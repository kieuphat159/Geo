/**
 * Bottom sheet for UC10 facility detail display and direction handoff actions.
 */

import { guestStrings } from "../constants/guestStrings";
import type { Facility } from "../types/guest";
import { formatDistanceLabel } from "../utils/distance";

interface FacilityDetailSheetProps {
    facility: Facility | null;
    hasUserLocation: boolean;
    variant?: "sheet" | "panel";
    onClose: () => void;
    onDirectionsBlocked: () => void;
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
    onDirectionsBlocked,
}: FacilityDetailSheetProps) {
    if (!facility) {
        return null;
    }

    const detailRows = [
        { label: guestStrings.detailLabelType, value: getFacilityTypeLabel(facility.type) },
        { label: guestStrings.detailLabelAddress, value: facility.address },
        { label: guestStrings.detailLabelHotline, value: facility.phone || guestStrings.detailPhoneFallback },
        {
            label: guestStrings.detailLabelOpeningHours,
            value: facility.openingHours || guestStrings.detailOpeningHoursFallback,
        },
        {
            label: guestStrings.detailLabelDistance,
            value: formatDistanceLabel(facility.distanceMeters) || guestStrings.detailDistanceFallback,
        },
    ];

    const openGoogleDirections = () => {
        if (!hasUserLocation) {
            onDirectionsBlocked();
            return;
        }

        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
        window.open(directionsUrl, "_blank", "noopener,noreferrer");
    };

    const containerClassName =
        variant === "panel"
            ? "pointer-events-auto rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"
            : "pointer-events-auto absolute bottom-[7.25rem] left-1/2 z-[660] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-3xl border border-violet-100 bg-white/95 p-4 shadow-xl shadow-violet-950/20 backdrop-blur md:bottom-0 md:left-0 md:top-0 md:h-dvh md:w-[320px] md:max-w-none md:translate-x-0 md:rounded-none md:rounded-r-3xl md:border-r md:border-violet-100 md:bg-white/80 md:pt-[max(1rem,env(safe-area-inset-top))] md:pb-[max(1rem,env(safe-area-inset-bottom))] md:backdrop-blur-xl md:overflow-y-auto lg:hidden";

    return (
        <section className={containerClassName} aria-label={guestStrings.detailTitle}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold text-slate-900">{facility.name}</h3>
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

            <button
                className="mt-4 min-h-12 w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-violet-200"
                type="button"
                disabled={!hasUserLocation}
                onClick={openGoogleDirections}
            >
                {guestStrings.directionsButton}
            </button>

            {!hasUserLocation ? (
                <p className="mt-2 text-xs font-medium text-amber-600">{guestStrings.directionsNeedGps}</p>
            ) : null}
        </section>
    );
}
