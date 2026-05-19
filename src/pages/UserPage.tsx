import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
import { clearSession, getStoredSession, normalizeKnownRoleId } from "../services/auth";
import { fetchFacilities, getActiveEmergencySos, sendEmergencySos } from "../services/guestApi";
import type {
    AssignedHospital,
    Facility,
    FacilityFilterType,
    GeoJsonLineString,
    SosResponse,
    TrackingSocketEvent,
} from "../types/guest";
import { haversineDistanceMeters } from "../utils/distance";
import { useTrimmedRoutePath } from "../utils/routePath";
import { isGuestPresentableFacilityName } from "../utils/facilityDisplay";
import { telHrefFromDisplay } from "../utils/phone";

const HCMC_CENTER: [number, number] = [10.7769, 106.7009];
const SOS_SUCCESS_OVERLAY_MS = 1800;
const GUEST_UUID_STORAGE_KEY = "geo:guest-uuid";
const ACTIVE_TRACKING_HINT_KEY = "geo:has-active-tracking";
const DEFAULT_REALISTIC_RADIUS = 5000;
const MAX_REALISTIC_RADIUS = 10000;
const NEARBY_DISPLAY_LIMIT = 5;
const SIDEBAR_SPLIT_STORAGE_KEY = "geo:guest-map-split-px";
const SIDEBAR_MIN_PX = 300;
const SIDEBAR_MAX_PX = 560;
const SIDEBAR_DEFAULT_PX = 384;

function readStoredSidebarWidthPx(): number {
    if (typeof window === "undefined") {
        return SIDEBAR_DEFAULT_PX;
    }

    try {
        const raw = window.localStorage.getItem(SIDEBAR_SPLIT_STORAGE_KEY);
        const n = raw ? Number.parseInt(raw, 10) : NaN;
        if (!Number.isFinite(n)) {
            return SIDEBAR_DEFAULT_PX;
        }

        return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, n));
    } catch {
        return SIDEBAR_DEFAULT_PX;
    }
}

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
    const knownRole = normalizeKnownRoleId(session);
    const dashboardRoute = knownRole === 1 ? "/super-admin" : knownRole === 2 ? "/admin" : null;
    const dashboardLabel = knownRole === 1 ? "Quản trị hệ thống" : knownRole === 2 ? "Trung tâm điều phối" : null;
    const isSuperAdmin = knownRole === 1;
    const isHospitalAdmin = knownRole === 2;
    const [mode, setMode] = useState<GuestMode>("browse");
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>(guestStrings.locationStatusUnknown);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [locateContext, setLocateContext] = useState<"sos" | "manual">("manual");

    const [filterType, setFilterType] = useState<FacilityFilterType>("all");
    const [searchText, setSearchText] = useState("");
    const [radius, setRadius] = useState(DEFAULT_REALISTIC_RADIUS);
    const [advancedFacilityOptions, setAdvancedFacilityOptions] = useState(false);
    const [advancedGpsHint, setAdvancedGpsHint] = useState<string | null>(null);

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
    const displayedRoutePath = useTrimmedRoutePath(
        routePath,
        mode === "tracking" || mode === "completed" ? animatedAmbulancePosition : null,
        activeRequestId,
    );

    const lookupPosition = useMemo<[number, number]>(() => currentPosition ?? HCMC_CENTER, [currentPosition]);

    const effectiveRadius = useMemo(
        () => (advancedFacilityOptions ? radius : DEFAULT_REALISTIC_RADIUS),
        [advancedFacilityOptions, radius],
    );

    const spatialFilteredFacilities = useMemo(() => {
        if (!advancedFacilityOptions || !currentPosition) {
            return facilities;
        }
        return facilities.filter((f) => {
            const d =
                typeof f.distanceMeters === "number" && Number.isFinite(f.distanceMeters)
                    ? f.distanceMeters
                    : haversineDistanceMeters(currentPosition, [f.lat, f.lng]);
            return d <= effectiveRadius + 0.5;
        });
    }, [facilities, advancedFacilityOptions, currentPosition, effectiveRadius]);

    const displayedFacilities = useMemo(
        () =>
            advancedFacilityOptions
                ? spatialFilteredFacilities
                : spatialFilteredFacilities.slice(0, NEARBY_DISPLAY_LIMIT),
        [advancedFacilityOptions, spatialFilteredFacilities],
    );

    const mapFacilities = useMemo(() => {
        if (!selectedFacility) {
            return displayedFacilities;
        }

        if (displayedFacilities.some((facility) => facility.id === selectedFacility.id)) {
            return displayedFacilities;
        }

        return [...displayedFacilities, selectedFacility];
    }, [displayedFacilities, selectedFacility]);

    const handleAdvancedFacilityOptionsChange = useCallback(
        (open: boolean) => {
            if (open && !currentPosition) {
                setAdvancedGpsHint(guestStrings.radiusAdvancedNeedsGps);
                window.setTimeout(() => setAdvancedGpsHint(null), 6500);
                return;
            }
            setAdvancedFacilityOptions(open);
            if (!open) {
                setRadius(DEFAULT_REALISTIC_RADIUS);
            }
        },
        [currentPosition],
    );

    useEffect(() => {
        if (advancedFacilityOptions && !currentPosition) {
            setAdvancedFacilityOptions(false);
            setRadius(DEFAULT_REALISTIC_RADIUS);
        }
    }, [currentPosition, advancedFacilityOptions]);

    const location = useLocation();
    const onUserMapHome = location.pathname === "/" || location.pathname === "";

    const dashboardNavActive =
        knownRole === 1
            ? location.pathname.startsWith("/super-admin")
            : knownRole === 2
              ? location.pathname.startsWith("/admin")
              : false;
    const profileNavActive = location.pathname.startsWith("/profile");

    const sidebarQuickNavClass = (isActive: boolean) =>
        `flex-1 inline-flex min-h-8 items-center justify-center rounded-md px-1 py-1 text-center text-[11px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
            isActive
                ? "border-b-[3px] border-violet-700 bg-white/80 text-violet-950 shadow-sm"
                : "border-b-[3px] border-transparent text-slate-600 hover:bg-white/50 hover:text-violet-900"
        }`;

    const [sidebarWidthPx, setSidebarWidthPx] = useState(() => readStoredSidebarWidthPx());
    const sidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

    const onSidebarSplitPointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            sidebarResizeRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: sidebarWidthPx,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [sidebarWidthPx],
    );

    const onSidebarSplitPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const session = sidebarResizeRef.current;
        if (!session || event.pointerId !== session.pointerId) {
            return;
        }

        const delta = event.clientX - session.startX;
        const next = Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, session.startWidth + delta));
        setSidebarWidthPx(next);
    }, []);

    const onSidebarSplitPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const session = sidebarResizeRef.current;
        if (!session || event.pointerId !== session.pointerId) {
            return;
        }

        sidebarResizeRef.current = null;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            /* already released */
        }

        setSidebarWidthPx((width) => {
            try {
                window.localStorage.setItem(SIDEBAR_SPLIT_STORAGE_KEY, String(width));
            } catch {
                /* ignore */
            }

            return width;
        });
    }, []);

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
                        radius: effectiveRadius,
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
                const presentableRows = sortedRows.filter((facility) => isGuestPresentableFacilityName(facility.name));
                setFacilities(presentableRows);
                setSelectedFacility((previous) =>
                    previous ? (presentableRows.find((facility) => facility.id === previous.id) ?? null) : null,
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
    }, [filterType, lookupPosition, effectiveRadius, searchText]);

    const acquireCurrentLocation = useCallback(
        async (purpose: "sos" | "manual" = "manual"): Promise<[number, number] | null> => {
            setLocateContext(purpose);
            setLocationError(null);
            setStatusMessage(purpose === "sos" ? guestStrings.sosAcquiringLocation : guestStrings.locationRequesting);
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
                setLocateContext("manual");
            }
        },
        [],
    );

    const handleSosClick = useCallback(async () => {
        setSosSubmitError(null);
        setPhoneError(null);

        const position = await acquireCurrentLocation("sos");
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

            const directionsUrl = currentPosition
                ? `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`
                : `https://www.google.com/maps/search/?api=1&query=${facility.lat},${facility.lng}`;
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
            ? !advancedFacilityOptions
                ? guestStrings.emptySuggestOpenAdvanced
                : radius < MAX_REALISTIC_RADIUS
                  ? guestStrings.emptySuggestExpandToTenKm
                  : guestStrings.emptySuggestExpandBeyondTenKm
            : undefined;

    // FacilityList handles the common empty-state styling internally.
    const listFeedbackMessage = facilityError;

    const mapLayoutSignature = `${mode}-${selectedFacility ? "detail" : "list"}-sw${sidebarWidthPx}`;

    return (
        <main className="relative flex h-dvh w-screen items-stretch overflow-hidden bg-violet-950 lg:gap-0">
            <aside
                className="relative z-[1010] hidden min-h-0 shrink-0 flex-col overflow-hidden border border-violet-200/90 bg-white/95 shadow-xl backdrop-blur lg:my-4 lg:ml-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)] lg:rounded-2xl"
                style={{ width: sidebarWidthPx }}
            >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                        <div className="mb-2 shrink-0 rounded-xl border border-violet-100 bg-white px-3 py-2 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
                                Trung tâm hỗ trợ khẩn cấp
                            </p>
                            <h1 className="mt-0.5 truncate text-sm font-bold leading-tight text-violet-950">
                                Bản đồ hỗ trợ khẩn cấp
                            </h1>

                            {isHospitalAdmin ? (
                                <Link
                                    to="/admin"
                                    className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg bg-violet-800 px-3 py-2 text-center text-[12px] font-bold leading-tight text-white shadow hover:bg-violet-700"
                                >
                                    Trung tâm điều phối — Dashboard BV
                                </Link>
                            ) : null}

                            <nav
                                className="mt-2 flex gap-0.5 rounded-lg border border-slate-200 bg-slate-100/70 p-0.5"
                                aria-label="Điều hướng nhanh"
                            >
                                <button
                                    className={sidebarQuickNavClass(onUserMapHome && mode === "browse")}
                                    type="button"
                                    onClick={() => {
                                        void acquireCurrentLocation();
                                    }}
                                    disabled={isLocating}
                                    title={guestStrings.locateButton}
                                >
                                    {guestStrings.locateButton}
                                </button>
                                {!isHospitalAdmin && dashboardRoute ? (
                                    <Link
                                        to={dashboardRoute}
                                        className={sidebarQuickNavClass(dashboardNavActive)}
                                    >
                                        {dashboardLabel}
                                    </Link>
                                ) : null}
                                <Link to="/profile" className={sidebarQuickNavClass(profileNavActive)}>
                                    Hồ sơ y tế
                                </Link>
                            </nav>

                            <div
                                className={`mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${
                                    statusMessage === guestStrings.locationDenied ||
                                    statusMessage === guestStrings.locationFailed
                                        ? "border-amber-200 bg-amber-50 text-amber-900"
                                        : currentPosition
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                          : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                                title={statusMessage}
                            >
                                <span aria-hidden="true">📍</span>
                                <span className="truncate">
                                    {statusMessage === guestStrings.locationReady || Boolean(currentPosition)
                                        ? guestStrings.locationStatusCompactReady
                                        : statusMessage === guestStrings.locationStatusUnknown
                                          ? guestStrings.locationStatusCompactUnknown
                                          : statusMessage}
                                </span>
                            </div>

                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/90 px-2 py-1.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 items-start gap-1.5">
                                        <span className="shrink-0 text-sm leading-none" aria-hidden="true">
                                            👤
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold leading-tight text-slate-800">
                                                {isLoggedIn ? displayName : guestStrings.guestAnonymousBadge}
                                            </p>
                                            <p className="mt-0.5 text-[9px] leading-snug text-slate-600">
                                                {isLoggedIn
                                                    ? guestStrings.guestMedicalProfileHint
                                                    : guestStrings.guestAnonymousHint}
                                            </p>
                                        </div>
                                    </div>
                                    {!isLoggedIn ? (
                                        <Link
                                            to="/login"
                                            className="shrink-0 pt-0.5 text-[10px] font-semibold text-violet-700 hover:underline"
                                        >
                                            Đăng nhập
                                        </Link>
                                    ) : (
                                        <button
                                            className="shrink-0 pt-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-800"
                                            type="button"
                                            onClick={() => {
                                                clearSession();
                                                window.location.reload();
                                            }}
                                        >
                                            Đăng xuất
                                        </button>
                                    )}
                                </div>
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
                                        resultCount={displayedFacilities.length}
                                        totalMatchCount={spatialFilteredFacilities.length}
                                        advancedOptionsOpen={advancedFacilityOptions}
                                        onAdvancedOptionsOpenChange={handleAdvancedFacilityOptionsChange}
                                        errorMessage={null}
                                        variant="panel"
                                        onFilterTypeChange={setFilterType}
                                        onSearchTextChange={setSearchText}
                                        onRadiusChange={setRadius}
                                        hasUserGps={Boolean(currentPosition)}
                                    />
                                </div>

                                <div className="subtle-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 pb-[max(1.5rem,calc(5rem+env(safe-area-inset-bottom)))]">
                                    {selectedFacility ? (
                                        <FacilityDetailSheet
                                            facility={selectedFacility}
                                            hasUserLocation={Boolean(currentPosition)}
                                            variant="panel"
                                            onClose={() => setSelectedFacility(null)}
                                        />
                                    ) : (
                                        <FacilityList
                                            facilities={displayedFacilities}
                                            isLoading={isFacilityLoading}
                                            errorMessage={listFeedbackMessage}
                                            emptyMessage={emptyFacilityMessage}
                                            onSelectFacility={setSelectedFacility}
                                            onOpenDirections={handleOpenDirectionsForFacility}
                                        />
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="subtle-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-1 pb-5">
                                <div className="shrink-0 rounded-2xl border border-red-100 bg-red-50/50 p-4 shadow-sm">
                                <h2 className="text-xs font-extrabold uppercase tracking-wider text-red-900">
                                    {guestStrings.trackingModeBadge}
                                </h2>
                                <p className="mt-2 text-lg font-bold leading-snug text-slate-900">
                                    {mode === "tracking" ? trackingStatusMessage : guestStrings.rescueCompleted}
                                </p>
                                {mode === "tracking" && etaMinutes !== null ? (
                                    <p className="mt-2 text-base font-semibold text-violet-950">
                                        {guestStrings.trackingEtaPrefix} ~{etaMinutes} {guestStrings.trackingEtaSuffix}
                                    </p>
                                ) : null}
                                {mode === "tracking" && assignedHospital ? (
                                    <div className="mt-3 rounded-xl border border-white bg-white p-3 shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            {guestStrings.assignedHospitalLabel}
                                        </p>
                                        <p className="mt-1 text-base font-bold text-slate-900">{assignedHospital.name}</p>
                                        {(() => {
                                            const hospitalTel = telHrefFromDisplay(assignedHospital.hotline);
                                            const hospitalPhoneLabel =
                                                assignedHospital.hotline || guestStrings.detailPhoneFallback;
                                            return hospitalTel ? (
                                                <>
                                                    <a
                                                        className="mt-2 block break-all text-2xl font-extrabold tracking-tight text-slate-900 underline decoration-emerald-300 decoration-2 underline-offset-2"
                                                        href={hospitalTel}
                                                    >
                                                        {hospitalPhoneLabel}
                                                    </a>
                                                    <a
                                                        className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 text-base font-extrabold text-white shadow hover:bg-emerald-500"
                                                        href={hospitalTel}
                                                    >
                                                        {guestStrings.callNowButton}
                                                    </a>
                                                </>
                                            ) : (
                                                <p className="mt-2 text-xl font-bold text-slate-800">{hospitalPhoneLabel}</p>
                                            );
                                        })()}
                                    </div>
                                ) : null}
                            </div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <div
                className="relative z-[1011] hidden w-2.5 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center border-l border-violet-200/40 bg-violet-950/20 hover:bg-violet-400/25 active:bg-violet-400/40 lg:flex lg:flex-col"
                role="slider"
                aria-orientation="vertical"
                aria-label="Kéo để thay đổi độ rộng danh sách và bản đồ"
                aria-valuemin={SIDEBAR_MIN_PX}
                aria-valuemax={SIDEBAR_MAX_PX}
                aria-valuenow={sidebarWidthPx}
                tabIndex={0}
                onPointerDown={onSidebarSplitPointerDown}
                onPointerMove={onSidebarSplitPointerMove}
                onPointerUp={onSidebarSplitPointerUp}
                onPointerCancel={onSidebarSplitPointerUp}
                onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                        return;
                    }

                    event.preventDefault();
                    const delta = event.key === "ArrowLeft" ? -12 : 12;
                    setSidebarWidthPx((width) => {
                        const next = Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, width + delta));
                        try {
                            window.localStorage.setItem(SIDEBAR_SPLIT_STORAGE_KEY, String(next));
                        } catch {
                            /* ignore */
                        }

                        return next;
                    });
                }}
            >
                <span className="pointer-events-none h-12 w-px rounded-full bg-violet-400/80" aria-hidden="true" />
            </div>

            <section className="relative z-0 h-full min-w-0 flex-1 lg:my-4 lg:mr-4 lg:rounded-2xl lg:border lg:border-violet-900/25 lg:shadow-lg">
                <div className="absolute inset-0 z-0 overflow-hidden lg:rounded-2xl">
                    <VietnamMap
                        defaultCenter={HCMC_CENTER}
                        mode={mode}
                        currentPosition={currentPosition}
                        facilities={mapFacilities}
                        selectedFacilityId={selectedFacility?.id ?? null}
                        onFacilitySelect={setSelectedFacility}
                        onOpenDirectionsForFacility={handleOpenDirectionsForFacility}
                        onSosHereForFacility={handleSosHereForFacility}
                        sosPosition={sosPosition}
                        assignedHospital={assignedHospital}
                        ambulancePosition={animatedAmbulancePosition}
                        routePath={displayedRoutePath}
                        layoutSignature={mapLayoutSignature}
                    />
                </div>

                {isHospitalAdmin ? (
                    <div className="pointer-events-none absolute right-3 top-3 z-[1002] pt-[max(0rem,env(safe-area-inset-top))]">
                        <Link
                            className="pointer-events-auto inline-flex min-h-11 items-center rounded-xl bg-violet-800/90 px-4 text-sm font-semibold text-white shadow backdrop-blur transition hover:bg-violet-700"
                            to="/admin"
                        >
                            Trung tâm điều phối
                        </Link>
                    </div>
                ) : null}

                {isSuperAdmin ? (
                    <div className="pointer-events-none absolute right-3 top-3 z-[1002] pt-[max(0rem,env(safe-area-inset-top))]">
                        <Link
                            className="pointer-events-auto inline-flex min-h-11 items-center rounded-xl bg-violet-800/90 px-4 text-sm font-semibold text-white shadow backdrop-blur transition hover:bg-violet-700"
                            to="/super-admin"
                        >
                            Quản trị hệ thống
                        </Link>
                    </div>
                ) : null}

                <header className="pointer-events-none absolute left-0 right-0 top-0 z-[690] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
                    <div className="pointer-events-auto mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 md:ml-[336px] md:mr-3 md:max-w-none">
                        {dashboardRoute ? (
                            <Link
                                className="inline-flex min-h-12 items-center rounded-xl bg-violet-800/85 px-4 text-sm font-semibold text-white shadow backdrop-blur hover:bg-violet-700"
                                to={dashboardRoute}
                            >
                                {dashboardLabel}
                            </Link>
                        ) : (
                            <span className="min-w-[1px]" aria-hidden="true" />
                        )}
                        <button
                            className="min-h-12 rounded-xl bg-white/95 px-4 text-sm font-semibold text-violet-900 shadow hover:bg-white"
                            type="button"
                            onClick={() => {
                                void acquireCurrentLocation();
                            }}
                            disabled={isLocating}
                        >
                            {guestStrings.locateButton}
                        </button>
                    </div>

                    <div
                        className={`pointer-events-auto mx-auto mt-2 flex w-full max-w-[430px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur md:ml-[336px] md:mr-3 md:w-fit md:max-w-[420px] ${
                            statusMessage === guestStrings.locationDenied || statusMessage === guestStrings.locationFailed
                                ? "border-amber-300/80 bg-amber-50/95 text-amber-900"
                                : currentPosition
                                  ? "border-emerald-300/80 bg-emerald-50/95 text-emerald-900"
                                  : "border-white/40 bg-slate-900/70 text-violet-50"
                        }`}
                        title={statusMessage}
                    >
                        <span aria-hidden="true">📍</span>
                        <span className="truncate">
                            {statusMessage === guestStrings.locationReady || Boolean(currentPosition)
                                ? guestStrings.locationStatusCompactReady
                                : statusMessage === guestStrings.locationStatusUnknown
                                  ? guestStrings.locationStatusCompactUnknown
                                  : statusMessage}
                        </span>
                    </div>
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
                        resultCount={displayedFacilities.length}
                        totalMatchCount={spatialFilteredFacilities.length}
                        advancedOptionsOpen={advancedFacilityOptions}
                        onAdvancedOptionsOpenChange={handleAdvancedFacilityOptionsChange}
                        errorMessage={null}
                        onFilterTypeChange={setFilterType}
                        onSearchTextChange={setSearchText}
                        onRadiusChange={setRadius}
                        hasUserGps={Boolean(currentPosition)}
                    >
                        <FacilityList
                            facilities={displayedFacilities}
                            isLoading={isFacilityLoading}
                            errorMessage={listFeedbackMessage}
                            emptyMessage={emptyFacilityMessage}
                            onSelectFacility={setSelectedFacility}
                            onOpenDirections={handleOpenDirectionsForFacility}
                        />
                    </FacilityFilterPanel>
                ) : null}

                {mode === "browse" && Boolean(selectedFacility) ? (
                    <FacilityDetailSheet
                        facility={selectedFacility}
                        hasUserLocation={Boolean(currentPosition)}
                        onClose={() => setSelectedFacility(null)}
                    />
                ) : null}

                {locationError ? (
                    <div className="pointer-events-auto absolute left-1/2 top-[max(5.75rem,calc(env(safe-area-inset-top)+5rem))] z-[710] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50/95 p-3 text-sm shadow-lg md:left-[336px] md:w-[min(430px,calc(100%-21rem))] md:max-w-none md:translate-x-0 lg:left-4 lg:top-[5.5rem] lg:w-[min(430px,calc(100%-2rem))]">
                        <p className="font-semibold text-red-700">{locationError}</p>
                        <button
                            className="mt-2 min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
                            type="button"
                            onClick={() => {
                                void acquireCurrentLocation();
                            }}
                        >
                            {guestStrings.retry}
                        </button>
                    </div>
                ) : null}

                {advancedGpsHint ? (
                    <div className="pointer-events-auto absolute left-1/2 top-[max(5.75rem,calc(env(safe-area-inset-top)+5rem))] z-[710] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-violet-200 bg-violet-50/95 p-3 text-sm shadow-lg md:left-[336px] md:w-[min(430px,calc(100%-21rem))] md:max-w-none md:translate-x-0 lg:left-4 lg:top-[5.5rem] lg:w-[min(430px,calc(100%-2rem))]">
                        <p className="font-semibold text-violet-900">{advancedGpsHint}</p>
                    </div>
                ) : null}

                {sessionRestoreMessage ? (
                    <div className="pointer-events-auto absolute left-1/2 top-[max(5.75rem,calc(env(safe-area-inset-top)+5rem))] z-[710] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-sm shadow-lg md:left-[336px] md:w-[min(430px,calc(100%-21rem))] md:max-w-none md:translate-x-0 lg:left-4 lg:top-[5.5rem] lg:w-[min(430px,calc(100%-2rem))]">
                        <p className="font-semibold text-amber-700">{sessionRestoreMessage}</p>
                    </div>
                ) : null}
            </section>

            {mode === "browse" ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex justify-center px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1">
                    <div className="pointer-events-auto w-full max-w-[min(90vw,22rem)] sm:max-w-[min(85vw,24rem)]">
                        <SosButton
                            variant="dock"
                            onClick={handleSosClick}
                            disabled={isLocating || isSendingSos}
                        />
                    </div>
                </div>
            ) : null}

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
                <div className="pointer-events-none absolute inset-0 z-[1050] grid place-items-center bg-slate-900/20">
                    <div className="max-w-[min(420px,calc(100%-2rem))] rounded-2xl bg-white/95 px-5 py-4 text-center text-sm font-semibold text-slate-700 shadow-xl">
                        <p>
                            {locateContext === "sos"
                                ? guestStrings.sosAcquiringLocation
                                : guestStrings.locationRequesting}
                        </p>
                        {locateContext === "sos" ? (
                            <p className="mt-2 text-xs font-medium text-slate-500">{guestStrings.sosAcquiringLocationSub}</p>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {showSosSuccess ? (
                <div className="pointer-events-none absolute inset-0 z-[1060] grid place-items-center bg-slate-900/35 p-4">
                    <article className="pointer-events-auto w-full max-w-[430px] rounded-3xl bg-white p-5 text-center shadow-2xl">
                        <h2 className="text-xl font-bold text-emerald-700">{guestStrings.sosSuccessTitle}</h2>
                        <p className="mt-2 text-sm text-slate-700">{guestStrings.sosSuccessBody}</p>
                        {assignedHospital ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {guestStrings.assignedHospitalLabel}
                                </p>
                                <p className="mt-1 text-base font-bold text-slate-900">{assignedHospital.name}</p>
                                {(() => {
                                    const successTel = telHrefFromDisplay(assignedHospital.hotline);
                                    const successLabel =
                                        assignedHospital.hotline || guestStrings.detailPhoneFallback;
                                    return successTel ? (
                                        <>
                                            <a
                                                className="mt-2 block break-all text-2xl font-extrabold text-slate-900"
                                                href={successTel}
                                            >
                                                {successLabel}
                                            </a>
                                            <a
                                                className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 text-base font-extrabold text-white shadow hover:bg-emerald-500"
                                                href={successTel}
                                            >
                                                {guestStrings.callNowButton}
                                            </a>
                                        </>
                                    ) : (
                                        <p className="mt-2 text-lg font-bold text-slate-800">{successLabel}</p>
                                    );
                                })()}
                            </div>
                        ) : null}
                    </article>
                </div>
            ) : null}

            {mode === "completed" ? (
                <div className="absolute inset-0 z-[1060] grid place-items-center bg-slate-900/55 p-4">
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
