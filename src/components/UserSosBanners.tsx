interface UserSosBannersProps {
    linkBanner: {
        visible: boolean;
        isActive: boolean;
        requestId: number | null;
    };
    showTrackingBanner: boolean;
    trackingRequestId: number | null;
    onLinkAnonymousSos: () => void;
    onViewTracking: () => void;
    onStopSharing: () => void;
    className?: string;
}

export default function UserSosBanners({
    linkBanner,
    showTrackingBanner,
    trackingRequestId,
    onLinkAnonymousSos,
    onViewTracking,
    onStopSharing,
    className = "",
}: UserSosBannersProps) {
    if (!linkBanner.visible && !showTrackingBanner) {
        return null;
    }

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {linkBanner.visible && linkBanner.requestId !== null ? (
                <div
                    className={`rounded-xl border px-3 py-2.5 text-xs leading-snug shadow-sm ${
                        linkBanner.isActive
                            ? "border-red-200 bg-red-50 text-red-950"
                            : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                    role="status"
                >
                    <p className="font-semibold">
                        {linkBanner.isActive
                            ? "🚨 Bạn có một yêu cầu SOS đang xử lý từ lúc chưa đăng nhập."
                            : "📋 Bạn có một yêu cầu SOS trước đó từ thiết bị này chưa liên kết tài khoản."}
                    </p>
                    <button
                        type="button"
                        className="mt-2 text-left text-[11px] font-bold underline decoration-2 underline-offset-2 hover:opacity-80"
                        onClick={onLinkAnonymousSos}
                    >
                        Liên kết để theo dõi →
                    </button>
                </div>
            ) : null}

            {showTrackingBanner && trackingRequestId !== null ? (
                <div
                    className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs leading-snug text-violet-950 shadow-sm"
                    role="status"
                >
                    <p className="font-semibold">
                        📍 Hệ thống đang ghi nhận vị trí của bạn cho ca cấp cứu #{trackingRequestId}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-lg bg-violet-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-700"
                            onClick={onViewTracking}
                        >
                            Xem chi tiết
                        </button>
                        <button
                            type="button"
                            className="rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100"
                            onClick={onStopSharing}
                        >
                            Dừng chia sẻ
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
