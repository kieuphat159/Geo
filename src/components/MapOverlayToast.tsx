import type { ReactNode } from "react";
import { mapOverlayToastPositionClass } from "../constants/mapOverlayToast";

export type MapOverlayToastVariant = "error" | "hint" | "warning";

const variantClass: Record<
    MapOverlayToastVariant,
    { shell: string; close: string }
> = {
    error: {
        shell: "border-red-200 bg-red-50/95",
        close: "text-red-400 hover:bg-red-100 hover:text-red-700",
    },
    hint: {
        shell: "border-violet-200 bg-violet-50/95",
        close: "text-violet-400 hover:bg-violet-100 hover:text-violet-700",
    },
    warning: {
        shell: "border-amber-200 bg-amber-50/95",
        close: "text-amber-500 hover:bg-amber-100 hover:text-amber-800",
    },
};

interface MapOverlayToastProps {
    variant: MapOverlayToastVariant;
    topClass: string;
    onClose: () => void;
    children: ReactNode;
}

export default function MapOverlayToast({ variant, topClass, onClose, children }: MapOverlayToastProps) {
    const styles = variantClass[variant];

    return (
        <div
            className={`${mapOverlayToastPositionClass} ${topClass} relative rounded-2xl border p-3 pr-9 text-sm shadow-lg ${styles.shell}`}
        >
            <button
                className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md ${styles.close}`}
                type="button"
                aria-label="Đóng thông báo"
                onClick={onClose}
            >
                ×
            </button>
            {children}
        </div>
    );
}
