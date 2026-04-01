import { guestStrings } from "../constants/guestStrings";

interface SosButtonProps {
    onClick?: () => void;
    disabled?: boolean;
    variant?: "floating" | "panel";
}

export default function SosButton({ onClick, disabled = false, variant = "floating" }: SosButtonProps) {
    const containerClassName =
        variant === "panel"
            ? "relative flex w-full items-center justify-center"
            : "relative flex items-center justify-center";

    const pulseClassName =
        variant === "panel"
            ? "absolute h-20 w-[78%] animate-ping rounded-3xl bg-red-500/20"
            : "absolute h-24 w-24 animate-ping rounded-full bg-red-500/35";

    const buttonClassName =
        variant === "panel"
            ? "pointer-events-auto relative z-10 flex min-h-14 w-full items-center justify-center rounded-xl border-4 border-white/30 bg-gradient-to-b from-red-500 to-red-700 px-6 py-3 text-base font-extrabold text-white shadow-[0_14px_45px_rgba(220,38,38,0.55)] transition hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-500"
            : "pointer-events-auto relative z-10 flex min-h-14 min-w-[200px] items-center justify-center rounded-full border-4 border-white/30 bg-gradient-to-b from-red-500 to-red-700 px-6 py-3 text-base font-extrabold text-white shadow-[0_14px_45px_rgba(220,38,38,0.55)] transition hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-500 md:min-w-[220px] lg:min-w-[200px] lg:px-10 lg:py-4";

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
                {guestStrings.sosButton}
            </button>
        </div>
    );
}
