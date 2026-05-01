export type EmergencyPriority = "CRITICAL" | "HIGH" | "MEDIUM";
export type EmergencyStatus = "WAITING" | "ASSIGNED" | "ON_THE_WAY" | "ARRIVED" | "COMPLETED";

export interface EmergencyCase {
  id: string;
  createdAt: string;
  priority: EmergencyPriority;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  status: EmergencyStatus;
    tracking_token?: string;
    assigned_ambulance_id?: number | null;
    done_at?: string | null;
    requester_name?: string | null;
    requester_age?: number | null;
    requester_emergency_contact_phone?: string | null;
    medical_profile?: {
      blood_type?: string | null;
      allergies?: string | null;
      chronic_conditions?: string | null;
    } | null;
}
