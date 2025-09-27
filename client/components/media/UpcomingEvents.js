import React from "react";

export default function UpcomingEvents({
    showUpcomingSection,
    events,
    userOrgIdsForBooking,
    currentUserId,
    isSwitchView,
    switchOrgId,
    upcomingStatus,
    setUpcomingStatus,
    upcomingSort,
    setUpcomingSort,
    organizations,
    fetchEvents,
    API,
    io,
    setSeatSelect,
    setDesiredSeatsInput,
    setSeatError,
    setShowSeatSelect,
    socketRef,
    setMessage
}) {
    if (!showUpcomingSection) return null;

    const getActiveOrgName = () => {
        if (!isSwitchView) return 'all organizations';
        const org = organizations.find(o => String(o.id) === String(switchOrgId));
        return org?.name || 'selected organization';
    };

    const getFilterDisplayText = () => {
        const statusText = upcomingStatus === 'all' ? 'all events' :
            upcomingStatus === 'upcoming' ? 'upcoming events' : 'completed events';
        const orgText = getActiveOrgName();
        const sortText = upcomingSort === 'dateAsc' ? 'date (ascending)' : 'date (descending)';
        return `${statusText} from ${orgText} sorted by ${sortText}`;
    };

    return (
        <div className="px-8 pb-12">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-6">
                        <h2 className="text-2xl font-bold text-gray-800 tracking-wide">Upcoming Events</h2>
                        <div className="text-sm text-gray-600">{events.filter(ev => (userOrgIdsForBooking.has(ev.org_id) || String(ev.created_by) === String(currentUserId))).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length} events</div>
                    </div>
                    <button onClick={fetchEvents} className="px-4 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-white transition-all duration-300 shadow-lg">Refresh</button>
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-8">
                    <select value={upcomingStatus} onChange={e => setUpcomingStatus(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                        <option value="all">All</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="completed">Completed</option>
                    </select>
                    <select value={upcomingSort} onChange={e => setUpcomingSort(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                        <option value="dateAsc">Date ↑</option>
                        <option value="dateDesc">Date ↓</option>
                    </select>
                </div>

                {events.filter(ev => userOrgIdsForBooking.has(ev.org_id)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length === 0 ? (
                    <div className="text-center py-20 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl">
                        <div className="text-6xl mb-6">
                            <i className="fa-solid fa-folder-open" style={{ color: "#96C2DB", fontSize: "45px" }}></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-4 tracking-wide">NO EVENTS FOUND</h3>
                        <p className="text-gray-600 mb-2 max-w-md mx-auto leading-relaxed">
                            Currently no events for <span className="font-semibold text-gray-700">{getActiveOrgName()}</span> with your selected filters.
                        </p>
                        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                            Filters: {getFilterDisplayText()}
                        </p>
                        <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">Check back later for upcoming events.</p>
                        <button onClick={fetchEvents} className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 backdrop-blur-md text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl hover:shadow-3xl group border border-blue-400 tracking-wide">Refresh</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {events
                            .filter(ev => (userOrgIdsForBooking.has(ev.org_id) || String(ev.created_by) === String(currentUserId)))
                            .filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId))
                            .filter(ev => {
                                const dt = ev.event_date ? new Date(ev.event_date).getTime() : 0;
                                const now = Date.now();
                                if (upcomingStatus === 'upcoming') return dt >= now;
                                if (upcomingStatus === 'completed') return dt && dt < now;
                                return true;
                            })
                            // org filter dropdown removed; rely solely on switch context
                            .sort((a, b) => {
                                const da = new Date(a.event_date).getTime();
                                const db = new Date(b.event_date).getTime();
                                return upcomingSort === 'dateAsc' ? da - db : db - da;
                            })
                            .map((ev) => {
                                const org = organizations.find(o => String(o.id) === String(ev.org_id));
                                return (
                                    <div key={ev.id} className="group relative rounded-2xl border border-emerald-200 bg-white shadow-2xl p-4 h-full flex flex-col">
                                        <div className="flex items-start justify-between mb-3 h-8">
                                            <div className="text-lg font-semibold text-gray-800 line-clamp-1 flex-1 pr-2">{ev.name}</div>
                                            <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={org?.name || ''}>{org?.name || ''}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 mb-3 h-10 line-clamp-2 overflow-hidden">{ev.description || "No description"}</div>
                                        <div className="text-xs text-gray-500 mb-3 h-5 flex items-center">
                                            <span className="font-medium">Organizer:</span>
                                            <span className="ml-1 truncate">{ev.organizer_first_name && ev.organizer_last_name
                                                ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                : ev.organizer_username || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-gray-700 mb-3 h-6">
                                            <span className="font-medium">{ev.category || 'event'}</span>
                                            <span className="text-xs">{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-600 mb-4 h-5">
                                            <span>Total: {ev.total_slots}</span>
                                            <span>Available: {ev.available_slots}</span>
                                        </div>
                                        <div className="mt-auto flex items-center gap-2">
                                            {upcomingStatus === 'upcoming' && (
                                                <button onClick={() => {
                                                    try {
                                                        window.location.assign(`/book/${encodeURIComponent(ev.id)}${isSwitchView ? `?orgId=${encodeURIComponent(switchOrgId)}` : ''}`);
                                                    } catch (_) { }
                                                }} className="px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl text-sm font-semibold">Book tickets</button>
                                            )}
                                            {upcomingStatus === 'completed' && (
                                                <div className="px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm font-semibold">Event Completed</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
}


