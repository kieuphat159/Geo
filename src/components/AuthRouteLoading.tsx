/** Shown while route guards resolve session / refresh token (avoids blank screen after login). */
export default function AuthRouteLoading() {
    return (
        <main className="min-h-dvh grid place-items-center bg-slate-100 p-6">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
                <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600"
                    role="status"
                    aria-label="Đang tải"
                />
                <p className="text-sm font-medium text-slate-600">Đang xác thực phiên đăng nhập...</p>
            </div>
        </main>
    );
}
