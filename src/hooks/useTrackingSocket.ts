/**
 * WebSocket hook for SOS request tracking with auto-reconnect and event filtering.
 */

import { useEffect, useRef, useState } from "react";
import type { TrackingSocketEvent } from "../types/guest";

export type TrackingConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

interface UseTrackingSocketOptions {
    requestId: number | null;
    enabled: boolean;
    onEvent: (event: TrackingSocketEvent) => void;
}

const TRACKING_PATH = "/tracking";

function resolveTrackingSocketUrl(): string {
    const configuredUrl = import.meta.env.VITE_WS_URL;

    if (configuredUrl) {
        const normalized = new URL(
            configuredUrl,
            typeof window !== "undefined" ? window.location.origin : "http://localhost:8080",
        );

        if (normalized.protocol === "http:") {
            normalized.protocol = "ws:";
        }

        if (normalized.protocol === "https:") {
            normalized.protocol = "wss:";
        }

        if (!normalized.pathname || normalized.pathname === "/") {
            normalized.pathname = TRACKING_PATH;
        }

        return normalized.toString();
    }

    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:8080";
    return `${protocol}//${host}${TRACKING_PATH}`;
}

export function useTrackingSocket({ requestId, enabled, onEvent }: UseTrackingSocketOptions): {
    connectionState: TrackingConnectionState;
    isReconnecting: boolean;
} {
    const [connectionState, setConnectionState] = useState<TrackingConnectionState>("idle");

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const shouldReconnectRef = useRef(false);
    const onEventRef = useRef(onEvent);

    onEventRef.current = onEvent;

    useEffect(() => {
        if (!enabled || requestId === null) {
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

            const socket = new WebSocket(resolveTrackingSocketUrl());
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttemptsRef.current = 0;
                setConnectionState("connected");

                // Backend contract: subscribe to a request-specific tracking channel.
                socket.send(
                    JSON.stringify({
                        action: "subscribe",
                        request_id: requestId,
                    }),
                );
            };

            socket.onmessage = (event) => {
                let parsed: unknown;

                try {
                    parsed = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (!parsed || typeof parsed !== "object") {
                    return;
                }

                const trackingEvent = parsed as Partial<TrackingSocketEvent>;
                if (trackingEvent.request_id !== requestId) {
                    return;
                }

                onEventRef.current(trackingEvent as TrackingSocketEvent);
            };

            socket.onclose = () => {
                socketRef.current = null;

                if (!shouldReconnectRef.current) {
                    setConnectionState("disconnected");
                    return;
                }

                reconnectAttemptsRef.current += 1;
                const backoffMs = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000);
                setConnectionState("reconnecting");
                reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
            };

            socket.onerror = () => {
                socket.close();
            };
        };

        connect();

        return () => {
            shouldReconnectRef.current = false;
            clearReconnectTimer();

            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }

            setConnectionState("disconnected");
        };
    }, [enabled, requestId]);

    return {
        connectionState,
        isReconnecting: connectionState === "reconnecting",
    };
}
