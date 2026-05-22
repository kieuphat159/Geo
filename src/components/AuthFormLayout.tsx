import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

interface AuthFormLayoutProps {
    title: string;
    subtitle: string;
    children: ReactNode;
    onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
    footerLinks?: Array<{ label: string; href: string; emphasis?: boolean }>;
}

function AuthCard({
    title,
    subtitle,
    children,
    footerLinks = [],
}: {
    title: string;
    subtitle: string;
    children: ReactNode;
    footerLinks?: AuthFormLayoutProps["footerLinks"];
}) {
    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-6 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
                            <path
                                fillRule="evenodd"
                                d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
                        <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
                    </div>
                </div>
            </div>

            <div className="px-6 py-5">{children}</div>

            {footerLinks && footerLinks.length > 0 ? (
                <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
                    {footerLinks.map((item) => (
                        <p key={item.href + item.label} className="text-sm text-slate-600">
                            <Link
                                to={item.href}
                                className={
                                    item.emphasis
                                        ? "font-semibold text-indigo-700 hover:text-indigo-600 hover:underline"
                                        : "font-semibold text-slate-700 hover:underline"
                                }
                            >
                                {item.label}
                            </Link>
                        </p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function AuthFormLayout({ title, subtitle, children, onSubmit, footerLinks = [] }: AuthFormLayoutProps) {
    return (
        <main className="min-h-dvh grid place-items-center bg-slate-50 p-4 font-sans text-slate-900">
            {onSubmit ? (
                <form className="w-full max-w-md" onSubmit={onSubmit}>
                    <AuthCard title={title} subtitle={subtitle} footerLinks={footerLinks}>
                        {children}
                    </AuthCard>
                </form>
            ) : (
                <div className="w-full max-w-md">
                    <AuthCard title={title} subtitle={subtitle} footerLinks={footerLinks}>
                        {children}
                    </AuthCard>
                </div>
            )}
        </main>
    );
}
