/**
 * Floating facility search and filter controls for UC9 on mobile and desktop.
 */

import { useEffect, useState, type ReactNode } from "react";
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

function activeFilterLabel(filterType: FacilityFilterType): string {
    const hit = filterButtons.find((b) => b.value === filterType);
    return hit?.label ?? guestStrings.facilityTypeAll;
}

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
    const [isExpanded, setIsExpanded] = useState(() =>
        typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
    );
    const isPanel = variant === "panel";
    const isFloatingMobile = variant === "floating";

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 768px)");
        const sync = () => {
            if (mq.matches) setIsExpanded(true);
        };
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

    const collapsePanel = () => setIsExpanded(false);
    const expandPanel = () => setIsExpanded(true);

    /** Clears centered bottom SOS pill + safe area */
    const mobileStackBottom =
        "bottom-[max(5.75rem,calc(4.75rem+env(safe-area-inset-bottom)))]";

    const containerClassName =
        isPanel
            ? "pointer-events-auto flex flex-col rounded-xl border border-violet-100 bg-white px-3 py-2 shadow-sm"
            : `pointer-events-auto absolute left-3 right-3 z-[650] mx-auto flex max-w-[min(100%,32rem)] flex-col border border-violet-100 bg-white/95 shadow-2xl shadow-violet-950/20 backdrop-blur transition-all duration-300 sm:left-4 sm:right-4 ` +
              (isExpanded
                  ? "bottom-[max(4.75rem,calc(3.5rem+env(safe-area-inset-bottom)+0.5rem))] max-h-[min(78vh,calc(100dvh-5rem))] min-h-[min(52vh,420px)] rounded-t-3xl rounded-b-none p-4 pb-0 "
                  : `${mobileStackBottom} h-auto max-h-none rounded-3xl p-3 `) +
              "md:hidden";

    const resultSummary = isLoading
        ? guestStrings.loadingFacilities
        : advancedOptionsOpen
          ? `${resultCount} ${guestStrings.searchResultSuffix}`
          : totalMatchCount > resultCount
            ? `${guestStrings.showingNearestSummary}: ${resultCount}/${totalMatchCount} ${guestStrings.facilitiesWord}`
            : `${resultCount} ${guestStrings.searchResultSuffix}`;

    const filterControls = (
        <>
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
                className={`${isPanel ? "mt-1.5 text-[11px]" : "mt-3 text-xs"} text-violet-900/80`}
                aria-live="polite"
            >
                {resultSummary}
            </p>

            {errorMessage ? (
                <p className="mt-1 text-xs font-medium text-red-600 shrink-0" role="alert">
                    {errorMessage}
                </p>
            ) : null}
        </>
    );

    const panelBody = (
        <section className={containerClassName} aria-label={guestStrings.facilityPanelTitle}>
            {isFloatingMobile ? (
                <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-violet-100 pb-2">
                    <button
                        type="button"
                        className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border-0 bg-transparent py-1"
                        onClick={() => (isExpanded ? collapsePanel() : expandPanel())}
                        aria-expanded={isExpanded ? "true" : "false"}
                        aria-label={
                            isExpanded
                                ? guestStrings.facilityPanelCloseMapAria
                                : guestStrings.facilityPanelOpenListLabel
                        }
                    >
                        <span className="h-1.5 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                        {!isExpanded ? (
                            <span className="truncate text-[11px] font-semibold text-violet-800">
                                {guestStrings.facilityPanelOpenListLabel} ({resultCount})
                            </span>
                        ) : (
                            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-violet-950">
                                {guestStrings.facilityPanelTitle}
                            </span>
                        )}
                    </button>
                    {isExpanded ? (
                        <button
                            type="button"
                            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                            onClick={collapsePanel}
                            aria-label={guestStrings.facilityPanelCloseMapAria}
                        >
                            {guestStrings.facilityPanelCloseLabel}
                        </button>
                    ) : null}
                </div>
            ) : null}

            <div className="shrink-0 flex flex-col">
                {isPanel ? (
                    <h2 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-violet-950">
                        {guestStrings.facilityPanelTitle}
                    </h2>
                ) : null}

                {isFloatingMobile && !isExpanded ? (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-violet-900/90">
                            <span className="font-semibold text-violet-950">{activeFilterLabel(filterType)}</span>
                            {" · "}
                            {resultSummary}
                        </p>
                        <p className="text-[10px] leading-snug text-slate-500">{guestStrings.facilityPanelCompactHint}</p>
                        <button
                            type="button"
                            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-md hover:bg-violet-600"
                            onClick={expandPanel}
                        >
                            {guestStrings.facilityPanelOpenListLabel} ({resultCount})
                        </button>
                    </div>
                ) : (
                    filterControls
                )}
            </div>

            {children && (isPanel || isExpanded) ? (
                <div
                    className={`subtle-scrollbar ${isPanel ? "mt-1.5" : "mt-2"} min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[max(1.25rem,calc(5.5rem+env(safe-area-inset-bottom)))] max-h-[min(52vh,calc(100dvh-14rem))]`}
                >
                    {children}
                </div>
            ) : null}
        </section>
    );

    if (isFloatingMobile && isExpanded) {
        return (
            <>
                <button
                    type="button"
                    className="fixed inset-0 z-[649] cursor-default border-0 bg-slate-900/45 md:hidden"
                    aria-label={guestStrings.facilityPanelCloseMapAria}
                    onClick={collapsePanel}
                />
                {panelBody}
            </>
        );
    }

    return panelBody;
}
