import type { ReactNode } from "react";

interface AppModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: "md" | "lg";
    zIndex?: number;
    closeDisabled?: boolean;
    titleId?: string;
}

const sizeClass: Record<NonNullable<AppModalProps["size"]>, string> = {
    md: "max-w-lg",
    lg: "max-w-2xl",
};

export default function AppModal({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    size = "md",
    zIndex = 900,
    closeDisabled = false,
    titleId,
}: AppModalProps) {
    if (!open) {
        return null;
    }

    const headingId = titleId ?? "app-modal-title";

    return (
        <div
            className="fixed inset-0 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
            style={{ zIndex }}
            role="presentation"
            onClick={(e) => {
                if (!closeDisabled && e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className={`flex max-h-[min(90vh,820px)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${sizeClass[size]}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                    <div>
                        <h3 id={headingId} className="text-lg font-bold text-slate-900">
                            {title}
                        </h3>
                        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        onClick={onClose}
                        disabled={closeDisabled}
                    >
                        Đóng
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

                {footer ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
