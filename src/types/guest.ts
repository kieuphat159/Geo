/**
 * Guest-facing domain models for facilities, SOS payloads, and tracking events.
 */

export type FacilityType = 1 | 2 | 3;
export type FacilityFilterType = "all" | FacilityType;

export type TrackingStatus = "ASSIGNED" | "ON_THE_WAY" | "COMPLETED" | string;

export interface Facility {
    id: string | number;
    name: string;
    address: string;
    phone?: string;
    openingHours?: string;
    type: FacilityType;
    lat: number;
    lng: number;
    distanceMeters?: number;
}

export interface FacilityQueryParams {
    type: FacilityFilterType;
    query: string;
    radius: number;
    lat: number;
    lng: number;
}

export interface SosRequestPayload {
    victim_phone?: string;
    guest_uuid?: string;
    lat: number;
    lng: number;
}

export interface AssignedHospital {
    id?: string | number;
    name: string;
    hotline?: string;
    lat: number;
    lng: number;
}

export interface GeoJsonLineString {
    type: "LineString";
    coordinates: [number, number][];
}

export interface SosResponse {
    request_id: number;
    assigned_hospital?: AssignedHospital;
    route_path?: GeoJsonLineString | [number, number][];
    eta_minutes?: number;
    tracking_token?: string;
    status?: string;
    ambulance_position?: { lat: number; lng: number } | null;
    patient_position?: { lat: number; lng: number } | null;
}

export interface TrackingSocketEvent {
    ambulance_id?: number;
    request_id: number;
    lat?: number;
    lng?: number;
    updated_at?: string;
    eta_minutes?: number;
    status?: TrackingStatus;
    route_path?: GeoJsonLineString | [number, number][];
}
