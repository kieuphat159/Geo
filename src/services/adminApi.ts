/**
 * Admin API client for facility CRUD and emergency list for dispatcher.
 */
import type { Facility } from "../types/guest";
import { authorizedFetch } from "./auth";

const FACILITIES_ENDPOINT = "/api/facilities";
const EMERGENCIES_ENDPOINT = "/api/emergencies";
const AMBULANCES_ENDPOINT = "/api/ambulances";
const USERS_ENDPOINT = "/api/users";

type FacilityApiType = "hospital" | "pharmacy";

function toFacilityTypeValue(type: unknown): FacilityApiType {
    if (type === 1 || type === "hospital") return "hospital";
    // Backend currently stores non-hospital in the same enum branch.
    return "pharmacy";
}

function fromFacilityApi(raw: any): Facility {
    const location = raw?.location?.coordinates;
    const lng = Array.isArray(location) ? Number(location[0]) : Number(raw?.lng ?? 0);
    const lat = Array.isArray(location) ? Number(location[1]) : Number(raw?.lat ?? 0);
    const mappedFacilityType = Number(raw?.facility_type);
    const facilityType =
        mappedFacilityType === 1 || mappedFacilityType === 2 || mappedFacilityType === 3
            ? mappedFacilityType
            : raw?.type === "hospital"
              ? 1
              : 3;
    return {
        id: raw?.id,
        name: raw?.name ?? "",
        address: raw?.address ?? "",
        phone: raw?.phone ?? "",
        lat,
        lng,
        type: facilityType,
        distanceMeters: raw?.distance_meters,
        is_active: raw?.is_active,
    } as Facility & { is_active?: boolean };
}

function resolveApiUrl(pathname: string): URL {
    const configuredBaseUrl = import.meta.env.VITE_API_URL;
    const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

    return new URL(pathname, configuredBaseUrl || fallbackBaseUrl);
}

async function handleJsonResponse(response: Response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed ${response.status}: ${text}`);
    }

    try {
        return await response.json();
    } catch {
        return null;
    }
}

export async function fetchEmergencies(signal?: AbortSignal) {
    const url = resolveApiUrl(EMERGENCIES_ENDPOINT);

    const resp = await authorizedFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });

    const payload = (await handleJsonResponse(resp)) as any;
    // Backend contract for dispatcher dashboard returns an array.
    return (Array.isArray(payload) ? payload : payload?.data ?? payload?.results ?? payload?.data ?? []);
}

export async function fetchAmbulances(signal?: AbortSignal) {
    const url = resolveApiUrl(AMBULANCES_ENDPOINT);
    const resp = await authorizedFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });
    const payload = (await handleJsonResponse(resp)) as any;
    return payload?.data ?? payload?.results ?? payload ?? [];
}

export async function assignAmbulance(emergencyId: number, ambulanceId: number) {
    const url = resolveApiUrl(`/api/emergency/${emergencyId}/assign`);
    const resp = await authorizedFetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ambulance_id: ambulanceId }),
    });
    return await handleJsonResponse(resp);
}

export async function startTrackingSimulation(ambulanceId: number, emergencyRequestId: number, intervalMs = 3000) {
    const url = resolveApiUrl(`/api/tracking/simulate/start`);
    const resp = await authorizedFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ambulance_id: ambulanceId, emergency_request_id: emergencyRequestId, interval_ms: intervalMs }),
    });
    return await handleJsonResponse(resp);
}

export async function updateEmergencyStatus(emergencyId: number, status: string) {
    const url = resolveApiUrl(`/api/emergency/${emergencyId}/status`);
    const resp = await authorizedFetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status }),
    });
    return await handleJsonResponse(resp);
}

export async function createFacility(payload: Partial<Facility>) {
    const url = resolveApiUrl(FACILITIES_ENDPOINT);
    const body = {
        name: payload.name,
        address: payload.address,
        phone: payload.phone,
        lat: payload.lat,
        lng: payload.lng,
        type: toFacilityTypeValue(payload.type),
    };

    const resp = await authorizedFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });

    const parsed = await handleJsonResponse(resp);
    return fromFacilityApi(parsed?.data ?? parsed);
}

export async function updateFacility(id: string | number, payload: Partial<Facility>) {
    const url = resolveApiUrl(`${FACILITIES_ENDPOINT}/${id}`);
    const body = {
        name: payload.name,
        address: payload.address,
        phone: payload.phone,
        lat: payload.lat,
        lng: payload.lng,
        type: payload.type == null ? undefined : toFacilityTypeValue(payload.type),
    };

    const resp = await authorizedFetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });

    const parsed = await handleJsonResponse(resp);
    return fromFacilityApi(parsed?.data ?? parsed);
}

export async function deleteFacility(id: string | number) {
    const url = resolveApiUrl(`${FACILITIES_ENDPOINT}/${id}`);

    const resp = await authorizedFetch(url.toString(), {
        method: "DELETE",
        headers: { Accept: "application/json" },
    });

    return await handleJsonResponse(resp);
}

export async function fetchFacilitiesAdmin(signal?: AbortSignal) {
    const url = resolveApiUrl(FACILITIES_ENDPOINT);

    const resp = await authorizedFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });

    const parsed = (await handleJsonResponse(resp)) as any;
    const rows = Array.isArray(parsed) ? parsed : parsed?.data ?? [];
    return rows.map(fromFacilityApi);
}

export async function fetchUsers(signal?: AbortSignal) {
    const url = resolveApiUrl(USERS_ENDPOINT);
    const resp = await authorizedFetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });
    const parsed = (await handleJsonResponse(resp)) as any;
    return parsed?.data ?? [];
}

export async function createHospitalAdmin(payload: { email: string; password: string; facility_id: number }) {
    const url = resolveApiUrl(USERS_ENDPOINT);
    const resp = await authorizedFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...payload, role_id: 2 }),
    });
    const parsed = (await handleJsonResponse(resp)) as any;
    return parsed?.data ?? parsed;
}

export default {
    fetchEmergencies,
    fetchAmbulances,
    assignAmbulance,
    startTrackingSimulation,
    updateEmergencyStatus,
    createFacility,
    updateFacility,
    deleteFacility,
    fetchFacilitiesAdmin,
    fetchUsers,
    createHospitalAdmin,
};
