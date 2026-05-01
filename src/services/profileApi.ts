import { authorizedFetch } from "./auth";

function resolveApiUrl(pathname: string): URL {
  const configuredBaseUrl = import.meta.env.VITE_API_URL;
  const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  return new URL(pathname, configuredBaseUrl || fallbackBaseUrl);
}

export interface UserMedicalProfile {
  full_name: string;
  age: number | null;
  emergency_contact_phone: string;
  blood_type: string;
  chronic_conditions: string;
  allergies: string;
}

export async function getMyProfile(): Promise<UserMedicalProfile | null> {
  const response = await authorizedFetch(resolveApiUrl("/api/profile/me").toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || "Không thể tải hồ sơ");
  return payload?.data ?? null;
}

export async function saveMyProfile(profile: Partial<UserMedicalProfile>): Promise<UserMedicalProfile> {
  const response = await authorizedFetch(resolveApiUrl("/api/profile/me").toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(profile),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || "Không thể cập nhật hồ sơ");
  return payload.data as UserMedicalProfile;
}
