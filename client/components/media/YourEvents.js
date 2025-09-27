import React, { useEffect, useMemo, useRef, useState } from "react";

export default function YourEvents({
    showYourEventsSection,
    myBookings,
    fetchMyBookings,
    currentUserId,
    organizations,
    events,
    API,
    io,
    socketRef,
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
    const socketsReadyRef = useRef(false);

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

    // Realtime refresh when seats are freed or bookings are updated for the same event
    useEffect(() => {
        try {
            if (!socketRef?.current) {
                socketRef.current = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
            }
            const s = socketRef.current;
            if (socketsReadyRef.current) return;
            socketsReadyRef.current = true;
            const eventIds = Array.from(new Set(myBookings.map(b => b.event_id))).filter(Boolean);
            for (const eid of eventIds) { try { s.emit('event:join', { eventId: eid }); } catch { } }
            const handleRefresh = ({ eventId }) => {
                const watching = myBookings.some(b => String(b.event_id) === String(eventId));
                if (!watching) return;
                fetchMyBookings(currentUserId);
            };
            s.on('event:seats:freed', handleRefresh);
            s.on('event:bookings:update', handleRefresh);
            return () => {
                s.off('event:seats:freed', handleRefresh);
                s.off('event:bookings:update', handleRefresh);
            };
        } catch { }
    }, [myBookings, currentUserId]);

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

                                // Check if event is completed
                                const eventDate = ev?.event_date ? new Date(ev.event_date).getTime() : 0;
                                const now = Date.now();
                                const isEventCompleted = eventDate && eventDate < now;
                                return (
                                    <div key={`event-${g.event.event_id}`} className="group relative rounded-2xl border border-indigo-200 bg-white shadow-2xl p-4 flex flex-col h-full">
                                        <div className="flex items-start justify-between mb-2 h-8">
                                            <div className="text-lg font-semibold text-gray-800 line-clamp-1 pr-2">{g.event.event_name}</div>
                                            <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title={org?.name || ''}>{org?.name || ''}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 mb-2 line-clamp-2 h-10 overflow-hidden">{g.event.event_description || 'No description'}</div>
                                        <div className="text-xs text-gray-500 mb-2 h-5 flex items-center">
                                            <span className="font-medium">Organizer:</span>
                                            <span className="ml-1 truncate">{ev?.organizer_first_name && ev?.organizer_last_name
                                                ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                : ev?.organizer_username || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-gray-700 h-6">
                                            <span>{g.event.category || 'event'}</span>
                                            <span className="text-xs">{g.event.event_date ? new Date(g.event.event_date).toLocaleString() : ''}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 text-xs text-gray-600 h-5">
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
                                        <div className="mt-auto pt-4 flex items-center gap-2">
                                            <button onClick={() => {
                                                const bookingIds = g.bookings.map(b => b.booking_id).join(',');
                                                const orgFromEvent = organizations.find(o => String(o.id) === String(ev?.org_id))?.id || activeOrgId;
                                                const params = new URLSearchParams();
                                                params.set('bks', bookingIds);
                                                if (orgFromEvent) params.set('orgId', String(orgFromEvent));
                                                if (currentUserId) params.set('uid', String(currentUserId));
                                                try { window.location.assign(`/manage/${encodeURIComponent(g.event.event_id)}?${params.toString()}`); } catch (_) { }
                                            }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">View</button>
                                            {!isEventCompleted && (
                                                <button onClick={() => {
                                                    const bookingIds = g.bookings.map(b => b.booking_id).join(',');
                                                    const orgFromEvent = organizations.find(o => String(o.id) === String(ev?.org_id))?.id || activeOrgId;
                                                    const orgSuffix = orgFromEvent ? `?bks=${encodeURIComponent(bookingIds)}&orgId=${encodeURIComponent(orgFromEvent)}` : `?bks=${encodeURIComponent(bookingIds)}`;
                                                    try { window.location.assign(`/cancel/${encodeURIComponent(g.event.event_id)}${orgSuffix}`); } catch (_) { }
                                                }} className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-semibold">Cancel</button>
                                            )}
                                            {isEventCompleted && (
                                                <div className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-500 font-semibold">Event Completed</div>
                                            )}
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


