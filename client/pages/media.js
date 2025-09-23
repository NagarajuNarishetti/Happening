import { useEffect, useMemo, useState } from "react";
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
    const [desiredSeats, setDesiredSeats] = useState(1);
    const router = useRouter();
    const switchOrgId = router?.query?.id || router?.query?.orgId || null;
    const isSwitchView = Boolean(switchOrgId);

    const toLower = (v) => String(v || '').toLowerCase();
    const userOrgIdsForBooking = useMemo(() => {
        const ids = new Set();
        for (const o of organizations) {
            const r = toLower(o.role);
            if (r === 'user' || r === 'customer' || r === 'viewer') ids.add(o.id);
        }
        return ids;
    }, [organizations]);

    const organizerOrgIds = useMemo(() => {
        const ids = new Set();
        for (const o of organizations) {
            const r = toLower(o.role);
            if (r === 'organizer') ids.add(o.id);
        }
        return ids;
    }, [organizations]);

    const switchOrgRole = useMemo(() => {
        if (!isSwitchView) return null;
        const org = organizations.find(o => String(o.id) === String(switchOrgId));
        return toLower(org?.role);
    }, [organizations, isSwitchView, switchOrgId]);
    const isSwitchOrganizer = switchOrgRole === 'organizer';

    // Selected organization details when viewing via /switch/[id]
    const switchedOrg = useMemo(() => {
        if (!isSwitchView) return null;
        return organizations.find(o => String(o.id) === String(switchOrgId)) || null;
    }, [organizations, isSwitchView, switchOrgId]);

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
            // Optionally filter by org in switch view to reduce payload
            const query = [];
            if (isSwitchView && switchOrgId) query.push(`org_id=${encodeURIComponent(String(switchOrgId))}`);
            const res = await API.get(`/events${query.length ? `?${query.join('&')}` : ''}`);
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
                                            <button
                                                onClick={() => openOrgOverview(switchedOrg)}
                                                className="px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-indigo-600/10 text-indigo-700 border border-indigo-200 hover:bg-indigo-600/20 hover:border-indigo-300"
                                                title="Open organization overview"
                                            >
                                                {switchedOrg.name}
                                            </button>
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
                                            <div key={ev.id} className="group relative rounded-2xl border border-emerald-200 bg-white shadow-2xl p-4">
                                                <div className="flex items-start justify-between mb-1">
                                                    <div className="text-lg font-semibold text-gray-800">{ev.name}</div>
                                                    <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={org?.name || ''}>{org?.name || ''}</span>
                                                </div>
                                                <div className="text-sm text-gray-600 mb-2 line-clamp-2">{ev.description || "No description"}</div>
                                                <div className="flex items-center justify-between text-sm text-gray-700">
                                                    <span>{ev.category || 'event'}</span>
                                                    <span>{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                                </div>
                                                <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
                                                    <span>Total: {ev.total_slots}</span>
                                                    <span>Available: {ev.available_slots}</span>
                                                </div>
                                                <div className="mt-4 flex items-center gap-2">
                                                    <button onClick={async () => {
                                                        try {
                                                            const res = await API.get(`/events/${ev.id}/seats`);
                                                            const { total, taken } = res.data || { total: ev.total_slots, taken: [] };
                                                            // Build seat grid metadata
                                                            const seats = Array.from({ length: total }, (_, i) => ({ seat_no: i + 1, taken: taken?.includes(i + 1) }));
                                                            setSeatSelect({ event: ev, seats });
                                                            setDesiredSeats(1);
                                                            setShowSeatSelect(true);
                                                        } catch (e) {
                                                            setMessage('❌ Failed to load seats: ' + (e.response?.data?.error || e.message));
                                                        }
                                                    }} className="px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl text-sm font-semibold">Book</button>
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
                                                            setMessage('✅ Booking(s) cancelled');
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
                                <p className="text-gray-600">No events created yet. Use the Create Event button to add one.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {events.filter(ev => organizerOrgIds.has(ev.org_id) && String(ev.created_by) === String(currentUserId)).filter(ev => !isSwitchView || String(ev.org_id) === String(switchOrgId)).map((ev) => {
                                    const org = organizations.find(o => o.id === ev.org_id);
                                    return (
                                        <div key={`org-${ev.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow">
                                            <div className="flex items-center justify-between">
                                                <div className="text-lg font-semibold text-gray-800">{ev.name}</div>
                                                <span className="text-xs text-gray-500">{org?.name || '—'}</span>
                                            </div>
                                            <div className="text-sm text-gray-600 mt-1 line-clamp-2">{ev.description || 'No description'}</div>
                                            <div className="flex items-center justify-between text-xs text-gray-600 mt-2">
                                                <span>{ev.category}</span>
                                                <span>{ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</span>
                                            </div>
                                            <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
                                                <span>Total: {ev.total_slots}</span>
                                                <span>Available: {ev.available_slots}</span>
                                            </div>
                                            <div className="mt-4 flex items-center gap-2">
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
                                    setMessage('✅ Selected seats cancelled');
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
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl mx-4 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-gray-800">Select Seats - {seatSelect.event.name}</h3>
                            <button onClick={() => setShowSeatSelect(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        <div className="text-sm text-gray-600 mb-3">Green = available, Red = booked. You can request more seats than available to join the waiting list automatically.</div>
                        <div className="mb-4 flex items-center gap-3">
                            <label className="text-sm text-gray-700">How many seats?</label>
                            <input type="number" min={1} value={desiredSeats} onChange={e => setDesiredSeats(Math.max(1, Number(e.target.value) || 1))} className="w-24 border rounded-lg px-3 py-2 text-sm" />
                            <div className="text-xs text-gray-600">Available now: {Number(seatSelect.event.available_slots) ?? 0}</div>
                        </div>
                        <div className="grid grid-cols-5 gap-2 max-h-[420px] overflow-auto p-2 border rounded-lg">
                            {seatSelect.seats.map(s => (
                                <button key={s.seat_no} disabled={s.taken} onClick={() => {
                                    setSeatSelect(prev => ({ ...prev, seats: prev.seats.map(x => x.seat_no === s.seat_no ? { ...x, selected: !x.selected } : x) }));
                                }} className={`px-2 py-2 text-xs rounded ${s.taken ? 'bg-red-200 text-red-800 cursor-not-allowed' : (s.selected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200')}`}>
                                    {s.seat_no}
                                </button>
                            ))}
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-3">
                            <div className="text-xs text-gray-600">Selected: {seatSelect.seats.filter(s => s.selected).length}</div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowSeatSelect(false)} className="px-4 py-2 rounded-xl border text-sm">Close</button>
                                <button onClick={async () => {
                                    const selected = seatSelect.seats.filter(s => s.selected).map(s => s.seat_no);
                                    const seatsToBook = Math.max(1, selected.length, Number(desiredSeats) || 1);
                                    try {
                                        setBookingLoading(true);
                                        const resp = await API.post('/bookings', { event_id: seatSelect.event.id, user_id: currentUserId, seats: seatsToBook, seat_numbers: selected });
                                        if (resp?.data?.status === 'waiting' || seatsToBook > Number(seatSelect.event.available_slots || 0)) {
                                            setMessage(`🕒 Added to waitlist${resp?.data?.waiting_number ? ` (position ${resp.data.waiting_number})` : ''}.`);
                                        } else {
                                            setMessage('✅ Booking submitted');
                                        }
                                        setShowSeatSelect(false);
                                        await Promise.all([fetchEvents(), fetchMyBookings(currentUserId)]);
                                    } catch (e) {
                                        setMessage('❌ Failed to book: ' + (e.response?.data?.error || e.message));
                                    } finally {
                                        setBookingLoading(false);
                                    }
                                }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold">Book</button>
                            </div>
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
