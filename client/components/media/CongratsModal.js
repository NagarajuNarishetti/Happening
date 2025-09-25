import React from "react";

export default function CongratsModal({
    showCongrats,
    setShowCongrats,
    congratsData
}) {
    if (!showCongrats || !congratsData) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowCongrats(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
                <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Congratulations!</h3>
                    {congratsData.status === 'confirmed' ? (
                        <div>
                            <p className="text-gray-600 mb-3">You have successfully booked your tickets!</p>
                            <p className="text-indigo-600 font-semibold mb-3">Thank you for choosing us!</p>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                <p className="text-green-800 font-semibold mb-1">Your Seats:</p>
                                <p className="text-green-700 text-lg">
                                    {congratsData.assigned_seats && congratsData.assigned_seats.length > 0
                                        ? `Seat${congratsData.assigned_seats.length > 1 ? 's' : ''} ${congratsData.assigned_seats.join(', ')}`
                                        : `Seat${congratsData.seats > 1 ? 's' : ''} assigned`}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-gray-600 mb-3">The event is currently full, but you've been added to the waiting list!</p>
                            <p className="text-indigo-600 font-semibold mb-3">Thank you for your interest!</p>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                                <p className="text-yellow-800 font-semibold mb-1">Waiting List Position:</p>
                                <p className="text-yellow-700 text-lg">#{congratsData.waiting_number || 'Unknown'}</p>
                                <p className="text-yellow-600 text-sm mt-1">You'll be notified if seats become available</p>
                            </div>
                        </div>
                    )}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
                        <p className="text-sm text-gray-600 mb-1">Event:</p>
                        <p className="font-semibold text-gray-800">{congratsData.event_name}</p>
                    </div>
                    <button onClick={() => setShowCongrats(false)} className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors">Got it!</button>
                </div>
            </div>
        </div>
    );
}


