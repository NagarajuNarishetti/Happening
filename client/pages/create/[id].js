import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import CreateEventModal from "../../components/media/CreateEventModal";
import API from "../../lib/api";

export default function CreateEventPage({ keycloak }) {
    const router = useRouter();
    const { id } = router.query; // organization id (optional)

    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState("");
    const [currentUserId, setCurrentUserId] = useState(null);
    const [organizations, setOrganizations] = useState([]);
    const [newEvent, setNewEvent] = useState({ org_id: "", name: "", description: "", category: "webinar", event_date: "", total_slots: 50 });

    const isAuthed = Boolean(keycloak?.authenticated);

    const switchedOrg = useMemo(() => {
        if (!id) return null;
        return organizations.find(o => String(o.id) === String(id)) || null;
    }, [organizations, id]);

    const Breadcrumbs = () => (
        <nav className="max-w-7xl mx-auto mt-4 px-8" aria-label="Breadcrumb">
            <ol className="flex items-center text-sm text-slate-600">
                <li className="flex items-center">
                    <a href="/home" className="hover:text-indigo-600 font-medium">Home</a>
                </li>
                {id && (
                    <li className="flex items-center">
                        <span className="mx-2 text-slate-400">›</span>
                        <a href={`/switch/${encodeURIComponent(id)}`} className="hover:text-indigo-600 font-medium">{switchedOrg?.name || 'Organization'}</a>
                    </li>
                )}
                <li className="flex items-center">
                    <span className="mx-2 text-slate-400">›</span>
                    <span className="text-slate-800 font-semibold">Create Event</span>
                </li>
            </ol>
        </nav>
    );

    const goBack = () => {
        if (id) router.push(`/switch/${encodeURIComponent(id)}`);
        else router.push('/home');
    };

    const getCurrentUser = async () => {
        if (!keycloak?.authenticated) return null;
        try {
            const keycloakId = keycloak.tokenParsed?.sub;
            const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);
            if (userResponse.data.length === 0) {
                const newUser = await API.post("/users", {
                    keycloak_id: keycloakId,
                    username: keycloak.tokenParsed?.preferred_username || "Unknown",
                    email: keycloak.tokenParsed?.email || "",
                    role: "user",
                });
                return { id: newUser.data.id };
            }
            const user = userResponse.data[0];
            return { id: user.id };
        } catch (err) {
            console.error("Error getting current user:", err);
            return null;
        }
    };

    const fetchOrganizationsForUser = async (userId) => {
        try {
            const res = await API.get(`/organizations/user/${userId}`);
            setOrganizations(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Error fetching organizations for user", err);
            setOrganizations([]);
        }
    };

    useEffect(() => {
        const init = async () => {
            if (!isAuthed) return;
            const userData = await getCurrentUser();
            const uid = userData?.id || null;
            setCurrentUserId(uid);
            if (uid) {
                await fetchOrganizationsForUser(uid);
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed]);

    // Default org to route param when present
    useEffect(() => {
        if (!id) return;
        setNewEvent(prev => ({ ...prev, org_id: String(id) }));
    }, [id]);

    // No-op for fetchEvents in modal; after success navigate back
    const fetchEvents = async () => { };

    if (!isAuthed) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
                    <h2 className="text-3xl font-bold text-gray-800 mb-4 tracking-wide">Please sign in</h2>
                    <p className="text-gray-600 mb-8 leading-relaxed">You need to be authenticated to create an event.</p>
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={() => keycloak.login()} className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl border border-blue-300 tracking-wider">Sign in</button>
                        <a href="/" className="px-8 py-3 rounded-2xl border border-blue-200 text-blue-700 bg-white/70 hover:bg-white">Back to home</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <Breadcrumbs />
            <CreateEventModal
                showCreateModal={true}
                setShowCreateModal={() => goBack()}
                newEvent={newEvent}
                setNewEvent={setNewEvent}
                isSwitchView={Boolean(id)}
                switchOrgId={id || null}
                organizations={organizations}
                creating={creating}
                setCreating={setCreating}
                setMessage={setMessage}
                fetchEvents={async () => { try { await fetchEvents(); } finally { goBack(); } }}
                currentUserId={currentUserId}
                API={API}
            />
            {message && (
                <div className={`max-w-7xl mx-auto mt-6 ${message.includes('✅') ? 'text-green-700' : 'text-red-700'}`}>{message}</div>
            )}
        </div>
    );
}


