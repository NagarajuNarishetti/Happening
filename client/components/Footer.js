export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="mt-10 border-t border-gray-200/70 bg-white/70 backdrop-blur">
            <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-gray-600 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <img src="/brand-logo.svg" alt="Happening" className="w-5 h-5 rounded" />
                    <span className="font-semibold text-gray-700">Happening</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="opacity-80">© {year} All rights reserved</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="opacity-90">Built by Nagaraju Varma</span>
                    <span className="hidden sm:inline text-gray-400">|</span>
                    <span className="opacity-70">Version 1.0.0</span>
                </div>
            </div>
        </footer>
    );
}


