import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { io } from "socket.io-client";
import API from "../../lib/api";
import CongratsModal from "../../components/media/CongratsModal";

export default function BookPage({ keycloak }) {
    const router = useRouter();
    const { id } = router.query;
    const [event, setEvent] = useState(null);
    const [seats, setSeats] = useState([]);
    const [desiredSeatsInput, setDesiredSeatsInput] = useState("1");
    const [seatError, setSeatError] = useState("");
    const [bookingLoading, setBookingLoading] = useState(false);
    const [message, setMessage] = useState("");
    const socketRef = useRef(null);

    const currentUserId = null; // legacy placeholder (we will resolve dynamically below)

    const orgId = router.query.orgId || null;
    const [orgName, setOrgName] = useState('');
    const [showCongrats, setShowCongrats] = useState(false);
    const [congratsData, setCongratsData] = useState(null);
    const [holdExpiresAt, setHoldExpiresAt] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(null);

    // Load organization name for breadcrumb when orgId is present
    useEffect(() => {
        const loadOrg = async () => {
            if (!orgId) return;
            try {
                const res = await API.get(`/organizations/${encodeURIComponent(orgId)}`);
                const name = res?.data?.name;
                if (name) setOrgName(name);
            } catch { /* ignore */ }
        };
        loadOrg();
    }, [orgId]);

    useEffect(() => {
        if (!id) return;
        const load = async () => {
            try {
                const seatsRes = await API.get(`/events/${id}/seats`);
                const { total, taken, held, event: eventPayload } = seatsRes.data || {};
                if (eventPayload) {
                    setEvent(eventPayload);
                } else {
                    // Fallback: fetch event basics
                    const all = await API.get(`/events`);
                    const ev = (Array.isArray(all.data) ? all.data : []).find(e => String(e.id) === String(id));
                    setEvent(ev || null);
                }
                const totalSeats = seatsRes.data?.total ?? (eventPayload?.total_slots ?? 0);
                const takenSet = new Set((seatsRes.data?.taken || []).map(Number));
                const heldSet = new Set((seatsRes.data?.held || []).map(Number));
                setSeats(Array.from({ length: totalSeats }, (_, i) => ({ seat_no: i + 1, taken: takenSet.has(i + 1), held: heldSet.has(i + 1), selected: false })));
            } catch (e) {
                setMessage('❌ Failed to load seats: ' + (e.response?.data?.error || e.message));
            }
        };
        load();
    }, [id]);

    useEffect(() => {
        if (!id) return;
        if (!socketRef.current) {
            socketRef.current = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
        }
        const s = socketRef.current;
        try { s.emit('event:join', { eventId: id }); } catch { }
        // Immediately request a sync of currently held seats on entering the room
        try { s.emit('event:holds:sync', { eventId: id }); } catch { }
        // Heartbeat to trigger server cleanup broadcast and keep own holds fresh
        const hb = setInterval(() => {
            try { s.emit('event:holds:heartbeat', { eventId: id }); } catch { }
        }, 2000);
        const onHeld = ({ eventId, heldSeats }) => {
            if (String(eventId) !== String(id)) return;
            const list = Array.isArray(heldSeats) ? heldSeats : [];
            setSeats(prev => {
                const updated = prev.map(x => {
                    const isHeldNow = list.includes(x.seat_no);
                    let nextSelected = x.selected;
                    // If someone else is holding it now, it cannot remain selected locally
                    if (isHeldNow && !x.selected) {
                        nextSelected = false;
                    }
                    if (!isHeldNow && x.held && !x.selected) {
                        // hold expired elsewhere
                        nextSelected = false;
                    }
                    return { ...x, held: isHeldNow, selected: nextSelected };
                });
                const anySelected = updated.some(s => s.selected);
                if (!anySelected) {
                    setHoldExpiresAt(null);
                    setSecondsLeft(null);
                }
                return updated;
            });
        };
        const onBooked = ({ eventId, bookedSeats }) => {
            if (String(eventId) !== String(id)) return;
            const setBooked = new Set((bookedSeats || []).map(Number));
            setSeats(prev => prev.map(x => setBooked.has(x.seat_no) ? ({ ...x, taken: true, selected: false }) : x));
            setEvent(prev => prev ? ({ ...prev, available_slots: Math.max(0, Number(prev.available_slots || 0) - setBooked.size) }) : prev);
        };
        const onFreed = ({ eventId, freedSeats }) => {
            if (String(eventId) !== String(id)) return;
            const setFreed = new Set((freedSeats || []).map(Number));
            setSeats(prev => prev.map(x => setFreed.has(x.seat_no) ? ({ ...x, taken: false, held: false, selected: false }) : x));
            setEvent(prev => prev ? ({ ...prev, available_slots: Number(prev.available_slots || 0) + setFreed.size }) : prev);
        };
        s.on('event:holds:update', onHeld);
        s.on('event:bookings:update', onBooked);
        s.on('event:seats:freed', onFreed);
        return () => {
            clearInterval(hb);
            s.off('event:holds:update', onHeld);
            s.off('event:bookings:update', onBooked);
            s.off('event:seats:freed', onFreed);
            try { s.emit('event:leave', { eventId: id }); } catch { }
        };
    }, [id]);

    const selectedCount = useMemo(() => seats.filter(s => s.selected).length, [seats]);

    const handleToggleSeat = (s) => {
        if (s.taken || (s.held && !s.selected)) return;
        const next = seats.map(x => x.seat_no === s.seat_no ? { ...x, selected: !x.selected } : x);
        setSeats(next);
        const selected = next.filter(x => x.selected).map(x => x.seat_no);
        try { socketRef.current?.emit('event:holds:set', { eventId: id, seats: selected }); } catch { }
        const isNowSelected = next.find(x => x.seat_no === s.seat_no)?.selected;
        if (isNowSelected) {
            setHoldExpiresAt(Date.now() + 10000);
        } else if (selected.length === 0) {
            setHoldExpiresAt(null);
            setSecondsLeft(null);
        }
    };

    // Countdown timer for holds
    useEffect(() => {
        if (!holdExpiresAt) return;
        const t = setInterval(() => {
            const remainingMs = holdExpiresAt - Date.now();
            const secs = Math.max(0, Math.ceil(remainingMs / 1000));
            setSecondsLeft(secs);
            if (remainingMs <= 0) {
                clearInterval(t);
                // Release selection locally and on server
                setSeats(prev => prev.map(x => ({ ...x, selected: false })));
                try { socketRef.current?.emit('event:holds:set', { eventId: id, seats: [] }); } catch { }
                setHoldExpiresAt(null);
            }
        }, 200);
        return () => clearInterval(t);
    }, [holdExpiresAt, id]);

    const handleBook = async () => {
        const selected = seats.filter(s => s.selected).map(s => s.seat_no);
        const seatsToBook = Math.max(1, selected.length, Number(desiredSeatsInput) || 1);
        const remaining = Number(event?.available_slots || 0);
        if (remaining > 0 && seatsToBook > remaining) {
            setSeatError(`Sorry, we only have ${remaining} ticket${remaining === 1 ? '' : 's'} left.`);
            return;
        }
        try {
            setBookingLoading(true);
            // Resolve user_id from Keycloak -> Users API
            let userId = currentUserId;
            if (!userId) {
                const keycloakId = typeof window !== 'undefined' ? window?.keycloak?.tokenParsed?.sub : null;
                if (!keycloakId) throw new Error('not_authenticated');
                const userResponse = await API.get(`/users?keycloak_id=${encodeURIComponent(keycloakId)}`);
                userId = Array.isArray(userResponse.data) && userResponse.data[0]?.id ? userResponse.data[0].id : null;
                if (!userId) throw new Error('user_not_found');
            }

            const resp = await API.post('/bookings', { event_id: id, user_id: userId, seats: seatsToBook, seat_numbers: selected });
            const payload = resp?.data || {};
            setCongratsData({
                ...payload,
                event_name: event?.name || 'Event',
                seats: seatsToBook,
            });
            setShowCongrats(true);
        } catch (e) {
            setMessage('❌ Failed to book: ' + (e.response?.data?.error || e.message));
        } finally {
            setBookingLoading(false);
        }
    };

    // Breadcrumbs
    const crumbs = [
        { label: 'Home', href: '/home' },
        ...(orgId ? [{ label: orgName || 'Organization', href: `/switch/${orgId}` }] : []),
        { label: 'Book Tickets' }
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

            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 mt-6 p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Select Seats{event?.name ? ` - ${event.name}` : ''}</h3>
                    <a href={orgId ? `/switch/${orgId}` : '/home'} className="text-gray-500 hover:text-gray-700">✕</a>
                </div>

                {event && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <h4 className="font-semibold text-gray-800">{event.name}</h4>
                            </div>
                            <div className="text-xs text-gray-600 capitalize">{event.category || 'Event'}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-1 text-gray-600">
                                <span>{event.event_date ? new Date(event.event_date).toLocaleString() : 'Date TBD'}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-600">
                                <span>Organizer: {event.organizer_username || 'Unknown'}</span>
                            </div>
                        </div>
                        <div className="mt-2 bg-white/60 rounded p-2">
                            <div className="flex items-center justify-between text-xs">
                                <span>Capacity: <span className="font-semibold text-blue-600">{event.total_slots || 0}</span></span>
                                <span>Available: <span className="font-semibold text-green-600">{event.available_slots || 0}</span></span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, ((event.total_slots - event.available_slots) / event.total_slots) * 100))}%` }}></div>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                {event.total_slots - event.available_slots} of {event.total_slots} seats booked
                            </div>
                        </div>
                    </div>
                )}

                {Number(event?.available_slots || 0) > 0 ? (
                    <div className="text-sm text-gray-600 mb-3">Green = available, Dark green = your selection, Orange = frozen by others (10s timeout), Red = booked.</div>
                ) : (
                    <div className="mb-3 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Sorry, currently all tickets are booked. If you want to stay on the waiting list, please choose the number of tickets you need. Note: if fewer seats become available than your request, we will allocate only that many to you.
                    </div>
                )}

                {seatError && (
                    <div className="mb-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{seatError}</div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">How many seats?</label>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={desiredSeatsInput} onChange={e => {
                                const onlyDigits = String(e.target.value || '').replace(/[^0-9]/g, '');
                                setDesiredSeatsInput(onlyDigits);
                                if (seatError) setSeatError("");
                            }} className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                            <span className="text-sm text-gray-600">Available: <span className="font-semibold text-green-600">{Number(event?.available_slots) ?? 0}</span></span>
                            {secondsLeft != null && (
                                <span className="ml-3 text-sm font-semibold text-amber-700">Book in {secondsLeft}s or selection will be released</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-200 rounded"></div><span>Available</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-600 rounded"></div><span>Selected</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-200 rounded animate-pulse"></div><span>Frozen</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-200 rounded"></div><span>Booked</span></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-800">Available Seats</h4>
                        <div className="text-xs text-gray-500">{selectedCount} selected</div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 max-h-[300px] overflow-auto p-2 border border-gray-100 rounded bg-gray-50">
                        {seats.map(s => {
                            const isFrozen = s.held && !s.selected;
                            const isSelected = s.selected;
                            const isTaken = s.taken;
                            return (
                                <button key={s.seat_no} disabled={isTaken || isFrozen} onClick={() => handleToggleSeat(s)} className={`px-2 py-1.5 text-xs font-medium rounded transition-all duration-200 ${isTaken
                                    ? 'bg-red-100 text-red-700 cursor-not-allowed border border-red-200'
                                    : isFrozen
                                        ? 'bg-orange-100 text-orange-700 cursor-not-allowed border border-orange-300 animate-pulse'
                                        : isSelected
                                            ? 'bg-emerald-600 text-white shadow-md transform scale-105'
                                            : 'bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 border border-emerald-200 hover:shadow-sm'
                                    }`} title={isFrozen ? 'This seat is being selected by another user' : ''}>{s.seat_no}</button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <span className="text-sm font-medium text-gray-700">Selected: {selectedCount}</span>
                            </div>
                            {selectedCount > 0 && (
                                <div className="text-xs text-gray-500">Seats: {seats.filter(s => s.selected).map(s => s.seat_no).join(', ')}</div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <a href={orgId ? `/switch/${orgId}` : '/home'} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</a>
                            <button onClick={handleBook} disabled={bookingLoading} className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                {bookingLoading ? 'Processing…' : 'Book Seats'}
                            </button>
                        </div>
                    </div>
                    {message && <div className="mt-3 text-sm text-red-700">{message}</div>}
                </div>
            </div>
            <CongratsModal showCongrats={showCongrats} setShowCongrats={(v) => { setShowCongrats(v); if (!v) { router.replace(`/switch/${encodeURIComponent(orgId || '')}`); } }} congratsData={congratsData} />
        </div>
    );
}


