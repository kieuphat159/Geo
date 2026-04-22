/**
 * Admin API client for facility CRUD and emergency list for dispatcher.
 */
import type { Facility } from "../types/guest";

const FACILITIES_ENDPOINT = "/api/facilities";
const EMERGENCIES_ENDPOINT = "/api/emergencies";

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

    const resp = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });

    return (await handleJsonResponse(resp)) as unknown[];
}

export async function createFacility(payload: Partial<Facility>) {
    const url = resolveApiUrl(FACILITIES_ENDPOINT);

    const resp = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
    });

    return (await handleJsonResponse(resp)) as Facility;
}

export async function updateFacility(id: string | number, payload: Partial<Facility>) {
    const url = resolveApiUrl(`${FACILITIES_ENDPOINT}/${id}`);

    const resp = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
    });

    return (await handleJsonResponse(resp)) as Facility;
}

export async function deleteFacility(id: string | number) {
    const url = resolveApiUrl(`${FACILITIES_ENDPOINT}/${id}`);

    const resp = await fetch(url.toString(), {
        method: "DELETE",
        headers: { Accept: "application/json" },
    });

    return await handleJsonResponse(resp);
}

export async function fetchFacilitiesAdmin(signal?: AbortSignal) {
    const url = resolveApiUrl(FACILITIES_ENDPOINT);

    const resp = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });

    return (await handleJsonResponse(resp)) as Facility[];
}

export default {
    fetchEmergencies,
    createFacility,
    updateFacility,
    deleteFacility,
    fetchFacilitiesAdmin,
};
