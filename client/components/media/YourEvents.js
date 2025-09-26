import React, { useEffect, useMemo, useRef, useState } from "react";

export default function YourEvents({
    showYourEventsSection,
    myBookings,
    fetchMyBookings,
    currentUserId,
    organizations,
    events,
    API,
    setManageSeats,
    setManageBooking,
    setShowManageSeatsModal,
    setMessage,
    setCancelCongratsData,
    setShowCancelCongrats,
    fetchEvents,
    activeOrgId
}) {
    if (!showYourEventsSection) return null;

    const [waitingPositions, setWaitingPositions] = useState(new Map()); // booking_id -> {position, loading}
    const pollingRef = useRef(null);

    // Filter bookings by active organization if provided
    const myBookingsFiltered = useMemo(() => {
        const effectiveOrgId = activeOrgId ? String(activeOrgId) : null;
        if (!effectiveOrgId) return myBookings;
        const targetOrgId = effectiveOrgId;
        const allowedEventIds = new Set(
            events
                .filter(e => String(e.org_id) === targetOrgId)
                .map(e => String(e.id))
        );
        return myBookings.filter(b => allowedEventIds.has(String(b.event_id)));
    }, [myBookings, activeOrgId, events]);

    const groupsMemo = useMemo(() => {
        const groups = new Map();
        for (const b of myBookingsFiltered) {
            if (!groups.has(b.event_id)) groups.set(b.event_id, { event: b, bookings: [], totalSeats: 0 });
            const g = groups.get(b.event_id);
            g.bookings.push(b);
            g.totalSeats += Number(b.seats) || 0;
        }
        return groups;
    }, [myBookingsFiltered]);

    const loadWaitingForEvent = async (group) => {
        // pick the first waiting booking for this event
        const waitingBk = group.bookings.find(bk => String(bk.status).toLowerCase() === 'waiting');
        if (!waitingBk) return; // nothing to do
        try {
            const prevInfo = waitingPositions.get(waitingBk.booking_id);
            setWaitingPositions(prev => new Map(prev).set(waitingBk.booking_id, { position: prevInfo?.position ?? null, loading: true, confirmedSeats: prevInfo?.confirmedSeats ?? null, pendingSeats: prevInfo?.pendingSeats ?? null, requestedSeats: prevInfo?.requestedSeats ?? null }));
            const res = await API.get(`/bookings/${waitingBk.booking_id}/waiting-position`);
            const position = Number(res.data?.position) || null;
            const confirmedSeats = Number(res.data?.confirmedSeats ?? 0);
            const pendingSeats = Number(res.data?.pendingSeats ?? 0);
            const requestedSeats = Number(res.data?.requestedSeats ?? 0);
            setWaitingPositions(prev => new Map(prev).set(waitingBk.booking_id, { position, loading: false, confirmedSeats, pendingSeats, requestedSeats }));
        } catch {
            const prevInfo = waitingPositions.get(waitingBk.booking_id);
            setWaitingPositions(prev => new Map(prev).set(waitingBk.booking_id, { position: prevInfo?.position ?? null, loading: false, confirmedSeats: prevInfo?.confirmedSeats ?? null, pendingSeats: prevInfo?.pendingSeats ?? null, requestedSeats: prevInfo?.requestedSeats ?? null }));
        }
    };

    // initial fetch of waiting positions and polling every 10s
    useEffect(() => {
        const allGroups = Array.from(groupsMemo.values());
        allGroups.forEach(g => loadWaitingForEvent(g));
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(() => {
            allGroups.forEach(g => loadWaitingForEvent(g));
        }, 10000);
        return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
    }, [groupsMemo]);

    return (
        <div className="px-8 pb-12">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-6">
                        <h2 className="text-2xl font-bold text-gray-800 tracking-wide">Your Events</h2>
                        <div className="text-sm text-gray-600">{myBookingsFiltered.length} bookings</div>
                    </div>
                    <button onClick={() => fetchMyBookings(currentUserId)} className="px-4 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-white transition-all duration-300 shadow-lg">Refresh</button>
                </div>

                {myBookingsFiltered.length === 0 ? (
                    <div className="text-center py-10 bg-white/80 backdrop-blur-3xl rounded-2xl border border-blue-200/50 shadow">
                        <p className="text-gray-600">You haven't booked any events yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {(() => {
                            const groups = groupsMemo;
                            const eventsById = new Map(events.map(e => [String(e.id), e]));
                            const targetOrgId = activeOrgId ? String(activeOrgId) : null;
                            const filtered = Array.from(groups.values())
                                .filter(g => {
                                    if (!targetOrgId) return true;
                                    const ev = eventsById.get(String(g.event.event_id));
                                    if (!ev) return false; // if we don't know event org, hide under org filter
                                    return String(ev.org_id) === targetOrgId;
                                })
                                .sort((a, b) => {
                                    const da = new Date(a.event.event_date).getTime();
                                    const db = new Date(b.event.event_date).getTime();
                                    return db - da;
                                });
                            return filtered.map(g => {
                                const ev = eventsById.get(String(g.event.event_id));
                                const org = organizations.find(o => String(o.id) === String(ev?.org_id));
                                const waitingBk = g.bookings.find(bk => String(bk.status).toLowerCase() === 'waiting');
                                const waitingInfo = waitingBk ? waitingPositions.get(waitingBk.booking_id) : null;
                                return (
                                    <div key={`event-${g.event.event_id}`} className="group relative rounded-2xl border border-indigo-200 bg-white shadow-2xl p-4">
                                        <div className="flex items-start justify-between mb-1">
                                            <div className="text-lg font-semibold text-gray-800">{g.event.event_name}</div>
                                            <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title={org?.name || ''}>{org?.name || ''}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 mb-2 line-clamp-2">{g.event.event_description || 'No description'}</div>
                                        <div className="text-xs text-gray-500 mb-2">
                                            <span className="font-medium">Organizer:</span> {ev?.organizer_first_name && ev?.organizer_last_name
                                                ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                : ev?.organizer_username || 'Unknown'}
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-gray-700">
                                            <span>{g.event.category || 'event'}</span>
                                            <span>{g.event.event_date ? new Date(g.event.event_date).toLocaleString() : ''}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
                                            <span>Seats: {g.totalSeats}</span>
                                            {waitingBk ? (
                                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">Waiting</span>
                                            ) : (
                                                <span>Status: confirmed</span>
                                            )}
                                        </div>
                                        {waitingBk && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <button
                                                    onClick={() => loadWaitingForEvent(g)}
                                                    className="px-2 py-1 text-[11px] rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold"
                                                >
                                                    {waitingInfo?.loading ? 'Checking…' : `View Position${waitingInfo?.position ? `: #${waitingInfo.position}` : ''}`}
                                                </button>
                                                {waitingInfo && !waitingInfo.loading && (
                                                    <span className="text-[11px] text-purple-700">
                                                        {`Confirmed: ${waitingInfo.confirmedSeats ?? 0}, Pending: ${waitingInfo.pendingSeats ?? 0}`}
                                                    </span>
                                                )}
                                                {waitingInfo?.position ? (
                                                    <span className="text-[11px] text-gray-500">Auto-updating every 10s</span>
                                                ) : null}
                                            </div>
                                        )}
                                        <div className="mt-4 flex items-center gap-2">
                                            <button onClick={async () => {
                                                try {
                                                    const seatLists = await Promise.all(g.bookings.map(async bk => {
                                                        const res = await API.get(`/bookings/${bk.booking_id}/seats`);
                                                        const arr = Array.isArray(res.data) ? res.data : [];
                                                        return arr.map(x => ({ ...x, booking_id: bk.booking_id }));
                                                    }));
                                                    const merged = seatLists.flat();
                                                    setManageSeats(merged);
                                                    setManageBooking({ event_id: g.event.event_id, event_name: g.event.event_name, grouped: true, bookings: g.bookings });
                                                    setShowManageSeatsModal(true);
                                                } catch (e) {
                                                    setMessage('❌ Failed to load seats: ' + (e.response?.data?.error || e.message));
                                                }
                                            }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">View</button>
                                            <button onClick={async () => {
                                                try {
                                                    const ok = window.confirm('Cancel all your seats for this event?');
                                                    if (!ok) return;
                                                    await Promise.all(g.bookings.map(bk => API.post(`/bookings/${bk.booking_id}/cancel`)));
                                                    const totalSeats = g.bookings.reduce((sum, bk) => sum + (bk.seats || 0), 0);
                                                    setCancelCongratsData({
                                                        cancelled_seats: [],
                                                        seat_count: totalSeats,
                                                        remaining_seats: 0,
                                                        event_name: g.event.event_name
                                                    });
                                                    setShowCancelCongrats(true);
                                                    await Promise.all([fetchEvents(), fetchMyBookings(currentUserId)]);
                                                } catch (e) {
                                                    setMessage('❌ Failed to cancel: ' + (e.response?.data?.error || e.message));
                                                }
                                            }} className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-semibold">Cancel</button>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}


