/**
 * Trim a driven route polyline so only the path ahead of the vehicle is shown.
 */

import { useEffect, useMemo, useRef } from "react";
import { haversineDistanceMeters } from "./distance";

export type LatLng = [number, number];

function distanceToSegmentMeters(point: LatLng, segStart: LatLng, segEnd: LatLng): number {
    const [lat, lng] = point;
    const [lat1, lng1] = segStart;
    const [lat2, lng2] = segEnd;

    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
        return haversineDistanceMeters(point, segStart);
    }

    const t = Math.max(0, Math.min(1, ((lng - lng1) * dx + (lat - lat1) * dy) / len2));
    const projected: LatLng = [lat1 + t * dy, lng1 + t * dx];
    return haversineDistanceMeters(point, projected);
}

/**
 * Returns route coordinates from the vehicle position to the destination.
 * `minProgressIndex` keeps trimming monotonic while GPS updates arrive.
 */
export function trimRouteFromPosition(
    route: LatLng[],
    current: LatLng,
    minProgressIndex = 0,
): { path: LatLng[]; progressIndex: number } {
    if (route.length === 0) {
        return { path: [], progressIndex: 0 };
    }

    if (route.length === 1) {
        return { path: [current, route[0]], progressIndex: 0 };
    }

    const searchStart = Math.max(0, minProgressIndex);
    let bestSegment = searchStart;
    let bestDist = Infinity;

    for (let i = searchStart; i < route.length - 1; i += 1) {
        const distance = distanceToSegmentMeters(current, route[i], route[i + 1]);
        if (distance < bestDist) {
            bestDist = distance;
            bestSegment = i;
        }
    }

    const lastPoint = route[route.length - 1];
    const distToEnd = haversineDistanceMeters(current, lastPoint);
    if (distToEnd <= bestDist) {
        if (distToEnd < 8) {
            return { path: [], progressIndex: route.length - 1 };
        }
        return { path: [current, lastPoint], progressIndex: route.length - 1 };
    }

    const progressIndex = Math.max(minProgressIndex, bestSegment + 1);
    const ahead = route.slice(progressIndex);
    const path = ahead.length > 0 && haversineDistanceMeters(current, ahead[0]) > 3
        ? [current, ...ahead]
        : ahead;

    if (path.length < 2) {
        return { path: [current, lastPoint], progressIndex: route.length - 1 };
    }

    return { path, progressIndex };
}

export function useTrimmedRoutePath(
    route: LatLng[],
    currentPosition: LatLng | null,
    resetKey: unknown,
): LatLng[] {
    const progressRef = useRef(0);

    useEffect(() => {
        progressRef.current = 0;
    }, [resetKey]);

    return useMemo(() => {
        if (route.length < 2 || !currentPosition) {
            return route;
        }

        const { path, progressIndex } = trimRouteFromPosition(route, currentPosition, progressRef.current);
        progressRef.current = progressIndex;
        return path;
    }, [route, currentPosition]);
}
