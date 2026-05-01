/**
 * Reusable Leaflet icon factories for facility, SOS, hospital, and ambulance layers.
 */

import L, { type DivIcon } from "leaflet";
import type { FacilityType } from "../types/guest";

function createSvgIcon(className: string, svgMarkup: string, iconSize: [number, number], iconAnchor: [number, number]): DivIcon {
    return L.divIcon({
        className,
        html: svgMarkup,
        iconSize,
        iconAnchor,
    });
}

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

function createFacilityTypeIcon(emoji: string, className: string): DivIcon {
    return L.divIcon({
        className: `facility-type-marker ${className}`,
        html: `<span>${emoji}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

const hospitalFacilitySvg = `
<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
  <rect x="3" y="3" width="28" height="28" rx="8" fill="#5b21b6" stroke="#ffffff" stroke-width="2.5"></rect>
  <path d="M17 9.5v15M9.5 17h15" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"></path>
</svg>
`;

const clinicFacilitySvg = `
<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
  <circle cx="17" cy="17" r="13.5" fill="#7c3aed" stroke="#ffffff" stroke-width="2.5"></circle>
  <path d="M12 11.5v7a4.5 4.5 0 0 0 9 0v-3.5a2.5 2.5 0 0 1 5 0V18" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"></path>
  <circle cx="26" cy="19.8" r="1.7" fill="#ffffff"></circle>
</svg>
`;

export const userLocationIcon = L.divIcon({
    className: "user-location-pulse-marker",
    html: "<span></span>",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});
export const hospitalIcon = createCircleIcon("#7c3aed");
export const ambulanceIcon = createEmojiIcon("🚑", "ambulance-marker");
export const facilityHospitalIcon = createSvgIcon("facility-svg-marker", hospitalFacilitySvg, [34, 34], [17, 17]);
export const facilityClinicIcon = createSvgIcon("facility-svg-marker", clinicFacilitySvg, [34, 34], [17, 17]);
export const facilityPharmacyIcon = createFacilityTypeIcon("💊", "facility-pharmacy-marker");

export const sosPulseIcon = L.divIcon({
    className: "sos-pulse-marker",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

export function getFacilityIcon(type: FacilityType): DivIcon {
    if (type === 1) {
        return facilityHospitalIcon;
    }

    if (type === 2) {
        return facilityClinicIcon;
    }

    return facilityPharmacyIcon;
}
