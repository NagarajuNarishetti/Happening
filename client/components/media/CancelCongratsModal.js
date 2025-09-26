import React from "react";

export default function CancelCongratsModal({
    showCancelCongrats,
    setShowCancelCongrats,
    cancelCongratsData
}) {
    if (!showCancelCongrats || !cancelCongratsData) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowCancelCongrats(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
                <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Cancellation Successful!</h3>
                    <div>
                        <p className="text-gray-600 mb-3">You have successfully cancelled your seat(s).</p>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                            <p className="text-green-800 font-semibold mb-1">Cancelled Seats:</p>
                            <p className="text-green-700 text-lg">
                                {cancelCongratsData.cancelled_seats && cancelCongratsData.cancelled_seats.length > 0
                                    ? `Seat${cancelCongratsData.cancelled_seats.length > 1 ? 's' : ''} ${cancelCongratsData.cancelled_seats.join(', ')}`
                                    : `${cancelCongratsData.seat_count} seat${cancelCongratsData.seat_count > 1 ? 's' : ''} cancelled`}
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
                        <p className="text-sm text-gray-600 mb-1">Event:</p>
                        <p className="font-semibold text-gray-800">{cancelCongratsData.event_name}</p>
                    </div>
                    {cancelCongratsData.remaining_seats > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-left">
                            <p className="text-sm text-blue-600 mb-1">Remaining Seats:</p>
                            <p className="font-semibold text-blue-800">{cancelCongratsData.remaining_seats} seat{cancelCongratsData.remaining_seats > 1 ? 's' : ''} still confirmed</p>
                        </div>
                    )}
                    <button onClick={() => setShowCancelCongrats(false)} className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors">Got it!</button>
                </div>
            </div>
        </div>
    );
}


