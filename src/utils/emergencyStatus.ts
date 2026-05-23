import type { EmergencyCase, EmergencyStatus } from "../types/emergency";

/** Chuẩn hóa status từ API (pending, WAITING, …) về enum UI. */
export function normalizeEmergencyStatus(raw: unknown): EmergencyStatus {
    const s = String(raw ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");

    if (s === "PENDING" || s === "WAITING") return "WAITING";
    if (s === "ASSIGNED") return "ASSIGNED";
    if (s === "ON_THE_WAY") return "ON_THE_WAY";
    if (s === "IN_PROGRESS") return "ON_THE_WAY";
    if (s === "ARRIVED") return "ARRIVED";
    if (s === "COMPLETED" || s === "DONE") return "COMPLETED";
    if (s === "CANCELLED") return "COMPLETED";
    return "WAITING";
}

export function isWaitingForDispatch(status: unknown): boolean {
    return normalizeEmergencyStatus(status) === "WAITING";
}

export function normalizeEmergencyRow<T extends { status?: unknown }>(row: T): T & { status: EmergencyStatus } {
    return { ...row, status: normalizeEmergencyStatus(row.status) };
}

export function normalizeEmergencyRows(rows: EmergencyCase[]): EmergencyCase[] {
    return rows.map((row) => normalizeEmergencyRow(row));
}
