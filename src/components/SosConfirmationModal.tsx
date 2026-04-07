/**
 * Modal used by UC1 to confirm phone and location before sending SOS request.
 */

import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { guestStrings } from "../constants/guestStrings";
import { userLocationIcon } from "../utils/mapIcons";

interface SosConfirmationModalProps {
    open: boolean;
    position: [number, number] | null;
    phone: string;
    phoneError: string | null;
    isSubmitting: boolean;
    submitError: string | null;
    onPhoneChange: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}

function formatCoordinate(value: number): string {
    return value.toFixed(6);
}

export default function SosConfirmationModal({
    open,
    position,
    phone,
    phoneError,
    isSubmitting,
    submitError,
    onPhoneChange,
    onCancel,
    onConfirm,
}: SosConfirmationModalProps) {
    if (!open || !position) {
        return null;
    }

    return (
        <div
            className="absolute inset-0 z-[740] grid place-items-end bg-slate-900/45 p-3 backdrop-blur-sm sm:place-items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sos-confirm-title"
        >
            <article className="w-full max-w-[430px] rounded-3xl bg-white p-4 shadow-2xl">
                <h2 id="sos-confirm-title" className="text-lg font-bold text-slate-900">
                    {guestStrings.sosModalTitle}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{guestStrings.sosModalSubtitle}</p>

                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                    <MapContainer
                        className="h-44 w-full"
                        center={position}
                        zoom={16}
                        dragging={false}
                        doubleClickZoom={false}
                        scrollWheelZoom={false}
                        zoomControl={false}
                        attributionControl={false}
                    >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={position} icon={userLocationIcon} />
                    </MapContainer>
                </div>

                <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-sm">
                    <dt className="font-semibold text-slate-500">{guestStrings.latitudeLabel}</dt>
                    <dd className="font-mono text-slate-800">{formatCoordinate(position[0])}</dd>
                    <dt className="font-semibold text-slate-500">{guestStrings.longitudeLabel}</dt>
                    <dd className="font-mono text-slate-800">{formatCoordinate(position[1])}</dd>
                </dl>

                <label className="mt-3 block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">
                        {guestStrings.sosPhoneLabel}
                    </span>
                    <input
                        className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-500"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={phone}
                        placeholder={guestStrings.sosPhonePlaceholder}
                        onChange={(event) => onPhoneChange(event.target.value)}
                    />
                </label>

                {phoneError ? <p className="mt-2 text-xs font-semibold text-red-600">{phoneError}</p> : null}
                {submitError ? <p className="mt-2 text-xs font-semibold text-red-600">{submitError}</p> : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        className="min-h-12 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                        type="button"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        {guestStrings.sosCancel}
                    </button>
                    <button
                        className="min-h-12 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
                        type="button"
                        onClick={onConfirm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? guestStrings.sosSending : guestStrings.sosConfirm}
                    </button>
                </div>
            </article>
        </div>
    );
}
