import React from "react";

export default function ManageSeatsModal({
    showManageSeatsModal,
    setShowManageSeatsModal,
    manageBooking,
    manageSeats,
    setManageSeats,
    API,
    setMessage,
    setCancelCongratsData,
    setShowCancelCongrats,
    fetchEvents,
    fetchMyBookings,
    currentUserId
}) {
    if (!showManageSeatsModal || !manageBooking) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowManageSeatsModal(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Manage Seats - {manageBooking.event_name}</h3>
                    <button onClick={() => setShowManageSeatsModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-sm font-medium text-blue-800">Your Current Seats</span>
                        </div>
                        <div className="text-lg font-bold text-blue-900">
                            {manageSeats.filter(s => s.status === 'booked').length} seats
                        </div>
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                        Total confirmed seats you hold for this event
                    </div>
                </div>

                <div className="text-sm text-gray-600 mb-3">Select seats to cancel. Confirmed seats are listed below.</div>
                <div className="grid grid-cols-6 gap-2 max-h-60 overflow-auto p-2 border rounded-lg">
                    {manageSeats.map((s, idx) => (
                        <label key={`${s.booking_id || 'b'}-${s.seat_no}-${idx}`} className={`flex items-center gap-2 text-xs px-2 py-1 rounded border ${s.status === 'booked' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <input type="checkbox" disabled={s.status !== 'booked'} onChange={(e) => {
                                if (e.target.checked) setManageSeats(prev => prev.map((x, i) => i === idx ? { ...x, _selected: true } : x));
                                else setManageSeats(prev => prev.map((x, i) => i === idx ? { ...x, _selected: false } : x));
                            }} />
                            Seat {s.seat_no}
                        </label>
                    ))}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={() => setShowManageSeatsModal(false)} className="px-4 py-2 rounded-xl border text-sm">Close</button>
                    <button onClick={async () => {
                        const selected = manageSeats.filter(s => s._selected && s.status === 'booked');
                        if (selected.length === 0) { setShowManageSeatsModal(false); return; }
                        try {
                            const ok = window.confirm(`Cancel ${selected.length} seat(s)?`);
                            if (!ok) return;
                            if (manageBooking?.grouped) {
                                const byBooking = new Map();
                                for (const s of selected) {
                                    if (!byBooking.has(s.booking_id)) byBooking.set(s.booking_id, []);
                                    byBooking.get(s.booking_id).push(s.seat_no);
                                }
                                for (const [bid, seatNos] of byBooking.entries()) {
                                    await API.post(`/bookings/${bid}/cancel-seats`, { seat_numbers: seatNos });
                                }
                            } else {
                                const toCancel = selected.map(s => s.seat_no);
                                await API.post(`/bookings/${manageBooking.booking_id}/cancel-seats`, { seat_numbers: toCancel });
                            }

                            const cancelledSeats = selected.map(s => s.seat_no);
                            const remainingSeats = manageSeats.filter(s => s.status === 'booked' && !s._selected).length;

                            setCancelCongratsData({
                                cancelled_seats: cancelledSeats,
                                seat_count: selected.length,
                                remaining_seats: remainingSeats,
                                event_name: manageBooking.event_name
                            });
                            setShowCancelCongrats(true);

                            setShowManageSeatsModal(false);
                            await Promise.all([fetchEvents(), fetchMyBookings(currentUserId)]);
                        } catch (e) {
                            setMessage('❌ Failed to cancel seats: ' + (e.response?.data?.error || e.message));
                        }
                    }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold">Cancel Selected</button>
                </div>
            </div>
        </div>
    );
}


