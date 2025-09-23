const express = require('express');
const pool = require('../config/db');
const { getRedis } = require('../config/redis');

const router = express.Router();

async function ensureEventsTables() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID,
      created_by UUID,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT CHECK (category IN ('webinar','concert','hackathon')),
      event_date TIMESTAMP NOT NULL,
      total_slots INT NOT NULL CHECK (total_slots >= 0),
      available_slots INT NOT NULL CHECK (available_slots >= 0),
      status TEXT CHECK (status IN ('upcoming','ongoing','completed','cancelled')) DEFAULT 'upcoming',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

router.post('/', async (req, res) => {
    try {
        await ensureEventsTables();
        const { org_id, name, description, category, event_date, total_slots, created_by } = req.body || {};
        if (!created_by) return res.status(400).json({ error: 'created_by is required' });
        // If an org is specified, ensure the creator is an active member (organizer or orgAdmin)
        if (org_id) {
            const membership = await pool.query(
                `SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2 AND is_active = true`,
                [org_id, created_by]
            );
            if (!membership.rows[0] || !['organizer', 'orgAdmin'].includes(String(membership.rows[0].role))) {
                return res.status(403).json({ error: 'Creator must be organizer or orgAdmin of the organization' });
            }
        }
        const { rows } = await pool.query(
            `INSERT INTO events(org_id, created_by, name, description, category, event_date, total_slots, available_slots)
       VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
            [org_id || null, created_by, name, description || null, category || null, event_date, total_slots]
        );

        // initialize Redis slots counter
        try {
            const redis = getRedis();
            await redis.set(`event:${rows[0].id}:slots`, total_slots);
        } catch { }

        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { org_id, created_by } = req.query || {};
        let sql = 'SELECT * FROM events';
        const params = [];
        const conds = [];
        if (org_id) { params.push(org_id); conds.push(`org_id = $${params.length}`); }
        if (created_by) { params.push(created_by); conds.push(`created_by = $${params.length}`); }
        if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
        sql += ' ORDER BY event_date DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Seat map for an event: returns { total, taken: [seat_no,...] }
router.get('/:id/seats', async (req, res) => {
    try {
        const { rows: evRows } = await pool.query('SELECT id, total_slots FROM events WHERE id=$1', [req.params.id]);
        if (!evRows[0]) return res.status(404).json({ error: 'Not found' });
        const total = Number(evRows[0].total_slots);
        const { rows } = await pool.query("SELECT seat_no FROM booking_seats WHERE event_id=$1 AND status='booked' ORDER BY seat_no", [req.params.id]);
        res.json({ total, taken: rows.map(r => Number(r.seat_no)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { name, description, category, event_date, total_slots, user_id } = req.body || {};
        // enforce only creator can edit
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        const owner = await pool.query('SELECT created_by FROM events WHERE id=$1', [req.params.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Not found' });
        if (String(owner.rows[0].created_by) !== String(user_id)) return res.status(403).json({ error: 'Forbidden' });
        const { rows } = await pool.query(
            `UPDATE events SET 
        name = COALESCE($2,name),
        description = COALESCE($3,description),
        category = COALESCE($4,category),
        event_date = COALESCE($5,event_date),
        total_slots = COALESCE($6,total_slots),
        available_slots = CASE WHEN $6 IS NOT NULL THEN $6 ELSE available_slots END,
        updated_at = NOW()
       WHERE id=$1 RETURNING *`,
            [req.params.id, name, description, category, event_date, total_slots]
        );

        if (!rows[0]) return res.status(404).json({ error: 'Not found' });

        if (typeof total_slots === 'number') {
            try {
                const redis = getRedis();
                // Keep Redis in sync with DB visible availability when total_slots changes
                const visible = Number(rows[0].available_slots || total_slots);
                await redis.set(`event:${rows[0].id}:slots`, visible);
            } catch { }
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { user_id } = req.query || {};
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        const owner = await pool.query('SELECT created_by FROM events WHERE id=$1', [req.params.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Not found' });
        if (String(owner.rows[0].created_by) !== String(user_id)) return res.status(403).json({ error: 'Forbidden' });
        const { rowCount } = await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        try {
            const redis = getRedis();
            await redis.del(`event:${req.params.id}:slots`);
        } catch { }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reassign an event's creator to a different user within the same org
// Body: { requested_by, new_created_by }
router.post('/:id/reassign', async (req, res) => {
    try {
        const { requested_by, new_created_by } = req.body || {};
        if (!requested_by || !new_created_by) {
            return res.status(400).json({ error: 'requested_by and new_created_by are required' });
        }
        const evRes = await pool.query('SELECT id, org_id FROM events WHERE id=$1', [req.params.id]);
        if (!evRes.rows[0]) return res.status(404).json({ error: 'Event not found' });
        const orgId = evRes.rows[0].org_id;
        if (!orgId) return res.status(400).json({ error: 'Event has no organization to validate against' });

        // Requester must be orgAdmin in the event's org
        const reqMembership = await pool.query(
            `SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND is_active=true`,
            [orgId, requested_by]
        );
        if (!reqMembership.rows[0] || String(reqMembership.rows[0].role) !== 'orgAdmin') {
            return res.status(403).json({ error: 'Only orgAdmin can reassign event creator' });
        }

        // New creator must belong to same org with organizer or orgAdmin role
        const newMembership = await pool.query(
            `SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND is_active=true`,
            [orgId, new_created_by]
        );
        if (!newMembership.rows[0] || !['organizer', 'orgAdmin'].includes(String(newMembership.rows[0].role))) {
            return res.status(400).json({ error: 'New creator must be organizer/orgAdmin of the same organization' });
        }

        const updateRes = await pool.query(
            `UPDATE events SET created_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
            [req.params.id, new_created_by]
        );
        res.json(updateRes.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;


