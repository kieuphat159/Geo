import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface AppPageShellProps {
    title: string;
    subtitle?: string;
    backTo?: { href: string; label: string };
    actions?: ReactNode;
    children: ReactNode;
    maxWidthClass?: string;
}

export default function AppPageShell({
    title,
    subtitle,
    backTo,
    actions,
    children,
    maxWidthClass = "max-w-[1600px]",
}: AppPageShellProps) {
    return (
        <main className="min-h-dvh bg-slate-50 p-4 font-sans text-slate-900 sm:p-6 lg:p-8">
            <div className={`mx-auto space-y-6 ${maxWidthClass}`}>
                <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
                                <path
                                    fillRule="evenodd"
                                    d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
                            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                        {backTo ? (
                            <Link
                                className="inline-flex max-w-max items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95"
                                to={backTo.href}
                            >
                                ← {backTo.label}
                            </Link>
                        ) : null}
                    </div>
                </header>
                {children}
            </div>
        </main>
    );
}
