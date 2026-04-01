/**
 * In-browser mock backend for REST and WebSocket contracts.
 * Enable with VITE_USE_MOCK=true to run frontend without backend services.
 */

type JsonRecord = Record<string, unknown>;

type MockFacilityFeature = {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
    properties: {
        id: string;
        name: string;
        address: string;
        phone: string;
        facility_type: 1 | 2 | 3;
        opening_hours: string;
    };
};

const FACILITIES_PATH = "/api/facilities";
const SOS_PATH = "/api/emergency/sos";
const TRACKING_PATH = "/tracking";

const SOS_REQUEST_ID = 42;
const AMBULANCE_START: [number, number] = [10.7546, 106.6603];

const MOCK_FACILITIES: MockFacilityFeature[] = [
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6603, 10.7546] },
        properties: {
            id: "hospital-cho-ray",
            name: "Bệnh viện Chợ Rẫy",
            address: "201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP.HCM",
            phone: "028 3855 4137",
            facility_type: 1,
            opening_hours: "24/7",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6592, 10.7674] },
        properties: {
            id: "hospital-115",
            name: "Bệnh viện Nhân dân 115",
            address: "527 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
            phone: "028 3865 4249",
            facility_type: 1,
            opening_hours: "24/7",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6649, 10.7558] },
        properties: {
            id: "hospital-ump",
            name: "Bệnh viện Đại học Y Dược",
            address: "215 Hồng Bàng, Phường 11, Quận 5, TP.HCM",
            phone: "1900 6923",
            facility_type: 1,
            opening_hours: "24/7",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6879, 10.7814] },
        properties: {
            id: "clinic-fv-saigon",
            name: "Phòng khám FV Sài Gòn",
            address: "167A Nam Kỳ Khởi Nghĩa, Quận 3, TP.HCM",
            phone: "028 6291 6167",
            facility_type: 2,
            opening_hours: "07:00 - 20:00",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.7041, 10.7912] },
        properties: {
            id: "clinic-careplus",
            name: "Phòng khám CarePlus",
            address: "107 Tân Hải, Phường 13, Tân Bình, TP.HCM",
            phone: "1800 6116",
            facility_type: 2,
            opening_hours: "07:30 - 20:00",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6928, 10.7719] },
        properties: {
            id: "pharmacy-long-chau",
            name: "Nhà thuốc Long Châu",
            address: "245 Võ Thị Sáu, Quận 3, TP.HCM",
            phone: "1800 6928",
            facility_type: 3,
            opening_hours: "06:30 - 22:30",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6997, 10.7778] },
        properties: {
            id: "pharmacy-pharmacity",
            name: "Pharmacity",
            address: "168 Nguyễn Thị Minh Khai, Quận 3, TP.HCM",
            phone: "1800 6821",
            facility_type: 3,
            opening_hours: "06:00 - 23:00",
        },
    },
    {
        type: "Feature",
        geometry: { type: "Point", coordinates: [106.6822, 10.7649] },
        properties: {
            id: "pharmacy-an-khang",
            name: "Nhà thuốc An Khang",
            address: "421 Điện Biên Phủ, Quận 3, TP.HCM",
            phone: "1900 1572",
            facility_type: 3,
            opening_hours: "07:00 - 22:00",
        },
    },
];

let initialized = false;
let lastVictim: [number, number] = [10.7769, 106.7009];

function toAbsoluteUrl(input: RequestInfo | URL): URL {
    if (input instanceof URL) {
        return input;
    }

    if (typeof input === "string") {
        return new URL(input, window.location.origin);
    }

    return new URL(input.url, window.location.origin);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

async function readJsonBody(input: RequestInfo | URL, init?: RequestInit): Promise<JsonRecord> {
    if (typeof init?.body === "string") {
        try {
            return JSON.parse(init.body) as JsonRecord;
        } catch {
            return {};
        }
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
        try {
            return (await input.clone().json()) as JsonRecord;
        } catch {
            return {};
        }
    }

    return {};
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

function buildTrackingPoints(start: [number, number], target: [number, number], steps: number): [number, number][] {
    const [startLat, startLng] = start;
    const [targetLat, targetLng] = target;

    return Array.from({ length: steps }, (_, index) => {
        const ratio = (index + 1) / steps;
        const wobble = index < steps - 1 ? Math.sin(index) * 0.00018 : 0;

        return [
            startLat + (targetLat - startLat) * ratio + wobble,
            startLng + (targetLng - startLng) * ratio - wobble,
        ];
    });
}

class MockTrackingWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readonly url: string;
    readonly protocol = "";
    readonly extensions = "";

    binaryType: BinaryType = "blob";
    bufferedAmount = 0;
    readyState = MockTrackingWebSocket.CONNECTING;

    onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
    onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
    onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
    onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;

    private subscribeRequestId = SOS_REQUEST_ID;
    private streamStarted = false;
    private closed = false;
    private timerIds: number[] = [];

    constructor(url: string) {
        super();
        this.url = url;

        console.log("[MOCK] WebSocket intercepted:", url);

        const openTimer = window.setTimeout(() => {
            if (this.closed) {
                return;
            }

            this.readyState = MockTrackingWebSocket.OPEN;
            this.emitOpen();
        }, 500);

        this.timerIds.push(openTimer);
    }

    send(data: string): void {
        console.log("[MOCK] WS send:", data);

        if (this.readyState !== MockTrackingWebSocket.OPEN) {
            return;
        }

        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data) as { action?: string; request_id?: number };
                if (parsed.action === "subscribe" && typeof parsed.request_id === "number") {
                    this.subscribeRequestId = parsed.request_id;
                }
            } catch {
                // Ignore malformed payloads in mock mode.
            }
        }

        this.startStream();
    }

    close(_code?: number, _reason?: string): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.readyState = MockTrackingWebSocket.CLOSED;
        this.clearTimers();
        this.emitClose(1000, "Mock socket closed", true);
    }

    private startStream(): void {
        if (this.streamStarted || this.closed) {
            return;
        }

        this.streamStarted = true;

        const points = buildTrackingPoints(AMBULANCE_START, lastVictim, 8);
        let index = 0;

        const intervalId = window.setInterval(() => {
            if (this.closed || this.readyState !== MockTrackingWebSocket.OPEN) {
                this.clearTimers();
                return;
            }

            if (index < points.length) {
                const [lat, lng] = points[index];
                const payload = {
                    request_id: this.subscribeRequestId,
                    status: "EN_ROUTE",
                    lat,
                    lng,
                    updated_at: new Date().toISOString(),
                    eta_minutes: 8 - index,
                };

                this.emitMessage(payload);
                index += 1;
                return;
            }

            const [finalLat, finalLng] = points[points.length - 1] ?? lastVictim;
            this.emitMessage({
                request_id: this.subscribeRequestId,
                status: "COMPLETED",
                lat: finalLat,
                lng: finalLng,
                updated_at: new Date().toISOString(),
                eta_minutes: 0,
            });

            this.clearTimers();
        }, 3000);

        this.timerIds.push(intervalId);
    }

    private clearTimers(): void {
        this.timerIds.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this.timerIds = [];
    }

    private emitOpen(): void {
        const event = new Event("open");
        this.dispatchEvent(event);
        this.onopen?.call(this as unknown as WebSocket, event);
    }

    private emitClose(code: number, reason: string, wasClean: boolean): void {
        const event = new CloseEvent("close", { code, reason, wasClean });
        this.dispatchEvent(event);
        this.onclose?.call(this as unknown as WebSocket, event);
    }

    private emitMessage(payload: unknown): void {
        const event = new MessageEvent("message", {
            data: JSON.stringify(payload),
        });

        this.dispatchEvent(event);
        this.onmessage?.call(this as unknown as WebSocket, event);
    }
}

export function initMockBackend(): void {
    if (initialized) {
        return;
    }

    initialized = true;

    const originalFetch = window.fetch.bind(window);
    const originalWebSocket = window.WebSocket;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const requestUrl = toAbsoluteUrl(input);
        const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"))
            .toUpperCase()
            .trim();

        if (requestUrl.pathname.endsWith(FACILITIES_PATH) && method === "GET") {
            console.log("[MOCK] Intercepted GET", requestUrl.toString());

            return jsonResponse({
                type: "FeatureCollection",
                features: MOCK_FACILITIES,
            });
        }

        if (requestUrl.pathname.endsWith(SOS_PATH) && method === "POST") {
            console.log("[MOCK] Intercepted POST", requestUrl.toString());

            const body = await readJsonBody(input, init);
            const victimLat = toNumber(body.lat) ?? lastVictim[0];
            const victimLng = toNumber(body.lng) ?? lastVictim[1];
            lastVictim = [victimLat, victimLng];

            await sleep(1200);

            const routeCoordinates: [number, number][] = [
                [106.6603, 10.7546],
                [106.665, 10.758],
                [106.67, 10.762],
                [106.675, 10.765],
                [victimLng, victimLat],
            ];

            return jsonResponse({
                request_id: SOS_REQUEST_ID,
                hospital: {
                    name: "Bệnh viện Chợ Rẫy",
                    hotline: "028 3855 4137",
                    lat: 10.7546,
                    lng: 106.6603,
                },
                route: {
                    coordinates: routeCoordinates,
                },
                route_path: {
                    type: "LineString",
                    coordinates: routeCoordinates,
                },
                eta_minutes: 8,
            });
        }

        return originalFetch(input, init);
    };

    const PatchedWebSocket = function (this: unknown, url: string | URL, protocols?: string | string[]): WebSocket {
        const socketUrl = typeof url === "string" ? url : url.toString();

        if (socketUrl.includes(TRACKING_PATH)) {
            return new MockTrackingWebSocket(socketUrl) as unknown as WebSocket;
        }

        console.log("[MOCK] WebSocket passthrough:", socketUrl);

        if (typeof protocols === "undefined") {
            return new originalWebSocket(url);
        }

        return new originalWebSocket(url, protocols);
    } as unknown as typeof WebSocket;

    Object.defineProperties(PatchedWebSocket, {
        CONNECTING: { value: 0 },
        OPEN: { value: 1 },
        CLOSING: { value: 2 },
        CLOSED: { value: 3 },
    });

    PatchedWebSocket.prototype = originalWebSocket.prototype;
    window.WebSocket = PatchedWebSocket;

    console.log("[MOCK] Mock backend initialized");
}
