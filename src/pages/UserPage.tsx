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
import { clearSession, getStoredSession } from "../services/auth";
import { fetchFacilities, getActiveEmergencySos, sendEmergencySos } from "../services/guestApi";
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
const GUEST_UUID_STORAGE_KEY = "geo:guest-uuid";
const ACTIVE_TRACKING_HINT_KEY = "geo:has-active-tracking";
const DEFAULT_REALISTIC_RADIUS = 5000;
const MAX_REALISTIC_RADIUS = 10000;

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
    const session = getStoredSession();
    const isLoggedIn = Boolean(session?.token);
    const displayName = session?.user?.email ?? "bạn";
    const roleId = session?.user?.role_id;
    const dashboardRoute = roleId === 1 ? "/super-admin" : roleId === 2 ? "/admin" : null;
    const dashboardLabel = roleId === 1 ? "Quản trị hệ thống" : roleId === 2 ? "Trung tâm điều phối" : null;
    const isSuperAdmin = roleId === 1;
    const [mode, setMode] = useState<GuestMode>("browse");
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>(guestStrings.locationStatusUnknown);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    const [filterType, setFilterType] = useState<FacilityFilterType>("all");
    const [searchText, setSearchText] = useState("");
    const [radius, setRadius] = useState(DEFAULT_REALISTIC_RADIUS);

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
    const [trackingToken, setTrackingToken] = useState<string | null>(null);
    const [sessionRestoreMessage, setSessionRestoreMessage] = useState<string | null>(null);

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

                const filteredRows = filterType === "all" ? rows : rows.filter((facility) => facility.type === filterType);
                const sortedRows = [...filteredRows].sort((left, right) => {
                    const leftDistance = typeof left.distanceMeters === "number" ? left.distanceMeters : Number.POSITIVE_INFINITY;
                    const rightDistance =
                        typeof right.distanceMeters === "number" ? right.distanceMeters : Number.POSITIVE_INFINITY;
                    const leftPriority = leftDistance < 10000 ? 0 : 1;
                    const rightPriority = rightDistance < 10000 ? 0 : 1;
                    if (leftPriority !== rightPriority) {
                        return leftPriority - rightPriority;
                    }
                    return leftDistance - rightDistance;
                });
                setFacilities(sortedRows);
                setSelectedFacility((previous) =>
                    previous ? (sortedRows.find((facility) => facility.id === previous.id) ?? null) : null,
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

    const handleOpenDirectionsForFacility = useCallback(
        (facility: Facility) => {
            if (mode !== "browse") {
                return;
            }

            if (!currentPosition) {
                setLocationError(guestStrings.directionsNeedGps);
                return;
            }

            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
            window.open(directionsUrl, "_blank", "noopener,noreferrer");
        },
        [currentPosition, mode],
    );

    const handleSosHereForFacility = useCallback(
        (facility: Facility) => {
            if (mode !== "browse") {
                return;
            }

            setLocationError(null);
            setSosSubmitError(null);
            setPhoneError(null);

            setSosPreviewPosition([facility.lat, facility.lng]);
            setIsSosModalOpen(true);
        },
        [mode],
    );

    const applySosSuccess = useCallback((response: SosResponse, victimPosition: [number, number]) => {
        setActiveRequestId(response.request_id);
        setTrackingToken(response.tracking_token ?? null);
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
        localStorage.setItem(ACTIVE_TRACKING_HINT_KEY, "1");
    }, []);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        async function restoreActiveSession() {
            if (mode !== "browse") {
                return;
            }

            const hasAuthSession = Boolean(session?.token);
            const guestId = typeof window !== "undefined" ? localStorage.getItem(GUEST_UUID_STORAGE_KEY) : null;
            const hasTrackingHint =
                typeof window !== "undefined" && localStorage.getItem(ACTIVE_TRACKING_HINT_KEY) === "1";
            if (!hasAuthSession && !guestId) {
                if (isMounted && hasTrackingHint) {
                    setSessionRestoreMessage(guestStrings.sessionNotFound);
                }
                return;
            }

            const activeSession = await getActiveEmergencySos(controller.signal);
            if (!isMounted) {
                return;
            }

            if (!activeSession) {
                if (isMounted && hasTrackingHint) {
                    setSessionRestoreMessage(guestStrings.sessionNotFound);
                }
                return;
            }

            const fallbackPosition = currentPosition ?? HCMC_CENTER;
            const victimPosition: [number, number] = activeSession.patient_position
                ? [activeSession.patient_position.lat, activeSession.patient_position.lng]
                : fallbackPosition;

            applySosSuccess(activeSession, victimPosition);
            if (activeSession.ambulance_position) {
                setAmbulanceTargetPosition([
                    activeSession.ambulance_position.lat,
                    activeSession.ambulance_position.lng,
                ]);
            }
            setSessionRestoreMessage(null);
        }

        restoreActiveSession().catch(() => {
            if (isMounted) {
                setSessionRestoreMessage(guestStrings.sessionNotFound);
            }
        });

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [applySosSuccess, currentPosition, mode, session?.token]);

    const handleConfirmSos = useCallback(async () => {
        if (!sosPreviewPosition) {
            return;
        }

        const normalizedPhone = normalizePhoneInput(victimPhone);
        if (!isLoggedIn && !normalizedPhone) {
            setPhoneError(guestStrings.sosPhoneRequired);
            return;
        }

        if (normalizedPhone && !/^\d{9,15}$/.test(normalizedPhone)) {
            setPhoneError(guestStrings.sosPhoneInvalid);
            return;
        }

        setPhoneError(null);
        setSosSubmitError(null);
        setIsSendingSos(true);

        try {
            const response = await sendEmergencySos({
                victim_phone: normalizedPhone || undefined,
                lat: sosPreviewPosition[0],
                lng: sosPreviewPosition[1],
            });

            applySosSuccess(response, sosPreviewPosition);
            setIsSosModalOpen(false);
            setSelectedFacility(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : guestStrings.sosSendFailed;
            setSosSubmitError(message);
        } finally {
            setIsSendingSos(false);
        }
    }, [applySosSuccess, isLoggedIn, sosPreviewPosition, victimPhone]);

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
        trackingToken,
        enabled: activeRequestId !== null && mode !== "completed" && Boolean(trackingToken),
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
        setTrackingToken(null);
        setAmbulanceTargetPosition(null);
        setEtaMinutes(null);
        setTrackingStatusMessage(guestStrings.trackingFallback);
        setSessionRestoreMessage(null);
        localStorage.removeItem(ACTIVE_TRACKING_HINT_KEY);
    };

    const emptyFacilityMessage =
        !isFacilityLoading && !facilityError && facilities.length === 0
            ? radius < MAX_REALISTIC_RADIUS
                ? guestStrings.emptySuggestExpandToTenKm
                : guestStrings.emptySuggestExpandBeyondTenKm
            : undefined;

    // FacilityList handles the common empty-state styling internally.
    const listFeedbackMessage = facilityError;

    const mapLayoutSignature = `${mode}-${selectedFacility ? "detail" : "list"}`;

    return (
        <main className="relative flex h-dvh w-screen overflow-hidden bg-violet-950">
            <aside className="relative hidden h-dvh min-w-[360px] max-w-[460px] w-[32vw] resize-x flex-col overflow-auto border-r border-violet-200 bg-white/90 backdrop-blur lg:flex">
                <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
                    <div className="mb-3 shrink-0 rounded-2xl border border-violet-100 bg-white px-3 py-2.5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Trung tâm hỗ trợ khẩn cấp
                        </p>
                        <h1 className="mt-0.5 text-base font-bold text-violet-950">Bản đồ hỗ trợ khẩn cấp</h1>

                        <div className="mt-2.5 grid grid-cols-3 gap-2">
                            <button
                                className="min-h-10 rounded-xl bg-violet-50 px-3 text-xs font-semibold text-violet-900 transition hover:bg-violet-100"
                                type="button"
                                onClick={acquireCurrentLocation}
                                disabled={isLocating}
                            >
                                {guestStrings.locateButton}
                            </button>
                            {dashboardRoute && !isSuperAdmin ? (
                                <Link
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-violet-700 px-3 text-xs font-semibold text-white shadow transition hover:bg-violet-600"
                                    to={dashboardRoute}
                                >
                                    {dashboardLabel}
                                </Link>
                            ) : !dashboardRoute ? (
                                <Link
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-violet-700 px-3 text-xs font-semibold text-white shadow transition hover:bg-violet-600"
                                    to="/admin"
                                >
                                    {guestStrings.hospitalScreenButton}
                                </Link>
                            ) : (
                                <div className="min-h-10 rounded-xl bg-violet-50" aria-hidden="true" />
                            )}
                            <Link className="inline-flex min-h-10 items-center justify-center rounded-xl bg-violet-50 px-3 text-xs font-semibold text-violet-900" to="/profile">
                                Hồ sơ y tế
                            </Link>
                        </div>

                        <p className="mt-2 rounded-xl bg-violet-900 px-3 py-1.5 text-[11px] font-medium text-violet-50">
                            {statusMessage}
                        </p>
                        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
                            {isLoggedIn
                                ? `Thông báo khách: Chào ${displayName}, hồ sơ y tế của bạn sẽ được gửi kèm yêu cầu SOS.`
                                : "Thông báo khách: Bạn đang gửi SOS với tư cách khách. Đăng nhập để gửi kèm hồ sơ y tế (tuỳ chọn)."}
                        </p>
                        <div className="mt-1.5 flex gap-2">
                            {!isLoggedIn ? (
                                <Link to="/login" className="text-xs font-semibold text-violet-700">Đăng nhập</Link>
                            ) : (
                                <button className="text-xs font-semibold text-slate-600" onClick={() => { clearSession(); window.location.reload(); }}>Đăng xuất</button>
                            )}
                        </div>
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

                            <div className="subtle-scrollbar mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1 pb-12">
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
                                        emptyMessage={emptyFacilityMessage}
                                        onSelectFacility={setSelectedFacility}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="shrink-0 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-900">
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

            <section className="relative h-full min-w-0 flex-1">
                {isSuperAdmin ? (
                    <div className="pointer-events-none absolute right-3 top-3 z-[700] pt-[max(0rem,env(safe-area-inset-top))]">
                        <Link
                            className="pointer-events-auto inline-flex min-h-11 items-center rounded-xl bg-violet-800/90 px-4 text-sm font-semibold text-white shadow backdrop-blur transition hover:bg-violet-700"
                            to="/super-admin"
                        >
                            Quản trị hệ thống
                        </Link>
                    </div>
                ) : null}

                <VietnamMap
                    defaultCenter={HCMC_CENTER}
                    mode={mode}
                    currentPosition={currentPosition}
                    facilities={facilities}
                    selectedFacilityId={selectedFacility?.id ?? null}
                    onFacilitySelect={setSelectedFacility}
                    onOpenDirectionsForFacility={handleOpenDirectionsForFacility}
                    onSosHereForFacility={handleSosHereForFacility}
                    sosPosition={sosPosition}
                    assignedHospital={assignedHospital}
                    ambulancePosition={animatedAmbulancePosition}
                    routePath={routePath}
                    layoutSignature={mapLayoutSignature}
                />

                <header className="pointer-events-none absolute left-0 right-0 top-0 z-[690] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
                    <div className="pointer-events-auto mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 md:ml-[336px] md:mr-3 md:max-w-none md:justify-end">
                        <button
                            className="min-h-12 rounded-xl bg-white/95 px-4 text-sm font-semibold text-violet-900 shadow hover:bg-white"
                            type="button"
                            onClick={acquireCurrentLocation}
                            disabled={isLocating}
                        >
                            {guestStrings.locateButton}
                        </button>
                        {dashboardRoute && !isSuperAdmin ? (
                            <Link
                                className="inline-flex min-h-12 items-center rounded-xl bg-violet-800/85 px-4 text-sm font-semibold text-white shadow backdrop-blur hover:bg-violet-700"
                                to={dashboardRoute}
                            >
                                {dashboardLabel}
                            </Link>
                        ) : !dashboardRoute ? (
                            <Link
                                className="inline-flex min-h-12 items-center rounded-xl bg-violet-800/85 px-4 text-sm font-semibold text-white shadow backdrop-blur hover:bg-violet-700"
                                to="/admin"
                            >
                                {guestStrings.hospitalScreenButton}
                            </Link>
                        ) : null}
                    </div>

                    <p className="pointer-events-auto mx-auto mt-2 w-full max-w-[430px] rounded-xl bg-violet-900/80 px-3 py-2 text-xs font-medium text-violet-50 shadow-lg backdrop-blur md:ml-[336px] md:mr-3 md:w-fit md:max-w-[420px]">
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
                            emptyMessage={emptyFacilityMessage}
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

                {sessionRestoreMessage ? (
                    <div className="pointer-events-auto absolute left-1/2 top-[max(5.75rem,calc(env(safe-area-inset-top)+5rem))] z-[710] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-sm shadow-lg md:left-[336px] md:w-[min(430px,calc(100%-21rem))] md:max-w-none md:translate-x-0 lg:left-4 lg:top-[5.5rem] lg:w-[min(430px,calc(100%-2rem))]">
                        <p className="font-semibold text-amber-700">{sessionRestoreMessage}</p>
                    </div>
                ) : null}
            </section>

                <div className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[1000] -translate-x-1/2 lg:bottom-8 lg:left-[calc(clamp(360px,32vw,460px)+(100vw-clamp(360px,32vw,460px))/2)]">
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
