import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import API from "../../lib/api";

export default function CancelBookingPage() {
    const router = useRouter();
    const { id, orgId, bks } = { id: router.query.id, orgId: router.query.orgId, bks: router.query.bks };
    const [eventName, setEventName] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState('');
    const [orgName, setOrgName] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const all = await API.get(`/events`);
                const ev = (Array.isArray(all.data) ? all.data : []).find(e => String(e.id) === String(id));
                setEventName(ev?.name || 'Event');
            } catch { }
        };
        if (id) load();
    }, [id]);

    useEffect(() => {
        const loadOrg = async () => {
            if (!orgId) return;
            try {
                const res = await API.get(`/organizations/${encodeURIComponent(orgId)}`);
                const name = res?.data?.name;
                if (name) setOrgName(name);
            } catch { }
        };
        loadOrg();
    }, [orgId]);

    const cancelAll = async () => {
        try {
            setConfirming(true);
            const ids = String(bks || '').split(',').filter(Boolean);
            await Promise.all(ids.map(bid => API.post(`/bookings/${bid}/cancel`)));
            setMessage('✅ Your booking has been cancelled.');
        } catch (e) {
            setMessage('❌ Failed to cancel: ' + (e.response?.data?.error || e.message));
        } finally {
            setConfirming(false);
        }
    };

    const crumbs = [
        { label: 'Home', href: '/home' },
        ...(orgId ? [{ label: orgName || 'Organization', href: `/switch/${orgId}` }] : []),
        { label: 'Cancel Booking' }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <nav className="max-w-7xl mx-auto mt-4 px-8" aria-label="Breadcrumb">
                <ol className="flex items-center text-sm text-slate-600">
                    {crumbs.map((c, i) => (
                        <li key={i} className="flex items-center">
                            {i > 0 && <span className="mx-2 text-slate-400">›</span>}
                            {c.href ? <a className="hover:text-indigo-600 font-medium" href={c.href}>{c.label}</a> : <span className="text-slate-800 font-semibold">{c.label}</span>}
                        </li>
                    ))}
                </ol>
            </nav>

            <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 mt-6 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Cancel booking — {eventName}</h2>
                <p className="text-gray-700 mb-6">Are you sure you want to cancel your booking? This action cannot be undone.</p>
                <div className="flex items-center justify-end gap-3">
                    <a href={orgId ? `/switch/${orgId}` : '/home'} className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Back</a>
                    <button onClick={cancelAll} disabled={confirming} className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold shadow">
                        {confirming ? 'Cancelling…' : 'Cancel booking'}
                    </button>
                </div>
                {message && <div className="mt-4 text-sm text-gray-800">{message}</div>}
            </div>
        </div>
    );
}


