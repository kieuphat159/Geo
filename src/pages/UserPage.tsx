import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import FacilityDetailSheet from "../components/FacilityDetailSheet";
import FacilityFilterPanel from "../components/FacilityFilterPanel";
import FacilityList from "../components/FacilityList";
import SosButton from "../components/SosButton";
import SosConfirmationModal from "../components/SosConfirmationModal";
import TrackingStatusBar from "../components/TrackingStatusBar";
import UserSosBanners from "../components/UserSosBanners";
import VietnamMap from "../components/VietnamMap";
import { guestStrings } from "../constants/guestStrings";
import MapOverlayToast from "../components/MapOverlayToast";
import { mapOverlayToastTopPrimaryClass, mapOverlayToastTopSecondaryClass } from "../constants/mapOverlayToast";
import { useSosReconcile } from "../context/SosReconcileContext";
import { useAnimatedPosition } from "../hooks/useAnimatedPosition";
import { useAnonymousSosLinkBanner } from "../hooks/useAnonymousSosLinkBanner";
import { useTrackingSocket } from "../hooks/useTrackingSocket";
import { saveAnonymousSosSession } from "../services/anonymousSosSession";
import { getStoredSession, logout, normalizeKnownRoleId } from "../services/auth";
import {
    fetchFacilities,
    getActiveEmergencySos,
    resolveAssignedHospitalFromSos,
    sendEmergencySos,
} from "../services/guestApi";
import type {
    AssignedHospital,
    Facility,
    FacilityFilterType,
    GeoJsonLineString,
    SosResponse,
    TrackingSocketEvent,
} from "../types/guest";
import { haversineDistanceMeters } from "../utils/distance";
import { isGuestPresentableFacilityName } from "../utils/facilityDisplay";
import { telHrefFromDisplay } from "../utils/phone";
import { useTrimmedRoutePath } from "../utils/routePath";
import {
    isGeolocationDeniedError,
    queryGeolocationPermissionState,
    startGpsPositionRequest,
    watchGeolocationPermission,
} from "../utils/geolocationPermission";
import { isInSupportedArea } from "../utils/supportedArea";

const HCMC_CENTER: [number, number] = [10.7769, 106.7009];
const SOS_SUCCESS_OVERLAY_MS = 1800;
const GUEST_UUID_STORAGE_KEY = "geo:guest-uuid";
const ACTIVE_TRACKING_HINT_KEY = "geo:has-active-tracking";
const ACTIVE_TRACKING_SNAPSHOT_KEY = "geo:active-tracking-snapshot";
const DEFAULT_REALISTIC_RADIUS = 5000;
const MAX_REALISTIC_RADIUS = 10000;
const NEARBY_DISPLAY_LIMIT = 5;
const SIDEBAR_SPLIT_STORAGE_KEY = "geo:guest-map-split-px";
const SIDEBAR_MIN_PX = 300;
const SIDEBAR_MAX_PX = 560;
const SIDEBAR_DEFAULT_PX = 400;

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

type GuestMode = "browse" | "awaiting_dispatch" | "tracking" | "completed";

function guestModeFromEmergencyStatus(status?: string): GuestMode {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "pending";
    if (normalized === "completed" || normalized === "cancelled") {
        return "completed";
    }
    if (normalized === "assigned" || normalized === "in_progress") {
        return "tracking";
    }
    return "awaiting_dispatch";
}

function awaitingDispatchMessage(hospital: AssignedHospital | null | undefined): string {
    if (hospital?.name) {
        return `${hospital.name} ${guestStrings.awaitingDispatchSuffix}`;
    }
    return guestStrings.awaitingDispatchFallback;
}
type ActiveTrackingSnapshot = {
    response: SosResponse;
    victimPosition: [number, number];
    savedAt: number;
};

function normalizePhoneInput(value: string): string {
    return value.replace(/[^\d]/g, "");
}

function normalizeVi(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
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
        return guestStrings.trackingAssigned;
    }

    return guestStrings.trackingFallback;
}

function readActiveTrackingSnapshot(): ActiveTrackingSnapshot | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = localStorage.getItem(ACTIVE_TRACKING_SNAPSHOT_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as ActiveTrackingSnapshot;
        if (!parsed || !parsed.response || !Array.isArray(parsed.victimPosition) || parsed.victimPosition.length < 2) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function clearLocalTrackingArtifacts() {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.removeItem(ACTIVE_TRACKING_HINT_KEY);
    localStorage.removeItem(ACTIVE_TRACKING_SNAPSHOT_KEY);
}

export default function UserPage() {
    const session = getStoredSession();
    const isLoggedIn = Boolean(session?.token);
    const displayName = session?.user?.email ?? "bạn";
    const knownRole = normalizeKnownRoleId(session);
    const dashboardRoute = knownRole === 1 ? "/super-admin" : knownRole === 2 ? "/admin" : null;
    const dashboardLabel = knownRole === 1 ? "Quản trị hệ thống" : knownRole === 2 ? "Trung tâm điều phối" : null;
    const isNormalUserRole = knownRole === 3;
    const { openReconcilePrompt } = useSosReconcile();
    const linkBanner = useAnonymousSosLinkBanner(isLoggedIn && isNormalUserRole);
    const [mode, setMode] = useState<GuestMode>("browse");
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>(guestStrings.locationStatusUnknown);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [locationPermissionHint, setLocationPermissionHint] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [locateContext, setLocateContext] = useState<"sos" | "manual">("manual");
    const [outsideAreaBlocked, setOutsideAreaBlocked] = useState(false);

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
    const [trackingFocusNonce, setTrackingFocusNonce] = useState(0);
    const [sosPosition, setSosPosition] = useState<[number, number] | null>(null);
    const [assignedHospital, setAssignedHospital] = useState<AssignedHospital | null>(null);
    const [routePath, setRoutePath] = useState<[number, number][]>([]);
    const [ambulanceTargetPosition, setAmbulanceTargetPosition] = useState<[number, number] | null>(null);
    const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
    const [trackingStatusMessage, setTrackingStatusMessage] = useState<string>(guestStrings.trackingFallback);
    const [trackingToken, setTrackingToken] = useState<string | null>(null);
    const [sessionRestoreMessage, setSessionRestoreMessage] = useState<string | null>(null);
    const [trackingDetailHighlighted, setTrackingDetailHighlighted] = useState(false);
    const restoreProbeRef = useRef<{ key: string; at: number } | null>(null);
    const trackingDetailHighlightTimerRef = useRef<number | null>(null);
    const desktopTrackingDetailRef = useRef<HTMLDivElement | null>(null);
    const mobileTrackingDetailRef = useRef<HTMLDivElement | null>(null);

    const animatedAmbulancePosition = useAnimatedPosition(ambulanceTargetPosition, 800);
    const displayedRoutePath = useTrimmedRoutePath(
        routePath,
        mode === "tracking" || mode === "completed" ? animatedAmbulancePosition : null,
        activeRequestId,
    );
    const mapRoutePath = mode === "tracking" || mode === "completed" ? displayedRoutePath : [];

    const lookupPosition = useMemo<[number, number]>(() => currentPosition ?? HCMC_CENTER, [currentPosition]);

    const effectiveRadius = useMemo(
        () => (advancedFacilityOptions ? radius : DEFAULT_REALISTIC_RADIUS),
        [advancedFacilityOptions, radius],
    );

    const facilityFetchRadius = useMemo(() => {
        if (searchText.trim()) {
            return Math.max(effectiveRadius, 80_000);
        }
        return effectiveRadius;
    }, [effectiveRadius, searchText]);

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

    const displayedFacilities = useMemo(() => {
        const hasSearch = searchText.trim().length > 0;
        if (hasSearch || advancedFacilityOptions) {
            return spatialFilteredFacilities;
        }
        return spatialFilteredFacilities.slice(0, NEARBY_DISPLAY_LIMIT);
    }, [advancedFacilityOptions, spatialFilteredFacilities, searchText]);

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
                if (isInSupportedArea(parsed.latitude, parsed.longitude)) {
                    setCurrentPosition([parsed.latitude, parsed.longitude]);
                    setStatusMessage(guestStrings.locationReady);
                } else {
                    localStorage.removeItem("guest:last-location");
                    setOutsideAreaBlocked(true);
                    setLocationError(guestStrings.locationOutsideSupportedArea);
                    setStatusMessage(guestStrings.locationOutsideSupportedArea);
                }
            }
        } catch {
            localStorage.removeItem("guest:last-location");
        }
    }, []);

    useEffect(() => {
        if (!currentPosition) {
            return;
        }

        if (!isInSupportedArea(currentPosition[0], currentPosition[1])) {
            localStorage.removeItem("guest:last-location");
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
                        radius: facilityFetchRadius,
                        lat: lookupPosition[0],
                        lng: lookupPosition[1],
                    },
                    controller.signal,
                );

                if (!isMounted) {
                    return;
                }

                const filteredByType = filterType === "all" ? rows : rows.filter((facility) => facility.type === filterType);
                const searchQuery = normalizeVi(searchText.trim());
                const filteredRows = !searchQuery
                    ? filteredByType
                    : filteredByType.filter((facility) => {
                          const searchable = normalizeVi(`${facility.name} ${facility.address ?? ""}`);
                          return searchable.includes(searchQuery);
                      });
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
    }, [filterType, lookupPosition, facilityFetchRadius, searchText]);

    const acquireCurrentLocation = useCallback(
        async (
            purpose: "sos" | "manual" = "manual",
            prestartedRequest?: Promise<[number, number]>,
        ): Promise<[number, number] | null> => {
            const positionPromise = prestartedRequest ?? startGpsPositionRequest();

            setLocateContext(purpose);
            setLocationError(null);
            setLocationPermissionHint(null);
            setOutsideAreaBlocked(false);
            setStatusMessage(purpose === "sos" ? guestStrings.sosAcquiringLocation : guestStrings.locationRequesting);
            setIsLocating(true);

            try {
                const position = await positionPromise;
                const [lat, lng] = position;

                if (!isInSupportedArea(lat, lng)) {
                    setCurrentPosition(null);
                    setOutsideAreaBlocked(true);
                    setLocationError(guestStrings.locationOutsideSupportedArea);
                    setStatusMessage(guestStrings.locationOutsideSupportedArea);
                    return null;
                }

                setOutsideAreaBlocked(false);
                setCurrentPosition(position);
                setStatusMessage(guestStrings.locationReady);
                return position;
            } catch (error) {
                if (isGeolocationDeniedError(error)) {
                    setLocationError(guestStrings.locationDenied);
                    setStatusMessage(guestStrings.locationDenied);
                    const permission = await queryGeolocationPermissionState();
                    setLocationPermissionHint(
                        permission === "denied"
                            ? guestStrings.locationDeniedSettingsHint
                            : guestStrings.locationDeniedPromptHint,
                    );
                } else {
                    setLocationError(guestStrings.locationFailed);
                    setStatusMessage(guestStrings.locationFailed);
                    setLocationPermissionHint(null);
                }

                return null;
            } finally {
                setIsLocating(false);
                setLocateContext("manual");
            }
        },
        [],
    );

    const handleRetryLocationPermission = useCallback(() => {
        void acquireCurrentLocation();
    }, [acquireCurrentLocation]);

    useEffect(() => {
        if (locationError !== guestStrings.locationDenied) {
            return;
        }

        return watchGeolocationPermission((state) => {
            if (state === "granted") {
                void acquireCurrentLocation();
            }
        });
    }, [locationError, acquireCurrentLocation]);

    const handleSosClick = useCallback(async () => {
        const positionPromise = startGpsPositionRequest();
        setSosSubmitError(null);
        setPhoneError(null);

        const position = await acquireCurrentLocation("sos", positionPromise);
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

            if (!isInSupportedArea(facility.lat, facility.lng)) {
                setOutsideAreaBlocked(true);
                setLocationError(guestStrings.locationOutsideSupportedArea);
                setStatusMessage(guestStrings.locationOutsideSupportedArea);
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

        const resolvedHospital = resolveAssignedHospitalFromSos(response, victimPosition);
        setAssignedHospital(resolvedHospital);

        const parsedRoute = toRouteLatLng(response.route_path);
        const nextMode = guestModeFromEmergencyStatus(response.status);

        if (nextMode === "tracking" || nextMode === "completed") {
            setRoutePath(parsedRoute.length >= 3 ? parsedRoute : []);
        } else {
            setRoutePath([]);
        }

        if (nextMode === "tracking") {
            if (resolvedHospital) {
                setAmbulanceTargetPosition([resolvedHospital.lat, resolvedHospital.lng]);
            } else if (response.ambulance_position) {
                setAmbulanceTargetPosition([response.ambulance_position.lat, response.ambulance_position.lng]);
            } else {
                setAmbulanceTargetPosition(null);
            }

            if (typeof response.eta_minutes === "number" && Number.isFinite(response.eta_minutes)) {
                setEtaMinutes(Math.max(1, Math.round(response.eta_minutes)));
            } else {
                setEtaMinutes(null);
            }

            setTrackingStatusMessage(
                response.status === "assigned" || response.status === "in_progress"
                    ? guestStrings.trackingAssigned
                    : guestStrings.trackingFallback,
            );
        } else if (nextMode === "awaiting_dispatch") {
            setAmbulanceTargetPosition(null);
            setEtaMinutes(null);
            setTrackingStatusMessage(awaitingDispatchMessage(resolvedHospital ?? undefined));
        } else {
            setAmbulanceTargetPosition(null);
            setEtaMinutes(null);
            setTrackingStatusMessage(guestStrings.rescueCompleted);
        }

        setMode(nextMode);
        setTrackingFocusNonce((value) => value + 1);
        setShowSosSuccess(true);
        localStorage.setItem(ACTIVE_TRACKING_HINT_KEY, "1");
        localStorage.setItem(
            ACTIVE_TRACKING_SNAPSHOT_KEY,
            JSON.stringify({
                response,
                victimPosition,
                savedAt: Date.now(),
            } satisfies ActiveTrackingSnapshot),
        );

        if (response.session_token) {
            saveAnonymousSosSession(response.session_token, response.request_id);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        async function restoreActiveSession() {
            if (mode !== "browse") {
                return;
            }

            // Prevent SOS state from leaking into admin/super-admin sessions.
            if (knownRole === 1 || knownRole === 2) {
                clearLocalTrackingArtifacts();
                setActiveRequestId(null);
                setTrackingToken(null);
                setAssignedHospital(null);
                setRoutePath([]);
                setSosPosition(null);
                setAmbulanceTargetPosition(null);
                setEtaMinutes(null);
                setTrackingStatusMessage(guestStrings.trackingFallback);
                return;
            }

            const hasAuthSession = Boolean(session?.token);
            const guestId = typeof window !== "undefined" ? localStorage.getItem(GUEST_UUID_STORAGE_KEY) : null;
            const hasTrackingHint =
                typeof window !== "undefined" && localStorage.getItem(ACTIVE_TRACKING_HINT_KEY) === "1";
            const restoreKey = `${session?.token ?? "guest"}:${guestId ?? "no-guest"}:${hasTrackingHint ? "hint" : "no-hint"}`;
            const now = Date.now();
            const recentProbe = restoreProbeRef.current;
            if (recentProbe && recentProbe.key === restoreKey && now - recentProbe.at < 15000) {
                return;
            }
            restoreProbeRef.current = { key: restoreKey, at: now };
            if (!hasAuthSession && !guestId) {
                if (isMounted && hasTrackingHint) {
                    setSessionRestoreMessage(guestStrings.sessionNotFound);
                }
                return;
            }

            const snapshot = hasTrackingHint ? readActiveTrackingSnapshot() : null;
            let restoredFromSnapshot = false;
            if (snapshot && isMounted) {
                applySosSuccess(snapshot.response, snapshot.victimPosition);
                if (
                    snapshot.response.ambulance_position &&
                    guestModeFromEmergencyStatus(snapshot.response.status) === "tracking"
                ) {
                    setAmbulanceTargetPosition([
                        snapshot.response.ambulance_position.lat,
                        snapshot.response.ambulance_position.lng,
                    ]);
                }
                setSessionRestoreMessage(null);
                restoredFromSnapshot = true;
            }

            const canRestoreFromBackend = !hasAuthSession || isNormalUserRole;
            if (!canRestoreFromBackend) {
                return;
            }

            const activeSession = await getActiveEmergencySos(controller.signal);
            if (!isMounted) {
                return;
            }

            if (!activeSession) {
                if (isMounted && hasTrackingHint && !restoredFromSnapshot) {
                    setSessionRestoreMessage(guestStrings.sessionNotFound);
                }
                return;
            }

            const fallbackPosition = currentPosition ?? HCMC_CENTER;
            const victimPosition: [number, number] = activeSession.patient_position
                ? [activeSession.patient_position.lat, activeSession.patient_position.lng]
                : fallbackPosition;

            applySosSuccess(activeSession, victimPosition);
            if (
                activeSession.ambulance_position &&
                guestModeFromEmergencyStatus(activeSession.status) === "tracking"
            ) {
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
    }, [applySosSuccess, currentPosition, isNormalUserRole, knownRole, mode, session?.token]);

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

    const handleTrackingEvent = useCallback(
        (event: TrackingSocketEvent) => {
            const normalizedStatus = event.status ? event.status.toUpperCase() : "";
            const hasAmbulancePosition = typeof event.lat === "number" && typeof event.lng === "number";
            const hasRoutePayload = Boolean(event.route_path);
            const ambulancePoint: [number, number] | null = hasAmbulancePosition
                ? [Number(event.lat), Number(event.lng)]
                : null;

            if (normalizedStatus === "ON_THE_WAY" || hasAmbulancePosition || hasRoutePayload) {
                setMode((current) => (current === "awaiting_dispatch" ? "tracking" : current));
            }

            if (normalizedStatus === "ASSIGNED") {
                setMode((current) => (current === "awaiting_dispatch" ? "tracking" : current));
                setTrackingStatusMessage(guestStrings.trackingAssigned);
                if (assignedHospital) {
                    setAmbulanceTargetPosition([assignedHospital.lat, assignedHospital.lng]);
                }
                if (typeof event.eta_minutes === "number" && Number.isFinite(event.eta_minutes)) {
                    setEtaMinutes(Math.max(1, Math.round(event.eta_minutes)));
                }
                if (event.route_path) {
                    const parsedRoute = toRouteLatLng(event.route_path);
                    if (parsedRoute.length >= 3) {
                        setRoutePath(parsedRoute);
                    }
                }
                return;
            }

            if (ambulancePoint) {
                setAmbulanceTargetPosition(ambulancePoint);
            }

            if (event.route_path) {
                const parsedRoute = toRouteLatLng(event.route_path);
                if (parsedRoute.length >= 3) {
                    setRoutePath(parsedRoute);
                }
            }

            if (typeof event.eta_minutes === "number" && Number.isFinite(event.eta_minutes)) {
                setEtaMinutes(Math.max(1, Math.round(event.eta_minutes)));
            }

            if (normalizedStatus === "COMPLETED") {
                setMode("completed");
                setTrackingStatusMessage(guestStrings.rescueCompleted);
                setShowSosSuccess(false);
                return;
            }

            setTrackingStatusMessage(trackingMessageFromStatus(event.status));
        },
        [assignedHospital],
    );

    const { isReconnecting, browserOnline } = useTrackingSocket({
        requestId: activeRequestId,
        trackingToken,
        enabled:
            activeRequestId !== null &&
            (mode === "awaiting_dispatch" || mode === "tracking") &&
            Boolean(trackingToken),
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
        localStorage.removeItem(ACTIVE_TRACKING_SNAPSHOT_KEY);
    };

    const handleStopTrackingShare = () => {
        const confirmed = window.confirm(
            "Dừng hiển thị theo dõi trên thiết bị này? Ca cấp cứu vẫn được xử lý bởi điều phối viên.",
        );
        if (!confirmed) {
            return;
        }
        clearTrackingState();
    };

    const handleViewTrackingDetail = () => {
        setSelectedFacility(null);
        setMode((current) => (current === "awaiting_dispatch" ? "tracking" : current));
        setTrackingFocusNonce((value) => value + 1);
        setTrackingDetailHighlighted(true);

        if (trackingDetailHighlightTimerRef.current !== null) {
            window.clearTimeout(trackingDetailHighlightTimerRef.current);
        }
        trackingDetailHighlightTimerRef.current = window.setTimeout(() => {
            setTrackingDetailHighlighted(false);
            trackingDetailHighlightTimerRef.current = null;
        }, 1600);

        window.requestAnimationFrame(() => {
            const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
            const focusTarget = isMobileViewport
                ? mobileTrackingDetailRef.current ?? desktopTrackingDetailRef.current
                : desktopTrackingDetailRef.current ?? mobileTrackingDetailRef.current;
            focusTarget?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        });
    };

    useEffect(() => {
        return () => {
            if (trackingDetailHighlightTimerRef.current !== null) {
                window.clearTimeout(trackingDetailHighlightTimerRef.current);
            }
        };
    }, []);

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
        <main className="relative flex h-dvh w-screen items-stretch overflow-hidden bg-violet-950 md:gap-0">
            <aside
                className="relative z-[1010] hidden min-h-0 shrink-0 flex-col overflow-hidden border border-violet-200/90 bg-white/95 shadow-xl backdrop-blur md:my-3 md:ml-3 md:flex md:h-[calc(100dvh-1.5rem)] md:max-h-[calc(100dvh-1.5rem)] md:rounded-2xl lg:my-4 lg:ml-4"
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

                            {dashboardRoute && dashboardLabel ? (
                                <Link
                                    to={dashboardRoute}
                                    className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-800 px-3 py-2 text-center text-[13px] font-extrabold leading-tight text-white shadow-md hover:bg-violet-700"
                                >
                                    {dashboardLabel}
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
                                    disabled={isLocating || outsideAreaBlocked}
                                    title={guestStrings.locateButton}
                                >
                                    {guestStrings.locateButton}
                                </button>
                                <Link to="/profile" className={sidebarQuickNavClass(profileNavActive)}>
                                    Hồ sơ y tế
                                </Link>
                            </nav>

                            <div
                                className={`mt-2 flex justify-end gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${
                                    statusMessage === guestStrings.locationDenied ||
                                    statusMessage === guestStrings.locationFailed ||
                                    statusMessage === guestStrings.locationOutsideSupportedArea
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
                                                logout();
                                                window.location.reload();
                                            }}
                                        >
                                            Đăng xuất
                                        </button>
                                    )}
                                </div>
                            </div>

                            <UserSosBanners
                                className="mt-2 shrink-0"
                                linkBanner={linkBanner}
                                showTrackingBanner={mode === "tracking" && activeRequestId !== null}
                                trackingRequestId={activeRequestId}
                                onLinkAnonymousSos={() => {
                                    void openReconcilePrompt();
                                }}
                                onViewTracking={handleViewTrackingDetail}
                                onStopSharing={handleStopTrackingShare}
                            />
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
                                <div
                                    ref={desktopTrackingDetailRef}
                                    className={`shrink-0 rounded-2xl border border-red-100 bg-red-50/50 p-4 shadow-sm transition-all duration-300 ${
                                        trackingDetailHighlighted ? "ring-4 ring-violet-300 ring-offset-2 ring-offset-white" : ""
                                    }`}
                                >
                                    <h2 className="text-xs font-extrabold uppercase tracking-wider text-red-900">
                                        {mode === "awaiting_dispatch"
                                            ? guestStrings.awaitingDispatchBadge
                                            : guestStrings.trackingModeBadge}
                                    </h2>
                                    <p className="mt-2 text-lg font-bold leading-snug text-slate-900">
                                        {mode === "completed" ? guestStrings.rescueCompleted : trackingStatusMessage}
                                    </p>
                                    {mode === "tracking" && etaMinutes !== null ? (
                                        <p className="mt-2 text-base font-semibold text-violet-950">
                                            {guestStrings.trackingEtaPrefix} ~{etaMinutes} {guestStrings.trackingEtaSuffix}
                                        </p>
                                    ) : null}
                                    {(mode === "awaiting_dispatch" || mode === "tracking") && assignedHospital ? (
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
                className="relative z-[1011] hidden w-2.5 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center border-l border-violet-200/40 bg-violet-950/20 hover:bg-violet-400/25 active:bg-violet-400/40 md:flex md:flex-col"
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

            <section className="relative z-0 h-full min-w-0 flex-1 md:my-3 md:mr-3 md:rounded-2xl md:border md:border-violet-900/25 md:shadow-lg lg:my-4 lg:mr-4">
                <div className="absolute inset-0 z-0 overflow-hidden md:rounded-2xl">
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
                        routePath={mapRoutePath}
                        trackingFocusNonce={trackingFocusNonce}
                        layoutSignature={mapLayoutSignature}
                    />
                </div>

                <header className="pointer-events-none absolute left-0 right-0 top-0 z-[690] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
                    <div className="pointer-events-auto mx-auto flex w-full max-w-[min(100%,28rem)] items-center justify-between gap-2 sm:max-w-[32rem]">
                        {!isLoggedIn ? (
                            <Link
                                to="/login"
                                className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white/95 px-3 text-xs font-semibold text-violet-800 shadow hover:bg-white"
                            >
                                Đăng nhập
                            </Link>
                        ) : (
                            <button
                                className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow hover:bg-white"
                                type="button"
                                onClick={() => {
                                    logout();
                                    window.location.reload();
                                }}
                            >
                                Đăng xuất
                            </button>
                        )}
                        <button
                            className="min-h-12 min-w-[7rem] rounded-xl bg-white/95 px-4 text-sm font-semibold text-violet-900 shadow hover:bg-white"
                            type="button"
                            onClick={() => {
                                void acquireCurrentLocation();
                            }}
                            disabled={isLocating || outsideAreaBlocked}
                        >
                            {guestStrings.locateButton}
                        </button>
                        {isLoggedIn ? (
                            <Link
                                to="/profile"
                                className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white/95 px-3 text-xs font-semibold text-violet-800 shadow hover:bg-white"
                            >
                                Hồ sơ
                            </Link>
                        ) : (
                            <span className="min-w-[1px]" aria-hidden="true" />
                        )}
                    </div>

                    <div
                        className={`pointer-events-auto mx-auto mt-2 flex w-full max-w-[min(100%,28rem)] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur sm:max-w-[32rem] ${
                            statusMessage === guestStrings.locationDenied ||
                            statusMessage === guestStrings.locationFailed ||
                            statusMessage === guestStrings.locationOutsideSupportedArea
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

                    {isLoggedIn && isNormalUserRole ? (
                        <UserSosBanners
                            className="pointer-events-auto mx-auto mt-2 w-full max-w-[min(100%,28rem)] sm:max-w-[32rem]"
                            linkBanner={linkBanner}
                            showTrackingBanner={mode === "tracking" && activeRequestId !== null}
                            trackingRequestId={activeRequestId}
                            onLinkAnonymousSos={() => {
                                void openReconcilePrompt();
                            }}
                            onViewTracking={handleViewTrackingDetail}
                            onStopSharing={handleStopTrackingShare}
                        />
                    ) : null}
                </header>

                <TrackingStatusBar
                    visible={mode === "tracking" || mode === "awaiting_dispatch"}
                    mode={mode === "tracking" ? "tracking" : "awaiting_dispatch"}
                    assignedHospital={assignedHospital}
                    etaMinutes={mode === "tracking" ? etaMinutes : null}
                    statusMessage={trackingStatusMessage}
                    isReconnecting={isReconnecting}
                    browserOnline={browserOnline}
                />

                {(mode === "awaiting_dispatch" || mode === "tracking") && assignedHospital ? (
                    <div className="pointer-events-none absolute inset-x-3 bottom-[max(5.5rem,calc(5rem+env(safe-area-inset-bottom)))] z-[680] md:hidden">
                        <div
                            ref={mobileTrackingDetailRef}
                            className={`pointer-events-auto rounded-2xl border border-red-100 bg-white/95 p-3 shadow-lg transition-all duration-300 ${
                                trackingDetailHighlighted ? "ring-4 ring-violet-300 ring-offset-2 ring-offset-white" : ""
                            }`}
                        >
                            <p className="text-[11px] font-bold uppercase tracking-wide text-red-800">
                                {mode === "awaiting_dispatch"
                                    ? guestStrings.awaitingDispatchBadge
                                    : guestStrings.trackingModeBadge}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {guestStrings.nearestHospitalLabel}
                            </p>
                            <p className="mt-0.5 text-base font-bold text-slate-900">{assignedHospital.name}</p>
                            <p className="mt-1 text-sm text-slate-700">{trackingStatusMessage}</p>
                        </div>
                    </div>
                ) : null}

                {mode === "browse" && !selectedFacility ? (
                    <div className="md:hidden">
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
                    </div>
                ) : null}

                {mode === "browse" && Boolean(selectedFacility) ? (
                    <div className="md:hidden">
                    <FacilityDetailSheet
                        facility={selectedFacility}
                        hasUserLocation={Boolean(currentPosition)}
                        onClose={() => setSelectedFacility(null)}
                    />
                    </div>
                ) : null}

                {locationError && !outsideAreaBlocked ? (
                    <MapOverlayToast
                        variant="error"
                        topClass={mapOverlayToastTopPrimaryClass}
                        onClose={() => {
                            setLocationError(null);
                            setLocationPermissionHint(null);
                        }}
                    >
                        <p className="font-semibold text-red-700">{locationError}</p>
                        {locationPermissionHint ? (
                            <p className="mt-1.5 text-xs leading-snug text-red-600/90">{locationPermissionHint}</p>
                        ) : null}
                        <button
                            className="mt-2 min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            disabled={isLocating}
                            onClick={handleRetryLocationPermission}
                        >
                            {isLocating ? guestStrings.locationRequesting : guestStrings.retry}
                        </button>
                    </MapOverlayToast>
                ) : null}

                {advancedGpsHint ? (
                    <MapOverlayToast
                        variant="hint"
                        topClass={mapOverlayToastTopSecondaryClass}
                        onClose={() => setAdvancedGpsHint(null)}
                    >
                        <p className="font-semibold text-violet-900">{advancedGpsHint}</p>
                    </MapOverlayToast>
                ) : null}

                {sessionRestoreMessage ? (
                    <MapOverlayToast
                        variant="warning"
                        topClass={mapOverlayToastTopSecondaryClass}
                        onClose={() => setSessionRestoreMessage(null)}
                    >
                        <p className="font-semibold text-amber-700">{sessionRestoreMessage}</p>
                    </MapOverlayToast>
                ) : null}
            </section>

            {mode === "browse" ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex justify-center px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1">
                    <div className="pointer-events-auto w-full max-w-[min(90vw,22rem)] sm:max-w-[min(85vw,24rem)]">
                        <SosButton
                            variant="dock"
                            onClick={handleSosClick}
                            disabled={isLocating || isSendingSos || outsideAreaBlocked}
                        />
                    </div>
                </div>
            ) : null}

            {outsideAreaBlocked && mode === "browse" ? (
                <div
                    className="absolute inset-0 z-[1070] grid place-items-center bg-slate-900/60 p-4"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="outside-area-title"
                    aria-describedby="outside-area-body"
                >
                    <article className="w-full max-w-[430px] rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-2xl">
                        <p id="outside-area-title" className="text-lg font-bold text-amber-800">
                            {guestStrings.locationOutsideSupportedAreaTitle}
                        </p>
                        <p id="outside-area-body" className="mt-3 text-sm leading-relaxed text-slate-700">
                            {guestStrings.locationOutsideSupportedAreaBody}
                        </p>
                        <button
                            className="mt-5 min-h-12 w-full rounded-xl bg-violet-800 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            disabled={isLocating}
                            onClick={() => {
                                void acquireCurrentLocation();
                            }}
                        >
                            {guestStrings.locationOutsideSupportedAreaRetry}
                        </button>
                    </article>
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
