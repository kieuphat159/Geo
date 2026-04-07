import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FacilityDetailSheet from "../components/FacilityDetailSheet";
import FacilityFilterPanel from "../components/FacilityFilterPanel";
import FacilityList from "../components/FacilityList";
import SosButton from "../components/SosButton";
import SosConfirmationModal from "../components/SosConfirmationModal";
import TrackingStatusBar from "../components/TrackingStatusBar";
import VietnamMap from "../components/VietnamMap";
import { guestStrings } from "../constants/guestStrings";
import { useAnimatedPosition } from "../hooks/useAnimatedPosition";
import { useTrackingSocket } from "../hooks/useTrackingSocket";
import { fetchFacilities, sendEmergencySos } from "../services/guestApi";
import type {
    AssignedHospital,
    Facility,
    FacilityFilterType,
    GeoJsonLineString,
    SosResponse,
    TrackingSocketEvent,
} from "../types/guest";

const HCMC_CENTER: [number, number] = [10.7769, 106.7009];
const SOS_SUCCESS_OVERLAY_MS = 1800;

type GuestMode = "browse" | "tracking" | "completed";

function normalizePhoneInput(value: string): string {
    return value.replace(/[^\d]/g, "");
}

function coordinateToLatLng(point: [number, number]): [number, number] {
    const [first, second] = point;

    if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
        return [first, second];
    }

    if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
        return [second, first];
    }

    return [second, first];
}

function toRouteLatLng(routePath: GeoJsonLineString | [number, number][] | undefined): [number, number][] {
    if (!routePath) {
        return [];
    }

    const coordinates = Array.isArray(routePath) ? routePath : routePath.coordinates;

    return coordinates
        .map((point) => {
            if (!Array.isArray(point) || point.length < 2) {
                return null;
            }

            const first = Number(point[0]);
            const second = Number(point[1]);

            if (!Number.isFinite(first) || !Number.isFinite(second)) {
                return null;
            }

            return coordinateToLatLng([first, second]);
        })
        .filter((point): point is [number, number] => Boolean(point));
}

function trackingMessageFromStatus(status?: string): string {
    if (!status) {
        return guestStrings.trackingFallback;
    }

    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus === "ASSIGNED") {
        return guestStrings.trackingAssigned;
    }

    if (normalizedStatus === "ON_THE_WAY") {
        return guestStrings.trackingFallback;
    }

    return guestStrings.trackingFallback;
}

function requestCurrentGpsPosition(): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("Geolocation is unavailable."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve([position.coords.latitude, position.coords.longitude]);
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0,
            },
        );
    });
}

export default function UserPage() {
    const [mode, setMode] = useState<GuestMode>("browse");
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>(guestStrings.locationStatusUnknown);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    const [filterType, setFilterType] = useState<FacilityFilterType>("all");
    const [searchText, setSearchText] = useState("");
    const [radius, setRadius] = useState(2000);

    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [facilityError, setFacilityError] = useState<string | null>(null);
    const [isFacilityLoading, setIsFacilityLoading] = useState(false);
    const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

    const [sosPreviewPosition, setSosPreviewPosition] = useState<[number, number] | null>(null);
    const [isSosModalOpen, setIsSosModalOpen] = useState(false);
    const [victimPhone, setVictimPhone] = useState("");
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [sosSubmitError, setSosSubmitError] = useState<string | null>(null);
    const [isSendingSos, setIsSendingSos] = useState(false);
    const [showSosSuccess, setShowSosSuccess] = useState(false);

    const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
    const [sosPosition, setSosPosition] = useState<[number, number] | null>(null);
    const [assignedHospital, setAssignedHospital] = useState<AssignedHospital | null>(null);
    const [routePath, setRoutePath] = useState<[number, number][]>([]);
    const [ambulanceTargetPosition, setAmbulanceTargetPosition] = useState<[number, number] | null>(null);
    const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
    const [trackingStatusMessage, setTrackingStatusMessage] = useState<string>(guestStrings.trackingFallback);

    const animatedAmbulancePosition = useAnimatedPosition(ambulanceTargetPosition, 800);

    const lookupPosition = useMemo<[number, number]>(() => currentPosition ?? HCMC_CENTER, [currentPosition]);

    useEffect(() => {
        const cachedLocation = localStorage.getItem("guest:last-location");
        if (!cachedLocation) {
            return;
        }

        try {
            const parsed = JSON.parse(cachedLocation) as { latitude: number; longitude: number };
            if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
                setCurrentPosition([parsed.latitude, parsed.longitude]);
                setStatusMessage(guestStrings.locationReady);
            }
        } catch {
            localStorage.removeItem("guest:last-location");
        }
    }, []);

    useEffect(() => {
        if (!currentPosition) {
            return;
        }

        localStorage.setItem(
            "guest:last-location",
            JSON.stringify({ latitude: currentPosition[0], longitude: currentPosition[1] }),
        );
    }, [currentPosition]);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const timer = window.setTimeout(async () => {
            setIsFacilityLoading(true);
            setFacilityError(null);

            try {
                const rows = await fetchFacilities(
                    {
                        type: filterType,
                        query: searchText,
                        radius,
                        lat: lookupPosition[0],
                        lng: lookupPosition[1],
                    },
                    controller.signal,
                );

                if (!isMounted) {
                    return;
                }

                setFacilities(rows);
                setSelectedFacility((previous) =>
                    previous ? (rows.find((facility) => facility.id === previous.id) ?? null) : null,
                );
            } catch (error) {
                const errorName = (error as { name?: string }).name;
                if (errorName === "AbortError" || !isMounted) {
                    return;
                }

                setFacilityError(guestStrings.facilityLoadError);
                setFacilities([]);
            } finally {
                if (isMounted) {
                    setIsFacilityLoading(false);
                }
            }
        }, 250);

        return () => {
            isMounted = false;
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [filterType, lookupPosition, radius, searchText]);

    const acquireCurrentLocation = useCallback(async (): Promise<[number, number] | null> => {
        setLocationError(null);
        setStatusMessage(guestStrings.locationRequesting);
        setIsLocating(true);

        try {
            const position = await requestCurrentGpsPosition();
            setCurrentPosition(position);
            setStatusMessage(guestStrings.locationReady);
            return position;
        } catch (error) {
            const code = (error as { code?: number }).code;

            if (code === 1) {
                setLocationError(guestStrings.locationDenied);
                setStatusMessage(guestStrings.locationDenied);
            } else {
                setLocationError(guestStrings.locationFailed);
                setStatusMessage(guestStrings.locationFailed);
            }

            return null;
        } finally {
            setIsLocating(false);
        }
    }, []);

    const handleSosClick = useCallback(async () => {
        setSosSubmitError(null);
        setPhoneError(null);

        const position = await acquireCurrentLocation();
        if (!position) {
            return;
        }

        setSosPreviewPosition(position);
        setIsSosModalOpen(true);
    }, [acquireCurrentLocation]);

    const applySosSuccess = useCallback((response: SosResponse, victimPosition: [number, number]) => {
        setActiveRequestId(response.request_id);
        setSosPosition(victimPosition);
        setAssignedHospital(response.assigned_hospital ?? null);

        const parsedRoute = toRouteLatLng(response.route_path);
        if (parsedRoute.length >= 2) {
            setRoutePath(parsedRoute);
        } else if (response.assigned_hospital) {
            setRoutePath([
                [response.assigned_hospital.lat, response.assigned_hospital.lng],
                [victimPosition[0], victimPosition[1]],
            ]);
        } else {
            setRoutePath([]);
        }

        if (response.assigned_hospital) {
            setAmbulanceTargetPosition([response.assigned_hospital.lat, response.assigned_hospital.lng]);
        } else {
            setAmbulanceTargetPosition(victimPosition);
        }

        if (typeof response.eta_minutes === "number" && Number.isFinite(response.eta_minutes)) {
            setEtaMinutes(Math.max(1, Math.round(response.eta_minutes)));
        } else {
            setEtaMinutes(null);
        }

        setTrackingStatusMessage(guestStrings.trackingFallback);
        setMode("tracking");
        setShowSosSuccess(true);
    }, []);

    const handleConfirmSos = useCallback(async () => {
        if (!sosPreviewPosition) {
            return;
        }

        const normalizedPhone = normalizePhoneInput(victimPhone);
        if (!normalizedPhone) {
            setPhoneError(guestStrings.sosPhoneRequired);
            return;
        }

        if (!/^\d{9,15}$/.test(normalizedPhone)) {
            setPhoneError(guestStrings.sosPhoneInvalid);
            return;
        }

        setPhoneError(null);
        setSosSubmitError(null);
        setIsSendingSos(true);

        try {
            const response = await sendEmergencySos({
                victim_phone: normalizedPhone,
                lat: sosPreviewPosition[0],
                lng: sosPreviewPosition[1],
            });

            applySosSuccess(response, sosPreviewPosition);
            setIsSosModalOpen(false);
            setSelectedFacility(null);
        } catch {
            setSosSubmitError(guestStrings.sosSendFailed);
        } finally {
            setIsSendingSos(false);
        }
    }, [applySosSuccess, sosPreviewPosition, victimPhone]);

    const handleTrackingEvent = useCallback((event: TrackingSocketEvent) => {
        if (typeof event.lat === "number" && typeof event.lng === "number") {
            setAmbulanceTargetPosition([event.lat, event.lng]);
        }

        if (typeof event.eta_minutes === "number" && Number.isFinite(event.eta_minutes)) {
            setEtaMinutes(Math.max(1, Math.round(event.eta_minutes)));
        }

        if (event.route_path) {
            const parsedRoute = toRouteLatLng(event.route_path);
            if (parsedRoute.length >= 2) {
                setRoutePath(parsedRoute);
            }
        }

        if (event.status && event.status.toUpperCase() === "COMPLETED") {
            setMode("completed");
            setTrackingStatusMessage(guestStrings.rescueCompleted);
            setShowSosSuccess(false);
            return;
        }

        setTrackingStatusMessage(trackingMessageFromStatus(event.status));
    }, []);

    const { isReconnecting } = useTrackingSocket({
        requestId: activeRequestId,
        enabled: activeRequestId !== null && mode !== "completed",
        onEvent: handleTrackingEvent,
    });

    useEffect(() => {
        if (!showSosSuccess) {
            return;
        }

        const timer = window.setTimeout(() => {
            setShowSosSuccess(false);
        }, SOS_SUCCESS_OVERLAY_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [showSosSuccess]);

    const clearTrackingState = () => {
        setMode("browse");
        setActiveRequestId(null);
        setAssignedHospital(null);
        setRoutePath([]);
        setSosPosition(null);
        setAmbulanceTargetPosition(null);
        setEtaMinutes(null);
        setTrackingStatusMessage(guestStrings.trackingFallback);
    };

    const listFeedbackMessage =
        facilityError || (!isFacilityLoading && facilities.length === 0 ? guestStrings.noFacilities : null);

    const mapLayoutSignature = `${mode}-${selectedFacility ? "detail" : "list"}`;

    return (
        <main className="relative h-dvh w-screen overflow-hidden bg-slate-900 lg:grid lg:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="relative hidden h-dvh w-[380px] flex-col overflow-hidden border-r border-slate-200/70 bg-white/85 backdrop-blur lg:flex">
                <div className="flex min-h-0 flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
                    <div className="mb-4 shrink-0 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Emergency console
                        </p>
                        <h1 className="mt-1 text-lg font-bold text-slate-900">Emergency Support Map</h1>

                        <div className="mt-3 flex items-center gap-2">
                            <button
                                className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                                type="button"
                                onClick={acquireCurrentLocation}
                                disabled={isLocating}
                            >
                                {guestStrings.locateButton}
                            </button>
                            <Link
                                className="inline-flex min-h-12 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
                                to="/hospital"
                            >
                                {guestStrings.hospitalScreenButton}
                            </Link>
                        </div>

                        <p className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100">
                            {statusMessage}
                        </p>
                    </div>

                    {mode === "browse" ? (
                        <>
                            <div className="shrink-0">
                                <FacilityFilterPanel
                                    filterType={filterType}
                                    searchText={searchText}
                                    radius={radius}
                                    isLoading={isFacilityLoading}
                                    resultCount={facilities.length}
                                    errorMessage={null}
                                    variant="panel"
                                    onFilterTypeChange={setFilterType}
                                    onSearchTextChange={setSearchText}
                                    onRadiusChange={setRadius}
                                />
                            </div>

                            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 pb-20">
                                {selectedFacility ? (
                                    <FacilityDetailSheet
                                        facility={selectedFacility}
                                        hasUserLocation={Boolean(currentPosition)}
                                        variant="panel"
                                        onClose={() => setSelectedFacility(null)}
                                        onDirectionsBlocked={() => setLocationError(guestStrings.directionsNeedGps)}
                                    />
                                ) : (
                                    <FacilityList
                                        facilities={facilities}
                                        isLoading={isFacilityLoading}
                                        errorMessage={listFeedbackMessage}
                                        onSelectFacility={setSelectedFacility}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="shrink-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                                {guestStrings.trackingModeBadge}
                            </h2>
                            <p className="mt-2 text-sm font-medium text-slate-700">
                                {mode === "tracking" ? trackingStatusMessage : guestStrings.rescueCompleted}
                            </p>
                            {mode === "tracking" && etaMinutes !== null ? (
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {guestStrings.trackingEtaPrefix} ~{etaMinutes} {guestStrings.trackingEtaSuffix}
                                </p>
                            ) : null}
                        </div>
                    )}
                </div>
            </aside>

            <section className="relative h-full w-full min-w-0">
                <VietnamMap
                    defaultCenter={HCMC_CENTER}
                    mode={mode}
                    currentPosition={currentPosition}
                    facilities={facilities}
                    onFacilitySelect={setSelectedFacility}
                    sosPosition={sosPosition}
                    assignedHospital={assignedHospital}
                    ambulancePosition={animatedAmbulancePosition}
                    routePath={routePath}
                    layoutSignature={mapLayoutSignature}
                />

                <header className="pointer-events-none absolute left-0 right-0 top-0 z-[690] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
                    <div className="pointer-events-auto mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 md:ml-[336px] md:mr-3 md:max-w-none md:justify-end">
                        <button
                            className="min-h-12 rounded-xl bg-white/95 px-4 text-sm font-semibold text-slate-800 shadow hover:bg-white"
                            type="button"
                            onClick={acquireCurrentLocation}
                            disabled={isLocating}
                        >
                            {guestStrings.locateButton}
                        </button>
                        <Link
                            className="inline-flex min-h-12 items-center rounded-xl bg-slate-900/80 px-4 text-sm font-semibold text-white shadow backdrop-blur hover:bg-slate-900"
                            to="/hospital"
                        >
                            {guestStrings.hospitalScreenButton}
                        </Link>
                    </div>

                    <p className="pointer-events-auto mx-auto mt-2 w-full max-w-[430px] rounded-xl bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-100 shadow-lg backdrop-blur md:ml-[336px] md:mr-3 md:w-fit md:max-w-[420px]">
                        {statusMessage}
                    </p>
                </header>

                <TrackingStatusBar
                    visible={mode === "tracking"}
                    etaMinutes={etaMinutes}
                    statusMessage={trackingStatusMessage}
                    isReconnecting={isReconnecting}
                />

                {mode === "browse" && !selectedFacility ? (
                    <FacilityFilterPanel
                        filterType={filterType}
                        searchText={searchText}
                        radius={radius}
                        isLoading={isFacilityLoading}
                        resultCount={facilities.length}
                        errorMessage={null}
                        onFilterTypeChange={setFilterType}
                        onSearchTextChange={setSearchText}
                        onRadiusChange={setRadius}
                    >
                        <FacilityList
                            facilities={facilities}
                            isLoading={isFacilityLoading}
                            errorMessage={listFeedbackMessage}
                            onSelectFacility={setSelectedFacility}
                        />
                    </FacilityFilterPanel>
                ) : null}

                {mode === "browse" && Boolean(selectedFacility) ? (
                    <FacilityDetailSheet
                        facility={selectedFacility}
                        hasUserLocation={Boolean(currentPosition)}
                        onClose={() => setSelectedFacility(null)}
                        onDirectionsBlocked={() => setLocationError(guestStrings.directionsNeedGps)}
                    />
                ) : null}

                {locationError ? (
                    <div className="pointer-events-auto absolute left-1/2 top-[max(5.75rem,calc(env(safe-area-inset-top)+5rem))] z-[710] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50/95 p-3 text-sm shadow-lg md:left-[336px] md:w-[min(430px,calc(100%-21rem))] md:max-w-none md:translate-x-0 lg:left-4 lg:top-[5.5rem] lg:w-[min(430px,calc(100%-2rem))]">
                        <p className="font-semibold text-red-700">{locationError}</p>
                        <button
                            className="mt-2 min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
                            type="button"
                            onClick={acquireCurrentLocation}
                        >
                            {guestStrings.retry}
                        </button>
                    </div>
                ) : null}
            </section>

            <div className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[1000] -translate-x-1/2 lg:bottom-8 lg:left-[calc(380px+(100vw-380px)/2)]">
                <SosButton onClick={handleSosClick} disabled={isLocating || isSendingSos} />
            </div>

            <SosConfirmationModal
                open={isSosModalOpen}
                position={sosPreviewPosition}
                phone={victimPhone}
                phoneError={phoneError}
                isSubmitting={isSendingSos}
                submitError={sosSubmitError}
                onPhoneChange={setVictimPhone}
                onCancel={() => {
                    setIsSosModalOpen(false);
                    setSosSubmitError(null);
                    setPhoneError(null);
                }}
                onConfirm={handleConfirmSos}
            />

            {isLocating ? (
                <div className="pointer-events-none absolute inset-0 z-[720] grid place-items-center bg-slate-900/20">
                    <div className="rounded-2xl bg-white/95 px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
                        {guestStrings.locationRequesting}
                    </div>
                </div>
            ) : null}

            {showSosSuccess ? (
                <div className="pointer-events-none absolute inset-0 z-[735] grid place-items-center bg-slate-900/35 p-4">
                    <article className="w-full max-w-[430px] rounded-3xl bg-white p-5 text-center shadow-2xl">
                        <h2 className="text-xl font-bold text-emerald-700">{guestStrings.sosSuccessTitle}</h2>
                        <p className="mt-2 text-sm text-slate-700">{guestStrings.sosSuccessBody}</p>
                        {assignedHospital ? (
                            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700">
                                <p className="font-semibold text-slate-900">
                                    {guestStrings.assignedHospitalLabel}: {assignedHospital.name}
                                </p>
                                <p className="mt-1">
                                    {guestStrings.assignedHospitalHotline}:{" "}
                                    {assignedHospital.hotline || guestStrings.detailPhoneFallback}
                                </p>
                            </div>
                        ) : null}
                    </article>
                </div>
            ) : null}

            {mode === "completed" ? (
                <div className="absolute inset-0 z-[734] grid place-items-center bg-slate-900/55 p-4">
                    <article className="w-full max-w-[430px] rounded-3xl bg-white p-6 text-center shadow-2xl">
                        <h2 className="text-2xl font-bold text-emerald-700">{guestStrings.rescueCompleted}</h2>
                        <button
                            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                            type="button"
                            onClick={clearTrackingState}
                        >
                            {guestStrings.returnToMap}
                        </button>
                    </article>
                </div>
            ) : null}
        </main>
    );
}
