/**
 * Guest API client for facility lookup and SOS submission using backend REST contracts.
 */

import type {
    AssignedHospital,
    Facility,
    FacilityQueryParams,
    FacilityType,
    GeoJsonLineString,
    SosRequestPayload,
    SosResponse,
} from "../types/guest";
import { haversineDistanceMeters } from "../utils/distance";

// Placeholder contracts expected from backend.
const FACILITIES_ENDPOINT = "/api/facilities";
const SOS_ENDPOINT = "/api/emergency/sos";

const MOCK_FACILITIES_GEOJSON = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.6603, 10.7546] },
            properties: {
                id: 1,
                name: "Bệnh viện Chợ Rẫy",
                address: "201B Nguyễn Chí Thanh, Phường 12, Quận 5",
                phone: "028 3855 4137",
                facility_type: 1,
                opening_hours: "24/7",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.6678, 10.7626] },
            properties: {
                id: 2,
                name: "Bệnh viện Nhân dân 115",
                address: "527 Sư Vạn Hạnh, Phường 12, Quận 10",
                phone: "028 3865 4281",
                facility_type: 1,
                opening_hours: "24/7",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.7724, 10.8531] },
            properties: {
                id: 3,
                name: "Bệnh viện Đại học Y Dược TP.HCM",
                address: "215 Hồng Bàng, Phường 11, Quận 5",
                phone: "028 3855 2780",
                facility_type: 1,
                opening_hours: "24/7",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.6952, 10.788] },
            properties: {
                id: 4,
                name: "Phòng khám Đa khoa An Khang",
                address: "45 Lý Tự Trọng, Phường Bến Nghé, Quận 1",
                phone: "028 3822 1234",
                facility_type: 2,
                opening_hours: "07:00 - 21:00",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.705, 10.772] },
            properties: {
                id: 5,
                name: "Phòng khám Quốc tế Victoria",
                address: "79 Điện Biên Phủ, Phường Đa Kao, Quận 1",
                phone: "028 3910 4545",
                facility_type: 2,
                opening_hours: "08:00 - 20:00",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.689, 10.775] },
            properties: {
                id: 6,
                name: "Nhà thuốc Long Châu",
                address: "12 Nguyễn Trãi, Phường Nguyễn Cư Trinh, Quận 1",
                phone: "1800 6928",
                facility_type: 3,
                opening_hours: "06:00 - 22:00",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.71, 10.781] },
            properties: {
                id: 7,
                name: "Pharmacity Đinh Tiên Hoàng",
                address: "88 Đinh Tiên Hoàng, Phường Đa Kao, Quận 1",
                phone: "1800 1572",
                facility_type: 3,
                opening_hours: "07:00 - 23:00",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [106.682, 10.768] },
            properties: {
                id: 8,
                name: "Nhà thuốc Pharmacity Lê Lai",
                address: "31 Lê Lai, Phường Bến Thành, Quận 1",
                phone: "1800 1572",
                facility_type: 3,
                opening_hours: "07:00 - 23:00",
            },
        },
    ],
} as const;

function resolveApiUrl(pathname: string): URL {
    const configuredBaseUrl = import.meta.env.VITE_API_URL;
    const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

    return new URL(pathname, configuredBaseUrl || fallbackBaseUrl);
}

function toNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

function toFacilityType(value: unknown): FacilityType | undefined {
    const parsed = toNumber(value);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
        return parsed;
    }

    return undefined;
}

function parseAssignedHospital(input: unknown): AssignedHospital | undefined {
    if (!input || typeof input !== "object") {
        return undefined;
    }

    const hospital = input as Record<string, unknown>;

    const lat = toNumber(hospital.lat ?? hospital.latitude);
    const lng = toNumber(hospital.lng ?? hospital.longitude);
    const name =
        (hospital.name as string | undefined) ||
        (hospital.hospital_name as string | undefined) ||
        (hospital.hospitalName as string | undefined);

    if (!name || lat === undefined || lng === undefined) {
        return undefined;
    }

    return {
        id: (hospital.id as string | number | undefined) ?? (hospital.hospital_id as string | number | undefined),
        name,
        hotline:
            (hospital.hotline as string | undefined) ||
            (hospital.phone as string | undefined) ||
            (hospital.hospital_hotline as string | undefined),
        lat,
        lng,
    };
}

function normalizeRoutePath(rawRoutePath: unknown): GeoJsonLineString | undefined {
    if (!rawRoutePath) {
        return undefined;
    }

    if (
        typeof rawRoutePath === "object" &&
        rawRoutePath !== null &&
        (rawRoutePath as { type?: string }).type === "LineString" &&
        Array.isArray((rawRoutePath as { coordinates?: unknown[] }).coordinates)
    ) {
        const coordinates = (rawRoutePath as { coordinates: unknown[] }).coordinates
            .map((coordinate) => {
                if (!Array.isArray(coordinate) || coordinate.length < 2) {
                    return undefined;
                }

                const lng = toNumber(coordinate[0]);
                const lat = toNumber(coordinate[1]);

                if (lng === undefined || lat === undefined) {
                    return undefined;
                }

                return [lng, lat] as [number, number];
            })
            .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

        if (coordinates.length >= 2) {
            return {
                type: "LineString",
                coordinates,
            };
        }
    }

    if (Array.isArray(rawRoutePath)) {
        const coordinates = rawRoutePath
            .map((coordinate) => {
                if (!Array.isArray(coordinate) || coordinate.length < 2) {
                    return undefined;
                }

                const lng = toNumber(coordinate[0]);
                const lat = toNumber(coordinate[1]);

                if (lng === undefined || lat === undefined) {
                    return undefined;
                }

                return [lng, lat] as [number, number];
            })
            .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

        if (coordinates.length >= 2) {
            return {
                type: "LineString",
                coordinates,
            };
        }
    }

    return undefined;
}

function parseFacility(input: unknown, userLocation: [number, number]): Facility | null {
    if (!input || typeof input !== "object") {
        return null;
    }

    const row = input as Record<string, unknown>;
    const geometry = row.geometry as Record<string, unknown> | undefined;
    const properties = row.properties as Record<string, unknown> | undefined;

    let lat = toNumber(row.lat ?? row.latitude ?? properties?.lat ?? properties?.latitude);
    let lng = toNumber(row.lng ?? row.longitude ?? properties?.lng ?? properties?.longitude);

    if (geometry && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
        lng = toNumber(geometry.coordinates[0]) ?? lng;
        lat = toNumber(geometry.coordinates[1]) ?? lat;
    }

    if (lat === undefined || lng === undefined) {
        return null;
    }

    const type =
        toFacilityType(
            row.Facility_Type ??
                row.facility_type ??
                row.type ??
                properties?.Facility_Type ??
                properties?.facility_type ??
                properties?.type,
        ) ?? 3;

    const name =
        (row.name as string | undefined) ||
        (row.facility_name as string | undefined) ||
        (properties?.name as string | undefined) ||
        (properties?.facility_name as string | undefined) ||
        "Unknown facility";

    const address =
        (row.address as string | undefined) || (properties?.address as string | undefined) || "Unknown address";

    const distanceFromPayload = toNumber(
        row.distance_m ?? row.distanceMeters ?? properties?.distance_m ?? properties?.distanceMeters,
    );

    const distanceMeters = distanceFromPayload ?? haversineDistanceMeters(userLocation, [lat, lng]);

    return {
        id:
            (row.id as string | number | undefined) ??
            (properties?.id as string | number | undefined) ??
            `${name}-${lat}-${lng}`,
        name,
        address,
        phone:
            (row.phone as string | undefined) ||
            (row.hotline as string | undefined) ||
            (properties?.phone as string | undefined) ||
            (properties?.hotline as string | undefined),
        openingHours:
            (row.opening_hours as string | undefined) ||
            (row.openingHours as string | undefined) ||
            (properties?.opening_hours as string | undefined) ||
            (properties?.openingHours as string | undefined),
        type,
        lat,
        lng,
        distanceMeters,
    };
}

function parseFacilityRows(data: unknown, userLocation: [number, number]): Facility[] {
    const rows = Array.isArray((data as { features?: unknown[] }).features)
        ? (data as { features: unknown[] }).features
        : Array.isArray((data as { data?: unknown[] }).data)
          ? (data as { data: unknown[] }).data
          : Array.isArray(data)
            ? data
            : [];

    return rows
        .map((row) => parseFacility(row, userLocation))
        .filter((facility): facility is Facility => Boolean(facility));
}

export async function fetchFacilities(params: FacilityQueryParams, signal?: AbortSignal): Promise<Facility[]> {
    const userLocation: [number, number] = [params.lat, params.lng];

    if (import.meta.env.VITE_USE_MOCK === "true") {
        console.log("[MOCK] returning mock facilities");
        return parseFacilityRows(MOCK_FACILITIES_GEOJSON, userLocation);
    }

    const url = resolveApiUrl(FACILITIES_ENDPOINT);

    if (params.type !== "all") {
        url.searchParams.set("type", String(params.type));
    }

    if (params.query.trim()) {
        url.searchParams.set("q", params.query.trim());
    }

    url.searchParams.set("lat", String(params.lat));
    url.searchParams.set("lng", String(params.lng));
    url.searchParams.set("radius", String(params.radius));

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal,
        });

        if (!response.ok) {
            throw new Error(`Facility lookup failed with status ${response.status}.`);
        }

        const data = (await response.json()) as unknown;
        return parseFacilityRows(data, userLocation);
    } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
            throw error;
        }

        console.warn("[MOCK] API failed, using mock facilities", error);
        return parseFacilityRows(MOCK_FACILITIES_GEOJSON, userLocation);
    }
}

export async function sendEmergencySos(payload: SosRequestPayload): Promise<SosResponse> {
    const url = resolveApiUrl(SOS_ENDPOINT);

    const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`SOS request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const requestId = toNumber(data.request_id ?? data.requestId);

    if (requestId === undefined) {
        throw new Error("SOS response missing request_id.");
    }

    return {
        request_id: requestId,
        assigned_hospital: parseAssignedHospital(data.assigned_hospital ?? data.hospital),
        route_path: normalizeRoutePath(data.route_path ?? data.routePath),
        eta_minutes: toNumber(data.eta_minutes ?? data.etaMinutes),
    };
}
