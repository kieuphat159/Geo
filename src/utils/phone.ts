/**
 * Normalize displayed phone numbers into tel: links for click-to-call.
 */

export function digitsOnlyPhone(value: string): string {
    return value.replace(/\D/g, "");
}

/** Returns tel: href when the string contains enough digits for a call, otherwise null. */
export function telHrefFromDisplay(value: string | null | undefined): string | null {
    if (!value || !value.trim()) {
        return null;
    }

    let digits = digitsOnlyPhone(value);
    if (digits.length < 9 || digits.length > 15) {
        const match = value.match(/(?:\+?84|0)\s*\d[\d\s.\-]{7,}\d/);
        if (match) {
            digits = digitsOnlyPhone(match[0]);
        }
    }

    if (digits.length < 9 || digits.length > 15) {
        return null;
    }

    return `tel:${digits}`;
}
