import type { ReactNode } from "react";
import AppToast, { type AppToastStack } from "./AppToast";
import { mapOverlayToastTopSecondaryClass } from "../constants/mapOverlayToast";

export type MapOverlayToastVariant = "error" | "hint" | "warning";

interface MapOverlayToastProps {
    variant: MapOverlayToastVariant;
    topClass: string;
    onClose: () => void;
    children: ReactNode;
}

function resolveStack(topClass: string): AppToastStack {
    return topClass === mapOverlayToastTopSecondaryClass ? "secondary" : "primary";
}

export default function MapOverlayToast({ variant, topClass, onClose, children }: MapOverlayToastProps) {
    return (
        <AppToast variant={variant} stack={resolveStack(topClass)} onClose={onClose}>
            {children}
        </AppToast>
    );
}
