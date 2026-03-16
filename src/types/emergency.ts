export type EmergencyPriority = "CRITICAL" | "HIGH" | "MEDIUM";
export type EmergencyStatus = "WAITING" | "ASSIGNED" | "ON_THE_WAY";

export interface EmergencyCase {
  id: string;
  createdAt: string;
  priority: EmergencyPriority;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  status: EmergencyStatus;
}
