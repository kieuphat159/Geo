import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { AssignedHospital, Facility } from "../types/guest";
import { ambulanceIcon, getFacilityIcon, hospitalIcon, sosPulseIcon, userLocationIcon } from "../utils/mapIcons";

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
    onFacilitySelect: (facility: Facility) => void;
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
    onFacilitySelect,
    sosPosition,
    assignedHospital,
    ambulancePosition,
    routePath,
    layoutSignature,
}: VietnamMapProps) {
    const hospitalPosition: [number, number] | null = assignedHospital
        ? [assignedHospital.lat, assignedHospital.lng]
        : null;

    return (
        <MapContainer className="h-full w-full" center={defaultCenter} zoom={13} scrollWheelZoom zoomControl={false}>
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
                    eventHandlers={{
                        click: () => onFacilitySelect(facility),
                    }}
                >
                    <Popup>
                        <div>
                            <p className="font-semibold">{facility.name}</p>
                            <p className="text-xs">{facility.address}</p>
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
                        color: "#2563eb",
                        weight: 5,
                        opacity: 0.8,
                    }}
                />
            ) : null}
        </MapContainer>
    );
}
