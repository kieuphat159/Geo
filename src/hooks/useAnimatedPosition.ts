/**
 * Smoothly interpolates marker positions so real-time ambulance updates do not jump.
 */

import { useEffect, useRef, useState } from "react";

type LatLng = [number, number];

export function useAnimatedPosition(target: LatLng | null, durationMs = 700): LatLng | null {
    const [position, setPosition] = useState<LatLng | null>(target);
    const frameRef = useRef<number | null>(null);
    const positionRef = useRef<LatLng | null>(target);

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        if (!target) {
            return;
        }

        if (!positionRef.current) {
            setPosition(target);
            positionRef.current = target;
            return;
        }

        const [startLat, startLng] = positionRef.current;
        const [endLat, endLng] = target;
        const startedAt = performance.now();

        const step = (currentTime: number) => {
            const elapsed = currentTime - startedAt;
            const progress = Math.min(elapsed / durationMs, 1);

            const nextLat = startLat + (endLat - startLat) * progress;
            const nextLng = startLng + (endLng - startLng) * progress;

            const nextPosition: LatLng = [nextLat, nextLng];
            positionRef.current = nextPosition;
            setPosition(nextPosition);

            if (progress < 1) {
                frameRef.current = window.requestAnimationFrame(step);
            }
        };

        frameRef.current = window.requestAnimationFrame(step);

        return () => {
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [durationMs, target]);

    return position;
}
