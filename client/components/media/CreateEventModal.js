import React, { useEffect, useState } from "react";

export default function CreateEventModal({
    showCreateModal,
    setShowCreateModal,
    newEvent,
    setNewEvent,
    isSwitchView,
    switchOrgId,
    organizations,
    creating,
    setCreating,
    setMessage,
    fetchEvents,
    currentUserId,
    API
}) {
    const [totalSlotsInput, setTotalSlotsInput] = useState(String(newEvent.total_slots ?? ''));

    useEffect(() => {
        if (showCreateModal) {
            setTotalSlotsInput(String(newEvent.total_slots ?? ''));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCreateModal]);
    if (!showCreateModal) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Create Event</h3>
                    <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Organization</label>
                        {isSwitchView ? (
                            <select value={newEvent.org_id || String(switchOrgId || '')} onChange={(e) => setNewEvent({ ...newEvent, org_id: e.target.value })} disabled className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50">
                                <option value={String(switchOrgId || '')}>{organizations.find(o => String(o.id) === String(switchOrgId))?.name || 'Selected organization'}</option>
                            </select>
                        ) : (
                            <select value={newEvent.org_id} onChange={(e) => setNewEvent({ ...newEvent, org_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                                <option value="">Select organization</option>
                                {organizations.filter(o => String(o.role).toLowerCase() === 'organizer').map(o => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Name</label>
                        <input value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Event name" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-700 mb-1">Description</label>
                        <textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Event description" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Category</label>
                        <select value={newEvent.category} onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                            <option value="webinar">Webinar</option>
                            <option value="concert">Concert</option>
                            <option value="hackathon">Hackathon</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Event Date & Time</label>
                        <input type="datetime-local" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Total Slots</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={totalSlotsInput}
                            onChange={(e) => {
                                const onlyDigits = String(e.target.value || '').replace(/[^0-9]/g, '');
                                setTotalSlotsInput(onlyDigits);
                                if (onlyDigits === '') {
                                    setNewEvent({ ...newEvent, total_slots: '' });
                                } else {
                                    const parsed = parseInt(onlyDigits, 10);
                                    setNewEvent({ ...newEvent, total_slots: isNaN(parsed) ? '' : parsed });
                                }
                            }}
                            onBlur={() => {
                                const parsed = parseInt(totalSlotsInput || '0', 10);
                                const clamped = Math.max(1, isNaN(parsed) ? 1 : parsed);
                                setTotalSlotsInput(String(clamped));
                                setNewEvent({ ...newEvent, total_slots: clamped });
                            }}
                            onWheel={(e) => { try { e.currentTarget.blur(); } catch (_) { } }}
                            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); } }}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            placeholder="Enter total slots"
                        />
                    </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl border text-sm">Cancel</button>
                    <button disabled={creating} onClick={async () => {
                        if (!newEvent.org_id || !newEvent.name || !newEvent.event_date) {
                            setMessage("❌ Please fill organization, name and date");
                            return;
                        }
                        setCreating(true);
                        setMessage("");
                        try {
                            await API.post('/events', {
                                org_id: isSwitchView ? (newEvent.org_id || switchOrgId) : newEvent.org_id,
                                created_by: currentUserId,
                                name: newEvent.name,
                                description: newEvent.description,
                                category: newEvent.category,
                                event_date: newEvent.event_date,
                                total_slots: Math.max(1, parseInt(newEvent.total_slots || 1, 10))
                            });
                            setMessage("✅ Event created");
                            await fetchEvents();
                            setNewEvent({ org_id: "", name: "", description: "", category: "webinar", event_date: "", total_slots: 50 });
                            setShowCreateModal(false);
                            try { document.getElementById('organizer-events-list')?.scrollIntoView({ behavior: 'smooth' }); } catch (_) { }
                        } catch (e) {
                            setMessage("❌ Failed to create event: " + (e.response?.data?.error || e.message));
                        } finally {
                            setCreating(false);
                        }
                    }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{creating ? 'Creating...' : 'Create Event'}</button>
                </div>
            </div>
        </div>
    );
}


