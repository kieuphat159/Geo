/**
 * Ẩn bớt email trên UI (dashboard admin) nhưng vẫn phân biệt được các tài khoản seed/test.
 * admin.cho-ray@geobackend.com → a***.cho-ray@ge***.com (không gộp thành adm***@ge***.com)
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

    const dot = domain.lastIndexOf(".");
    const tld = dot >= 0 ? domain.slice(dot) : "";
    const host = dot >= 0 ? domain.slice(0, dot) : domain;
    const hostHead = host.slice(0, Math.min(2, host.length));
    const domainMasked = `${hostHead}***${tld}`;

    const adminSlug = /^admin\.(.+)$/i.exec(local);
    if (adminSlug && adminSlug[1].length > 0) {
        const slug = adminSlug[1];
        const slugShown = slug.length > 14 ? `${slug.slice(0, 6)}…${slug.slice(-6)}` : slug;
        return `a***.${slugShown}@${domainMasked}`;
    }

    const localHead = local.slice(0, Math.min(3, local.length));
    const localTail = local.length > 5 ? local.slice(-3) : "";
    if (localTail && local.length > 6) {
        return `${localHead}***${localTail}@${domainMasked}`;
    }

    return `${localHead}***@${domainMasked}`;
}
