import type { Facility, FacilityType } from "../types/guest";

export function normalizeFacilityType(type: unknown): FacilityType {
    const n = Number(type);
    if (n === 1 || n === 2 || n === 3) {
        return n as FacilityType;
    }
    if (type === "hospital") return 1;
    if (type === "clinic") return 2;
    if (type === "pharmacy") return 3;
    return 1;
}

/** Loại bỏ bản ghi trùng `id` (giữ bản mới nhất trong mảng). */
export function dedupeFacilitiesById(rows: Facility[]): Facility[] {
    const byId = new Map<string, Facility>();
    for (const row of rows) {
        if (row.id === undefined || row.id === null || row.id === "") {
            continue;
        }
        byId.set(String(row.id), row);
    }
    return Array.from(byId.values());
}

/** Cập nhật hoặc chèn một cơ sở; `fallbackId` dùng khi API không trả `id`. */
export function upsertFacilityInList(
    list: Facility[],
    next: Facility,
    fallbackId?: string | number,
): Facility[] {
    const resolvedId = next.id ?? fallbackId;
    if (resolvedId === undefined || resolvedId === null || resolvedId === "") {
        return dedupeFacilitiesById([next, ...list]);
    }

    const normalized: Facility = {
        ...next,
        id: resolvedId,
        type: normalizeFacilityType(next.type),
    };

    const rest = list.filter((f) => String(f.id) !== String(resolvedId));
    return dedupeFacilitiesById([normalized, ...rest]);
}
