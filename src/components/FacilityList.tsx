import { guestStrings } from "../constants/guestStrings";
import type { Facility } from "../types/guest";
import { estimateDriveMinutesFromMeters, formatDistanceLabel } from "../utils/distance";
import { inferFacilityOpenGuess } from "../utils/facilityDisplay";
import { telHrefFromDisplay } from "../utils/phone";

interface FacilityListProps {
    facilities: Facility[];
    isLoading: boolean;
    errorMessage: string | null;
    emptyMessage?: string;
    onSelectFacility: (facility: Facility) => void;
    onOpenDirections: (facility: Facility) => void;
}

function getTypeLabel(type: Facility["type"]): string {
    if (type === 1) {
        return guestStrings.facilityTypeHospitalVi;
    }

    if (type === 2) {
        return guestStrings.facilityTypeClinicVi;
    }

    return guestStrings.facilityTypePharmacyVi;
}

function getTypeBadgeClass(type: Facility["type"]): string {
    if (type === 1) {
        return "bg-blue-600 text-white";
    }

    if (type === 2) {
        return "bg-slate-600 text-white";
    }

    return "bg-violet-600 text-white";
}

function rankBadgeClass(rank: number): string {
    if (rank === 1) {
        return "bg-red-600 text-white ring-2 ring-red-400/40";
    }

    if (rank === 2) {
        return "bg-amber-500 text-white ring-2 ring-amber-300/50";
    }

    if (rank === 3) {
        return "bg-violet-600 text-white ring-2 ring-violet-300/40";
    }

    return "bg-slate-500 text-white";
}

export default function FacilityList({
    facilities,
    isLoading,
    errorMessage,
    emptyMessage,
    onSelectFacility,
    onOpenDirections,
}: FacilityListProps) {
    if (isLoading) {
        return (
            <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-medium text-violet-900/80">
                {guestStrings.loadingFacilities}
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
            </div>
        );
    }

    if (facilities.length === 0) {
        return (
            <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-medium text-violet-900/80">
                {emptyMessage || guestStrings.noFacilities}
            </div>
        );
    }

    return (
        <div className="space-y-2h">
            {facilities.map((facility, index) => {
                const rank = index + 1;
                const etaMinutes = estimateDriveMinutesFromMeters(facility.distanceMeters);
                const hotlineTel = telHrefFromDisplay(facility.phone);
                const hotlineDisplay = facility.phone || guestStrings.detailPhoneFallback;
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

                return (
                    <div
                        key={facility.id}
                        className="shrink-0 overflow-visible rounded-2xl border border-slate-200 bg-white px-3.5 pb-4 pt-3.5 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:border-violet-300 hover:shadow-md"
                    >
                        <div className="flex gap-3">
                            <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${rankBadgeClass(
                                    rank,
                                )}`}
                                aria-label={`${guestStrings.facilityCardRankAria} ${rank}`}
                            >
                                {rank}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start gap-2">
                                    <button
                                        className="facility-name-clamp min-w-0 flex-1 text-left text-[15px] font-bold leading-snug text-slate-900 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                        type="button"
                                        onClick={() => onSelectFacility(facility)}
                                    >
                                        {facility.name}
                                    </button>
                                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getTypeBadgeClass(
                                                facility.type,
                                            )}`}
                                        >
                                            {getTypeLabel(facility.type)}
                                        </span>
                                        {openGuess === "open" ? (
                                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                                {guestStrings.facilityOpenNowBadge}
                                            </span>
                                        ) : null}
                                        {openGuess === "closed" ? (
                                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-100">
                                                {guestStrings.facilityClosedBadge}
                                            </span>
                                        ) : null}
                                        {showUnknownHours ? (
                                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                                {guestStrings.facilityOpenUnknownBadge}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                                    {etaMinutes !== null ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                                            <span aria-hidden="true">⏱</span>~{etaMinutes} {guestStrings.etaApproxSuffix}
                                        </span>
                                    ) : null}
                                    <span className="inline-flex items-center gap-1">
                                        <span aria-hidden="true">📍</span>
                                        <span className="font-medium text-slate-700">
                                            {formatDistanceLabel(facility.distanceMeters) ||
                                                guestStrings.detailDistanceFallback}
                                        </span>
                                    </span>
                                </div>

                                <p className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {guestStrings.detailLabelHotline}
                                </p>
                                {hotlineTel ? (
                                    <a
                                        className="mt-0.5 block break-all text-lg font-extrabold leading-snug tracking-tight text-slate-900 underline decoration-violet-200 decoration-2 underline-offset-2 hover:text-violet-900"
                                        href={hotlineTel}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {hotlineDisplay}
                                    </a>
                                ) : (
                                    <p className="mt-0.5 text-lg font-bold text-slate-700">{hotlineDisplay}</p>
                                )}
                                {hotlineTel ? (
                                    <p className="mt-1 text-[11px] font-medium text-emerald-700">{guestStrings.hotlineTapHint}</p>
                                ) : null}

                                <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
                                    {hotlineTel ? (
                                        <a
                                            className={`inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-extrabold shadow-md transition sm:gap-2 sm:px-3 ${
                                                callLooksClosed
                                                    ? "bg-emerald-800/75 text-white/95 ring-1 ring-emerald-950/20 hover:bg-emerald-700/90"
                                                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                                            }`}
                                            href={hotlineTel}
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <span aria-hidden="true">📞</span>
                                            {guestStrings.callNowButton}
                                        </a>
                                    ) : (
                                        <span className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                                            {guestStrings.callNowButton}
                                        </span>
                                    )}
                                    <button
                                        className={`inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-1.5 rounded-xl border-2 bg-white px-2 text-sm font-extrabold shadow-sm transition sm:gap-2 sm:px-3 ${
                                            callLooksClosed
                                                ? "border-slate-300 text-slate-500 hover:bg-slate-50"
                                                : "border-violet-600 text-violet-900 hover:bg-violet-50"
                                        }`}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onOpenDirections(facility);
                                        }}
                                    >
                                        <span aria-hidden="true">↗</span>
                                        {guestStrings.directionsButton}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
