/**
 * Floating facility search and filter controls for UC9 on mobile and desktop.
 */

import { useState, type ReactNode } from "react";
import { guestStrings } from "../constants/guestStrings";
import type { FacilityFilterType } from "../types/guest";

interface FacilityFilterPanelProps {
    filterType: FacilityFilterType;
    searchText: string;
    radius: number;
    isLoading: boolean;
    resultCount: number;
    errorMessage: string | null;
    variant?: "floating" | "panel";
    onFilterTypeChange: (type: FacilityFilterType) => void;
    onSearchTextChange: (value: string) => void;
    onRadiusChange: (radius: number) => void;
    children?: ReactNode;
}

const filterButtons: Array<{ label: string; value: FacilityFilterType }> = [
    { label: guestStrings.facilityTypeAll, value: "all" },
    { label: guestStrings.facilityTypeHospital, value: 1 },
    { label: guestStrings.facilityTypeClinic, value: 2 },
    { label: guestStrings.facilityTypePharmacy, value: 3 },
];

export default function FacilityFilterPanel({
    filterType,
    searchText,
    radius,
    isLoading,
    resultCount,
    errorMessage,
    variant = "floating",
    onFilterTypeChange,
    onSearchTextChange,
    onRadiusChange,
    children,
}: FacilityFilterPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const containerClassName =
        variant === "panel"
            ? "pointer-events-auto flex flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
            : `pointer-events-auto flex flex-col absolute left-1/2 z-[650] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 border border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur transition-all duration-300 ` +
              (isExpanded
                  ? "bottom-0 h-[70vh] rounded-t-3xl rounded-b-none p-4 pb-0 "
                  : "bottom-[7.25rem] rounded-3xl h-auto p-4 ") +
              "md:bottom-0 md:left-0 md:top-0 md:h-dvh md:w-[320px] md:max-w-none md:translate-x-0 md:rounded-none md:rounded-r-3xl md:border-r md:border-slate-200/70 md:bg-white/70 md:pt-[max(1rem,env(safe-area-inset-top))] md:p-4 md:pb-[max(1rem,env(safe-area-inset-bottom))] md:backdrop-blur-xl lg:hidden";

    return (
        <section className={containerClassName} aria-label={guestStrings.facilityPanelTitle}>
            {variant === "floating" && (
                <div
                    className="md:hidden flex w-full cursor-pointer items-center justify-center pb-3 pt-1 -mt-2 shrink-0"
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-hidden="true"
                >
                    <div className="h-1.5 w-12 rounded-full bg-slate-300" />
                </div>
            )}
            <div className="shrink-0 flex flex-col">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {guestStrings.facilityPanelTitle}
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {filterButtons.map((item) => {
                    const isActive = item.value === filterType;

                    return (
                        <button
                            key={String(item.value)}
                            className={`min-h-12 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                                isActive
                                    ? "bg-slate-900 text-white shadow"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                            type="button"
                            onClick={() => onFilterTypeChange(item.value)}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>

            <label className="mt-3 block">
                <span className="sr-only">{guestStrings.searchPlaceholder}</span>
                <input
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-red-500 transition focus:border-red-300 focus:ring-2"
                    type="text"
                    value={searchText}
                    placeholder={guestStrings.searchPlaceholder}
                    onChange={(event) => onSearchTextChange(event.target.value)}
                />
            </label>

            <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{guestStrings.radiusLabel}</span>
                    <span>{Math.round(radius / 100) / 10} km</span>
                </div>
                <input
                    className="h-2 w-full cursor-pointer accent-red-500"
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={radius}
                    onChange={(event) => onRadiusChange(Number(event.target.value))}
                />
            </div>

            <p 
                className="mt-3 text-xs text-slate-600 md:cursor-auto cursor-pointer flex justify-between items-center" 
                aria-live="polite"
                onClick={() => variant === "floating" && setIsExpanded(!isExpanded)}
            >      
                <span>
                    {isLoading ? guestStrings.loadingFacilities : `${resultCount} ${guestStrings.searchResultSuffix}`}
                </span>
                {variant === "floating" && (
                    <span className="md:hidden text-slate-400">{isExpanded ? "▼" : "▲"}</span>
                )}
            </p>

            {errorMessage ? (
                <p className="mt-1 text-xs font-medium text-red-600 shrink-0" role="alert">
                    {errorMessage}
                </p>
            ) : null}
            </div>

            {children && (
                <div className={`mt-3 flex-1 min-h-0 overflow-y-auto pb-4 ${variant === "floating" && !isExpanded ? 'hidden md:block' : 'block'}`}>
                    {children}
                </div>
            )}
        </section>
    );
}
