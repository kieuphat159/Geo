/**
 * Guest list hygiene: hide obvious automated / E2E seed facility rows from the map UX.
 */
export function isGuestPresentableFacilityName(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
        return false;
    }

    if (/^E2E\s+Facility\b/i.test(trimmed)) {
        return false;
    }

    return true;
}

export type FacilityOpenGuess = "open" | "closed" | null;

/**
 * Best-effort open/closed hint from free-text opening hours (no routing API).
 */
export function inferFacilityOpenGuess(openingHours: string | undefined, fallbackLabel: string): FacilityOpenGuess {
    if (!openingHours || openingHours.trim() === "" || openingHours.trim() === fallbackLabel) {
        return null;
    }

    const h = openingHours.trim();

    if (/24\s*\/\s*7|24\s*h|cả\s*ngày|không\s*ngừng|mở\s*cửa\s*24/i.test(h)) {
        return "open";
    }

    if (/đóng\s*cửa|tạm\s*ngừng|ngừng\s*hoạt\s*động|nghỉ\s*lễ/i.test(h)) {
        return "closed";
    }

    const range =
        h.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/) ||
        h.match(/^(\d{1,2})h(\d{2})?\s*[-–—]\s*(\d{1,2})h(\d{2})?$/i) ||
        h.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/) ||
        h.match(/(\d{1,2})h(\d{2})?\s*[-–—]\s*(\d{1,2})h(\d{2})?/i);
    if (!range) {
        return null;
    }

    const startMinutes = Number(range[1]) * 60 + Number(range[2] || "0");
    const endMinutes = Number(range[3]) * 60 + Number(range[4] || "0");
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    if (endMinutes >= startMinutes) {
        return current >= startMinutes && current <= endMinutes ? "open" : "closed";
    }

    return current >= startMinutes || current <= endMinutes ? "open" : "closed";
}
