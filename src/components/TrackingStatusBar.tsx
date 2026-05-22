/**
 * Top status banner for UC3 ETA, reconnect state, and rescue progress messaging.
 */

import { guestStrings } from "../constants/guestStrings";
import { mapOverlayStatusBarPositionClass } from "../constants/mapOverlayToast";

interface TrackingStatusBarProps {
    visible: boolean;
    etaMinutes: number | null;
    statusMessage: string;
    isReconnecting: boolean;
    browserOnline?: boolean;
}

export default function TrackingStatusBar({
    visible,
    etaMinutes,
    statusMessage,
    isReconnecting,
    browserOnline = true,
}: TrackingStatusBarProps) {
    if (!visible) {
        return null;
    }

    const etaText =
        etaMinutes !== null
            ? `${guestStrings.trackingEtaPrefix} ~${etaMinutes} ${guestStrings.trackingEtaSuffix}`
            : statusMessage;

    return (
        <div className={mapOverlayStatusBarPositionClass}>
            <div className="rounded-2xl border border-white/20 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur">
                <p>{etaText}</p>
                {!browserOnline ? (
                    <p className="mt-1 text-xs font-medium text-amber-300">{guestStrings.trackingOffline}</p>
                ) : isReconnecting ? (
                    <p className="mt-1 text-xs font-medium text-amber-300">{guestStrings.trackingReconnect}</p>
                ) : null}
            </div>
        </div>
    );
}
