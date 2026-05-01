import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import FacilityAdminModal from "../components/FacilityAdminModal";
import * as adminApi from "../services/adminApi";
import { clearSession } from "../services/auth";

type ManagedUser = {
  id: number;
  email: string;
  role_id: number;
  facility_id?: number | null;
  MedicalFacility?: { id: number; name: string; type: string } | null;
};

type ManagedFacility = {
  id: number | string;
  name: string;
  type: number;
  is_active?: boolean;
};

type FacilityFilter = "all" | 1 | 2 | 3;

function getFacilityTypeLabel(type: number) {
  if (type === 1) return "Bệnh viện";
  if (type === 2) return "Phòng khám";
  if (type === 3) return "Nhà thuốc";
  return "Khác";
}

function isAbortError(error: unknown) {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("abort");
}

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [facilities, setFacilities] = useState<ManagedFacility[]>([]);
  const [facilityFilter, setFacilityFilter] = useState<FacilityFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [facilityId, setFacilityId] = useState<number | "">("");

  const loadData = async (signal?: AbortSignal) => {
    const [facilityResult, userResult] = await Promise.allSettled([
      adminApi.fetchFacilitiesAdmin(signal),
      adminApi.fetchUsers(signal),
    ]);

    let unauthorized = false;
    const loadErrors: string[] = [];

    if (facilityResult.status === "fulfilled") {
      setFacilities((facilityResult.value || []) as ManagedFacility[]);
    } else {
      if (isAbortError(facilityResult.reason) || signal?.aborted) {
        return;
      }
      const message = facilityResult.reason instanceof Error ? facilityResult.reason.message : "";
      unauthorized = unauthorized || message.includes("401");
      loadErrors.push("không tải được danh sách cơ sở y tế");
    }

    if (userResult.status === "fulfilled") {
      setUsers((userResult.value || []) as ManagedUser[]);
    } else {
      if (isAbortError(userResult.reason) || signal?.aborted) {
        return;
      }
      const message = userResult.reason instanceof Error ? userResult.reason.message : "";
      unauthorized = unauthorized || message.includes("401");
      loadErrors.push("không tải được danh sách tài khoản");
    }

    if (unauthorized) {
      clearSession();
      navigate("/login", { replace: true });
      return;
    }

    if (loadErrors.length > 0) {
      throw new Error(`Không thể tải dữ liệu quản trị toàn hệ thống: ${loadErrors.join(", ")}`);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    loadData(controller.signal).catch((e) => {
      if (controller.signal.aborted || isAbortError(e)) {
        return;
      }
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu quản trị toàn hệ thống");
    });
    return () => controller.abort();
  }, [navigate]);

  const hospitalFacilities = useMemo(
    () => facilities.filter((f) => Number(f.type) === 1),
    [facilities],
  );

  const onlineCount = useMemo(
    () => facilities.filter((f) => f.is_active !== false).length,
    [facilities],
  );

  const filteredFacilities = useMemo(() => {
    if (facilityFilter === "all") return facilities;
    return facilities.filter((f) => Number(f.type) === Number(facilityFilter));
  }, [facilities, facilityFilter]);

  const createAdmin = async () => {
    if (!email || !password || !facilityId) {
      setError("Vui lòng nhập đủ email, mật khẩu và bệnh viện");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await adminApi.createHospitalAdmin({
        email,
        password,
        facility_id: Number(facilityId),
      });
      setEmail("");
      setPassword("");
      setFacilityId("");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo tài khoản Admin bệnh viện");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-dvh bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Dashboard Quản trị toàn hệ thống</h1>
              <p className="mt-1 text-sm text-slate-600">
                Quản lý cơ sở y tế, tài khoản admin bệnh viện và theo dõi trạng thái hoạt động.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/user"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Về trang chủ
              </Link>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={handleLogout}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Tổng cơ sở y tế</p>
            <p className="mt-1 text-2xl font-bold">{facilities.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Đang Online</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{onlineCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Admin bệnh viện</p>
            <p className="mt-1 text-2xl font-bold">{users.filter((u) => u.role_id === 2).length}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex h-[560px] min-h-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Quản lý cơ sở y tế</h2>
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setAdminOpen(true)}
              >
                CRUD Cơ sở y tế
              </button>
            </div>
            <div className="mt-3">
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-64"
                value={String(facilityFilter)}
                onChange={(e) =>
                  setFacilityFilter(
                    e.target.value === "all" ? "all" : (Number(e.target.value) as FacilityFilter),
                  )
                }
                aria-label="Lọc loại cơ sở y tế"
              >
                <option value="all">Tất cả loại cơ sở</option>
                <option value="1">Bệnh viện</option>
                <option value="2">Phòng khám</option>
                <option value="3">Nhà thuốc</option>
              </select>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-slate-500">
                  <tr>
                    <th className="py-2">Tên cơ sở</th>
                    <th className="py-2">Loại</th>
                    <th className="py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFacilities.map((f) => (
                    <tr key={String(f.id)} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{f.name}</td>
                      <td className="py-2">{getFacilityTypeLabel(Number(f.type))}</td>
                      <td className="py-2">
                        {f.is_active === false ? (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Offline</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Online</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex h-[560px] min-h-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Tạo tài khoản Admin bệnh viện</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Email admin"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Mật khẩu"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <select
                className="rounded-lg border border-slate-200 px-3 py-2"
                aria-label="Chọn bệnh viện cho admin"
                value={facilityId === "" ? "" : String(facilityId)}
                onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Chọn bệnh viện</option>
                {hospitalFacilities.map((f) => (
                  <option key={String(f.id)} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:bg-indigo-300"
                onClick={createAdmin}
                disabled={creating}
              >
                {creating ? "Đang tạo..." : "Tạo tài khoản"}
              </button>
            </div>
            {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

            <div className="mt-5 min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-slate-500">
                  <tr>
                    <th className="py-2">Email</th>
                    <th className="py-2">Vai trò</th>
                    <th className="py-2">Cơ sở</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter((u) => u.role_id === 2)
                    .map((u) => (
                      <tr key={u.id} className="border-t border-slate-100">
                        <td className="py-2">{u.email}</td>
                        <td className="py-2">ADMIN</td>
                        <td className="py-2">{u.MedicalFacility?.name ?? "Chưa gán cơ sở"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <FacilityAdminModal open={adminOpen} onClose={() => setAdminOpen(false)} />
    </main>
  );
}
