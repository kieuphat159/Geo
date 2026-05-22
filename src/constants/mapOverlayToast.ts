/** Floating map overlays (errors, hints) — top-right of the viewport. */
export const mapOverlayToastPositionClass =
    "pointer-events-auto fixed right-3 z-[710] w-[min(320px,calc(100%-1.5rem))] max-w-[430px] lg:right-4";

export const mapOverlayToastTopPrimaryClass =
    "top-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))] lg:top-3";

export const mapOverlayToastTopSecondaryClass =
    "top-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] lg:top-3";

export const mapOverlayStatusBarPositionClass =
    "pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[700] w-[min(320px,calc(100%-1.5rem))] max-w-[430px] lg:right-4";
