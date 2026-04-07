/**
 * Reusable Leaflet icon factories for facility, SOS, hospital, and ambulance layers.
 */

import L, { type DivIcon } from "leaflet";
import type { FacilityType } from "../types/guest";

const defaultMarker = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

function createCircleIcon(color: string): DivIcon {
    return L.divIcon({
        className: "custom-circle-marker",
        html: `<span style="background:${color}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

function createEmojiIcon(emoji: string, className: string): DivIcon {
    return L.divIcon({
        className,
        html: `<span>${emoji}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
}

export const userLocationIcon = defaultMarker;
export const hospitalIcon = createCircleIcon("#2563eb");
export const ambulanceIcon = createEmojiIcon("🚑", "ambulance-marker");

export const sosPulseIcon = L.divIcon({
    className: "sos-pulse-marker",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

export function getFacilityIcon(type: FacilityType): DivIcon {
    if (type === 1) {
        return createCircleIcon("#dc2626");
    }

    if (type === 2) {
        return createCircleIcon("#f59e0b");
    }

    return createCircleIcon("#16a34a");
}
