/**
 * Top status banner for UC3 ETA, reconnect state, and rescue progress messaging.
 */

import { guestStrings } from "../constants/guestStrings";

interface TrackingStatusBarProps {
    visible: boolean;
    etaMinutes: number | null;
    statusMessage: string;
    isReconnecting: boolean;
}

export default function TrackingStatusBar({
    visible,
    etaMinutes,
    statusMessage,
    isReconnecting,
}: TrackingStatusBarProps) {
    if (!visible) {
        return null;
    }

    const etaText =
        etaMinutes !== null
            ? `${guestStrings.trackingEtaPrefix} ~${etaMinutes} ${guestStrings.trackingEtaSuffix}`
            : statusMessage;

    return (
        <div className="pointer-events-none absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[700] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 md:left-[336px] md:right-4 md:w-auto md:max-w-none md:translate-x-0 lg:left-auto lg:right-4">
            <div className="rounded-2xl border border-white/20 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur">
                <p>{etaText}</p>
                {isReconnecting ? (
                    <p className="mt-1 text-xs font-medium text-amber-300">{guestStrings.trackingReconnect}</p>
                ) : null}
            </div>
        </div>
    );
}
