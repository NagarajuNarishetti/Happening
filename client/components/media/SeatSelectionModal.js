import React from "react";

export default function SeatSelectionModal({
    showSeatSelect,
    seatSelect,
    setShowSeatSelect,
    setSeatError,
    seatError,
    desiredSeatsInput,
    setDesiredSeatsInput,
    bookingLoading,
    setBookingLoading,
    API,
    currentUserId,
    fetchEvents,
    fetchMyBookings,
    setMessage,
    setCongratsData,
    setShowCongrats,
    socketRef,
    io
}) {
    if (!showSeatSelect || !seatSelect?.event) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSeatSelect(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl mx-4 p-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Select Seats - {seatSelect.event.name}</h3>
                    <button onClick={() => setShowSeatSelect(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <h4 className="font-semibold text-gray-800">{seatSelect.event.name}</h4>
                        </div>
                        <div className="text-xs text-gray-600 capitalize">{seatSelect.event.category || 'Event'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-1 text-gray-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                            </svg>
                            <span>{seatSelect.event.event_date ? new Date(seatSelect.event.event_date).toLocaleString() : 'Date TBD'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            <span>Organizer: {seatSelect.event.organizer_username || 'Unknown'}</span>
                        </div>
                    </div>
                    <div className="mt-2 bg-white/60 rounded p-2">
                        <div className="flex items-center justify-between text-xs">
                            <span>Capacity: <span className="font-semibold text-blue-600">{seatSelect.event.total_slots || 0}</span></span>
                            <span>Available: <span className="font-semibold text-green-600">{seatSelect.event.available_slots || 0}</span></span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, ((seatSelect.event.total_slots - seatSelect.event.available_slots) / seatSelect.event.total_slots) * 100))}%` }}></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {seatSelect.event.total_slots - seatSelect.event.available_slots} of {seatSelect.event.total_slots} seats booked
                        </div>
                    </div>
                </div>
                {Number(seatSelect.event.available_slots || 0) > 0 ? (
                    <div className="text-sm text-gray-600 mb-3">Green = available, Dark green = your selection, Gray = selected by others (temporary), Red = booked. FCFS applies when booking.</div>
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
                            }} onWheel={(e) => { try { e.currentTarget.blur(); } catch (_) { } }} onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); } }} className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                            <span className="text-sm text-gray-600">Available: <span className="font-semibold text-green-600">{Number(seatSelect.event.available_slots) ?? 0}</span></span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-green-200 rounded"></div>
                                <span>Available</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-emerald-600 rounded"></div>
                                <span>Selected</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-gray-300 rounded"></div>
                                <span>Held</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-red-200 rounded"></div>
                                <span>Booked</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-800">Available Seats</h4>
                        <div className="text-xs text-gray-500">{seatSelect.seats.filter(s => s.selected).length} selected</div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 max-h-[300px] overflow-auto p-2 border border-gray-100 rounded bg-gray-50">
                        {seatSelect.seats.map(s => (
                            <button key={s.seat_no} disabled={s.taken} onClick={() => {
                                const nextSelected = seatSelect.seats.map(x => x.seat_no === s.seat_no ? { ...x, selected: !x.selected } : x);
                                const selected = nextSelected.filter(x => x.selected).map(x => x.seat_no);
                                try { socketRef.current?.emit('event:holds:set', { eventId: seatSelect.event.id, seats: selected }); } catch { }
                                // set after emit for consistency
                                seatSelect.seats = nextSelected;
                            }} className={`px-2 py-1.5 text-xs font-medium rounded transition-all duration-200 ${s.taken ? 'bg-red-100 text-red-700 cursor-not-allowed border border-red-200' : (s.selected ? 'bg-emerald-600 text-white shadow-md transform scale-105' : (s.held ? 'bg-gray-200 text-gray-600 cursor-not-allowed border border-gray-300' : 'bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 border border-emerald-200 hover:shadow-sm'))}`}>
                                {s.seat_no}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <span className="text-sm font-medium text-gray-700">Selected: {seatSelect.seats.filter(s => s.selected).length}</span>
                            </div>
                            {seatSelect.seats.filter(s => s.selected).length > 0 && (
                                <div className="text-xs text-gray-500">Seats: {seatSelect.seats.filter(s => s.selected).map(s => s.seat_no).join(', ')}</div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setSeatError(""); setShowSeatSelect(false); }} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                            <button onClick={async () => {
                                const selected = seatSelect.seats.filter(s => s.selected).map(s => s.seat_no);
                                const seatsToBook = Math.max(1, selected.length, Number(desiredSeatsInput) || 1);
                                const remaining = Number(seatSelect.event.available_slots || 0);
                                if (remaining > 0 && seatsToBook > remaining) {
                                    setSeatError(`Sorry, we only have ${remaining} ticket${remaining === 1 ? '' : 's'} left.`);
                                    return;
                                }
                                try {
                                    setBookingLoading(true);
                                    const resp = await API.post('/bookings', { event_id: seatSelect.event.id, user_id: currentUserId, seats: seatsToBook, seat_numbers: selected });
                                    setCongratsData({
                                        status: resp?.data?.status || 'confirmed',
                                        assigned_seats: resp?.data?.assigned_seats || [],
                                        waiting_number: resp?.data?.waiting_number,
                                        seats: seatsToBook,
                                        event_name: seatSelect.event.name
                                    });
                                    setShowCongrats(true);
                                    setShowSeatSelect(false);
                                    try { socketRef.current?.emit('event:holds:clear', { eventId: seatSelect.event.id }); } catch { }
                                    await Promise.all([fetchEvents(), fetchMyBookings(currentUserId)]);
                                } catch (e) {
                                    if (e.response?.status === 409 && e.response?.data?.error === 'seats_conflict') {
                                        const unavailable = e.response.data.unavailable || [];
                                        setMessage(`❌ Some seats were already booked: ${unavailable.join(', ')}`);
                                    } else {
                                        setMessage('❌ Failed to book: ' + (e.response?.data?.error || e.message));
                                    }
                                } finally {
                                    setBookingLoading(false);
                                }
                            }} disabled={bookingLoading} className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                {bookingLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Processing...</span>
                                    </div>
                                ) : (
                                    'Book Seats'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


