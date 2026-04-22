import { Link } from "react-router-dom";
import EmergencyTable from "../components/EmergencyTable";
import { useEffect, useState } from "react";
import * as adminApi from "../services/adminApi";
import FacilityAdminModal from "../components/FacilityAdminModal";

export default function HospitalDashboardPage() {
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    let prevWaitingCount = 0;

    async function pollOnce() {
      try {
        const rows = await adminApi.fetchEmergencies(controller.signal);
        if (!mounted) return;
        const waiting = (rows || []).filter((r: any) => r.status === "WAITING");
        if (waiting.length > prevWaitingCount) {
          setShowAlert(true);
          window.setTimeout(() => setShowAlert(false), 5000);
        }

        prevWaitingCount = waiting.length;
        setEmergencies(rows || []);
        setPollError(null);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setPollError("Không thể tải danh sách ca cấp cứu");
      }
    }

    pollOnce();
    const timer = window.setInterval(pollOnce, 8000);

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="min-h-dvh bg-slate-50 p-4 font-sans text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                <path fillRule="evenodd" d="M11.622 1.602a.73.73 0 01.756 0l2.25 1.313a.75.75 0 00.756 0l2.25-1.313a.73.73 0 01.756 0l2.25 1.313c.225.131.531.131.756 0l2.25-1.313a.73.73 0 01.756 0l2.25 1.313c.225.131.531.131.756 0l2.25-1.313a.73.73 0 01.756 0l2.25 1.313c.225.131.531.131.756 0a.75.75 0 000 1.313l-2.25 1.313a.73.73 0 01-.756 0l-2.25-1.313a.75.75 0 00-.756 0l-2.25 1.313a.73.73 0 01-.756 0l-2.25-1.313a.75.75 0 00-.756 0l-2.25 1.313a.73.73 0 01-.756 0l-2.25-1.313a.75.75 0 00-.756 0l-2.25 1.313a.73.73 0 01-.756 0L.988 2.915a.75.75 0 00-.756 0L1.622 1.602zM12 4.5a3 3 0 100 6 3 3 0 000-6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Trung tâm điều phối</h1>
              <p className="mt-0.5 text-sm text-slate-500">Màn hình chờ nhận và điều phối xe cấp cứu</p>
            </div>
          </div>
          <Link
            className="inline-flex max-w-max items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95"
            to="/user"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Màn hình người dùng
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] xl:grid-cols-[1.8fr_1fr]">
          <section className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-white px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Danh sách ca cấp cứu</h2>
              <p className="mt-1 text-sm text-slate-500">Các yêu cầu đang chờ phản hồi từ trung tâm</p>
              <div className="mt-3 flex items-center gap-2">
                <button className="rounded-lg bg-emerald-600 px-3 py-2 text-white" onClick={() => setAdminOpen(true)}>
                  Quản lý cơ sở
                </button>
              </div>
            </div>
            <div className="bg-slate-50/30 p-6 flex-1">
              {pollError ? <div className="text-red-600">{pollError}</div> : null}
              <EmergencyTable rows={emergencies} />
            </div>
          </section>

          <section
            className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            aria-label="Bản đồ theo dõi"
          >
            <div className="border-b border-slate-100 bg-white px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Bản đồ điều phối</h2>
              <p className="mt-1 text-sm text-slate-500">Import cái map vào đây</p>
            </div>
            <div className="p-6 flex-1 flex flex-col relative">
              <div className="absolute inset-x-6 bottom-6 top-6 grid place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <div className="text-center px-6">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100/80 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.705V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                    </svg>
                  </div>
                  <span className="block text-base font-semibold text-slate-700">Vùng tích hợp bản đồ</span>
                  <p className="mt-2 max-w-[240px] mx-auto text-sm leading-relaxed text-slate-500">
                    Nhúng cái map vào đây
                  </p>
                </div>
              </div>
              {/* Spacer matching absolute positioned content */}
              <div className="min-h-[360px] w-full"></div>
            </div>
          </section>
        </div>
      </div>
      {showAlert ? (
        <div className="fixed right-6 top-6 z-[950] rounded-xl bg-red-600 px-4 py-3 text-white shadow-lg">
          <strong>Có ca cấp cứu mới đang chờ xử lý</strong>
        </div>
      ) : null}

      <FacilityAdminModal open={adminOpen} onClose={() => setAdminOpen(false)} />
    </main>
  );
}
