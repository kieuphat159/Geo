import type { EmergencyCase } from "../types/emergency";

export const mockEmergencies: EmergencyCase[] = [
  {
    id: "EC-240316-001",
    createdAt: "2026-03-16 08:05",
    priority: "CRITICAL",
    address: "14 Nguyễn Chí Thanh, Ba Đình, Hà Nội",
    latitude: 21.02673,
    longitude: 105.80552,
    distanceKm: 1.8,
    status: "WAITING",
  },
  {
    id: "EC-240316-002",
    createdAt: "2026-03-16 08:12",
    priority: "HIGH",
    address: "23 Lê Lợi, phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
    latitude: 10.77584,
    longitude: 106.70099,
    distanceKm: 3.4,
    status: "WAITING",
  },
  {
    id: "EC-240316-003",
    createdAt: "2026-03-16 08:20",
    priority: "MEDIUM",
    address: "99 Trần Phú, Hải Châu, Đà Nẵng",
    latitude: 16.06811,
    longitude: 108.22083,
    distanceKm: 4.9,
    status: "ASSIGNED",
  },
];
