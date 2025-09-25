import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function HomePage() {
    const keycloak = typeof window !== 'undefined' ? window.keycloak : null;
    const handleLogin = () => keycloak?.login({ redirectUri: `${window.location.origin}/media` });
    const handleGoogleLogin = () => keycloak?.login({ idpHint: 'google' });
    const router = useRouter();

    // If already authenticated, don't show landing page; go to /media
    useEffect(() => {
        const redirectIfAuthenticated = () => {
            const kc = typeof window !== 'undefined' ? window.keycloak : null;
            if (kc?.authenticated) {
                router.replace('/media');
                return true;
            }
            return false;
        };
        if (redirectIfAuthenticated()) return;
        const t = setInterval(() => {
            if (redirectIfAuthenticated()) clearInterval(t);
        }, 250);
        return () => clearInterval(t);
    }, [router]);

    return (
        <main className="relative min-h-[calc(100vh-64px)] bg-white text-slate-900 overflow-hidden">
            {/* Top curved gradient banner */}
            <div className="pointer-events-none absolute -top-24 right-[-10%] w-[130%] h-[55vh] bg-gradient-to-r from-[#FF7CA3] via-[#7C3AED] to-[#2563EB] opacity-[0.85]" style={{ clipPath: 'path(\'M0,120 C240,0 720,240 1440,60 L1440,0 L0,0 Z\')' }} />
            {/* Fallback for browsers without clip-path:path using a soft blob */}
            <div className="pointer-events-none absolute -top-40 right-0 w-[1200px] h-[600px] bg-gradient-to-r from-[#93C5FD] via-[#818CF8] to-[#3B82F6] blur-3xl opacity-30 rounded-[50%]" />
            <Head>
                <title>Happening — Plan, publish and participate</title>
            </Head>
            <section id="home" className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-24 pb-16">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#E6F0FF] ring-1 ring-[#BFD8FF] text-xs mb-6 text-[#1D4ED8]">Services</div>
                        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight drop-shadow-sm text-slate-900">
                            Happening
                        </h1>
                        <p className="mt-6 text-slate-600 leading-relaxed max-w-xl">
                            Schedule smarter. A modern way to publish events, manage capacity and keep everyone aligned.
                        </p>
                        <div className="mt-10 flex flex-col sm:flex-row gap-4">
                            <button onClick={handleLogin} className="px-6 py-3 rounded-xl bg-[#2563EB] text-white font-semibold shadow-lg hover:bg-[#1D4ED8] transition">
                                Get Started
                            </button>
                        </div>
                    </div>
                    <div>
                        <div
                            className="relative rounded-3xl overflow-hidden shadow-2xl"
                            style={{
                                backgroundImage: "url('/Images/Hero1.jpg')",
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                WebkitMaskImage: 'radial-gradient(120% 90% at 70% 45%, black 70%, transparent 100%)',
                                maskImage: 'radial-gradient(120% 90% at 70% 45%, black 70%, transparent 100%)'
                            }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#EFF6FF]/0 via-[#EFF6FF]/20 to-[#DBEAFE]/40" />
                            <div className="relative w-full h-[360px] md:h-[420px]" />
                            <div className="absolute inset-0 -z-10 blur-3xl opacity-40 bg-gradient-to-r from-[#93C5FD]/40 to-[#C7D2FE]/40"></div>
                        </div>
                    </div>
                </div>
            </section>
            <section id="services" className="max-w-7xl mx-auto px-6 lg:px-8 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-2xl bg-white border border-[#E6EEF9]">
                        <div className="text-lg font-semibold text-slate-900">Smart seat allocation</div>
                        <p className="text-slate-600 mt-2">Auto-assign seats and waitlists with instant status alerts.</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white border border-[#E6EEF9]">
                        <div className="text-lg font-semibold text-slate-900">Workspaces for teams</div>
                        <p className="text-slate-600 mt-2">Separate organizations, roles, and permissions that scale.</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white border border-[#E6EEF9]">
                        <div className="text-lg font-semibold text-slate-900">Privacy‑first login</div>
                        <p className="text-slate-600 mt-2">Enterprise SSO via Keycloak with optional social sign‑in.</p>
                    </div>
                </div>
            </section>

            {/* News section removed as requested */}

            {/* About */}
            <section id="about" className="relative max-w-7xl mx-auto px-6 lg:px-8 pb-24">
                {/* Blended background using image palette */}
                <div className="pointer-events-none absolute inset-0 -z-10">
                    {/* Soft palette gradient derived from the illustration */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#E8F1FF] via-[#EFF6FF] to-[#F7FBFF]" />
                    {/* Subtle ambient glows in matching hues */}
                    <div className="absolute -bottom-28 -left-16 w-[560px] h-[560px] bg-[#93C5FD] blur-3xl opacity-20 rounded-full" />
                    <div className="absolute -top-20 right-0 w-[520px] h-[520px] bg-[#C7D2FE] blur-3xl opacity-25 rounded-full" />
                    {/* Masked hero illustration echo, faded into the background */}
                    <div
                        className="absolute inset-y-0 right-[-8%] w-[68%] bg-no-repeat bg-right bg-contain opacity-20"
                        style={{
                            backgroundImage: "url('/Images/time_management.jpg')",
                            WebkitMaskImage: 'radial-gradient(80% 80% at 85% 50%, black 60%, transparent 100%)',
                            maskImage: 'radial-gradient(80% 80% at 85% 50%, black 60%, transparent 100%)'
                        }}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Built for organizers and teams</h2>
                        <p className="text-slate-600 mt-3">Happening streamlines planning across organizations with roles, invites and realtime updates. Simple for attendees, powerful for admins.</p>
                    </div>
                    <div>
                        <div
                            className="relative rounded-2xl border border-[#E6EEF9] shadow-2xl overflow-hidden bg-white"
                            style={{ aspectRatio: '16 / 10' }}
                        >
                            <img
                                src="/Images/time_management.jpg"
                                alt="Time management"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="mt-6 rounded-2xl bg-gradient-to-br from-[#E8F1FF] via-[#EFF6FF] to-[#F7FBFF] p-6 border border-[#E6EEF9]">
                            <ul className="grid grid-cols-2 gap-4 text-sm text-slate-700">
                                <li>Seat management</li>
                                <li>Waitlists</li>
                                <li>Org roles</li>
                                <li>Notifications</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Contacts */}
            <section id="contact" className="max-w-7xl mx-auto px-6 lg:px-8 pb-28">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-900">Contact us</h2>
                    <p className="text-slate-600">We’ll get back within one business day</p>
                </div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-[#E6EEF9] rounded-2xl p-6">
                    <input className="border border-[#E6EEF9] rounded-lg px-3 py-2" placeholder="Your name" />
                    <input className="border border-[#E6EEF9] rounded-lg px-3 py-2" placeholder="Email" type="email" />
                    <textarea className="md:col-span-2 border border-[#E6EEF9] rounded-lg px-3 py-2" rows={4} placeholder="Message" />
                    <div className="md:col-span-2">
                        <button type="button" className="px-6 py-3 rounded-xl bg-[#2563EB] text-white font-semibold shadow hover:bg-[#1D4ED8]">Send message</button>
                    </div>
                </form>
            </section>
        </main>
    );
}
