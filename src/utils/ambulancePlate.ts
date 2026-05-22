/** Chuẩn hóa biển số — khớp backend (uppercase, không khoảng trắng). */
export function normalizeAmbulancePlate(plate: string): string {
    return plate.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidAmbulancePlate(plate: string): boolean {
    const normalized = normalizeAmbulancePlate(plate);
    if (!normalized || normalized.length > 20) return false;
    return /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$|^[A-Z0-9]{2,20}$/.test(normalized);
}

export type AmbulanceRow = { id?: number | string; plate_number?: string };

/** Giữ một bản ghi / biển số (id nhỏ nhất nếu trùng). */
export function dedupeAmbulancesByPlate<T extends AmbulanceRow>(list: T[]): T[] {
    const byPlate = new Map<string, T>();
    for (const row of list) {
        const key = normalizeAmbulancePlate(String(row.plate_number ?? ""));
        if (!key) continue;
        const prev = byPlate.get(key);
        if (!prev) {
            byPlate.set(key, row);
            continue;
        }
        const prevId = Number(prev.id);
        const nextId = Number(row.id);
        if (Number.isFinite(nextId) && (!Number.isFinite(prevId) || nextId < prevId)) {
            byPlate.set(key, row);
        }
    }
    return [...byPlate.values()].sort((a, b) =>
        normalizeAmbulancePlate(String(a.plate_number)).localeCompare(
            normalizeAmbulancePlate(String(b.plate_number)),
        ),
    );
}
