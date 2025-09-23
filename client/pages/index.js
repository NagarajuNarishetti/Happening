import { useEffect } from "react";
import { useRouter } from "next/router";

export default function HomePage() {
    const router = useRouter();
    useEffect(() => {
        const go = async () => {
            try {
                const kc = typeof window !== 'undefined' ? window.keycloak : null;
                const target = (typeof window !== 'undefined' ? window.location.origin : '') + '/media';
                if (kc?.authenticated) {
                    router.replace('/media');
                } else if (kc) {
                    kc.login({ redirectUri: target });
                } else {
                    router.replace('/media');
                }
            } catch (_) {
                router.replace('/media');
            }
        };
        go();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-gray-700">Redirecting to sign in…</div>
        </div>
    );
}
