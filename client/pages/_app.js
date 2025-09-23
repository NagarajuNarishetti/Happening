import { useEffect, useState } from "react";
import Head from "next/head";
// import "@fortawesome/fontawesome-free/css/all.min.css";
import "../styles/globals.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import keycloak from "../lib/keycloak";

export default function MyApp({ Component, pageProps }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      try {
        // Avoid multiple initialization during Fast Refresh / remounts
        if (typeof window !== 'undefined' && window.__kcInitDone) {
          window.keycloak = keycloak;
          if (keycloak?.token) localStorage.setItem('token', keycloak.token);
          setIsAuthenticated(Boolean(keycloak?.authenticated || keycloak?.token));
          setLoading(false);
          return;
        }

        const authenticated = await keycloak.init({
          // Do not force login on first load; only check if a session already exists
          onLoad: "check-sso",
          checkLoginIframe: false,
        });

        if (typeof window !== 'undefined') {
          window.__kcInitDone = true;
          window.keycloak = keycloak;
        }

        setIsAuthenticated(authenticated);
        if (authenticated) {
          localStorage.setItem('token', keycloak.token);
          keycloak.onTokenExpired = () => {
            keycloak.updateToken(70).then((refreshed) => {
              if (refreshed) {
                localStorage.setItem('token', keycloak.token);
              }
            });
          };
        }
      } catch (err) {
        console.error("Keycloak init failed:", err);
      } finally {
        setLoading(false);
      }
    };
    boot();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Happening</title>
        <meta name="theme-color" content="#10B981" />
        <link rel="icon" href="/brand-logo.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
      </Head>
      <Navbar keycloak={keycloak} />
      <Component {...pageProps} keycloak={keycloak} />
      <Footer />
    </div>
  );
}
