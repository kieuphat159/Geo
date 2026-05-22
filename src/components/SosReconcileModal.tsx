interface SosReconcileModalProps {
    open: boolean;
    isActive: boolean;
    requestId: number;
    loading: boolean;
    error: string | null;
    onDecline: () => void;
    onConfirm: () => void;
}

export default function SosReconcileModal({
    open,
    isActive,
    requestId,
    loading,
    error,
    onDecline,
    onConfirm,
}: SosReconcileModalProps) {
    if (!open) {
        return null;
    }

    const title = isActive
        ? "Liên kết SOS đang xử lý?"
        : "Liên kết SOS vào tài khoản?";

    const body = isActive
        ? "Chúng tôi phát hiện bạn đã gửi SOS khẩn cấp từ thiết bị này và ca vẫn đang được xử lý. Liên kết vào tài khoản giúp điều phối viên biết danh tính khi cần gọi lại."
        : "Chúng tôi phát hiện bạn đã gửi SOS trước đó từ thiết bị này. Bạn có muốn liên kết vào tài khoản để xem lại lịch sử không?";

    return (
        <div
            className="fixed inset-0 z-[2000] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sos-reconcile-title"
        >
            <article className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h2 id="sos-reconcile-title" className={`text-lg font-bold ${isActive ? "text-red-800" : "text-slate-900"}`}>
                    {title}
                </h2>
                <p className="mt-2 text-sm text-slate-600">{body}</p>
                <p className="mt-2 text-xs text-slate-500">Mã ca: #{requestId}</p>
                {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                    <button
                        type="button"
                        className="h-11 flex-1 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-400"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "Đang liên kết..." : "Đồng ý liên kết"}
                    </button>
                    <button
                        type="button"
                        className="h-11 flex-1 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                        onClick={onDecline}
                        disabled={loading}
                    >
                        Giữ ẩn danh
                    </button>
                </div>
            </article>
        </div>
    );
}
