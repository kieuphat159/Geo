/**
 * Top status banner for UC3 ETA, reconnect state, and rescue progress messaging.
 */

import { createPortal } from "react-dom";
import { guestStrings } from "../constants/guestStrings";
import { mapOverlayStatusBarPositionClass } from "../constants/mapOverlayToast";
import type { AssignedHospital } from "../types/guest";

interface TrackingStatusBarProps {
    visible: boolean;
    mode: "awaiting_dispatch" | "tracking";
    assignedHospital: AssignedHospital | null;
    etaMinutes: number | null;
    statusMessage: string;
    isReconnecting: boolean;
    browserOnline?: boolean;
}

export default function TrackingStatusBar({
    visible,
    mode,
    assignedHospital,
    etaMinutes,
    statusMessage,
    isReconnecting,
    browserOnline = true,
}: TrackingStatusBarProps) {
    if (!visible) {
        return null;
    }

    const etaText =
        mode === "tracking" && etaMinutes !== null
            ? `${guestStrings.trackingEtaPrefix} ~${etaMinutes} ${guestStrings.trackingEtaSuffix}`
            : statusMessage;

    return createPortal(
        <div className={mapOverlayStatusBarPositionClass}>
            <div className="rounded-2xl border border-white/20 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur">
                {mode === "awaiting_dispatch" ? (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-red-300">
                        {guestStrings.awaitingDispatchBadge}
                    </p>
                ) : null}
                {assignedHospital ? (
                    <div className={mode === "awaiting_dispatch" ? "mt-1.5" : undefined}>
                        <p className="text-[11px] font-medium text-violet-200">{guestStrings.nearestHospitalLabel}</p>
                        <p className="mt-0.5 text-base font-bold leading-snug text-white">{assignedHospital.name}</p>
                    </div>
                ) : null}
                <p className={assignedHospital ? "mt-2 text-sm font-semibold text-white/95" : undefined}>{etaText}</p>
                {!browserOnline ? (
                    <p className="mt-1 text-xs font-medium text-amber-300">{guestStrings.trackingOffline}</p>
                ) : isReconnecting ? (
                    <p className="mt-1 text-xs font-medium text-amber-300">{guestStrings.trackingReconnect}</p>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}
