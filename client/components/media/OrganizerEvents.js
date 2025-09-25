import React from "react";

export default function OrganizerEvents({
    isSwitchView,
    isSwitchOrganizer,
    organizerOrgIds,
    currentUserId,
    events,
    organizations,
    fetchEvents,
    setEditingEvent,
    setEditDescription,
    setShowEditModal,
    API,
    setMessage,
    yourOrgFilter,
    switchOrgId
}) {
    if (!isSwitchView || isSwitchOrganizer) {
        const count = events
            .filter(ev => organizerOrgIds.has(ev.org_id) && String(ev.created_by) === String(currentUserId))
            .filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length;

        const getOrgNameFromFilter = (orgFilter) => {
            if (!isSwitchView) return 'selected organization';
            const org = organizations.find(o => String(o.id) === String(switchOrgId));
            return org?.name || 'selected organization';
        };

        return (
            <div className="px-8 pb-20" id="organizer-events-list">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-6">
                            <h3 className="text-xl font-semibold text-gray-800">Events organized by you</h3>
                            <div className="text-sm text-gray-600">{count} events</div>
                        </div>
                        <button onClick={fetchEvents} className="px-3 py-1.5 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-lg text-xs font-medium text-gray-700 hover:bg-white shadow">Refresh</button>
                    </div>

                    {count === 0 ? (
                        <div className="text-center py-10 bg-white/80 backdrop-blur-3xl rounded-2xl border border-blue-200/50 shadow">
                            <p className="text-gray-600">
                                No events created yet for <span className="font-semibold text-gray-700">{getOrgNameFromFilter(isSwitchView ? String(switchOrgId) : yourOrgFilter)}</span>.
                                Use the Create Event button to add one.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {events.filter(ev => organizerOrgIds.has(ev.org_id) && String(ev.created_by) === String(currentUserId)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).map((ev) => {
                                const org = organizations.find(o => o.id === ev.org_id);
                                return (
                                    <div key={`org-${ev.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow h-full flex flex-col">
                                        <div className="flex items-center justify-between mb-3 h-8">
                                            <div className="text-lg font-semibold text-gray-800 line-clamp-1 flex-1 pr-2">{ev.name}</div>
                                            <span className="text-xs text-gray-500 shrink-0">{org?.name || '—'}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 mb-3 h-10 line-clamp-2 overflow-hidden">{ev.description || 'No description'}</div>
                                        <div className="text-xs text-gray-500 mb-3 h-5 flex items-center">
                                            <span className="font-medium">Organizer:</span>
                                            <span className="ml-1 truncate">{ev.organizer_first_name && ev.organizer_last_name
                                                ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                : ev.organizer_username || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-600 mb-3 h-6">
                                            <span className="font-medium">{ev.category}</span>
                                            <span className="text-xs">{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-600 mb-4 h-5">
                                            <span>Total: {ev.total_slots}</span>
                                            <span>Available: {ev.available_slots}</span>
                                        </div>
                                        <div className="mt-auto flex items-center gap-2">
                                            <button onClick={() => { setEditingEvent(ev); setEditDescription(ev.description || ""); setShowEditModal(true); }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">Edit</button>
                                            <button onClick={async () => {
                                                if (!confirm('Delete this event?')) return;
                                                try { await API.delete(`/events/${ev.id}?user_id=${encodeURIComponent(String(currentUserId))}`); await fetchEvents(); setMessage('✅ Event deleted'); } catch (e) { setMessage('❌ Failed to delete: ' + (e.response?.data?.error || e.message)); }
                                            }} className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-semibold">Delete</button>
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
    return null;
}


