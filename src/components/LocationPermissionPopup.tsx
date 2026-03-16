interface LocationPermissionPopupProps {
  open: boolean;
  onClose: () => void;
}

export default function LocationPermissionPopup({ open, onClose }: LocationPermissionPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-[700] grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gps-help-title"
    >
      <div className="w-full max-w-lg rounded-[2rem] border border-white/50 bg-white/95 p-6 shadow-2xl shadow-slate-900/20 backdrop-blur-xl transition-transform">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
        <h2 id="gps-help-title" className="mb-2 text-xl font-bold tracking-tight text-slate-900">
          Không lấy được vị trí
        </h2>
        <p className="mb-5 leading-relaxed text-slate-600">
          Bạn vừa từ chối quyền vị trí hoặc GPS đang tắt. Để gửi tín hiệu SOS chính xác, hãy bật GPS và cấp quyền cho trình duyệt.
        </p>
        <ul className="mb-6 space-y-3 text-sm leading-relaxed text-slate-600">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-800">1</span>
            <span><strong className="text-slate-900">Android:</strong> Cài đặt &gt; Vị trí &gt; Bật Vị trí &gt; cấp quyền cho trình duyệt.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-800">2</span>
            <span><strong className="text-slate-900">iPhone:</strong> Cài đặt &gt; Quyền riêng tư &gt; Dịch vụ định vị &gt; bật cho trình duyệt.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-800">3</span>
            <span><strong className="text-slate-900">Desktop:</strong> Bấm biểu tượng khóa trên thanh địa chỉ &gt; Cho phép Vị trí.</span>
          </li>
        </ul>
        <button
          className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/30 active:translate-y-0"
          type="button"
          onClick={onClose}
        >
          Đã hiểu và thử lại
        </button>
      </div>
    </div>
  );
}
