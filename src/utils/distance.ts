/**
 * Distance helpers for displaying user-to-facility proximity on the guest map.
 */

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * Uses the Haversine formula to estimate great-circle distance in meters.
 */
export function haversineDistanceMeters(origin: [number, number], destination: [number, number]): number {
    const [originLat, originLng] = origin;
    const [destinationLat, destinationLng] = destination;

    const deltaLat = toRadians(destinationLat - originLat);
    const deltaLng = toRadians(destinationLng - originLng);

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(toRadians(originLat)) *
            Math.cos(toRadians(destinationLat)) *
            Math.sin(deltaLng / 2) *
            Math.sin(deltaLng / 2);

    const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * angularDistance;
}

export function formatDistanceLabel(distanceMeters?: number): string {
    if (!distanceMeters || Number.isNaN(distanceMeters)) {
        return "";
    }

    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)} m`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km`;
}
