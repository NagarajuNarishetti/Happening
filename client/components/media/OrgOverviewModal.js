import React from "react";

export default function OrgOverviewModal({
    showOrgModal,
    selectedOrg,
    closeOrgOverview,
    loadingOrgMembers,
    orgMembers
}) {
    if (!showOrgModal || !selectedOrg) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={closeOrgOverview}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">{selectedOrg.name?.[0]?.toUpperCase?.()}</div>
                        <div>
                            <h3 className="text-xl font-semibold text-gray-800">{selectedOrg.name}</h3>
                            <div className="text-xs text-gray-500">Overview</div>
                        </div>
                    </div>
                    <button onClick={closeOrgOverview} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="grid md:grid-cols-3 gap-6 mb-4">
                    <div className="md:col-span-1 space-y-3">
                        <div>
                            <div className="text-xs text-gray-500">Owner</div>
                            <div className="text-sm font-medium text-gray-800">{selectedOrg.owner_username || '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Members</div>
                            <div className="text-sm font-medium text-gray-800">{selectedOrg.member_count ?? '—'}</div>
                        </div>
                        {selectedOrg.joined_at && (
                            <div>
                                <div className="text-xs text-gray-500">Joined</div>
                                <div className="text-sm font-medium text-gray-800">{new Date(selectedOrg.joined_at).toLocaleDateString()}</div>
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <div className="text-sm font-semibold text-gray-800 mb-2">Member Directory</div>
                        {loadingOrgMembers ? (
                            <div className="text-center py-6 text-sm text-gray-600">Loading members…</div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-auto">
                                {orgMembers.map(m => (
                                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-blue-50/50 border-blue-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">{m.username?.[0]?.toUpperCase?.()}</div>
                                            <div>
                                                <div className="text-sm font-medium text-gray-800">{m.username}</div>
                                                <div className="text-xs text-gray-600">{m.email}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-700 uppercase px-2 py-1 rounded-full border bg-white">{String(m.role).toUpperCase()}</div>
                                    </div>
                                ))}
                                {orgMembers.length === 0 && (
                                    <div className="text-center py-6 text-sm text-gray-600">No members found.</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end">
                    <button onClick={closeOrgOverview} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow">Close</button>
                </div>
            </div>
        </div>
    );
}


