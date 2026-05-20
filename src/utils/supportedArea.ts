/** Bounding box for TP.HCM — must match GeoBackend `SUPPORTED_AREA_BBOX`. */
export const SUPPORTED_AREA_BBOX = {
    minLat: 10.3,
    maxLat: 11.4,
    minLng: 106.2,
    maxLng: 107.3,
} as const;

export function isInSupportedArea(lat: number, lng: number): boolean {
    return (
        lat >= SUPPORTED_AREA_BBOX.minLat &&
        lat <= SUPPORTED_AREA_BBOX.maxLat &&
        lng >= SUPPORTED_AREA_BBOX.minLng &&
        lng <= SUPPORTED_AREA_BBOX.maxLng
    );
}
