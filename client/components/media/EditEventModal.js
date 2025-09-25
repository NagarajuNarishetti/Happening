import React from "react";

export default function EditEventModal({
    showEditModal,
    setShowEditModal,
    editingEvent,
    editDescription,
    setEditDescription,
    API,
    setMessage,
    fetchEvents,
    currentUserId
}) {
    if (!showEditModal || !editingEvent) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowEditModal(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Edit Event</h3>
                    <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Name</label>
                        <input disabled value={editingEvent.name || ''} className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Description</label>
                        <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} placeholder="Event description" />
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-xl border text-sm">Cancel</button>
                    <button onClick={async () => {
                        try {
                            await API.put(`/events/${editingEvent.id}`, { description: editDescription, user_id: currentUserId });
                            setMessage('✅ Event updated');
                            await fetchEvents();
                            setShowEditModal(false);
                        } catch (e) {
                            setMessage('❌ Failed to update: ' + (e.response?.data?.error || e.message));
                        }
                    }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold">Save</button>
                </div>
            </div>
        </div>
    );
}


