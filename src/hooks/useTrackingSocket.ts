/**
 * WebSocket hook for SOS request tracking with auto-reconnect and event filtering.
 */

import { useEffect, useRef, useState } from "react";
import type { TrackingSocketEvent } from "../types/guest";
import { io, type Socket } from "socket.io-client";

export type TrackingConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

interface UseTrackingSocketOptions {
    requestId: number | null;
    enabled: boolean;
    trackingToken?: string | null;
    onEvent: (event: TrackingSocketEvent) => void;
}

function resolveTrackingSocketUrl(): string {
    const configuredUrl = import.meta.env.VITE_WS_URL;

    if (configuredUrl) {
        const normalized = new URL(
            configuredUrl,
            typeof window !== "undefined" ? window.location.origin : "http://localhost:8080",
        );

        // socket.io-client expects HTTP(S) origins.
        if (normalized.protocol === "ws:") {
            normalized.protocol = "http:";
        }

        if (normalized.protocol === "wss:") {
            normalized.protocol = "https:";
        }

        if (!normalized.pathname || normalized.pathname === "/") {
            // Keep default socket.io path.
        }

        return normalized.toString();
    }

    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https:" : "http:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:8080";
    return `${protocol}//${host}`;
}

export function useTrackingSocket({ requestId, enabled, trackingToken, onEvent }: UseTrackingSocketOptions): {
    connectionState: TrackingConnectionState;
    isReconnecting: boolean;
} {
    const [connectionState, setConnectionState] = useState<TrackingConnectionState>("idle");

    const socketRef = useRef<Socket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const shouldReconnectRef = useRef(false);
    const onEventRef = useRef(onEvent);

    onEventRef.current = onEvent;

    useEffect(() => {
        if (!enabled || requestId === null || !onEvent) {
            setConnectionState("idle");
            return;
        }

        shouldReconnectRef.current = true;

        const clearReconnectTimer = () => {
            if (reconnectTimerRef.current !== null) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };

        const connect = () => {
            clearReconnectTimer();
            setConnectionState(reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting");

            const socket = io(resolveTrackingSocketUrl(), {
                transports: ["websocket"],
                autoConnect: true,
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 500,
            });
            socketRef.current = socket;

            const safeRequestId = requestId;

            socket.on("connect", () => {
                reconnectAttemptsRef.current = 0;
                setConnectionState("connected");

                if (typeof trackingToken === "string" && trackingToken.trim()) {
                    socket.emit("join_request_room", { requestId: safeRequestId, token: trackingToken });
                } else {
                    // Without token we can't join request room.
                    socket.emit("error", "Missing tracking token");
                }
            });

            socket.on("tracking_update", (payload: any) => {
                const emergencyRequestId = payload?.emergency_request_id ?? payload?.request_id ?? safeRequestId;
                if (Number(emergencyRequestId) !== safeRequestId) return;

                onEventRef.current({
                    ambulance_id: payload?.ambulance_id,
                    request_id: safeRequestId,
                    lat: payload?.lat,
                    lng: payload?.lng,
                    updated_at: payload?.timestamp,
                    eta_minutes: payload?.eta_minutes,
                    status: payload?.status,
                });
            });

            socket.on("tracking_ended", () => {
                onEventRef.current({
                    request_id: safeRequestId,
                    status: "COMPLETED",
                });
            });

            socket.io.on("reconnect_attempt", () => {
                setConnectionState("reconnecting");
            });

            socket.on("disconnect", () => {
                socketRef.current = null;
                if (!shouldReconnectRef.current) {
                    setConnectionState("disconnected");
                } else {
                    setConnectionState("reconnecting");
                }
            });
        };

        const handleOffline = () => {
            setConnectionState("reconnecting");
        };

        const handleOnline = () => {
            if (socketRef.current && !socketRef.current.connected) {
                setConnectionState("connecting");
                socketRef.current.connect();
            }
        };

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);

        connect();

        return () => {
            shouldReconnectRef.current = false;
            clearReconnectTimer();
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);

            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            setConnectionState("disconnected");
        };
    }, [enabled, requestId, trackingToken]);

    return {
        connectionState,
        isReconnecting: connectionState === "reconnecting",
    };
}
