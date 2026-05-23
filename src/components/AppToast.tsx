import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export type AppToastVariant = "error" | "hint" | "warning" | "success" | "solid-error";

export type AppToastStack = "primary" | "secondary";

const stackTopClass: Record<AppToastStack, string> = {
    primary: "top-[max(0.75rem,env(safe-area-inset-top))]",
    secondary: "top-[max(5.75rem,calc(env(safe-area-inset-top)+4.75rem))]",
};

const variantClass: Record<AppToastVariant, { shell: string; close: string }> = {
    error: {
        shell: "border-red-200 bg-red-50/95 text-red-900",
        close: "text-red-500 hover:bg-red-100 hover:text-red-800",
    },
    hint: {
        shell: "border-violet-200 bg-violet-50/95 text-violet-900",
        close: "text-violet-500 hover:bg-violet-100 hover:text-violet-800",
    },
    warning: {
        shell: "border-amber-200 bg-amber-50/95 text-amber-900",
        close: "text-amber-600 hover:bg-amber-100 hover:text-amber-900",
    },
    success: {
        shell: "border-emerald-300 bg-emerald-600 text-white",
        close: "text-white/85 hover:bg-white/20 hover:text-white",
    },
    "solid-error": {
        shell: "border-red-700 bg-red-600 text-white",
        close: "text-white/85 hover:bg-white/20 hover:text-white",
    },
};

const toastHostClass =
    "pointer-events-auto fixed right-3 z-[950] w-[min(360px,calc(100%-1.5rem))] max-w-[430px] lg:right-4";

interface AppToastProps {
    variant: AppToastVariant;
    stack?: AppToastStack;
    onClose: () => void;
    children: ReactNode;
}

export default function AppToast({ variant, stack = "primary", onClose, children }: AppToastProps) {
    const styles = variantClass[variant];

    return createPortal(
        <div className={`${toastHostClass} ${stackTopClass[stack]}`} role="status" aria-live="polite">
            <div className={`relative rounded-2xl border p-3 pr-10 text-sm shadow-lg ${styles.shell}`}>
                <button
                    className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-xl font-semibold leading-none ${styles.close}`}
                    type="button"
                    aria-label="Đóng thông báo"
                    onClick={onClose}
                >
                    ×
                </button>
                {children}
            </div>
        </div>,
        document.body,
    );
}
