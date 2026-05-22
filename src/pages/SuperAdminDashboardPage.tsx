import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppModal from "../components/AppModal";
import AppPageShell from "../components/AppPageShell";
import FacilityAdminModal, { type FacilityAdminModalIntent } from "../components/FacilityAdminModal";
import * as adminApi from "../services/adminApi";
import { getStoredSession, logout } from "../services/auth";
import type { Facility } from "../types/guest";
import {
    btnDangerClass,
    btnPrimaryClass,
    btnSecondaryClass,
    formControlFieldClassName,
    formControlFieldClassNameMt1,
} from "../constants/formClasses";
import { dedupeFacilitiesById, upsertFacilityInList } from "../utils/adminFacilities";
import { maskEmailForDisplay } from "../utils/maskEmail";

type ManagedUser = {
    id: number;
    email: string;
    role_id: number;
    is_active?: boolean;
    facility_id?: number | null;
    MedicalFacility?: { id: number; name: string; type: string } | null;
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

function normalizeVi(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function dedupeUsersById(list: ManagedUser[]): ManagedUser[] {
    const seen = new Set<number>();
    const out: ManagedUser[] = [];
    for (const u of list) {
        const id = Number(u.id);
        if (!Number.isFinite(id) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        out.push(u);
    }
    return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrengthHint(password: string): { label: string; tone: "slate" | "amber" | "emerald" } {
    if (!password) {
        return { label: "Tối thiểu 8 ký tự, nên có chữ hoa, chữ thường và số.", tone: "slate" };
    }
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score <= 2) {
        return { label: "Mật khẩu còn yếu — thêm độ dài và ký tự đa dạng.", tone: "amber" };
    }
    if (score <= 3) {
        return { label: "Mật khẩu ổn — có thể tạo tài khoản.", tone: "emerald" };
    }
    return { label: "Mật khẩu mạnh.", tone: "emerald" };
}

export default function SuperAdminDashboardPage() {
    const navigate = useNavigate();
    const session = getStoredSession();
    const currentUserId = session?.user?.id;

    const [facilityModalOpen, setFacilityModalOpen] = useState(false);
    const [createAdminModalOpen, setCreateAdminModalOpen] = useState(false);
    const [editAdminTarget, setEditAdminTarget] = useState<ManagedUser | null>(null);
    const [editAdminEmail, setEditAdminEmail] = useState("");
    const [editAdminFacilityId, setEditAdminFacilityId] = useState<number | "">("");
    const [editAdminPassword, setEditAdminPassword] = useState("");
    const [editAdminSaving, setEditAdminSaving] = useState(false);
    const [editAdminError, setEditAdminError] = useState<string | null>(null);
    const [revealedOncePassword, setRevealedOncePassword] = useState<string | null>(null);
    const [resettingAdminPassword, setResettingAdminPassword] = useState(false);
    const [facilityModalIntent, setFacilityModalIntent] = useState<FacilityAdminModalIntent | null>(null);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [facilityFilter, setFacilityFilter] = useState<FacilityFilter>("all");
    const [facilitySearch, setFacilitySearch] = useState("");
    const [adminSearch, setAdminSearch] = useState("");
    const [pageError, setPageError] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [facilityId, setFacilityId] = useState<number | "">("");
    const [expandedFacilityId, setExpandedFacilityId] = useState<string | number | null>(null);
    const [pendingDeactivateUser, setPendingDeactivateUser] = useState<ManagedUser | null>(null);
    const [deactivating, setDeactivating] = useState(false);

    const loadData = async (signal?: AbortSignal) => {
        const [facilityResult, userResult] = await Promise.allSettled([
            adminApi.fetchFacilitiesAdmin(signal),
            adminApi.fetchUsers(signal),
        ]);

        let unauthorized = false;
        const loadErrors: string[] = [];

        if (facilityResult.status === "fulfilled") {
            setFacilities(dedupeFacilitiesById((facilityResult.value || []) as Facility[]));
        } else {
            if (isAbortError(facilityResult.reason) || signal?.aborted) {
                return;
            }
            const message = facilityResult.reason instanceof Error ? facilityResult.reason.message : "";
            unauthorized = unauthorized || message.includes("401");
            loadErrors.push("không tải được danh sách cơ sở y tế");
        }

        if (userResult.status === "fulfilled") {
            setUsers(dedupeUsersById((userResult.value || []) as ManagedUser[]));
        } else {
            if (isAbortError(userResult.reason) || signal?.aborted) {
                return;
            }
            const message = userResult.reason instanceof Error ? userResult.reason.message : "";
            unauthorized = unauthorized || message.includes("401");
            loadErrors.push("không tải được danh sách tài khoản");
        }

        if (unauthorized) {
            logout();
            navigate("/login", { replace: true });
            return;
        }

        if (loadErrors.length > 0) {
            throw new Error(`Không thể tải dữ liệu quản trị toàn hệ thống: ${loadErrors.join(", ")}`);
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        setPageError(null);
        loadData(controller.signal).catch((e) => {
            if (controller.signal.aborted || isAbortError(e)) {
                return;
            }
            setPageError(e instanceof Error ? e.message : "Không thể tải dữ liệu quản trị toàn hệ thống");
        });
        return () => controller.abort();
    }, [navigate]);

    const hospitalFacilities = useMemo(
        () => facilities.filter((f) => Number(f.type) === 1 && f.is_active !== false),
        [facilities],
    );

    const activeFacilityCount = useMemo(
        () => facilities.filter((f) => f.is_active !== false).length,
        [facilities],
    );

    const inactiveFacilityCount = useMemo(
        () => facilities.filter((f) => f.is_active === false).length,
        [facilities],
    );

    const facilityIdsWithActiveAdmin = useMemo(() => {
        const set = new Set<number>();
        for (const u of users) {
            if (u.role_id === 2 && u.is_active !== false && u.facility_id != null) {
                set.add(Number(u.facility_id));
            }
        }
        return set;
    }, [users]);

    const activeHospitalAdminCount = useMemo(
        () => users.filter((u) => u.role_id === 2 && u.is_active !== false).length,
        [users],
    );

    const filteredFacilities = useMemo(() => {
        let list = dedupeFacilitiesById(facilities);
        if (facilityFilter !== "all") {
            list = list.filter((f) => Number(f.type) === Number(facilityFilter));
        }
        const q = normalizeVi(facilitySearch.trim());
        if (!q) {
            return list;
        }
        return list.filter((f) => {
            const haystack = normalizeVi(`${f.name} ${f.address ?? ""}`);
            return haystack.includes(q);
        });
    }, [facilities, facilityFilter, facilitySearch]);

    const handleFacilitySaved = useCallback((facility: Facility) => {
        setFacilities((prev) => upsertFacilityInList(prev, facility));
        setUsers((prev) =>
            prev.map((u) =>
                Number(u.facility_id) === Number(facility.id) && u.MedicalFacility
                    ? { ...u, MedicalFacility: { ...u.MedicalFacility, name: facility.name } }
                    : u,
            ),
        );
    }, []);

    const handleFacilityDeleted = useCallback((facilityId: string | number) => {
        setFacilities((prev) => prev.filter((f) => String(f.id) !== String(facilityId)));
    }, []);

    const filteredHospitalAdmins = useMemo(() => {
        const list = users.filter((u) => u.role_id === 2);
        const q = normalizeVi(adminSearch.trim());
        const filtered = !q
            ? list
            : list.filter((u) => {
                  const emailMatch = normalizeVi(u.email).includes(q);
                  const fac = u.MedicalFacility?.name ? normalizeVi(u.MedicalFacility.name).includes(q) : false;
                  return emailMatch || fac;
              });
        return [...filtered].sort((a, b) => {
            const fa = normalizeVi(a.MedicalFacility?.name ?? "");
            const fb = normalizeVi(b.MedicalFacility?.name ?? "");
            if (fa !== fb) {
                return fa.localeCompare(fb, "vi");
            }
            return normalizeVi(a.email).localeCompare(normalizeVi(b.email), "vi");
        });
    }, [users, adminSearch]);

    const duplicateActiveAdminFacilities = useMemo(() => {
        const counts = new Map<number, { name: string; count: number }>();
        for (const u of users) {
            if (u.role_id !== 2 || u.is_active === false || u.facility_id == null) {
                continue;
            }
            const fid = Number(u.facility_id);
            const prev = counts.get(fid);
            const name = u.MedicalFacility?.name ?? `BV #${fid}`;
            counts.set(fid, { name, count: (prev?.count ?? 0) + 1 });
        }
        return [...counts.entries()]
            .filter(([, v]) => v.count > 1)
            .map(([id, v]) => ({ facilityId: id, name: v.name, count: v.count }));
    }, [users]);

    const pctActive =
        facilities.length === 0 ? 0 : Math.round((activeFacilityCount / facilities.length) * 1000) / 10;

    const pwdHint = useMemo(() => passwordStrengthHint(password), [password]);
    const editPwdHint = useMemo(() => passwordStrengthHint(editAdminPassword), [editAdminPassword]);

    const closeFacilityModal = () => {
        setFacilityModalOpen(false);
        setFacilityModalIntent(null);
    };

    const openFacilityModal = (intent: FacilityAdminModalIntent) => {
        setFacilityModalIntent(intent);
        setFacilityModalOpen(true);
    };

    const openCreateAdminModal = () => {
        setCreateError(null);
        setCreateAdminModalOpen(true);
    };

    const closeCreateAdminModal = () => {
        setCreateAdminModalOpen(false);
        setCreateError(null);
    };

    const openEditAdminModal = (u: ManagedUser) => {
        setEditAdminError(null);
        setRevealedOncePassword(null);
        setEditAdminTarget(u);
        setEditAdminEmail(u.email);
        setEditAdminFacilityId(u.facility_id != null ? Number(u.facility_id) : "");
        setEditAdminPassword("");
    };

    const closeEditAdminModal = () => {
        setEditAdminTarget(null);
        setEditAdminError(null);
        setEditAdminPassword("");
        setRevealedOncePassword(null);
    };

    const facilityTakenByOtherActiveAdmin = (facilityId: number, excludeUserId: number) =>
        users.some(
            (u2) =>
                u2.role_id === 2 &&
                u2.is_active !== false &&
                Number(u2.facility_id) === facilityId &&
                Number(u2.id) !== excludeUserId,
        );

    const createAdmin = async () => {
        setCreateError(null);
        if (!email.trim() || !password || facilityId === "") {
            setCreateError("Vui lòng nhập đủ email, mật khẩu và chọn bệnh viện.");
            return;
        }
        if (!EMAIL_RE.test(email.trim())) {
            setCreateError("Email không đúng định dạng.");
            return;
        }
        if (password.length < 8) {
            setCreateError("Mật khẩu tối thiểu 8 ký tự (theo chính sách hệ thống).");
            return;
        }
        if (facilityIdsWithActiveAdmin.has(Number(facilityId))) {
            setCreateError(
                "Bệnh viện này đã có admin hoạt động. Vô hiệu admin cũ trước khi tạo mới, hoặc gán admin khác vào BV trống.",
            );
            return;
        }
        try {
            setCreating(true);
            await adminApi.createHospitalAdmin({
                email: email.trim(),
                password,
                facility_id: Number(facilityId),
            });
            setEmail("");
            setPassword("");
            setFacilityId("");
            setCreateAdminModalOpen(false);
            await loadData();
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Không thể tạo tài khoản Admin bệnh viện");
        } finally {
            setCreating(false);
        }
    };

    const confirmDeactivateAdmin = async () => {
        if (!pendingDeactivateUser) {
            return;
        }
        try {
            setDeactivating(true);
            await adminApi.deactivateHospitalAdmin(pendingDeactivateUser.id);
            setPendingDeactivateUser(null);
            await loadData();
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Không thể vô hiệu tài khoản");
        } finally {
            setDeactivating(false);
        }
    };

    const saveEditHospitalAdmin = async () => {
        if (!editAdminTarget) {
            return;
        }
        setEditAdminError(null);
        if (!editAdminEmail.trim()) {
            setEditAdminError("Email không được để trống.");
            return;
        }
        if (!EMAIL_RE.test(editAdminEmail.trim())) {
            setEditAdminError("Email không đúng định dạng.");
            return;
        }
        if (editAdminFacilityId === "") {
            setEditAdminError("Vui lòng chọn bệnh viện.");
            return;
        }
        if (editAdminPassword && editAdminPassword.length < 8) {
            setEditAdminError("Mật khẩu mới tối thiểu 8 ký tự (hoặc để trống).");
            return;
        }
        try {
            setEditAdminSaving(true);
            const payload: { email?: string; facility_id?: number; password?: string } = {
                email: editAdminEmail.trim(),
                facility_id: Number(editAdminFacilityId),
            };
            if (editAdminPassword.trim()) {
                payload.password = editAdminPassword.trim();
            }
            await adminApi.updateHospitalAdmin(editAdminTarget.id, payload);
            closeEditAdminModal();
            await loadData();
        } catch (e) {
            setEditAdminError(e instanceof Error ? e.message : "Không thể cập nhật tài khoản");
        } finally {
            setEditAdminSaving(false);
        }
    };

    const resetAdminPasswordAndReveal = async (mode: "random" | "fromField") => {
        if (!editAdminTarget) {
            return;
        }
        setEditAdminError(null);
        if (mode === "fromField") {
            const p = editAdminPassword.trim();
            if (p.length < 8) {
                setEditAdminError(
                    "Nhập mật tối thiểu 8 ký tự vào ô «Mật khẩu mới» bên dưới, hoặc dùng «Tạo ngẫu nhiên & hiển thị».",
                );
                return;
            }
        }
        try {
            setResettingAdminPassword(true);
            const pwd = mode === "fromField" ? editAdminPassword.trim() : undefined;
            const data = await adminApi.resetHospitalAdminPassword(editAdminTarget.id, pwd);
            const plain = typeof data?.temporary_password === "string" ? data.temporary_password : null;
            if (plain) {
                setRevealedOncePassword(plain);
                setEditAdminPassword("");
            } else {
                setEditAdminError("Phản hồi máy chủ thiếu mật khẩu — thử lại.");
            }
            await loadData();
        } catch (e) {
            setEditAdminError(e instanceof Error ? e.message : "Không thể đặt lại mật khẩu");
        } finally {
            setResettingAdminPassword(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login", { replace: true });
    };

    return (
        <AppPageShell
            title="Quản trị toàn hệ thống"
            subtitle="Quản lý cơ sở y tế, tài khoản admin bệnh viện và trạng thái hoạt động"
            maxWidthClass="max-w-[1200px]"
            backTo={{ href: "/user", label: "Về trang chủ" }}
            actions={
                <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={handleLogout}
                >
                    Đăng xuất
                </button>
            }
        >
                {pageError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                        {pageError}
                    </p>
                ) : null}

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Tổng cơ sở y tế</p>
                        <p className="mt-1 text-2xl font-bold">{facilities.length}</p>
                        <p className="mt-2 text-xs text-slate-500">
                            Gồm cả cơ sở đang kích hoạt và đã tạm ngưng (soft delete).
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Đang kích hoạt</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{activeFacilityCount}</p>
                        <p className="mt-2 text-xs text-slate-500">
                            Cơ sở còn hiển thị trên bản đồ công khai (is_active = true).
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                            {inactiveFacilityCount === 0
                                ? `Tất cả ${facilities.length || 0} cơ sở đều đang kích hoạt (${pctActive}%).`
                                : `${inactiveFacilityCount} cơ sở tạm ngưng — ${pctActive}% còn kích hoạt.`}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Admin bệnh viện (hoạt động)</p>
                        <p className="mt-1 text-2xl font-bold">{activeHospitalAdminCount}</p>
                        <p className="mt-2 text-xs text-slate-500">
                            Tài khoản role Admin BV chưa bị vô hiệu hóa ({users.filter((u) => u.role_id === 2).length}{" "}
                            tổng nếu gồm đã khóa).
                        </p>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="flex min-h-[560px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:h-[560px]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold">Quản lý cơ sở y tế</h2>
                            <button
                                type="button"
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
                                onClick={() => openFacilityModal({ mode: "create" })}
                            >
                                + Thêm cơ sở mới
                            </button>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <input
                                type="search"
                                placeholder="Tìm theo tên cơ sở..."
                                className={`${formControlFieldClassName} sm:max-w-xs`}
                                value={facilitySearch}
                                onChange={(e) => setFacilitySearch(e.target.value)}
                                aria-label="Tìm cơ sở y tế"
                            />
                            <select
                                className={`${formControlFieldClassName} sm:w-56`}
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
                                <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="py-3 pr-2">Mã</th>
                                        <th className="py-3 pr-2">Tên cơ sở</th>
                                        <th className="py-3 pr-2">Loại</th>
                                        <th className="py-3 pr-2">Trạng thái</th>
                                        <th className="py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFacilities.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                                                Không có cơ sở phù hợp bộ lọc.
                                            </td>
                                        </tr>
                                    ) : null}
                                    {filteredFacilities.map((f) => (
                                        <Fragment key={String(f.id)}>
                                            <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                                                <td className="py-3 pr-2 font-mono text-xs text-slate-500">#{f.id}</td>
                                                <td className="max-w-[200px] py-3 pr-2" title={f.name}>
                                                    <div className="truncate font-semibold text-slate-900">{f.name}</div>
                                                    {f.address ? (
                                                        <div className="truncate text-xs text-slate-500">{f.address}</div>
                                                    ) : null}
                                                </td>
                                                <td className="py-3 pr-2 text-slate-700">{getFacilityTypeLabel(Number(f.type))}</td>
                                                <td className="py-3 pr-2">
                                                    {f.is_active === false ? (
                                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                                            Tạm ngưng
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                                                            Kích hoạt
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 text-right">
                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                                            onClick={() => openFacilityModal({ mode: "edit", facilityId: f.id })}
                                                        >
                                                            Sửa
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                            onClick={() =>
                                                                setExpandedFacilityId((cur) =>
                                                                    cur === f.id ? null : f.id,
                                                                )
                                                            }
                                                        >
                                                            {expandedFacilityId === f.id ? "Ẩn" : "Chi tiết"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedFacilityId === f.id ? (
                                                <tr className="border-t border-slate-50 bg-slate-50/80">
                                                    <td colSpan={5} className="px-3 py-3 text-xs text-slate-700">
                                                        <p>
                                                            <span className="font-semibold">Địa chỉ:</span>{" "}
                                                            {f.address || "—"}
                                                        </p>
                                                        <p className="mt-1">
                                                            <span className="font-semibold">Hotline:</span> {f.phone || "—"}
                                                        </p>
                                                        <p className="mt-1 font-mono text-[11px] text-slate-600">
                                                            Tọa độ: {f.lat?.toFixed(5) ?? "—"}, {f.lng?.toFixed(5) ?? "—"}
                                                        </p>
                                                        <p className="mt-2 text-slate-500">
                                                            Xóa / tạm ngưng cơ sở: dùng mục &quot;Sửa&quot; trong cửa sổ quản lý (có
                                                            xác nhận xóa).
                                                        </p>
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex min-h-[560px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:h-[560px]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">Tài khoản Admin bệnh viện</h2>
                                <p className="mt-1 text-xs text-slate-500">
                                    Danh sách admin BV. Tạo mới qua popup — mỗi bệnh viện chỉ một admin hoạt động.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
                                onClick={openCreateAdminModal}
                            >
                                + Tạo tài khoản Admin BV
                            </button>
                        </div>

                        <div className="mt-4 shrink-0">
                            <input
                                type="search"
                                className={formControlFieldClassName}
                                placeholder="Tìm theo email hoặc tên cơ sở gán cho admin..."
                                value={adminSearch}
                                onChange={(e) => setAdminSearch(e.target.value)}
                                aria-label="Tìm admin bệnh viện"
                            />
                        </div>

                        {duplicateActiveAdminFacilities.length > 0 ? (
                            <div
                                className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                                role="status"
                            >
                                <p className="font-semibold">Có bệnh viện gán nhiều admin đang hoạt động</p>
                                <p className="mt-1 text-amber-900/90">
                                    {duplicateActiveAdminFacilities
                                        .slice(0, 4)
                                        .map((d) => `${d.name} (${d.count} tài khoản)`)
                                        .join(" · ")}
                                    {duplicateActiveAdminFacilities.length > 4 ? " …" : ""}
                                    . Vô hiệu bản trùng (giữ một admin/BV) hoặc chạy{" "}
                                    <code className="rounded bg-amber-100 px-1">npm run db:reset</code> trong GeoBackend
                                    để về seed sạch.
                                </p>
                            </div>
                        ) : null}

                        <div className="mt-3 min-h-0 flex-1 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="py-3 pr-2">Tài khoản</th>
                                        <th className="py-3 pr-2">Vai trò</th>
                                        <th className="py-3 pr-2">Cơ sở gán</th>
                                        <th className="py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHospitalAdmins.map((u) => {
                                        const masked = maskEmailForDisplay(u.email);
                                        const facilityName = u.MedicalFacility?.name ?? "Chưa gán cơ sở";
                                        const active = u.is_active !== false;
                                        return (
                                            <tr key={u.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                                                <td className="py-3 pr-2">
                                                    <div className="font-medium text-slate-900">{masked}</div>
                                                    <div className="text-[11px] text-slate-500">
                                                        #{u.id} · {facilityName}
                                                    </div>
                                                    {!active ? (
                                                        <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                                                            Đã vô hiệu
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="py-3 pr-2 text-slate-700">Admin BV</td>
                                                <td className="max-w-[140px] truncate py-3 pr-2 text-slate-700" title={facilityName}>
                                                    {facilityName}
                                                </td>
                                                <td className="py-3 text-right">
                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                                            onClick={() => openEditAdminModal(u)}
                                                        >
                                                            Xem / Sửa
                                                        </button>
                                                        {active ? (
                                                            <button
                                                                type="button"
                                                                className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                                disabled={
                                                                    currentUserId != null && Number(currentUserId) === Number(u.id)
                                                                }
                                                                onClick={() => setPendingDeactivateUser(u)}
                                                                title={
                                                                    currentUserId != null && Number(currentUserId) === Number(u.id)
                                                                        ? "Không thể tự vô hiệu chính mình"
                                                                        : undefined
                                                                }
                                                            >
                                                                Vô hiệu
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

            <AppModal
                open={createAdminModalOpen}
                onClose={closeCreateAdminModal}
                title="Tạo tài khoản Admin bệnh viện"
                subtitle="Mỗi bệnh viện chỉ một admin hoạt động. Cơ sở đã có admin sẽ bị khóa trong danh sách chọn."
                titleId="create-admin-modal-title"
                zIndex={902}
                closeDisabled={creating}
                footer={
                    <>
                        <button type="button" className={btnSecondaryClass} onClick={closeCreateAdminModal} disabled={creating}>
                            Hủy
                        </button>
                        <button
                            type="button"
                            className={btnPrimaryClass}
                            onClick={() => void createAdmin()}
                            disabled={creating}
                        >
                            {creating ? "Đang tạo..." : "Tạo tài khoản"}
                        </button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-3">
                    <label>
                        <span className="text-xs font-semibold text-slate-600">Email đăng nhập</span>
                        <input
                            id="sa-admin-email"
                            className={formControlFieldClassNameMt1}
                            placeholder="ten.admin@domain.com"
                            type="email"
                            autoComplete="off"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>
                    <label>
                        <span className="text-xs font-semibold text-slate-600">Mật khẩu</span>
                        <input
                            id="sa-admin-password"
                            className={formControlFieldClassNameMt1}
                            placeholder="Tối thiểu 8 ký tự"
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <p
                            className={`mt-1 text-[11px] font-medium ${
                                pwdHint.tone === "amber"
                                    ? "text-amber-700"
                                    : pwdHint.tone === "emerald"
                                      ? "text-emerald-700"
                                      : "text-slate-500"
                            }`}
                        >
                            {pwdHint.label}
                        </p>
                    </label>
                    <label>
                        <span className="text-xs font-semibold text-slate-600">Bệnh viện</span>
                        <select
                            id="sa-admin-facility"
                            className={formControlFieldClassNameMt1}
                            aria-label="Chọn bệnh viện cho admin"
                            value={facilityId === "" ? "" : String(facilityId)}
                            onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : "")}
                        >
                            <option value="">Chọn bệnh viện</option>
                            {hospitalFacilities.map((f) => {
                                const taken = facilityIdsWithActiveAdmin.has(Number(f.id));
                                return (
                                    <option key={String(f.id)} value={String(f.id)} disabled={taken}>
                                        #{f.id} — {f.name}
                                        {taken ? " (đã có admin)" : ""}
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>
                {createError ? (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                        {createError}
                    </p>
                ) : null}
            </AppModal>

            <AppModal
                open={Boolean(editAdminTarget)}
                onClose={closeEditAdminModal}
                title="Xem / sửa Admin bệnh viện"
                subtitle="Email đầy đủ chỉ hiển thị tại đây. Mật khẩu mới chỉ xem được một lần sau khi đặt lại."
                titleId="edit-admin-modal-title"
                zIndex={903}
                closeDisabled={editAdminSaving || resettingAdminPassword}
                footer={
                    <>
                        <button
                            type="button"
                            className={btnSecondaryClass}
                            onClick={closeEditAdminModal}
                            disabled={editAdminSaving || resettingAdminPassword}
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            className={btnPrimaryClass}
                            onClick={() => void saveEditHospitalAdmin()}
                            disabled={editAdminSaving || resettingAdminPassword}
                        >
                            {editAdminSaving ? "Đang lưu..." : "Lưu thay đổi"}
                        </button>
                    </>
                }
            >
                {editAdminTarget?.is_active === false ? (
                    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                        Tài khoản đang vô hiệu — vẫn có thể cập nhật email, bệnh viện gán hoặc đặt mật khẩu mới.
                    </p>
                ) : null}

                {editAdminTarget ? (
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600" htmlFor="edit-admin-email">
                                    Email đăng nhập
                                </label>
                                <input
                                    id="edit-admin-email"
                                    className={formControlFieldClassNameMt1}
                                    type="email"
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={editAdminEmail}
                                    onChange={(e) => setEditAdminEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <span className="block text-xs font-semibold text-slate-600">Mật khẩu (chỉ Super Admin)</span>
                                <p className="mt-1 text-xs text-slate-600">
                                    Hệ thống chỉ lưu băm (bcrypt). Để biết mật đăng nhập hiện tại, cần đặt lại — mật mới chỉ hiện một lần trong phiên popup này.
                                </p>
                                {revealedOncePassword ? (
                                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                        <p className="text-xs font-semibold text-emerald-900">
                                            Mật khẩu mới (chỉ hiện lần này — lưu hoặc gửi cho admin BV)
                                        </p>
                                        <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">
                                            {revealedOncePassword}
                                        </p>
                                        <button
                                            type="button"
                                            className="mt-2 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                                            onClick={() => {
                                                void navigator.clipboard.writeText(revealedOncePassword).catch(() => {
                                                    /* ignore */
                                                });
                                            }}
                                        >
                                            Sao chép
                                        </button>
                                    </div>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                        disabled={resettingAdminPassword || editAdminSaving}
                                        onClick={() => void resetAdminPasswordAndReveal("random")}
                                    >
                                        {resettingAdminPassword ? "Đang xử lý..." : "Tạo ngẫu nhiên & hiển thị"}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                                        disabled={resettingAdminPassword || editAdminSaving}
                                        onClick={() => void resetAdminPasswordAndReveal("fromField")}
                                    >
                                        {resettingAdminPassword ? "Đang xử lý..." : "Dùng mật trong ô & hiển thị"}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600" htmlFor="edit-admin-facility">
                                    Bệnh viện
                                </label>
                                <select
                                    id="edit-admin-facility"
                                    className={formControlFieldClassNameMt1}
                                    aria-label="Chọn bệnh viện cho admin"
                                    value={editAdminFacilityId === "" ? "" : String(editAdminFacilityId)}
                                    onChange={(e) => setEditAdminFacilityId(e.target.value ? Number(e.target.value) : "")}
                                >
                                    <option value="">Chọn bệnh viện</option>
                                    {hospitalFacilities.map((f) => {
                                        const taken = facilityTakenByOtherActiveAdmin(Number(f.id), editAdminTarget.id);
                                        return (
                                            <option key={String(f.id)} value={String(f.id)} disabled={taken}>
                                                #{f.id} — {f.name}
                                                {taken ? " (đã có admin)" : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600" htmlFor="edit-admin-password">
                                    Mật khẩu mới (tuỳ chọn, khi Lưu — không hiện lại)
                                </label>
                                <input
                                    id="edit-admin-password"
                                    className={formControlFieldClassNameMt1}
                                    placeholder="Để trống nếu giữ nguyên; hoặc nhập rồi bấm «Dùng mật trong ô & hiển thị»"
                                    type="password"
                                    autoComplete="new-password"
                                    value={editAdminPassword}
                                    onChange={(e) => setEditAdminPassword(e.target.value)}
                                />
                                <p
                                    className={`mt-1 text-[11px] font-medium ${
                                        editPwdHint.tone === "amber"
                                            ? "text-amber-700"
                                            : editPwdHint.tone === "emerald"
                                              ? "text-emerald-700"
                                              : "text-slate-500"
                                    }`}
                                >
                                    {editPwdHint.label}
                                </p>
                            </div>
                        </div>
                ) : null}
                {editAdminError ? (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                        {editAdminError}
                    </p>
                ) : null}
            </AppModal>

            <FacilityAdminModal
                open={facilityModalOpen}
                onClose={closeFacilityModal}
                openIntent={facilityModalIntent}
                onFacilitySaved={handleFacilitySaved}
                onFacilityDeleted={handleFacilityDeleted}
            />

            <AppModal
                open={Boolean(pendingDeactivateUser)}
                onClose={() => setPendingDeactivateUser(null)}
                title="Vô hiệu tài khoản admin?"
                subtitle="Hành động này không xóa dữ liệu — chỉ chặn đăng nhập."
                zIndex={950}
                closeDisabled={deactivating}
                footer={
                    <>
                        <button
                            type="button"
                            className={btnSecondaryClass}
                            onClick={() => setPendingDeactivateUser(null)}
                            disabled={deactivating}
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            className={btnDangerClass}
                            onClick={() => void confirmDeactivateAdmin()}
                            disabled={deactivating}
                        >
                            {deactivating ? "Đang xử lý..." : "Vô hiệu hóa"}
                        </button>
                    </>
                }
            >
                {pendingDeactivateUser ? (
                    <p className="text-sm text-slate-600">
                        Người dùng{" "}
                        <span className="font-semibold text-slate-900">
                            {pendingDeactivateUser.MedicalFacility?.name ?? "admin"}
                        </span>{" "}
                        ({maskEmailForDisplay(pendingDeactivateUser.email)}) sẽ không đăng nhập được nữa. Bạn có chắc chắn?
                    </p>
                ) : null}
            </AppModal>
        </AppPageShell>
    );
}
