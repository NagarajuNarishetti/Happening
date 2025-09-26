import { useEffect, useMemo, useState, useRef } from "react";
import { io } from "socket.io-client";
import API from "../lib/api";
import UpcomingEvents from "../components/media/UpcomingEvents";
import YourEvents from "../components/media/YourEvents";
import OrganizerEvents from "../components/media/OrganizerEvents";
import CreateEventModal from "../components/media/CreateEventModal";
import OrgOverviewModal from "../components/media/OrgOverviewModal";
import EditEventModal from "../components/media/EditEventModal";
import ManageSeatsModal from "../components/media/ManageSeatsModal";
import SeatSelectionModal from "../components/media/SeatSelectionModal";
import CongratsModal from "../components/media/CongratsModal";
import CancelCongratsModal from "../components/media/CancelCongratsModal";
import InvitationsButton from "../components/InvitationsButton";
import { useRouter } from "next/router";

export default function HomeWorkspacePage({ keycloak }) {
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

    // Build breadcrumb items for current view
    const breadcrumbItems = useMemo(() => {
        const items = [{ label: 'Home', href: '/home' }];
        if (isSwitchView && switchedOrg?.name) {
            items.push({ label: switchedOrg.name, href: `/switch/${encodeURIComponent(switchOrgId)}` });
        }
        if (showSeatSelect) {
            items.push({ label: 'Booking' });
        }
        return items;
    }, [isSwitchView, switchedOrg?.name, switchOrgId, showSeatSelect]);

    const Breadcrumbs = () => (
        <nav className="max-w-7xl mx-auto mt-4 px-8" aria-label="Breadcrumb">
            <ol className="flex items-center text-sm text-slate-600">
                {breadcrumbItems.map((item, idx) => (
                    <li key={`bc-${idx}`} className="flex items-center">
                        {idx > 0 && <span className="mx-2 text-slate-400">›</span>}
                        {item.href ? (
                            <a href={item.href} className="hover:text-indigo-600 font-medium">
                                {item.label}
                            </a>
                        ) : (
                            <span className="text-slate-800 font-semibold">{item.label}</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );

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
                <Breadcrumbs />
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
        <>
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
                <Breadcrumbs />
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

                <UpcomingEvents
                    showUpcomingSection={showUpcomingSection}
                    events={events}
                    userOrgIdsForBooking={userOrgIdsForBooking}
                    currentUserId={currentUserId}
                    isSwitchView={isSwitchView}
                    switchOrgId={switchOrgId}
                    upcomingStatus={upcomingStatus}
                    setUpcomingStatus={setUpcomingStatus}
                    upcomingSort={upcomingSort}
                    setUpcomingSort={setUpcomingSort}
                    organizations={organizations}
                    fetchEvents={fetchEvents}
                    API={API}
                    io={io}
                    setSeatSelect={setSeatSelect}
                    setDesiredSeatsInput={setDesiredSeatsInput}
                    setSeatError={setSeatError}
                    setShowSeatSelect={setShowSeatSelect}
                    socketRef={socketRef}
                    setMessage={setMessage}
                />

                {/* Your Events (booked by you) */}
                <YourEvents
                    showYourEventsSection={showYourEventsSection}
                    myBookings={myBookings}
                    fetchMyBookings={fetchMyBookings}
                    currentUserId={currentUserId}
                    organizations={organizations}
                    events={events}
                    API={API}
                    io={io}
                    socketRef={socketRef}
                    setManageSeats={setManageSeats}
                    setManageBooking={setManageBooking}
                    setShowManageSeatsModal={setShowManageSeatsModal}
                    setMessage={setMessage}
                    setCancelCongratsData={setCancelCongratsData}
                    setShowCancelCongrats={setShowCancelCongrats}
                    fetchEvents={fetchEvents}
                    activeOrgId={isSwitchView ? switchOrgId : null}
                />

                {/* Events organized by you */}
                <OrganizerEvents
                    isSwitchView={isSwitchView}
                    isSwitchOrganizer={isSwitchOrganizer}
                    organizerOrgIds={organizerOrgIds}
                    currentUserId={currentUserId}
                    events={events}
                    organizations={organizations}
                    fetchEvents={fetchEvents}
                    setEditingEvent={setEditingEvent}
                    setEditDescription={setEditDescription}
                    setShowEditModal={setShowEditModal}
                    API={API}
                    setMessage={setMessage}
                    yourOrgFilter={yourOrgFilter}
                    switchOrgId={switchOrgId}
                />

                {/* Modal: Create Event */}
                {/** replaced with <CreateEventModal /> */}

                <CreateEventModal
                    showCreateModal={showCreateModal}
                    setShowCreateModal={setShowCreateModal}
                    newEvent={newEvent}
                    setNewEvent={setNewEvent}
                    isSwitchView={isSwitchView}
                    switchOrgId={switchOrgId}
                    organizations={organizations}
                    creating={creating}
                    setCreating={setCreating}
                    setMessage={setMessage}
                    fetchEvents={fetchEvents}
                    currentUserId={currentUserId}
                    API={API}
                />

                {/* Modal: Organization Overview (inline) */}
                {/** replaced with <OrgOverviewModal /> */}

                <OrgOverviewModal
                    showOrgModal={showOrgModal}
                    selectedOrg={selectedOrg}
                    closeOrgOverview={closeOrgOverview}
                    loadingOrgMembers={loadingOrgMembers}
                    orgMembers={orgMembers}
                />

                {/* Modal: Edit Event Description */}
                {/** replaced with <EditEventModal /> */}

                <EditEventModal
                    showEditModal={showEditModal}
                    setShowEditModal={setShowEditModal}
                    editingEvent={editingEvent}
                    editDescription={editDescription}
                    setEditDescription={setEditDescription}
                    API={API}
                    setMessage={setMessage}
                    fetchEvents={fetchEvents}
                    currentUserId={currentUserId}
                />

                {/* Modal: Manage Seats for a Booking */}
                <ManageSeatsModal
                    showManageSeatsModal={showManageSeatsModal}
                    setShowManageSeatsModal={setShowManageSeatsModal}
                    manageBooking={manageBooking}
                    manageSeats={manageSeats}
                    setManageSeats={setManageSeats}
                    API={API}
                    setMessage={setMessage}
                    setCancelCongratsData={setCancelCongratsData}
                    setShowCancelCongrats={setShowCancelCongrats}
                    fetchEvents={fetchEvents}
                    fetchMyBookings={fetchMyBookings}
                    currentUserId={currentUserId}
                />

                {/* Seat selection modal for booking */}
                {/** replaced with <SeatSelectionModal /> */}
                {/* seat modal in component now */}
                <SeatSelectionModal
                    showSeatSelect={showSeatSelect}
                    seatSelect={seatSelect}
                    setShowSeatSelect={setShowSeatSelect}
                    setSeatError={setSeatError}
                    seatError={seatError}
                    desiredSeatsInput={desiredSeatsInput}
                    setDesiredSeatsInput={setDesiredSeatsInput}
                    bookingLoading={bookingLoading}
                    setBookingLoading={setBookingLoading}
                    API={API}
                    currentUserId={currentUserId}
                    fetchEvents={fetchEvents}
                    fetchMyBookings={fetchMyBookings}
                    setMessage={setMessage}
                    setCongratsData={setCongratsData}
                    setShowCongrats={setShowCongrats}
                    socketRef={socketRef}
                    io={io}
                />

                {/* Congratulations Popup */}
                {/** replaced with <CongratsModal /> */}
                {/* congrats modal in component now */}
                <CongratsModal
                    showCongrats={showCongrats}
                    setShowCongrats={setShowCongrats}
                    congratsData={congratsData}
                />

                {/* Cancellation Congratulations Popup */}
                {/** replaced with <CancelCongratsModal /> */}
                {/* cancel-congrats modal in component now */}
                <CancelCongratsModal
                    showCancelCongrats={showCancelCongrats}
                    setShowCancelCongrats={setShowCancelCongrats}
                    cancelCongratsData={cancelCongratsData}
                />

                {/* Floating Create Event button - only when allowed */}
                {
                    (!isSwitchView || isSwitchOrganizer) && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="fixed bottom-6 right-6 z-[9000] px-5 py-3 rounded-2xl bg-indigo-600 text-white shadow-2xl hover:bg-indigo-700 text-sm font-semibold"
                            title="Create Event"
                        >
                            Create Event
                        </button>
                    )
                }

                {
                    message && (
                        <div className={`max-w-7xl mx-auto mb-6 ${message.includes('✅') ? 'text-green-700' : 'text-red-700'}`}>{message}</div>
                    )
                }
            </div >
        </>
    );
}


