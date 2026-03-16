import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

const defaultCenter: [number, number] = [16.5, 107.5];

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FlyToLocation({ position }: { position: [number, number] | null }) {
  const map = useMap();

  if (position) {
    map.flyTo(position, 15, { duration: 1.3 });
  }

  return null;
}

interface VietnamMapProps {
  currentPosition: [number, number] | null;
}

export default function VietnamMap({ currentPosition }: VietnamMapProps) {
  return (
    <MapContainer className="h-full w-full" center={defaultCenter} zoom={6} scrollWheelZoom={false} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToLocation position={currentPosition} />
      {currentPosition ? <Marker position={currentPosition} icon={markerIcon} /> : null}
    </MapContainer>
  );
}
