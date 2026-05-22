/**
 * Bottom sheet for UC10 facility detail display and direction handoff actions.
 */

import { guestStrings } from "../constants/guestStrings";
import type { Facility } from "../types/guest";
import { estimateDriveMinutesFromMeters, formatDistanceLabel } from "../utils/distance";
import { inferFacilityOpenGuess } from "../utils/facilityDisplay";
import { telHrefFromDisplay } from "../utils/phone";

interface FacilityDetailSheetProps {
    facility: Facility | null;
    hasUserLocation: boolean;
    variant?: "sheet" | "panel";
    onClose: () => void;
}

function getFacilityTypeLabel(type: Facility["type"]): string {
    if (type === 1) {
        return guestStrings.facilityTypeHospitalVi;
    }

    if (type === 2) {
        return guestStrings.facilityTypeClinicVi;
    }

    return guestStrings.facilityTypePharmacyVi;
}

export default function FacilityDetailSheet({
    facility,
    hasUserLocation,
    variant = "sheet",
    onClose,
}: FacilityDetailSheetProps) {
    if (!facility) {
        return null;
    }

    const etaMinutes = estimateDriveMinutesFromMeters(facility.distanceMeters);
    const hotlineDisplay = facility.phone || guestStrings.detailPhoneFallback;
    const hotlineTel = telHrefFromDisplay(facility.phone);
    const openGuess = inferFacilityOpenGuess(
        facility.openingHours,
        guestStrings.detailOpeningHoursFallback,
    );
    const hasHoursText = Boolean(
        facility.openingHours &&
            facility.openingHours.trim() !== "" &&
            facility.openingHours.trim() !== guestStrings.detailOpeningHoursFallback,
    );
    const showUnknownHours = hasHoursText && openGuess === null;
    const callLooksClosed = openGuess === "closed";

    const detailRows = [
        { label: guestStrings.detailLabelType, value: getFacilityTypeLabel(facility.type) },
        { label: guestStrings.detailLabelAddress, value: facility.address },
        {
            label: guestStrings.detailLabelOpeningHours,
            value: facility.openingHours || guestStrings.detailOpeningHoursFallback,
        },
        {
            label: guestStrings.detailLabelDistance,
            value: formatDistanceLabel(facility.distanceMeters) || guestStrings.detailDistanceFallback,
        },
        ...(etaMinutes !== null
            ? [
                  {
                      label: guestStrings.detailLabelEtaApprox,
                      value: `~${etaMinutes} ${guestStrings.etaApproxSuffix}`,
                  },
              ]
            : []),
    ];

    const openGoogleDirections = () => {
        const directionsUrl = hasUserLocation
            ? `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${facility.lat},${facility.lng}`;
        window.open(directionsUrl, "_blank", "noopener,noreferrer");
    };

    const containerClassName =
        variant === "panel"
            ? "pointer-events-auto rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"
            : "pointer-events-auto absolute bottom-[max(6.75rem,calc(5.75rem+env(safe-area-inset-bottom)))] left-1/2 z-[1050] w-[calc(100%-1rem)] max-w-[min(100%,28rem)] -translate-x-1/2 rounded-3xl border border-violet-100 bg-white/95 p-4 shadow-xl shadow-violet-950/20 backdrop-blur sm:max-w-[32rem] md:hidden";

    return (
        <section className={containerClassName} aria-label={guestStrings.detailTitle}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 text-base font-bold leading-snug text-slate-900">{facility.name}</h3>
                        {openGuess === "open" ? (
                            <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                {guestStrings.facilityOpenNowBadge}
                            </span>
                        ) : null}
                        {openGuess === "closed" ? (
                            <span className="shrink-0 rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                {guestStrings.facilityClosedBadge}
                            </span>
                        ) : null}
                        {showUnknownHours ? (
                            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                {guestStrings.facilityOpenUnknownBadge}
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">{guestStrings.detailTitle}</p>
                </div>
                <button
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-800 hover:bg-violet-100"
                    type="button"
                    onClick={onClose}
                    aria-label={guestStrings.closeFacilityDetailAria}
                >
                    ✕
                </button>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
                {detailRows.map((row) => (
                    <div key={row.label} className="grid grid-cols-[92px_1fr] gap-2">
                        <dt className="font-semibold text-slate-500">{row.label}</dt>
                        <dd className="text-slate-800">{row.value}</dd>
                    </div>
                ))}
            </dl>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{guestStrings.detailLabelHotline}</p>
                {hotlineTel ? (
                    <a
                        className="mt-1 block break-all text-xl font-bold leading-snug text-slate-900 underline decoration-violet-300 decoration-2 underline-offset-2 hover:text-violet-900"
                        href={hotlineTel}
                    >
                        {hotlineDisplay}
                    </a>
                ) : (
                    <p className="mt-1 text-lg font-semibold text-slate-700">{hotlineDisplay}</p>
                )}
                {hotlineTel ? (
                    <a
                        className={`mt-3 flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-extrabold shadow transition ${
                            callLooksClosed
                                ? "bg-emerald-800/80 text-white/95 ring-1 ring-emerald-950/25 hover:bg-emerald-700/90"
                                : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                        href={hotlineTel}
                    >
                        {guestStrings.callNowButton}
                    </a>
                ) : null}
            </div>

            <button
                className="mt-4 min-h-12 w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-violet-600"
                type="button"
                onClick={openGoogleDirections}
            >
                {guestStrings.directionsButton}
            </button>

            {!hasUserLocation ? (
                <p className="mt-2 text-xs font-medium text-slate-500">{guestStrings.directionsNoGpsHint}</p>
            ) : null}
        </section>
    );
}
