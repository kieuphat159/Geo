import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { AssignedHospital, Facility } from "../types/guest";
import { ambulanceIcon, getFacilityIcon, hospitalIcon, sosPulseIcon, userLocationIcon } from "../utils/mapIcons";
import { guestStrings } from "../constants/guestStrings";

interface MapViewportControllerProps {
    mode: "browse" | "tracking" | "completed";
    defaultCenter: [number, number];
    userPosition: [number, number] | null;
    sosPosition: [number, number] | null;
    hospitalPosition: [number, number] | null;
    layoutSignature?: string;
}

function MapViewportController({
    mode,
    defaultCenter,
    userPosition,
    sosPosition,
    hospitalPosition,
    layoutSignature,
}: MapViewportControllerProps) {
    const map = useMap();
    const hasFittedTrackingRef = useRef(false);

    useEffect(() => {
        if (mode !== "tracking") {
            hasFittedTrackingRef.current = false;

            if (userPosition) {
                map.flyTo(userPosition, 15, { duration: 0.8 });
            } else {
                map.flyTo(defaultCenter, 13, { duration: 0.8 });
            }

            return;
        }

        if (hasFittedTrackingRef.current) {
            return;
        }

        const points: [number, number][] = [];

        if (sosPosition) {
            points.push(sosPosition);
        }

        if (hospitalPosition) {
            points.push(hospitalPosition);
        }

        if (points.length >= 2) {
            map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
            hasFittedTrackingRef.current = true;
            return;
        }

        if (sosPosition) {
            map.flyTo(sosPosition, 15, { duration: 0.9 });
            hasFittedTrackingRef.current = true;
        }
    }, [defaultCenter, hospitalPosition, map, mode, sosPosition, userPosition]);

    useEffect(() => {
        const invalidate = () => {
            map.invalidateSize({ pan: false });
        };

        const frameId = window.requestAnimationFrame(invalidate);
        const timeoutId = window.setTimeout(invalidate, 220);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [layoutSignature, map]);

    useEffect(() => {
        const onResize = () => {
            map.invalidateSize({ pan: false });
        };

        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
        };
    }, [map]);

    return null;
}

interface VietnamMapProps {
    defaultCenter: [number, number];
    mode: "browse" | "tracking" | "completed";
    currentPosition: [number, number] | null;
    facilities: Facility[];
    selectedFacilityId: string | number | null;
    onFacilitySelect: (facility: Facility) => void;
    onOpenDirectionsForFacility: (facility: Facility) => void;
    onSosHereForFacility: (facility: Facility) => void;
    sosPosition: [number, number] | null;
    assignedHospital: AssignedHospital | null;
    ambulancePosition: [number, number] | null;
    routePath: [number, number][];
    layoutSignature?: string;
}

export default function VietnamMap({
    defaultCenter,
    mode,
    currentPosition,
    facilities,
    selectedFacilityId,
    onFacilitySelect,
    onOpenDirectionsForFacility,
    onSosHereForFacility,
    sosPosition,
    assignedHospital,
    ambulancePosition,
    routePath,
    layoutSignature,
}: VietnamMapProps) {
    const hospitalPosition: [number, number] | null = assignedHospital
        ? [assignedHospital.lat, assignedHospital.lng]
        : null;
    const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
    const mapRef = useRef<LeafletMap | null>(null);

    useEffect(() => {
        if (selectedFacilityId === null || !mapRef.current) {
            return;
        }

        const marker = markerRefs.current[String(selectedFacilityId)];
        const selected = facilities.find((facility) => facility.id === selectedFacilityId);
        if (!marker || !selected) {
            return;
        }

        mapRef.current.flyTo([selected.lat, selected.lng], 16, { duration: 0.9 });
        window.setTimeout(() => marker.openPopup(), 220);
    }, [facilities, selectedFacilityId]);

    return (
        <MapContainer
            ref={mapRef}
            className="h-full w-full"
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapViewportController
                mode={mode}
                defaultCenter={defaultCenter}
                userPosition={currentPosition}
                sosPosition={sosPosition}
                hospitalPosition={hospitalPosition}
                layoutSignature={layoutSignature}
            />

            {facilities.map((facility) => (
                <Marker
                    key={facility.id}
                    position={[facility.lat, facility.lng]}
                    icon={getFacilityIcon(facility.type)}
                    ref={(instance) => {
                        markerRefs.current[String(facility.id)] = instance;
                    }}
                    eventHandlers={{
                        click: () => onFacilitySelect(facility),
                    }}
                >
                    <Popup>
                        <div className="max-w-[240px]">
                            <p className="font-semibold text-slate-900">{facility.name}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{facility.address}</p>

                            <div className="mt-2 space-y-1 text-[12px] text-slate-700">
                                <p>
                                    <span className="font-semibold">{guestStrings.detailLabelHotline}:</span>{" "}
                                    {facility.phone || guestStrings.detailPhoneFallback}
                                </p>
                                <p>
                                    <span className="font-semibold">{guestStrings.detailLabelOpeningHours}:</span>{" "}
                                    {facility.openingHours || guestStrings.detailOpeningHoursFallback}
                                </p>
                            </div>

                            <div className="mt-3 flex flex-col gap-2">
                                <button
                                    className="min-h-10 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-violet-200"
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onOpenDirectionsForFacility(facility);
                                    }}
                                >
                                    {guestStrings.directionsButton}
                                </button>

                                <button
                                    className="min-h-10 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-red-500"
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onSosHereForFacility(facility);
                                    }}
                                >
                                    {guestStrings.sosHereButton}
                                </button>
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {currentPosition ? <Marker position={currentPosition} icon={userLocationIcon} /> : null}
            {sosPosition ? <Marker position={sosPosition} icon={sosPulseIcon} /> : null}
            {hospitalPosition ? <Marker position={hospitalPosition} icon={hospitalIcon} /> : null}
            {ambulancePosition ? <Marker position={ambulancePosition} icon={ambulanceIcon} /> : null}

            {routePath.length >= 2 ? (
                <Polyline
                    positions={routePath}
                    pathOptions={{
                        color: "#7c3aed",
                        weight: 5,
                        opacity: 0.8,
                    }}
                />
            ) : null}
        </MapContainer>
    );
}
