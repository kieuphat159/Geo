import { guestStrings } from "../constants/guestStrings";
import type { Facility } from "../types/guest";
import { formatDistanceLabel } from "../utils/distance";

interface FacilityListProps {
    facilities: Facility[];
    isLoading: boolean;
    errorMessage: string | null;
    onSelectFacility: (facility: Facility) => void;
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
        return "bg-red-100 text-red-700";
    }

    if (type === 2) {
        return "bg-amber-100 text-amber-700";
    }

    return "bg-emerald-100 text-emerald-700";
}

export default function FacilityList({
    facilities,
    isLoading,
    errorMessage,
    onSelectFacility,
}: FacilityListProps) {
    if (isLoading) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600">
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
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600">
                {guestStrings.noFacilities}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {facilities.map((facility) => (
                <button
                    key={facility.id}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
                    type="button"
                    onClick={() => onSelectFacility(facility)}
                >
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-900">{facility.name}</h3>
                        <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getTypeBadgeClass(
                                facility.type,
                            )}`}
                        >
                            {getTypeLabel(facility.type)}
                        </span>
                    </div>

                    <div className="mt-3 grid gap-1 text-sm text-slate-600">
                        <p>
                            <span className="font-semibold text-slate-700">{guestStrings.detailLabelDistance}: </span>
                            {formatDistanceLabel(facility.distanceMeters) || guestStrings.detailDistanceFallback}
                        </p>
                        <p>
                            <span className="font-semibold text-slate-700">{guestStrings.detailLabelHotline}: </span>
                            {facility.phone || guestStrings.detailPhoneFallback}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
}
