/**
 * Ẩn bớt email trên UI (dashboard admin) để giảm lộ thông tin tài khoản nội bộ.
 * Ví dụ: admin.cho-ray@geobackend.com → adm***@ge***.com
 */
export function maskEmailForDisplay(email: string): string {
    const trimmed = email.trim();
    const at = trimmed.indexOf("@");
    if (at < 1) {
        return "•••";
    }

    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (!domain) {
        return "•••";
    }

    const localHead = local.slice(0, Math.min(3, local.length));
    const dot = domain.lastIndexOf(".");
    const tld = dot >= 0 ? domain.slice(dot) : "";
    const host = dot >= 0 ? domain.slice(0, dot) : domain;
    const hostHead = host.slice(0, Math.min(2, host.length));

    return `${localHead}***@${hostHead}***${tld}`;
}
