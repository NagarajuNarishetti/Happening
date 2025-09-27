import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import API from "../../lib/api";
import CancelCongratsModal from "../../components/media/CancelCongratsModal";
import { io } from "socket.io-client";

export default function ManageBookingPage() {
    const router = useRouter();
    const { id, orgId, bks } = { id: router.query.id, orgId: router.query.orgId, bks: router.query.bks };
    const [seats, setSeats] = useState([]);
    const [eventName, setEventName] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState('');
    const [orgName, setOrgName] = useState('');
    const [showCancelCongrats, setShowCancelCongrats] = useState(false);
    const [cancelCongratsData, setCancelCongratsData] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        const load = async () => {
            try {
                const all = await API.get(`/events`);
                const ev = (Array.isArray(all.data) ? all.data : []).find(e => String(e.id) === String(id));
                setEventName(ev?.name || 'Event');
                setEventDate(ev?.event_date || '');
                const ids = String(bks || '').split(',').filter(Boolean);
                const seatLists = await Promise.all(ids.map(async bid => {
                    const res = await API.get(`/bookings/${bid}/seats`);
                    const arr = Array.isArray(res.data) ? res.data : [];
                    return arr.map(x => ({ ...x, booking_id: bid }));
                }));
                setSeats(seatLists.flat());
            } catch (e) {
                // ignore
            }
        };
        if (id && bks) load();

        // Realtime updates: join event room and refresh when seats change
        if (id) {
            if (!socketRef.current) {
                socketRef.current = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
            }
            const s = socketRef.current;
            try { s.emit('event:join', { eventId: id }); } catch { }
            const refresh = async ({ eventId }) => {
                if (String(eventId) !== String(id)) return;
                try {
                    const ids = String(bks || '').split(',').filter(Boolean);
                    const seatLists = await Promise.all(ids.map(async bid => {
                        const res = await API.get(`/bookings/${bid}/seats`);
                        const arr = Array.isArray(res.data) ? res.data : [];
                        return arr.map(x => ({ ...x, booking_id: bid }));
                    }));
                    setSeats(seatLists.flat());
                } catch { }
            };
            const onFreed = ({ eventId }) => refresh({ eventId });
            const onBooked = ({ eventId }) => refresh({ eventId });
            s.on('event:seats:freed', onFreed);
            s.on('event:bookings:update', onBooked);
            return () => {
                s.off('event:seats:freed', onFreed);
                s.off('event:bookings:update', onBooked);
                try { s.emit('event:leave', { eventId: id }); } catch { }
            };
        }
    }, [id, bks]);

    useEffect(() => {
        const loadOrg = async () => {
            if (!orgId) return;
            try {
                const res = await API.get(`/organizations/${encodeURIComponent(orgId)}`);
                const name = res?.data?.name;
                if (name) setOrgName(name);
            } catch { }
        };
        loadOrg();
    }, [orgId]);

    // Check if event is completed
    const eventDateTime = eventDate ? new Date(eventDate).getTime() : 0;
    const now = Date.now();
    const isEventCompleted = eventDateTime && eventDateTime < now;

    const crumbs = [
        { label: 'Home', href: '/home' },
        ...(orgId ? [{ label: orgName || 'Organization', href: `/switch/${orgId}` }] : []),
        { label: 'View Booking' }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <nav className="max-w-7xl mx-auto mt-4 px-8" aria-label="Breadcrumb">
                <ol className="flex items-center text-sm text-slate-600">
                    {crumbs.map((c, i) => (
                        <li key={i} className="flex items-center">
                            {i > 0 && <span className="mx-2 text-slate-400">›</span>}
                            {c.href ? <a className="hover:text-indigo-600 font-medium" href={c.href}>{c.label}</a> : <span className="text-slate-800 font-semibold">{c.label}</span>}
                        </li>
                    ))}
                </ol>
            </nav>
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 mt-6 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">{eventName} — Your Seats</h2>
                    <a href={orgId ? `/switch/${orgId}` : '/home'} className="text-sm text-gray-600 hover:text-gray-800">Back</a>
                </div>
                {isEventCompleted ? (
                    <div className="text-center py-8">
                        <div className="mb-4 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            This event has already completed. Seat management is no longer available.
                        </div>
                        {seats.length > 0 && (
                            <>
                                <div className="text-sm text-gray-600 mb-3">Your booked seats for this completed event:</div>

                                {/* Legend for completed events */}
                                <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300"></span>
                                        <span>Booked</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-300"></span>
                                        <span>Cancelled</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                                    {[...seats]
                                        .sort((a, b) => {
                                            const rank = (s) => {
                                                const status = (s.status || '').toLowerCase();
                                                if (status === 'booked') return 0; // show booked first
                                                if (status === 'cancelled' || status === 'canceled') return 1; // cancelled at end
                                                return 2; // anything else
                                            };
                                            const ra = rank(a);
                                            const rb = rank(b);
                                            if (ra !== rb) return ra - rb;
                                            return Number(a.seat_no) - Number(b.seat_no);
                                        })
                                        .map((s) => {
                                            const status = (s.status || 'booked').toLowerCase();
                                            const isCancelled = status === 'cancelled' || status === 'canceled';
                                            return (
                                                <div
                                                    key={`${s.booking_id}-${s.seat_no}`}
                                                    className={`px-3 py-2 rounded-xl border text-sm font-semibold ${isCancelled
                                                            ? 'bg-gray-50 border-gray-300 text-gray-500'
                                                            : 'bg-green-50 border-green-300 text-green-700'
                                                        }`}
                                                >
                                                    Seat {s.seat_no}
                                                </div>
                                            );
                                        })}
                                </div>
                            </>
                        )}
                        <div className="flex items-center justify-center">
                            <a href={orgId ? `/switch/${orgId}` : '/home'} className="px-6 py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-semibold shadow">
                                Back to Home
                            </a>
                        </div>
                    </div>
                ) : seats.length === 0 ? (
                    <div className="text-gray-600">No seats to display.</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-600 mb-3">Select seats to cancel.</div>

                        {/* Legend */}
                        <div className="flex items-center gap-4 text-xs text-gray-600 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded bg-blue-200 border border-blue-300"></span>
                                <span>Holding</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-300"></span>
                                <span>Cancelled</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {[...seats]
                                .sort((a, b) => {
                                    const rank = (s) => {
                                        const status = (s.status || '').toLowerCase();
                                        if (status === 'held' || status === 'holding') return 0; // show first
                                        if (status === 'booked') return 1; // then active booked (selectable)
                                        if (status === 'cancelled' || status === 'canceled') return 2; // cancelled at end
                                        return 3; // anything else
                                    };
                                    const ra = rank(a);
                                    const rb = rank(b);
                                    if (ra !== rb) return ra - rb;
                                    return Number(a.seat_no) - Number(b.seat_no);
                                })
                                .map((s, idx) => {
                                    const key = `${s.booking_id}-${s.seat_no}`;
                                    const isSelected = selected.has(key);
                                    const status = (s.status || 'booked').toLowerCase();
                                    const isHeld = status === 'held' || status === 'holding';
                                    const isCancelled = status === 'cancelled' || status === 'canceled';
                                    const disabled = status !== 'booked';
                                    return (
                                        <button
                                            key={key}
                                            disabled={disabled}
                                            onClick={() => {
                                                setSelected(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(key)) next.delete(key); else next.add(key);
                                                    return next;
                                                });
                                            }}
                                            className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${disabled
                                                ? isCancelled
                                                    ? 'bg-gray-50 border-gray-300 text-gray-500 cursor-not-allowed'
                                                    : isHeld
                                                        ? 'bg-blue-200 border-blue-300 text-blue-900 cursor-not-allowed'
                                                        : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                                                : isSelected
                                                    ? 'bg-red-600 text-white border-red-600'
                                                    : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                                }`}
                                        >
                                            Seat {s.seat_no}
                                        </button>
                                    );
                                })}
                        </div>
                        <div className="mt-6 flex items-center justify-end gap-2">
                            <button onClick={() => setSelected(new Set())} className="px-4 py-2 rounded-xl border text-sm">Clear</button>
                            <button onClick={async () => {
                                const seatItems = seats.filter((s) => selected.has(`${s.booking_id}-${s.seat_no}`) && (s.status ?? 'booked') === 'booked');
                                if (seatItems.length === 0) return;
                                try {
                                    setConfirming(true);
                                    const byBooking = new Map();
                                    for (let i = 0; i < seats.length; i++) {
                                        const s = seats[i];
                                        const key = `${s.booking_id}-${s.seat_no}`;
                                        if (!selected.has(key)) continue;
                                        if (!byBooking.has(s.booking_id)) byBooking.set(s.booking_id, []);
                                        byBooking.get(s.booking_id).push(s.seat_no);
                                    }
                                    for (const [bid, seatNos] of byBooking.entries()) {
                                        await API.post(`/bookings/${bid}/cancel-seats`, { seat_numbers: seatNos });
                                    }
                                    const cancelledSeatNos = seatItems.map(s => s.seat_no).sort((a, b) => Number(a) - Number(b));
                                    const remainingBooked = seats.filter((s) => !(selected.has(`${s.booking_id}-${s.seat_no}`)) && (s.status ?? 'booked') === 'booked').length;
                                    setCancelCongratsData({
                                        cancelled_seats: cancelledSeatNos,
                                        seat_count: cancelledSeatNos.length,
                                        event_name: eventName,
                                        remaining_seats: remainingBooked
                                    });
                                    setShowCancelCongrats(true);
                                    // Optimistically update local state to reflect cancelled seats
                                    setSeats(prev => prev.map((s, idx) => {
                                        const key = `${s.booking_id}-${s.seat_no}`;
                                        if (selected.has(key)) {
                                            return { ...s, status: 'cancelled' };
                                        }
                                        return s;
                                    }));
                                    setSelected(new Set());
                                } catch (e) {
                                    setMessage('❌ Failed to cancel seats: ' + (e.response?.data?.error || e.message));
                                } finally {
                                    setConfirming(false);
                                }
                            }} disabled={confirming} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">Cancel Selected</button>
                        </div>
                        {message && <div className="mt-3 text-sm text-gray-800">{message}</div>}
                        <CancelCongratsModal showCancelCongrats={showCancelCongrats} setShowCancelCongrats={setShowCancelCongrats} cancelCongratsData={cancelCongratsData} />
                    </>
                )}
            </div>
        </div>
    );
}


