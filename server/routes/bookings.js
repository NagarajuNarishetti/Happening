const express = require('express');
const pool = require('../config/db');
const { getRedis } = require('../config/redis');
const { publish } = require('../config/rabbitmq');

const router = express.Router();

async function ensureBookingTables() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL,
      user_id UUID NOT NULL,
      seats INT NOT NULL CHECK (seats > 0),
      status TEXT NOT NULL CHECK (status IN ('confirmed','waiting','cancelled')),
      waiting_number INT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
    // per-seat table (idempotent)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_seats (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL,
      booking_id UUID,
      user_id UUID,
      seat_no INT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('booked','cancelled')) DEFAULT 'booked',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureBookingTables();
        const { event_id, user_id, seats, seat_numbers } = req.body || {};
        const redis = getRedis();

        await client.query('BEGIN');

        // FCFS: if user requested explicit seat_numbers, fail with 409 if any already booked
        if (Array.isArray(seat_numbers) && seat_numbers.length > 0) {
            const desired = seat_numbers.map(Number).filter(n => Number.isFinite(n) && n > 0);
            if (desired.length !== seat_numbers.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'invalid_seat_numbers' });
            }
            const { rows: conflictRows } = await client.query(
                "SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' AND seat_no = ANY($2::int[])",
                [event_id, desired]
            );
            if (conflictRows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'seats_conflict', unavailable: conflictRows.map(r => Number(r.seat_no)) });
            }
        }

        // Ensure Redis counter exists and is in sync with DB on cold start
        let key = `event:${event_id}:slots`;
        let current = await redis.get(key);
        if (current === null) {
            const { rows: evRows } = await client.query('SELECT available_slots FROM events WHERE id=$1', [event_id]);
            const available = Number(evRows?.[0]?.available_slots || 0);
            await redis.set(key, available);
            current = String(available);
        }
        // atomic slots decrement using Redis
        let remaining = await redis.decrby(key, seats);

        let status = 'confirmed';
        let waiting_number = null;
        if (remaining < 0) {
            // Redis says not enough. Reconcile with DB in the same transaction.
            const { rows: evRows2 } = await client.query('SELECT available_slots FROM events WHERE id=$1 FOR UPDATE', [event_id]);
            const dbAvail = Number(evRows2?.[0]?.available_slots || 0);
            if (dbAvail >= seats) {
                // There are actually enough seats. Correct Redis and proceed as confirmed.
                await redis.set(key, dbAvail - seats);
                remaining = dbAvail - seats;
                status = 'confirmed';
            } else {
                // Not enough in DB either → revert Redis overshoot and put user on waitlist
                await redis.incrby(key, seats);
                status = 'waiting';
                waiting_number = await redis.rpush(`event:${event_id}:waitlist`, user_id);
            }
        }

        const { rows } = await client.query(
            `INSERT INTO bookings(event_id, user_id, seats, status, waiting_number)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
            [event_id, user_id, seats, status, waiting_number]
        );

        // keep events.available_slots in sync and allocate seat numbers for confirmed bookings
        let seatNos = [];
        if (status === 'confirmed') {
            const takenRes = await client.query("SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' ORDER BY seat_no", [event_id]);
            const taken = new Set(takenRes.rows.map(r => Number(r.seat_no)));
            if (Array.isArray(seat_numbers) && seat_numbers.length === seats) {
                // Use desired seats. They were pre-validated above for conflicts.
                for (const s of seat_numbers.map(Number)) {
                    if (s <= 0 || taken.has(s)) { seatNos = []; break; }
                    seatNos.push(s);
                }
            } else {
                // Auto-assign lowest available
                let seat = 1;
                while (seatNos.length < seats) {
                    if (!taken.has(seat)) seatNos.push(seat);
                    seat++;
                }
            }
            for (const s of seatNos) {
                await client.query("INSERT INTO booking_seats(event_id, booking_id, user_id, seat_no, status) VALUES($1,$2,$3,$4,'booked')", [event_id, rows[0].id, user_id, s]);
            }
            await client.query('UPDATE events SET available_slots = GREATEST(available_slots - $1, 0), updated_at = NOW() WHERE id=$2', [seats, event_id]);
        }

        await client.query('COMMIT');

        // notify asynchronously
        try {
            await publish('notifications', {
                type: status === 'confirmed' ? 'booking_confirmed' : 'booking_waitlisted',
                eventId: event_id,
                userId: user_id,
                seats,
            });
        } catch { }

        // Broadcast real-time updates for booked seats and clear related holds
        if (status === 'confirmed' && Array.isArray(seatNos) && seatNos.length > 0) {
            try {
                const io = req.app.get('io');
                const redis = getRedis();
                for (const s of seatNos) {
                    await redis.del(`event:${event_id}:hold:${s}`);
                }
                const keys = await redis.keys(`event:${event_id}:hold:*`);
                const heldSeats = keys.map(k => Number(k.split(':').slice(-1)[0])).filter(n => Number.isFinite(n));
                // Update held seats view first
                if (io) io.to(`event:${event_id}`).emit('event:holds:update', { eventId: event_id, heldSeats });
                // Then announce booked seats to all viewers
                if (io) io.to(`event:${event_id}`).emit('event:bookings:update', { eventId: event_id, bookedSeats: seatNos });
            } catch { }
        }

        // Include assigned seat numbers in response for confirmed bookings
        const response = { ...rows[0] };
        if (status === 'confirmed' && seatNos.length > 0) {
            response.assigned_seats = seatNos;
        }
        
        res.status(201).json(response);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /bookings/user/:userId - list bookings for a user (with event details)
router.get('/user/:userId', async (req, res) => {
    try {
        await ensureBookingTables();
        const userId = req.params.userId;
        const { rows } = await pool.query(
            `SELECT b.id as booking_id, b.event_id, b.user_id, b.seats, b.status, b.waiting_number, b.created_at, b.updated_at,
                    e.name as event_name, e.description as event_description, e.category, e.event_date, e.total_slots, e.available_slots, e.org_id
             FROM bookings b
             JOIN events e ON e.id = b.event_id
             WHERE b.user_id = $1
             ORDER BY b.created_at DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/cancel', async (req, res) => {
    const client = await pool.connect();
    try {
        const bookingId = req.params.id;
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
        const booking = rows[0];
        if (!booking) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }
        if (booking.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.json(booking);
        }

        await client.query("UPDATE bookings SET status='cancelled', updated_at=NOW() WHERE id=$1", [bookingId]);

        // free seats for this booking
        const freedRes = await client.query("UPDATE booking_seats SET status='cancelled' WHERE booking_id=$1 AND status='booked' RETURNING seat_no", [bookingId]);
        const freedCount = freedRes.rowCount || 0;
        const freedSeats = freedRes.rows.map(r => Number(r.seat_no));

        const redis = getRedis();
        // Track seats newly assigned to promoted waitlist entries
        const promotedSeatNos = [];
        if (freedCount > 0) {
            await redis.incrby(`event:${booking.event_id}:slots`, freedCount);
            await client.query('UPDATE events SET available_slots = available_slots + $1, updated_at = NOW() WHERE id=$2', [freedCount, booking.event_id]);

            // Promote from waitlist while seats are available; allocate as many as originally requested, possibly partially
            let seatsRemainingToAllocate = freedCount;
            while (seatsRemainingToAllocate > 0) {
                const nextUserId = await redis.lpop(`event:${booking.event_id}:waitlist`);
                if (!nextUserId) break;

                const { rows: waitingRows } = await client.query(
                    `SELECT id, seats FROM bookings WHERE event_id=$1 AND user_id=$2 AND status='waiting' ORDER BY created_at ASC LIMIT 1`,
                    [booking.event_id, nextUserId]
                );
                const waiting = waitingRows[0];
                if (!waiting) continue;

                const requestedSeats = Math.max(1, Number(waiting.seats) || 1);
                const toAllocate = Math.min(seatsRemainingToAllocate, requestedSeats);

                const { rows: promotedRows } = await client.query(
                    `UPDATE bookings SET status='confirmed', waiting_number=NULL, seats=$2, updated_at=NOW() WHERE id=$1 RETURNING id`,
                    [waiting.id, toAllocate]
                );
                if (!promotedRows[0]) continue;

                // allocate seat numbers
                const takenRes = await client.query("SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' ORDER BY seat_no", [booking.event_id]);
                const taken = new Set(takenRes.rows.map(r => Number(r.seat_no)));
                let seatNum = 1;
                let allocated = 0;
                while (allocated < toAllocate) {
                    while (taken.has(seatNum)) seatNum++;
                    await client.query("INSERT INTO booking_seats(event_id, booking_id, user_id, seat_no, status) VALUES($1,$2,$3,$4,'booked')", [booking.event_id, waiting.id, nextUserId, seatNum]);
                    taken.add(seatNum);
                    promotedSeatNos.push(seatNum);
                    seatNum++;
                    allocated++;
                }
                await client.query('UPDATE events SET available_slots = GREATEST(available_slots - $1, 0), updated_at = NOW() WHERE id=$2', [toAllocate, booking.event_id]);
                seatsRemainingToAllocate -= toAllocate;
                try { await publish('notifications', { type: 'waitlist_promoted', eventId: booking.event_id, userId: nextUserId }); } catch { }
            }
        }

        await client.query('COMMIT');
        // Real-time updates after commit
        try {
            const io = req.app.get('io');
            const redis = getRedis();
            if (freedSeats.length > 0) {
                // Broadcast seats becoming available
                if (io) io.to(`event:${booking.event_id}`).emit('event:seats:freed', { eventId: booking.event_id, freedSeats });
            }
            if (promotedSeatNos.length > 0) {
                // Clear any holds and broadcast as booked
                for (const s of promotedSeatNos) { await redis.del(`event:${booking.event_id}:hold:${s}`); }
                const keys = await redis.keys(`event:${booking.event_id}:hold:*`);
                const heldSeats = keys.map(k => Number(k.split(':').slice(-1)[0])).filter(n => Number.isFinite(n));
                if (io) io.to(`event:${booking.event_id}`).emit('event:holds:update', { eventId: booking.event_id, heldSeats });
                if (io) io.to(`event:${booking.event_id}`).emit('event:bookings:update', { eventId: booking.event_id, bookedSeats: promotedSeatNos });
            }
        } catch { }

        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;

// Additional endpoints
// GET seats for a booking
router.get('/:id/seats', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // read existing seats
        let result = await client.query("SELECT seat_no, status FROM booking_seats WHERE booking_id=$1 ORDER BY seat_no", [req.params.id]);
        if (result.rows.length === 0) {
            // Backfill for legacy bookings: allocate seats now if booking is confirmed
            const { rows: bRows } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [req.params.id]);
            const booking = bRows[0];
            if (booking && booking.status === 'confirmed' && Number(booking.seats) > 0) {
                const takenRes = await client.query("SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' ORDER BY seat_no", [booking.event_id]);
                const taken = new Set(takenRes.rows.map(r => Number(r.seat_no)));
                const seatNos = [];
                let seat = 1;
                while (seatNos.length < Number(booking.seats)) {
                    if (!taken.has(seat)) seatNos.push(seat);
                    seat++;
                }
                for (const s of seatNos) {
                    await client.query("INSERT INTO booking_seats(event_id, booking_id, user_id, seat_no, status) VALUES($1,$2,$3,$4,'booked')", [booking.event_id, booking.id, booking.user_id, s]);
                }
                result = await client.query("SELECT seat_no, status FROM booking_seats WHERE booking_id=$1 ORDER BY seat_no", [req.params.id]);
            }
        }
        await client.query('COMMIT');
        res.json(result.rows);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Cancel specific seats for a booking
router.post('/:id/cancel-seats', async (req, res) => {
    const client = await pool.connect();
    try {
        const bookingId = req.params.id;
        const { seat_numbers } = req.body || {};
        if (!Array.isArray(seat_numbers) || seat_numbers.length === 0) return res.status(400).json({ error: 'seat_numbers required' });
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
        const booking = rows[0];
        if (!booking) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

        const seatRes = await client.query("UPDATE booking_seats SET status='cancelled' WHERE booking_id=$1 AND seat_no = ANY($2) AND status='booked' RETURNING seat_no", [bookingId, seat_numbers]);
        const cancelledCount = seatRes.rowCount || 0;
        const freedSeats = seatRes.rows.map(r => Number(r.seat_no));
        if (cancelledCount === 0) { await client.query('ROLLBACK'); return res.json({ ok: true, cancelled: 0 }); }

        await client.query('UPDATE events SET available_slots = available_slots + $1, updated_at = NOW() WHERE id=$2', [cancelledCount, booking.event_id]);

        const redis = getRedis();
        let seatsRemainingToAllocate = cancelledCount;
        while (seatsRemainingToAllocate > 0) {
            const nextUserId = await redis.lpop(`event:${booking.event_id}:waitlist`);
            if (!nextUserId) break;
            const { rows: waitingRows } = await client.query(
                `SELECT id, seats FROM bookings WHERE event_id=$1 AND user_id=$2 AND status='waiting' ORDER BY created_at ASC LIMIT 1`,
                [booking.event_id, nextUserId]
            );
            const waiting = waitingRows[0];
            if (!waiting) continue;
            const requestedSeats = Math.max(1, Number(waiting.seats) || 1);
            const toAllocate = Math.min(seatsRemainingToAllocate, requestedSeats);
            const { rows: promotedRows } = await client.query(
                `UPDATE bookings SET status='confirmed', waiting_number=NULL, seats=$2, updated_at=NOW() WHERE id=$1 RETURNING id`,
                [waiting.id, toAllocate]
            );
            if (!promotedRows[0]) continue;
            const takenRes = await client.query("SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' ORDER BY seat_no", [booking.event_id]);
            const taken = new Set(takenRes.rows.map(r => Number(r.seat_no)));
            let seat = 1, allocated = 0;
            while (allocated < toAllocate) {
                while (taken.has(seat)) seat++;
                await client.query("INSERT INTO booking_seats(event_id, booking_id, user_id, seat_no, status) VALUES($1,$2,$3,$4,'booked')", [booking.event_id, waiting.id, nextUserId, seat]);
                taken.add(seat);
                seat++;
                allocated++;
            }
            await client.query('UPDATE events SET available_slots = GREATEST(available_slots - $1, 0), updated_at = NOW() WHERE id=$2', [toAllocate, booking.event_id]);
            seatsRemainingToAllocate -= toAllocate;
        }

        await client.query('COMMIT');
        // Emit freed seats so other clients see them turn green immediately
        try {
            const io = req.app.get('io');
            if (freedSeats.length > 0 && io) io.to(`event:${booking.event_id}`).emit('event:seats:freed', { eventId: booking.event_id, freedSeats });
        } catch { }
        res.json({ ok: true, cancelled: cancelledCount });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});


