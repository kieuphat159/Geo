import { guestStrings } from "../constants/guestStrings";

interface SosButtonProps {
    onClick?: () => void;
    disabled?: boolean;
    /** floating: map-corner pill | panel: sidebar width | dock: centered bottom pill (~90vw max) */
    variant?: "floating" | "panel" | "dock";
}

function AmbulanceGlyph({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M6 16.5h-.75A2.25 2.25 0 0 1 3 14.25v-2.5A2.25 2.25 0 0 1 5.25 9.5H6L7 6h7l1 3.5h.75A2.25 2.25 0 0 1 18 11.75v2.5A2.25 2.25 0 0 1 15.75 16.5H15"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M8 16.5v1.25a1.25 1.25 0 0 0 2.5 0V16.5M13.5 16.5v1.25a1.25 1.25 0 0 0 2.5 0V16.5M10 12.5h4M12 10.5v4"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
            />
            <circle cx="7.25" cy="16.5" r="1.35" fill="currentColor" />
            <circle cx="16.75" cy="16.5" r="1.35" fill="currentColor" />
        </svg>
    );
}

export default function SosButton({ onClick, disabled = false, variant = "floating" }: SosButtonProps) {
    const containerClassName =
        variant === "dock"
            ? "relative flex w-full items-center justify-center"
            : variant === "panel"
              ? "relative flex w-full items-center justify-center"
              : "relative flex items-center justify-center";

    const pulseClassName =
        variant === "dock"
            ? "pointer-events-none absolute inset-x-1 inset-y-1 rounded-full bg-red-500/20 motion-safe:animate-pulse"
            : variant === "panel"
              ? "pointer-events-none absolute inset-x-[6%] inset-y-[12%] rounded-full bg-red-500/20 motion-safe:animate-pulse"
              : "absolute h-16 w-16 motion-safe:animate-ping rounded-full bg-red-500/35 md:h-[4.5rem] md:w-[4.5rem]";

    const buttonClassName =
        variant === "dock"
            ? "pointer-events-auto relative z-10 flex h-[52px] min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full border-2 border-white/35 bg-gradient-to-b from-red-600 to-red-900 px-7 text-base font-extrabold tracking-wide text-white shadow-[0_10px_36px_rgba(127,29,29,0.42)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-600 disabled:opacity-80 sos-emergency-dock-btn sm:px-9"
            : variant === "panel"
              ? `pointer-events-auto relative z-10 flex min-h-[3.5rem] w-full max-w-full items-center justify-center gap-2.5 rounded-full border-2 border-white/40 bg-gradient-to-b from-red-600 to-red-900 px-6 py-3 text-base font-extrabold leading-snug text-white transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-600 disabled:opacity-80 sos-emergency-panel-btn`
              : "pointer-events-auto relative z-10 flex min-h-14 min-w-[200px] items-center justify-center gap-2 rounded-full border-4 border-white/30 bg-gradient-to-b from-red-500 to-red-700 px-6 py-3 text-base font-extrabold text-white shadow-[0_14px_45px_rgba(220,38,38,0.55)] transition hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-500 md:min-w-[220px] lg:min-w-[200px] lg:px-10 lg:py-4";

    return (
        <div className={containerClassName}>
            <div className={pulseClassName}></div>
            <button
                className={buttonClassName}
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label="Emergency SOS"
            >
                <AmbulanceGlyph className="shrink-0 text-white drop-shadow-sm" />
                <span>{guestStrings.sosButton}</span>
            </button>
        </div>
    );
}
