import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useRouter } from "next/router";
import API from '../lib/api';
import InviteToOrgButton from "../components/InviteToOrgButton";
import InvitationsButton from "../components/InvitationsButton";

export default function Navbar({ keycloak }) {
  const router = useRouter();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const profileRef = useRef(null);
  const [showOrgs, setShowOrgs] = useState(false);
  const orgsHoverTimer = useRef(null);

  const links = [];
  const isHome = router.pathname === '/';

  const loadPendingInvites = async () => {
    if (!keycloak?.authenticated || !keycloak?.tokenParsed?.sub) {
      console.log('Keycloak not ready yet, skipping pending invites load');
      return;
    }
    try {
      const userResponse = await API.get(`/users?keycloak_id=${keycloak.tokenParsed.sub}`);
      if (userResponse.data.length > 0) {
        const userId = userResponse.data[0].id;
        const invitesResponse = await API.get(`/org-invites/pending/${userId}`);
        setPendingInvites(invitesResponse.data);
        try {
          const event = new CustomEvent('pendingInviteCount', { detail: invitesResponse.data.length });
          window.dispatchEvent(event);
        } catch (_) { }
      }
    } catch (error) {
      console.error('Error loading pending invites:', error);
      try {
        const event = new CustomEvent('pendingInviteCount', { detail: 0 });
        window.dispatchEvent(event);
      } catch (_) { }
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated && keycloak?.tokenParsed?.sub) {
      loadPendingInvites();
    }
    const handleRefreshInvites = () => loadPendingInvites();
    window.addEventListener('refreshInvites', handleRefreshInvites);
    return () => window.removeEventListener('refreshInvites', handleRefreshInvites);
  }, [keycloak?.authenticated, keycloak?.tokenParsed?.sub]);

  // Load current user and their organizations for dropdown + respond to refresh events
  useEffect(() => {
    const loadUserAndOrgs = async () => {
      if (!keycloak?.authenticated || !keycloak?.tokenParsed?.sub) return;
      try {
        // Ensure we always resolve latest user id
        let uid = currentUserId;
        if (!uid) {
          const userRes = await API.get(`/users?keycloak_id=${keycloak.tokenParsed.sub}`);
          if (userRes.data?.length) {
            uid = userRes.data[0].id;
            setCurrentUserId(uid);
          }
        }
        if (!uid) return;
        const orgRes = await API.get(`/organizations/user/${uid}`);
        setOrgs(Array.isArray(orgRes.data) ? orgRes.data : []);
      } catch (e) {
        console.error('Failed to load organizations for navbar:', e);
        setOrgs([]);
      }
    };

    // initial load
    loadUserAndOrgs();

    // listen for external refresh events (e.g., after accepting an invite)
    const handleRefreshOrgs = () => {
      loadUserAndOrgs();
    };
    window.addEventListener('refreshOrgs', handleRefreshOrgs);
    return () => window.removeEventListener('refreshOrgs', handleRefreshOrgs);
  }, [keycloak?.authenticated, keycloak?.tokenParsed?.sub, currentUserId]);

  const handleSwitchToOrg = (org) => {
    if (!org?.id) return;
    router.push(`/switch/${org.id}`);
  };

  // Close profile on outside click or route change
  useEffect(() => {
    if (!showProfile) return;
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    const close = () => setShowProfile(false);
    router.events.on('routeChangeStart', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      router.events.off('routeChangeStart', close);
    };
  }, [showProfile, router.events]);

  // Ensure orgs dropdown closes on route change or outside click
  useEffect(() => {
    if (!showOrgs) return;
    const close = () => setShowOrgs(false);
    router.events.on('routeChangeStart', close);
    const handleDocClick = (e) => {
      // If click is far away from the container, close. We rely on mouseleave too; this is extra safety
      // No specific ref for container since mouseleave covers most cases
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => {
      router.events.off('routeChangeStart', close);
      document.removeEventListener('mousedown', handleDocClick);
    };
  }, [showOrgs, router.events]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/accept/${inviteId}`);
      alert('✅ Organization invite accepted!');
      loadPendingInvites();
      try {
        const evt = new CustomEvent('refreshOrgs');
        window.dispatchEvent(evt);
      } catch (_) { }
    } catch (error) {
      alert('❌ Failed to accept invite: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/reject/${inviteId}`);
      alert('❌ Organization invite rejected!');
      loadPendingInvites();
    } catch (error) {
      alert('❌ Failed to reject invite: ' + (error.response?.data?.error || error.message));
    }
  };


  return (
    <nav className="bg-white/80 backdrop-blur-2xl border-b border-emerald-100/60 shadow-[0_2px_15px_rgba(16,185,129,0.15)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <div
            className="flex-shrink-0 cursor-pointer select-none group"
            onClick={() => {
              if (keycloak?.authenticated) {
                router.push('/media');
              } else {
                router.push('/');
              }
            }}
          >
            <div className="flex items-center gap-2">
              <img src="/brand-logo.svg" alt="Happening" className="w-7 h-7 rounded-[10px] shadow-sm" />
              <span className="text-2xl font-extrabold text-slate-800 group-hover:text-emerald-600 transition-all duration-300">
                Happening
              </span>
            </div>
          </div>

          {/* Center links for public home */}
          {!keycloak?.authenticated && isHome && (
            <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
              <a href="#home" className="hover:text-emerald-600">Home</a>
              <a href="#about" className="hover:text-emerald-600">About</a>
              <a href="#services" className="hover:text-emerald-600">Services</a>
              <a href="#company" className="hover:text-emerald-600">Company</a>
              <a href="#contact" className="hover:text-emerald-600">Contact</a>
            </div>
          )}

          {/* Right side: primary actions + profile */}
          <div className="flex items-center space-x-3">
            {keycloak?.authenticated && (
              <>
                {/* Organizations dropdown with stable hover */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (orgsHoverTimer.current) {
                      clearTimeout(orgsHoverTimer.current);
                      orgsHoverTimer.current = null;
                    }
                    setShowOrgs(true);
                  }}
                  onMouseLeave={() => {
                    // Delay closing slightly to allow cursor to move into panel
                    if (orgsHoverTimer.current) clearTimeout(orgsHoverTimer.current);
                    orgsHoverTimer.current = setTimeout(() => setShowOrgs(false), 200);
                  }}
                >
                  <button
                    onClick={() => router.push('/organizations')}
                    className="px-4 py-2 rounded-xl bg-white/80 border border-emerald-200/60 hover:border-emerald-300 text-slate-700 text-sm font-semibold shadow-sm hover:shadow transition flex items-center gap-1"
                  >
                    <span>Organizations</span>
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {/* Dropdown panel */}
                  {showOrgs && (
                    <div
                      className="absolute left-0 top-full mt-1 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-[9999] p-3"
                      onMouseEnter={() => {
                        if (orgsHoverTimer.current) {
                          clearTimeout(orgsHoverTimer.current);
                          orgsHoverTimer.current = null;
                        }
                      }}
                      onMouseLeave={() => {
                        if (orgsHoverTimer.current) clearTimeout(orgsHoverTimer.current);
                        orgsHoverTimer.current = setTimeout(() => setShowOrgs(false), 200);
                      }}
                    >
                      {(() => {
                        const toLower = (v) => String(v || '').toLowerCase();
                        const managedOrgs = orgs.filter(o => {
                          const r = toLower(o.role);
                          return r === 'orgadmin' || r === 'owner';
                        });
                        const memberOrgs = orgs.filter(o => {
                          const r = toLower(o.role);
                          return !(r === 'orgadmin' || r === 'owner');
                        });

                        const renderRoleLabel = (role) => {
                          const r = toLower(role);
                          if (r === 'organizer') return 'Organizer';
                          if (r === 'agent') return 'Agent';
                          if (r === 'customer' || r === 'viewer') return 'Customer';
                          if (r === 'user') return 'User';
                          if (r === 'owner' || r === 'orgadmin') return 'OrgAdmin';
                          return role;
                        };

                        return (
                          <>
                            <div className="mb-2">
                              <div className="text-xs text-gray-500 px-2 pb-1">You manage</div>
                              {managedOrgs.length > 0 ? (
                                managedOrgs.map(org => (
                                  <div key={`${org.id}-admin`} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 mb-2">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-800 truncate max-w-[12rem]">{org.name}</div>
                                      <div className="text-xs text-gray-500">Role: OrgAdmin</div>
                                    </div>
                                    {/* Switch action hidden for OrgAdmin-managed orgs */}
                                  </div>
                                ))
                              ) : (
                                <div className="px-2 py-3 text-xs text-gray-500">No organizations to manage</div>
                              )}
                            </div>

                            <div className="mt-2">
                              <div className="text-xs text-gray-500 px-2 pb-1">You work in</div>
                              {memberOrgs.length > 0 ? (
                                memberOrgs.map(org => (
                                  <div key={`${org.id}-member`} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 mb-2">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-800 truncate max-w-[12rem]">{org.name}</div>
                                      <div className="text-xs text-gray-500">Role: {renderRoleLabel(org.role)}</div>
                                    </div>
                                    <button onClick={() => handleSwitchToOrg(org)} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-semibold">Switch</button>
                                  </div>
                                ))
                              ) : (
                                <div className="px-2 py-3 text-xs text-gray-500">No organizations joined</div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <InviteToOrgButton keycloak={keycloak} />
                <InvitationsButton keycloak={keycloak} iconOnly />
              </>
            )}

            {/* Profile / Auth */}
            {keycloak?.authenticated ? (
              <div className="relative" ref={profileRef}>
                <button onClick={() => setShowProfile(v => !v)} className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center">
                  {keycloak?.tokenParsed?.preferred_username?.[0]?.toUpperCase?.() || 'U'}
                </button>
                {showProfile && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-[9999]">
                    <div className="px-4 py-3 border-b">
                      <div className="text-sm font-semibold">{keycloak?.tokenParsed?.preferred_username}</div>
                      <div className="text-xs text-gray-500 truncate">{keycloak?.tokenParsed?.email}</div>
                    </div>
                    <button onClick={() => { setShowProfile(false); router.push('/organizations'); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Organizations</button>
                    <button onClick={() => {
                      setShowProfile(false);
                      try {
                        const ok = window.confirm('Are you sure you want to logout?');
                        if (!ok) return;
                      } catch (_) { /* fallback if confirm blocked */ }
                      keycloak.logout({ redirectUri: window.location.origin });
                    }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Logout</button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => keycloak.login()}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#7C3AED] hover:from-[#2563EB] hover:to-[#6D28D9] text-white text-sm font-semibold shadow-lg transition-all duration-200 relative overflow-hidden group"
              >
                <span className="relative z-10">Get started</span>
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
