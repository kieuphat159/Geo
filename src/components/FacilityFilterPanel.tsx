/**
 * Floating facility search and filter controls for UC9 on mobile and desktop.
 */

import { useState, type ReactNode } from "react";
import { formControlClassName } from "../constants/formClasses";
import { guestStrings } from "../constants/guestStrings";
import type { FacilityFilterType } from "../types/guest";

interface FacilityFilterPanelProps {
    filterType: FacilityFilterType;
    searchText: string;
    radius: number;
    isLoading: boolean;
    resultCount: number;
    totalMatchCount: number;
    advancedOptionsOpen: boolean;
    onAdvancedOptionsOpenChange: (open: boolean) => void;
    errorMessage: string | null;
    variant?: "floating" | "panel";
    onFilterTypeChange: (type: FacilityFilterType) => void;
    onSearchTextChange: (value: string) => void;
    onRadiusChange: (radius: number) => void;
    /** TC07: false khi chưa có tọa độ GPS — tooltip + vô hiệu hóa slider bán kính */
    hasUserGps?: boolean;
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
    totalMatchCount,
    advancedOptionsOpen,
    onAdvancedOptionsOpenChange,
    errorMessage,
    variant = "floating",
    onFilterTypeChange,
    onSearchTextChange,
    onRadiusChange,
    hasUserGps = true,
    children,
}: FacilityFilterPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isPanel = variant === "panel";

    /** Clears centered bottom SOS pill + safe area */
    const mobileStackBottom =
        "bottom-[max(5.75rem,calc(4.75rem+env(safe-area-inset-bottom)))]";

    const containerClassName =
        isPanel
            ? "pointer-events-auto flex flex-col rounded-xl border border-violet-100 bg-white px-3 py-2 shadow-sm"
            : `pointer-events-auto flex flex-col absolute left-4 right-4 z-[650] mx-auto max-w-[430px] border border-violet-100 bg-white/95 shadow-2xl shadow-violet-950/20 backdrop-blur transition-all duration-300 sm:left-5 sm:right-5 ` +
              (isExpanded
                  ? "bottom-[max(4.75rem,calc(3.5rem+env(safe-area-inset-bottom)+0.5rem))] h-[min(70vh,calc(100dvh-5.5rem))] rounded-t-3xl rounded-b-none p-4 pb-0 "
                  : `${mobileStackBottom} rounded-3xl h-auto p-4 `) +
              "md:left-3 md:right-auto md:top-3 md:bottom-3 md:mx-0 md:h-auto md:max-h-[calc(100dvh-1.5rem)] md:w-[min(320px,calc(100%-1.5rem))] md:max-w-none md:rounded-2xl md:border md:border-violet-100 md:bg-white/90 md:px-5 md:py-4 md:pt-[max(1.25rem,env(safe-area-inset-top))] md:pb-[max(1.25rem,calc(0.75rem+env(safe-area-inset-bottom)))] md:shadow-2xl md:backdrop-blur-xl lg:hidden";

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
                <h2
                    className={`${isPanel ? "text-[11px] leading-tight" : "text-sm"} font-bold uppercase tracking-wide text-violet-950`}
                >
                    {guestStrings.facilityPanelTitle}
                </h2>

                <div className={`${isPanel ? "mt-1.5 gap-1.5" : "mt-3 gap-2"} grid grid-cols-2`}>
                    {filterButtons.map((item) => {
                        const isActive = item.value === filterType;

                        return (
                            <button
                                key={String(item.value)}
                                className={`${isPanel ? "min-h-9 px-2 py-1.5 text-[11px]" : "min-h-12 px-3 py-2 text-sm"} rounded-xl border-b-[3px] font-semibold transition-all ${
                                    isActive
                                        ? "border-violet-700 bg-violet-700 text-white shadow hover:bg-violet-600"
                                        : "border-transparent bg-violet-50 text-violet-900 hover:bg-violet-100"
                                }`}
                                type="button"
                                onClick={() => onFilterTypeChange(item.value)}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                <label className={`${isPanel ? "mt-1.5" : "mt-3"} block`}>
                    <span className="sr-only">{guestStrings.searchPlaceholder}</span>
                    <input
                        className={`${isPanel ? "h-9 text-xs" : "h-12 text-sm"} w-full rounded-xl border border-violet-100 px-3 outline-none ring-violet-500 transition focus:border-violet-300 focus:ring-2 ${formControlClassName}`}
                        type="text"
                        value={searchText}
                        placeholder={guestStrings.searchPlaceholder}
                        onChange={(event) => onSearchTextChange(event.target.value)}
                    />
                </label>

                {advancedOptionsOpen ? (
                    <div className={`${isPanel ? "mt-1.5 space-y-1.5" : "mt-3 space-y-2"}`}>
                        <div className="flex items-center justify-between text-xs font-medium text-violet-900/80">
                            <span>{guestStrings.radiusLabel}</span>
                            <span>{Math.round(radius / 100) / 10} km</span>
                        </div>
                        <input
                            className="h-2 w-full cursor-pointer accent-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                            type="range"
                            aria-label={guestStrings.radiusLabel}
                            title={!hasUserGps ? guestStrings.radiusSliderNeedGpsTooltip : undefined}
                            disabled={!hasUserGps}
                            min={1000}
                            max={20000}
                            step={500}
                            value={radius}
                            onChange={(event) => onRadiusChange(Number(event.target.value))}
                        />
                    </div>
                ) : (
                    <p className={`${isPanel ? "mt-1.5 text-[10px]" : "mt-3 text-[11px]"} font-medium leading-snug text-violet-800/90`}>
                        {guestStrings.radiusFixedSummary}
                    </p>
                )}

                <button
                    className={`${isPanel ? "mt-1.5 py-1.5 text-[10px]" : "mt-3 py-2 text-[11px]"} w-full rounded-lg border border-violet-200 bg-violet-50/80 px-2.5 text-left font-semibold text-violet-900 transition hover:bg-violet-100`}
                    type="button"
                    title={!hasUserGps ? guestStrings.radiusSliderNeedGpsTooltip : undefined}
                    onClick={() => onAdvancedOptionsOpenChange(!advancedOptionsOpen)}
                >
                    {advancedOptionsOpen ? guestStrings.advancedOptionsToggleHide : guestStrings.advancedOptionsToggleShow}
                </button>

                <p
                    className={`${isPanel ? "mt-1.5 text-[11px]" : "mt-3 text-xs"} text-violet-900/80 md:cursor-auto cursor-pointer flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-center`}
                    aria-live="polite"
                    onClick={() => variant === "floating" && setIsExpanded(!isExpanded)}
                >
                    <span>
                        {isLoading ? (
                            guestStrings.loadingFacilities
                        ) : advancedOptionsOpen ? (
                            `${resultCount} ${guestStrings.searchResultSuffix}`
                        ) : totalMatchCount > resultCount ? (
                            <>
                                {guestStrings.showingNearestSummary}: {resultCount}/{totalMatchCount}{" "}
                                {guestStrings.facilitiesWord}
                            </>
                        ) : (
                            `${resultCount} ${guestStrings.searchResultSuffix}`
                        )}
                    </span>
                    {variant === "floating" && (
                        <span className="shrink-0 text-violet-300 md:hidden">{isExpanded ? "▼" : "▲"}</span>
                    )}
                </p>

                {errorMessage ? (
                    <p className="mt-1 text-xs font-medium text-red-600 shrink-0" role="alert">
                        {errorMessage}
                    </p>
                ) : null}
            </div>

            {children && (
                <div
                    className={`subtle-scrollbar ${isPanel ? "mt-1.5" : "mt-3"} min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[max(1.25rem,calc(5.5rem+env(safe-area-inset-bottom)))] max-md:max-h-[min(52vh,calc(100dvh-15rem))] md:pb-[max(1.5rem,calc(5.5rem+env(safe-area-inset-bottom)))] ${variant === "floating" && !isExpanded ? "hidden md:block" : "block"}`}
                >
                    {children}
                </div>
            )}
        </section>
    );
}
