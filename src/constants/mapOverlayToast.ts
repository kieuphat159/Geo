/** Viewport top-right slot for map status bar (non-dismissible). */
export const mapOverlayStatusBarPositionClass =
    "pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[700] w-[min(360px,calc(100%-1.5rem))] max-w-[430px] lg:right-4";

/** @deprecated Use AppToast stack="primary" — kept for MapOverlayToast call sites. */
export const mapOverlayToastTopPrimaryClass = "primary";

/** @deprecated Use AppToast stack="secondary" — kept for MapOverlayToast call sites. */
export const mapOverlayToastTopSecondaryClass = "secondary";
