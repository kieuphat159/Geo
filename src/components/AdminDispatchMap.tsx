import { useEffect } from "react";
import { MapContainer, Marker, ScaleControl, TileLayer, useMap, ZoomControl } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { ambulanceIcon, sosPulseIcon } from "../utils/mapIcons";

export interface AdminPatientMarker {
  requestId: number;
  lat: number;
  lng: number;
}

interface AdminDispatchMapProps {
  defaultCenter: LatLngExpression;
  patientMarkers: AdminPatientMarker[];
  ambulancePositionsByRequest: Record<number, [number, number] | undefined>;
  focusPosition: [number, number] | null;
  layoutSignature?: string;
}

function MapFlyToOnFocus({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo(position, 15, { duration: 0.9 });
  }, [map, position]);

  return null;
}

export default function AdminDispatchMap({
  defaultCenter,
  patientMarkers,
  ambulancePositionsByRequest,
  focusPosition,
}: AdminDispatchMapProps) {
  return (
    <MapContainer
      className="h-full w-full"
      center={defaultCenter}
      zoom={13}
      minZoom={5}
      maxZoom={19}
      scrollWheelZoom
      doubleClickZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="topright" />
      <ScaleControl position="bottomleft" />

      <MapFlyToOnFocus position={focusPosition} />

      {patientMarkers.map((m) => (
        <Marker key={m.requestId} position={[m.lat, m.lng]} icon={sosPulseIcon}>
          {/* Popup intentionally omitted for simplicity */ }
        </Marker>
      ))}

      {Object.entries(ambulancePositionsByRequest).map(([requestIdStr, pos]) => {
        if (!pos) return null;
        return <Marker key={requestIdStr} position={pos} icon={ambulanceIcon} />;
      })}
    </MapContainer>
  );
}

