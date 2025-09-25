import { useEffect, useMemo, useState, useRef } from "react";
import { io } from "socket.io-client";
import API from "../lib/api";
import InvitationsButton from "../components/InvitationsButton";
import { useRouter } from "next/router";

export default function MediaPage({ keycloak }) {
    const [events, setEvents] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState(null);
    // Filters & sorting
    const [upcomingStatus, setUpcomingStatus] = useState('upcoming'); // all | upcoming | completed
    const [upcomingOrgFilter, setUpcomingOrgFilter] = useState('all'); // 'all' or org_id
    const [upcomingSort, setUpcomingSort] = useState('dateAsc'); // dateAsc | dateDesc

    const [yourStatus, setYourStatus] = useState('all');
    const [yourOrgFilter, setYourOrgFilter] = useState('all');
    const [yourSort, setYourSort] = useState('dateDesc');
    // Booking flow now happens via the View → seat selection modal only
    const [bookingLoading, setBookingLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [myBookings, setMyBookings] = useState([]);
    // Congratulations popup state
    const [showCongrats, setShowCongrats] = useState(false);
    const [congratsData, setCongratsData] = useState(null);
    // Cancellation congratulations popup state
    const [showCancelCongrats, setShowCancelCongrats] = useState(false);
    const [cancelCongratsData, setCancelCongratsData] = useState(null);
    // Create-event form state
    const [creating, setCreating] = useState(false);
    const [newEvent, setNewEvent] = useState({ org_id: "", name: "", description: "", category: "webinar", event_date: "", total_slots: 50 });
    const [showCreateModal, setShowCreateModal] = useState(false);
    // Edit-event modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null); // event object
    const [editDescription, setEditDescription] = useState("");
    // Manage seats modal
    const [showManageSeatsModal, setShowManageSeatsModal] = useState(false);
    const [manageBooking, setManageBooking] = useState(null);
    const [manageSeats, setManageSeats] = useState([]);
    // Seat selection for upcoming events
    const [showSeatSelect, setShowSeatSelect] = useState(false);
    const [seatSelect, setSeatSelect] = useState(null);
    const [seatError, setSeatError] = useState("");
    const [desiredSeatsInput, setDesiredSeatsInput] = useState("1");
    const socketRef = useRef(null);
    const heartbeatRef = useRef(null);
    const router = useRouter();
    const [selectedOrgId, setSelectedOrgId] = useState("");
    const switchOrgId = router?.query?.id || router?.query?.orgId || null;
    const isSwitchView = Boolean(switchOrgId);

    const toLower = (v) => String(v || '').toLowerCase().trim();
    const isOrganizerRole = (role) => {
        const r = toLower(role);
        return r === 'organizer' || r === 'agent' || r === 'reviewer' || r === 'orgadmin' || r === 'owner';
    };
    const isBookingRole = (role) => {
        const r = toLower(role);
        return r === 'user' || r === 'customer' || r === 'viewer';
    };
    const displayRole = (role) => {
        const r = toLower(role);
        if (r === 'orgadmin' || r === 'owner') return 'OrgAdmin';
        if (r === 'agent' || r === 'reviewer' || r === 'organizer') return 'Organizer';
        return 'User';
    };
    const getRoleBadgeColor = (role) => {
        const r = toLower(role);
        if (r === 'orgadmin' || r === 'owner') return 'bg-indigo-600/10 text-indigo-700 border-indigo-300';
        if (r === 'agent' || r === 'reviewer' || r === 'organizer') return 'bg-emerald-600/10 text-emerald-700 border-emerald-300';
        return 'bg-gray-600/10 text-gray-800 border-gray-300';
    };
    const userOrgIdsForBooking = useMemo(() => {
        const ids = new Set();
        for (const o of organizations) {
            if (isBookingRole(o.role)) ids.add(o.id);
        }
        return ids;
    }, [organizations]);

    const organizerOrgIds = useMemo(() => {
        const ids = new Set();
        for (const o of organizations) {
            if (isOrganizerRole(o.role)) ids.add(o.id);
        }
        return ids;
    }, [organizations]);

    const switchOrgRole = useMemo(() => {
        if (!isSwitchView) return null;
        const org = organizations.find(o => String(o.id) === String(switchOrgId));
        return toLower(org?.role);
    }, [organizations, isSwitchView, switchOrgId]);
    const isSwitchOrganizer = isOrganizerRole(switchOrgRole);

    // Selected organization details when viewing via /switch/[id]
    const switchedOrg = useMemo(() => {
        if (!isSwitchView) return null;
        return organizations.find(o => String(o.id) === String(switchOrgId)) || null;
    }, [organizations, isSwitchView, switchOrgId]);

    // When switched into an org, default both filters to that org
    useEffect(() => {
        if (!isSwitchView || !switchOrgId) return;
        // Only set if the org exists in the loaded organizations
        const exists = organizations.some(o => String(o.id) === String(switchOrgId));
        if (!exists) return;
        setUpcomingOrgFilter(String(switchOrgId));
        setYourOrgFilter(String(switchOrgId));
    }, [isSwitchView, switchOrgId, organizations]);

    // Inline organization overview modal state
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [orgMembers, setOrgMembers] = useState([]);
    const [loadingOrgMembers, setLoadingOrgMembers] = useState(false);

    const openOrgOverview = async (org) => {
        if (!org?.id) return;
        setSelectedOrg(org);
        setShowOrgModal(true);
        setLoadingOrgMembers(true);
        try {
            const response = await API.get(`/organizations/${org.id}/members`);
            setOrgMembers(Array.isArray(response.data) ? response.data : []);
        } catch (_) {
            setOrgMembers([]);
        } finally {
            setLoadingOrgMembers(false);
        }
    };
    const closeOrgOverview = () => {
        setShowOrgModal(false);
        setSelectedOrg(null);
        setOrgMembers([]);
    };

    // Friendly time-of-day greeting
    const greeting = useMemo(() => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    }, []);

    // In switch-organizer view, default new event's org to the switched org
    useEffect(() => {
        if (isSwitchView && isSwitchOrganizer && switchOrgId && !newEvent.org_id) {
            setNewEvent(prev => ({ ...prev, org_id: String(switchOrgId) }));
        }
    }, [isSwitchView, isSwitchOrganizer, switchOrgId]);

    const showUpcomingSection = !isSwitchView || !isSwitchOrganizer;

    // Helper function to get organization name from filter
    const getOrgNameFromFilter = (orgFilter) => {
        if (orgFilter === 'all') return 'all organizations';
        const org = organizations.find(o => String(o.id) === String(orgFilter));
        return org?.name || 'selected organization';
    };

    // Helper function to format filter display text
    const getFilterDisplayText = () => {
        const statusText = upcomingStatus === 'all' ? 'all events' :
            upcomingStatus === 'upcoming' ? 'upcoming events' : 'completed events';
        const orgText = getOrgNameFromFilter(upcomingOrgFilter);
        const sortText = upcomingSort === 'dateAsc' ? 'date (ascending)' : 'date (descending)';

        return `${statusText} from ${orgText} sorted by ${sortText}`;
    };
    const showYourEventsSection = !isSwitchView || !isSwitchOrganizer;

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

    const fetchEvents = async () => {
        try {
            // Always fetch all events; UI handles filtering so booked-event cards have metadata
            const res = await API.get(`/events`);
            setEvents(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Error fetching events", err);
            setEvents([]);
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

    const fetchMyBookings = async (userId) => {
        if (!userId) return setMyBookings([]);
        try {
            const res = await API.get(`/bookings/user/${userId}`);
            setMyBookings(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching my bookings', err);
            setMyBookings([]);
        }
    };

    useEffect(() => {
        const init = async () => {
            if (!keycloak?.authenticated) {
                setLoading(false);
                return;
            }
            try {
                const userData = await getCurrentUser();
                const uid = userData?.id || null;
                setCurrentUserId(uid);
                if (uid) {
                    await Promise.all([
                        fetchOrganizationsForUser(uid),
                        fetchMyBookings(uid)
                    ]);
                }
                await fetchEvents();
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [keycloak?.authenticated]);

    // Default selected org in minimal view (exclude admin/owner roles)
    useEffect(() => {
        const selectable = organizations.filter(o => {
            const r = toLower(o.role);
            return !(r === 'orgadmin' || r === 'owner');
        });
        if (!selectedOrgId && selectable.length > 0) {
            setSelectedOrgId(String(selectable[0].id));
        }
    }, [organizations, selectedOrgId]);

    // Heartbeat while seat modal is open
    useEffect(() => {
        if (showSeatSelect && seatSelect?.event?.id) {
            // start heartbeat
            heartbeatRef.current = setInterval(() => {
                try { socketRef.current?.emit('event:holds:heartbeat', { eventId: seatSelect.event.id }); } catch { }
            }, 8000);
            return () => {
                try { socketRef.current?.emit('event:holds:clear', { eventId: seatSelect.event.id }); } catch { }
                if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
            };
        }
    }, [showSeatSelect, seatSelect?.event?.id]);

    // Direct booking button removed; booking is handled inside the seat selection modal

    if (!keycloak?.authenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
                    <h2 className="text-3xl font-bold text-gray-800 mb-4 tracking-wide">Please sign in</h2>
                    <p className="text-gray-600 mb-8 leading-relaxed">You need to be authenticated to view your workspace.</p>
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={() => keycloak.login()} className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl border border-blue-300 tracking-wider">Sign in</button>
                        <a href="/" className="px-8 py-3 rounded-2xl border border-blue-200 text-blue-700 bg-white/70 hover:bg-white">Back to home</a>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-2xl"></div>
                    <p className="text-gray-700 text-xl font-semibold tracking-wide">Loading...</p>
                </div>
            </div>
        );
    }

    // If user hasn't switched into an organization, still show a nice greeting header
    if (!isSwitchView) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
                <div className="pt-10 px-8 pb-8">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-10">
                            <div className="relative overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-r from-white to-blue-50 shadow-xl">
                                <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,_rgba(59,130,246,0.15),_transparent_60%)]"></div>
                                <div className="relative flex items-center justify-between px-6 sm:px-10 py-8">
                                    <div className="min-w-0">
                                        <div className="text-sm text-blue-700/80 font-semibold flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                            Signed in
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">
                                                {greeting}, {keycloak.tokenParsed?.preferred_username}
                                            </h1>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">Here’s what’s happening in your workspace today.</p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold flex items-center justify-center shadow-lg border border-white/40">
                                            {keycloak.tokenParsed?.preferred_username?.[0]?.toUpperCase?.()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Switch panel */}
                        <div className="max-w-xl w-full bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-3xl shadow-2xl p-8 mx-auto text-center">
                            <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold mb-4">H</div>
                            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Switch into an organization to continue</h2>
                            <p className="text-slate-600 mb-6">Choose an organization to access booking and event features. You can switch organizations anytime from the navbar.</p>
                            {organizations.filter(o => { const r = toLower(o.role); return !(r === 'orgadmin' || r === 'owner'); }).length > 0 ? (
                                <div className="flex items-center justify-center gap-2 mb-6">
                                    <select value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm min-w-[220px]">
                                        {organizations.filter(o => { const r = toLower(o.role); return !(r === 'orgadmin' || r === 'owner'); }).map(o => (
                                            <option key={`org-opt-${o.id}`} value={String(o.id)}>{o.name}</option>
                                        ))}
                                    </select>
                                    <button onClick={() => router.push(`/switch/${encodeURIComponent(selectedOrgId)}`)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">Switch</button>
                                </div>
                            ) : (
                                <div className="mb-6 text-sm text-slate-500">No eligible organizations to switch. Ask an organizer to add you as a member.</div>
                            )}
                            <div className="text-xs text-slate-500">Tip: Switch organizations anytime from the navbar.</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <div className="pt-10 px-8 pb-2">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-10">
                        <div className="relative overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-r from-white to-blue-50 shadow-xl">
                            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,_rgba(59,130,246,0.15),_transparent_60%)]"></div>
                            <div className="relative flex items-center justify-between px-6 sm:px-10 py-8">
                                <div className="min-w-0">
                                    <div className="text-sm text-blue-700/80 font-semibold flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                        {isSwitchView && switchedOrg?.name ? 'Switched to' : 'Signed in'}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">
                                            {greeting}, {keycloak.tokenParsed?.preferred_username}
                                        </h1>
                                        {isSwitchView && switchedOrg?.name && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openOrgOverview(switchedOrg)}
                                                    className="px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-indigo-600/10 text-indigo-700 border border-indigo-200 hover:bg-indigo-600/20 hover:border-indigo-300"
                                                    title="Open organization overview"
                                                >
                                                    {switchedOrg.name}
                                                </button>
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide border shadow-sm ring-1 ring-black/5 ${getRoleBadgeColor(switchedOrg.role)}`}>{displayRole(switchedOrg.role)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600">Here’s what’s happening in your workspace today.</p>
                                </div>
                                <div className="flex-shrink-0">
                                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold flex items-center justify-center shadow-lg border border-white/40">
                                        {keycloak.tokenParsed?.preferred_username?.[0]?.toUpperCase?.()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showUpcomingSection && (
                <div className="px-8 pb-12">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-6">
                                <h2 className="text-2xl font-bold text-gray-800 tracking-wide">Upcoming Events</h2>
                                <div className="text-sm text-gray-600">{events.filter(ev => (userOrgIdsForBooking.has(ev.org_id) || String(ev.created_by) === String(currentUserId))).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length} events</div>
                            </div>
                            <button onClick={fetchEvents} className="px-4 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-white transition-all duration-300 shadow-lg">Refresh</button>
                        </div>
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-3 mb-8">
                            <select value={upcomingStatus} onChange={e => setUpcomingStatus(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="all">All</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="completed">Completed</option>
                            </select>
                            <select value={upcomingOrgFilter} onChange={e => setUpcomingOrgFilter(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="all">All organizations</option>
                                {organizations.filter(o => userOrgIdsForBooking.has(o.id)).map(o => (
                                    <option key={`up-org-${o.id}`} value={String(o.id)}>{o.name}</option>
                                ))}
                            </select>
                            <select value={upcomingSort} onChange={e => setUpcomingSort(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="dateAsc">Date ↑</option>
                                <option value="dateDesc">Date ↓</option>
                            </select>
                        </div>

                        {events.filter(ev => userOrgIdsForBooking.has(ev.org_id)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length === 0 ? (
                            <div className="text-center py-20 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl">
                                <div className="text-6xl mb-6">
                                    <i className="fa-solid fa-folder-open" style={{ color: "#96C2DB", fontSize: "45px" }}></i>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-4 tracking-wide">NO EVENTS FOUND</h3>
                                <p className="text-gray-600 mb-2 max-w-md mx-auto leading-relaxed">
                                    Currently no events for <span className="font-semibold text-gray-700">{getOrgNameFromFilter(upcomingOrgFilter)}</span> with your selected filters.
                                </p>
                                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                                    Filters: {getFilterDisplayText()}
                                </p>
                                <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">Check back later for upcoming events.</p>
                                <button onClick={fetchEvents} className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 backdrop-blur-md text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl hover:shadow-3xl group border border-blue-400 tracking-wide">Refresh</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {events
                                    .filter(ev => (userOrgIdsForBooking.has(ev.org_id) || String(ev.created_by) === String(currentUserId)))
                                    .filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId))
                                    .filter(ev => {
                                        // status filter
                                        const dt = ev.event_date ? new Date(ev.event_date).getTime() : 0;
                                        const now = Date.now();
                                        if (upcomingStatus === 'upcoming') return dt >= now;
                                        if (upcomingStatus === 'completed') return dt && dt < now;
                                        return true;
                                    })
                                    .filter(ev => upcomingOrgFilter === 'all' || String(ev.org_id) === String(upcomingOrgFilter))
                                    .sort((a, b) => {
                                        const da = new Date(a.event_date).getTime();
                                        const db = new Date(b.event_date).getTime();
                                        return upcomingSort === 'dateAsc' ? da - db : db - da;
                                    })
                                    .map((ev) => {
                                        const org = organizations.find(o => String(o.id) === String(ev.org_id));
                                        return (
                                            <div key={ev.id} className="group relative rounded-2xl border border-emerald-200 bg-white shadow-2xl p-4 h-full flex flex-col">
                                                {/* Header Section - Fixed Height */}
                                                <div className="flex items-start justify-between mb-3 h-8">
                                                    <div className="text-lg font-semibold text-gray-800 line-clamp-1 flex-1 pr-2">{ev.name}</div>
                                                    <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={org?.name || ''}>{org?.name || ''}</span>
                                                </div>

                                                {/* Description Section - Fixed Height */}
                                                <div className="text-sm text-gray-600 mb-3 h-10 line-clamp-2 overflow-hidden">{ev.description || "No description"}</div>

                                                {/* Organizer Section - Fixed Height */}
                                                <div className="text-xs text-gray-500 mb-3 h-5 flex items-center">
                                                    <span className="font-medium">Organizer:</span>
                                                    <span className="ml-1 truncate">{ev.organizer_first_name && ev.organizer_last_name
                                                        ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                        : ev.organizer_username || 'Unknown'}</span>
                                                </div>

                                                {/* Category & Date Section - Fixed Height */}
                                                <div className="flex items-center justify-between text-sm text-gray-700 mb-3 h-6">
                                                    <span className="font-medium">{ev.category || 'event'}</span>
                                                    <span className="text-xs">{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                                </div>

                                                {/* Capacity Section - Fixed Height */}
                                                <div className="flex items-center justify-between text-xs text-gray-600 mb-4 h-5">
                                                    <span>Total: {ev.total_slots}</span>
                                                    <span>Available: {ev.available_slots}</span>
                                                </div>

                                                {/* Action Button Section - Fixed at Bottom */}
                                                <div className="mt-auto flex items-center gap-2">
                                                    <button onClick={async () => {
                                                        try {
                                                            const res = await API.get(`/events/${ev.id}/seats`);
                                                            const { total, taken, held } = res.data || { total: ev.total_slots, taken: [], held: [] };
                                                            // Build seat grid metadata
                                                            const seats = Array.from({ length: total }, (_, i) => ({ seat_no: i + 1, taken: taken?.includes(i + 1), held: held?.includes(i + 1) }));
                                                            setSeatSelect({ event: ev, seats });
                                                            setDesiredSeatsInput("1");
                                                            setSeatError("");
                                                            setShowSeatSelect(true);
                                                            // init socket and join room
                                                            if (!socketRef.current) {
                                                                socketRef.current = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
                                                            }
                                                            socketRef.current.emit('event:join', { eventId: ev.id });
                                                            socketRef.current.on('event:holds:update', ({ eventId, heldSeats }) => {
                                                                if (String(eventId) !== String(ev.id)) return;
                                                                setSeatSelect(prev => prev ? ({
                                                                    ...prev,
                                                                    seats: prev.seats.map(x => ({ ...x, held: Array.isArray(heldSeats) ? heldSeats.includes(x.seat_no) : x.held }))
                                                                }) : prev);
                                                            });
                                                            // When someone books seats, immediately mark them as booked and deselect locally
                                                            socketRef.current.on('event:bookings:update', ({ eventId, bookedSeats }) => {
                                                                if (String(eventId) !== String(ev.id)) return;
                                                                const setBooked = new Set((bookedSeats || []).map(Number));
                                                                setSeatSelect(prev => prev ? ({
                                                                    ...prev,
                                                                    event: { ...prev.event, available_slots: Math.max(0, Number(prev.event.available_slots || 0) - setBooked.size) },
                                                                    seats: prev.seats.map(x => setBooked.has(x.seat_no) ? ({ ...x, taken: true, selected: false }) : x)
                                                                }) : prev);
                                                            });
                                                            // When seats are freed due to cancellations, turn them green immediately
                                                            socketRef.current.on('event:seats:freed', ({ eventId, freedSeats }) => {
                                                                if (String(eventId) !== String(ev.id)) return;
                                                                const setFreed = new Set((freedSeats || []).map(Number));
                                                                setSeatSelect(prev => prev ? ({
                                                                    ...prev,
                                                                    event: { ...prev.event, available_slots: Number(prev.event.available_slots || 0) + setFreed.size },
                                                                    seats: prev.seats.map(x => setFreed.has(x.seat_no) ? ({ ...x, taken: false, held: false, selected: false }) : x)
                                                                }) : prev);
                                                            });
                                                        } catch (e) {
                                                            setMessage('❌ Failed to load seats: ' + (e.response?.data?.error || e.message));
                                                        }
                                                    }} className="px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl text-sm font-semibold">Book tickets</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Your Events (booked by you) */}
            {showYourEventsSection && (
                <div className="px-8 pb-12">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-6">
                                <h2 className="text-2xl font-bold text-gray-800 tracking-wide">Your Events</h2>
                                <div className="text-sm text-gray-600">{myBookings.length} bookings</div>
                            </div>
                            <button onClick={() => fetchMyBookings(currentUserId)} className="px-4 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-white transition-all duration-300 shadow-lg">Refresh</button>
                        </div>
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-3 mb-8">
                            <select value={yourStatus} onChange={e => setYourStatus(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="all">All</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="completed">Completed</option>
                            </select>
                            <select value={yourOrgFilter} onChange={e => setYourOrgFilter(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="all">All organizations</option>
                                {organizations.map(o => (
                                    <option key={`your-org-${o.id}`} value={String(o.id)}>{o.name}</option>
                                ))}
                            </select>
                            <select value={yourSort} onChange={e => setYourSort(e.target.value)} className="px-3 py-2 rounded-xl border bg-white text-sm">
                                <option value="dateDesc">Date ↓</option>
                                <option value="dateAsc">Date ↑</option>
                            </select>
                        </div>

                        {myBookings.length === 0 ? (
                            <div className="text-center py-10 bg-white/80 backdrop-blur-3xl rounded-2xl border border-blue-200/50 shadow">
                                <p className="text-gray-600">You haven't booked any events yet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {(() => {
                                    // group bookings by event_id
                                    const groups = new Map();
                                    for (const b of myBookings) {
                                        if (!groups.has(b.event_id)) groups.set(b.event_id, { event: b, bookings: [], totalSeats: 0 });
                                        const g = groups.get(b.event_id);
                                        g.bookings.push(b);
                                        g.totalSeats += Number(b.seats) || 0;
                                    }
                                    const eventsById = new Map(events.map(e => [e.id, e]));
                                    const filtered = Array.from(groups.values()).filter(g => {
                                        const ev = eventsById.get(g.event.event_id);
                                        const dt = g.event.event_date ? new Date(g.event.event_date).getTime() : 0;
                                        const now = Date.now();
                                        if (yourStatus === 'upcoming' && dt < now) return false;
                                        if (yourStatus === 'completed' && dt >= now) return false;
                                        if (yourOrgFilter !== 'all' && String(ev?.org_id) !== String(yourOrgFilter)) return false;
                                        return true;
                                    }).sort((a, b) => {
                                        const da = new Date(a.event.event_date).getTime();
                                        const db = new Date(b.event.event_date).getTime();
                                        return yourSort === 'dateAsc' ? da - db : db - da;
                                    });
                                    return filtered.map(g => {
                                        const ev = eventsById.get(g.event.event_id);
                                        const org = organizations.find(o => String(o.id) === String(ev?.org_id));
                                        return (
                                            <div key={`event-${g.event.event_id}`} className="group relative rounded-2xl border border-indigo-200 bg-white shadow-2xl p-4">
                                                <div className="flex items-start justify-between mb-1">
                                                    <div className="text-lg font-semibold text-gray-800">{g.event.event_name}</div>
                                                    <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title={org?.name || ''}>{org?.name || ''}</span>
                                                </div>
                                                <div className="text-sm text-gray-600 mb-2 line-clamp-2">{g.event.event_description || 'No description'}</div>
                                                <div className="text-xs text-gray-500 mb-2">
                                                    <span className="font-medium">Organizer:</span> {ev?.organizer_first_name && ev?.organizer_last_name
                                                        ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                        : ev?.organizer_username || 'Unknown'}
                                                </div>
                                                <div className="flex items-center justify-between text-sm text-gray-700">
                                                    <span>{g.event.category || 'event'}</span>
                                                    <span>{g.event.event_date ? new Date(g.event.event_date).toLocaleString() : ''}</span>
                                                </div>
                                                <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
                                                    <span>Seats: {g.totalSeats}</span>
                                                    <span>Status: confirmed</span>
                                                </div>
                                                <div className="mt-4 flex items-center gap-2">
                                                    <button onClick={async () => {
                                                        try {
                                                            // Load seats for each booking in the group
                                                            const seatLists = await Promise.all(g.bookings.map(async bk => {
                                                                const res = await API.get(`/bookings/${bk.booking_id}/seats`);
                                                                const arr = Array.isArray(res.data) ? res.data : [];
                                                                return arr.map(x => ({ ...x, booking_id: bk.booking_id }));
                                                            }));
                                                            const merged = seatLists.flat();
                                                            setManageSeats(merged);
                                                            setManageBooking({ event_id: g.event.event_id, event_name: g.event.event_name, grouped: true, bookings: g.bookings });
                                                            setShowManageSeatsModal(true);
                                                        } catch (e) {
                                                            setMessage('❌ Failed to load seats: ' + (e.response?.data?.error || e.message));
                                                        }
                                                    }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">View</button>
                                                    <button onClick={async () => {
                                                        try {
                                                            const ok = window.confirm('Cancel all your seats for this event?');
                                                            if (!ok) return;
                                                            // cancel each booking fully
                                                            await Promise.all(g.bookings.map(bk => API.post(`/bookings/${bk.booking_id}/cancel`)));

                                                            // Show cancellation congratulations popup for full booking cancellation
                                                            const totalSeats = g.bookings.reduce((sum, bk) => sum + (bk.seats || 0), 0);
                                                            setCancelCongratsData({
                                                                cancelled_seats: [], // No specific seats for full booking cancellation
                                                                seat_count: totalSeats,
                                                                remaining_seats: 0, // All seats cancelled
                                                                event_name: g.event.event_name
                                                            });
                                                            setShowCancelCongrats(true);

                                                            await Promise.all([fetchEvents(), fetchMyBookings(currentUserId)]);
                                                        } catch (e) {
                                                            setMessage('❌ Failed to cancel: ' + (e.response?.data?.error || e.message));
                                                        }
                                                    }} className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-semibold">Cancel</button>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Events organized by you */}
            {(!isSwitchView || isSwitchOrganizer) && (
                <div className="px-8 pb-20" id="organizer-events-list">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-6">
                                <h3 className="text-xl font-semibold text-gray-800">Events organized by you</h3>
                                <div className="text-sm text-gray-600">{events.filter(ev => organizerOrgIds.has(ev.org_id) && String(ev.created_by) === String(currentUserId)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length} events</div>
                            </div>
                            <button onClick={fetchEvents} className="px-3 py-1.5 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-lg text-xs font-medium text-gray-700 hover:bg-white shadow">Refresh</button>
                        </div>

                        {events.filter(ev => organizerOrgIds.has(ev.org_id) && String(ev.created_by) === String(currentUserId)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).length === 0 ? (
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
                                            {/* Header Section - Fixed Height */}
                                            <div className="flex items-center justify-between mb-3 h-8">
                                                <div className="text-lg font-semibold text-gray-800 line-clamp-1 flex-1 pr-2">{ev.name}</div>
                                                <span className="text-xs text-gray-500 shrink-0">{org?.name || '—'}</span>
                                            </div>

                                            {/* Description Section - Fixed Height */}
                                            <div className="text-sm text-gray-600 mb-3 h-10 line-clamp-2 overflow-hidden">{ev.description || 'No description'}</div>

                                            {/* Organizer Section - Fixed Height */}
                                            <div className="text-xs text-gray-500 mb-3 h-5 flex items-center">
                                                <span className="font-medium">Organizer:</span>
                                                <span className="ml-1 truncate">{ev.organizer_first_name && ev.organizer_last_name
                                                    ? `${ev.organizer_first_name} ${ev.organizer_last_name}`
                                                    : ev.organizer_username || 'Unknown'}</span>
                                            </div>

                                            {/* Category & Date Section - Fixed Height */}
                                            <div className="flex items-center justify-between text-xs text-gray-600 mb-3 h-6">
                                                <span className="font-medium">{ev.category}</span>
                                                <span className="text-xs">{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                            </div>

                                            {/* Capacity Section - Fixed Height */}
                                            <div className="flex items-center justify-between text-xs text-gray-600 mb-4 h-5">
                                                <span>Total: {ev.total_slots}</span>
                                                <span>Available: {ev.available_slots}</span>
                                            </div>

                                            {/* Action Buttons Section - Fixed at Bottom */}
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
            )}

            {/* Modal: Create Event */}
            {showCreateModal && (
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
                                <input type="number" min={1} value={newEvent.total_slots} onChange={(e) => setNewEvent({ ...newEvent, total_slots: Math.max(1, Number(e.target.value) || 1) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
                                        total_slots: newEvent.total_slots
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
            )}

            {/* Modal: Organization Overview (inline) */}
            {showOrgModal && selectedOrg && (
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
            )}

            {/* Modal: Edit Event Description */}
            {showEditModal && editingEvent && (
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
            )}

            {/* Modal: Manage Seats for a Booking */}
            {showManageSeatsModal && manageBooking && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowManageSeatsModal(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl mx-4 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-gray-800">Manage Seats - {manageBooking.event_name}</h3>
                            <button onClick={() => setShowManageSeatsModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        {/* Seat Count Section */}
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
                                        // group by booking_id and call API per booking
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

                                    // Show cancellation congratulations popup instead of simple message
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
            )}

            {/* Seat selection modal for booking */}
            {showSeatSelect && seatSelect?.event && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowSeatSelect(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl mx-4 p-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-gray-800">Select Seats - {seatSelect.event.name}</h3>
                            <button onClick={() => setShowSeatSelect(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        {/* Event Details Section - Compact */}
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
                                    <div
                                        className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, ((seatSelect.event.total_slots - seatSelect.event.available_slots) / seatSelect.event.total_slots) * 100))}%`
                                        }}
                                    ></div>
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
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={desiredSeatsInput}
                                        onChange={e => {
                                            const onlyDigits = String(e.target.value || '').replace(/[^0-9]/g, '');
                                            setDesiredSeatsInput(onlyDigits);
                                            if (seatError) setSeatError("");
                                        }}
                                        onWheel={(e) => { try { e.currentTarget.blur(); } catch (_) { } }}
                                        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); } }}
                                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    />
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
                                <div className="text-xs text-gray-500">
                                    {seatSelect.seats.filter(s => s.selected).length} selected
                                </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 max-h-[300px] overflow-auto p-2 border border-gray-100 rounded bg-gray-50">
                                {seatSelect.seats.map(s => (
                                    <button key={s.seat_no} disabled={s.taken} onClick={() => {
                                        setSeatSelect(prev => ({ ...prev, seats: prev.seats.map(x => x.seat_no === s.seat_no ? { ...x, selected: !x.selected } : x) }));
                                        // emit updated holds for my selection
                                        const selected = seatSelect.seats.map(x => (x.seat_no === s.seat_no ? !x.selected : x.selected) ? x.seat_no : null).filter(Boolean);
                                        try { socketRef.current?.emit('event:holds:set', { eventId: seatSelect.event.id, seats: selected }); } catch { }
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
                                        <div className="text-xs text-gray-500">
                                            Seats: {seatSelect.seats.filter(s => s.selected).map(s => s.seat_no).join(', ')}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setSeatError(""); setShowSeatSelect(false); }}
                                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
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

                                                // Show congratulations popup instead of simple message
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
                                                    try {
                                                        const res = await API.get(`/events/${seatSelect.event.id}/seats`);
                                                        const { total, taken, held } = res.data || { total: seatSelect.event.total_slots, taken: [], held: [] };
                                                        setSeatSelect(prev => prev ? ({
                                                            ...prev,
                                                            seats: Array.from({ length: total }, (_, i) => ({
                                                                seat_no: i + 1,
                                                                taken: taken?.includes(i + 1),
                                                                held: held?.includes(i + 1),
                                                                selected: false
                                                            }))
                                                        }) : prev);
                                                    } catch { }
                                                } else {
                                                    setMessage('❌ Failed to book: ' + (e.response?.data?.error || e.message));
                                                }
                                            } finally {
                                                setBookingLoading(false);
                                            }
                                        }}
                                        disabled={bookingLoading}
                                        className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
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
            )}

            {/* Congratulations Popup */}
            {showCongrats && congratsData && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowCongrats(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
                        <div className="text-center">
                            {/* Success Icon */}
                            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            {/* Title */}
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Congratulations!</h3>

                            {/* Message based on booking status */}
                            {congratsData.status === 'confirmed' ? (
                                <div>
                                    <p className="text-gray-600 mb-3">You have successfully booked your tickets!</p>
                                    <p className="text-indigo-600 font-semibold mb-3">Thank you for choosing us!</p>
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                        <p className="text-green-800 font-semibold mb-1">Your Seats:</p>
                                        <p className="text-green-700 text-lg">
                                            {congratsData.assigned_seats && congratsData.assigned_seats.length > 0
                                                ? `Seat${congratsData.assigned_seats.length > 1 ? 's' : ''} ${congratsData.assigned_seats.join(', ')}`
                                                : `Seat${congratsData.seats > 1 ? 's' : ''} assigned`
                                            }
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-gray-600 mb-3">The event is currently full, but you've been added to the waiting list!</p>
                                    <p className="text-indigo-600 font-semibold mb-3">Thank you for your interest!</p>
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                                        <p className="text-yellow-800 font-semibold mb-1">Waiting List Position:</p>
                                        <p className="text-yellow-700 text-lg">
                                            #{congratsData.waiting_number || 'Unknown'}
                                        </p>
                                        <p className="text-yellow-600 text-sm mt-1">
                                            You'll be notified if seats become available
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Event Info */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
                                <p className="text-sm text-gray-600 mb-1">Event:</p>
                                <p className="font-semibold text-gray-800">{congratsData.event_name}</p>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setShowCongrats(false)}
                                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
                            >
                                Got it!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancellation Congratulations Popup */}
            {showCancelCongrats && cancelCongratsData && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowCancelCongrats(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
                        <div className="text-center">
                            {/* Success Icon */}
                            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            {/* Title */}
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Cancellation Successful!</h3>

                            {/* Message */}
                            <div>
                                <p className="text-gray-600 mb-3">You have successfully cancelled your seat(s).</p>
                                <p className="text-indigo-600 font-semibold mb-3">Thank you for your understanding!</p>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                    <p className="text-green-800 font-semibold mb-1">Cancelled Seats:</p>
                                    <p className="text-green-700 text-lg">
                                        {cancelCongratsData.cancelled_seats && cancelCongratsData.cancelled_seats.length > 0
                                            ? `Seat${cancelCongratsData.cancelled_seats.length > 1 ? 's' : ''} ${cancelCongratsData.cancelled_seats.join(', ')}`
                                            : `${cancelCongratsData.seat_count} seat${cancelCongratsData.seat_count > 1 ? 's' : ''} cancelled`
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Event Info */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
                                <p className="text-sm text-gray-600 mb-1">Event:</p>
                                <p className="font-semibold text-gray-800">{cancelCongratsData.event_name}</p>
                            </div>

                            {/* Remaining Seats Info */}
                            {cancelCongratsData.remaining_seats > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-left">
                                    <p className="text-sm text-blue-600 mb-1">Remaining Seats:</p>
                                    <p className="font-semibold text-blue-800">{cancelCongratsData.remaining_seats} seat{cancelCongratsData.remaining_seats > 1 ? 's' : ''} still confirmed</p>
                                </div>
                            )}

                            {/* Close Button */}
                            <button
                                onClick={() => setShowCancelCongrats(false)}
                                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
                            >
                                Got it!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Create Event button - only when allowed */}
            {(!isSwitchView || isSwitchOrganizer) && (
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="fixed bottom-6 right-6 z-[9000] px-5 py-3 rounded-2xl bg-indigo-600 text-white shadow-2xl hover:bg-indigo-700 text-sm font-semibold"
                    title="Create Event"
                >
                    Create Event
                </button>
            )}

            {message && (
                <div className={`max-w-7xl mx-auto mb-6 ${message.includes('✅') ? 'text-green-700' : 'text-red-700'}`}>{message}</div>
            )}
        </div>
    );
}
