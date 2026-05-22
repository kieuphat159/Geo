export type GeolocationPermissionState = PermissionState | "unknown";

const GEOLOCATION_PERMISSION: PermissionDescriptor = { name: "geolocation" };

/** Starts getCurrentPosition synchronously — call directly from a click handler. */
export function startGpsPositionRequest(): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("Geolocation is unavailable."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve([position.coords.latitude, position.coords.longitude]);
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0,
            },
        );
    });
}

export async function queryGeolocationPermissionState(): Promise<GeolocationPermissionState> {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        return "unknown";
    }

    try {
        const status = await navigator.permissions.query(GEOLOCATION_PERMISSION);
        return status.state;
    } catch {
        return "unknown";
    }
}

export function watchGeolocationPermission(onChange: (state: GeolocationPermissionState) => void): () => void {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        return () => undefined;
    }

    let disposed = false;
    let permissionStatus: PermissionStatus | null = null;

    const handleChange = () => {
        if (permissionStatus) {
            onChange(permissionStatus.state);
        }
    };

    void navigator.permissions.query(GEOLOCATION_PERMISSION).then((status) => {
        if (disposed) {
            return;
        }

        permissionStatus = status;
        onChange(status.state);
        status.addEventListener("change", handleChange);
    });

    return () => {
        disposed = true;
        permissionStatus?.removeEventListener("change", handleChange);
    };
}

export function isGeolocationDeniedError(error: unknown): boolean {
    return (error as GeolocationPositionError | undefined)?.code === 1;
}
