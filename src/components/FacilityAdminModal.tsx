import { useEffect, useMemo, useRef, useState } from "react";
import { formControlFieldClassNameMt1 } from "../constants/formClasses";
import * as adminApi from "../services/adminApi";
import type { Facility, FacilityType } from "../types/guest";
import { dedupeFacilitiesById, normalizeFacilityType, upsertFacilityInList } from "../utils/adminFacilities";

export type FacilityAdminModalIntent =
    | { mode: "create" }
    | { mode: "edit"; facilityId: string | number };

interface FacilityAdminModalProps {
    open: boolean;
    onClose: () => void;
    openIntent?: FacilityAdminModalIntent | null;
    onFacilitySaved?: (facility: Facility) => void;
    onFacilityDeleted?: (facilityId: string | number) => void;
}

const DEFAULT_FACILITY_TYPE: FacilityType = 1;
const TOAST_TIMEOUT_MS = 2400;

type ToastState = {
    id: number;
    message: string;
    type: "success" | "error";
};

const emptyForm = (): Partial<Facility> => ({
    name: "",
    address: "",
    phone: "",
    lat: 10.7769,
    lng: 106.7009,
    type: DEFAULT_FACILITY_TYPE,
});

export default function FacilityAdminModal({
    open,
    onClose,
    openIntent = null,
    onFacilitySaved,
    onFacilityDeleted,
}: FacilityAdminModalProps) {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Facility | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Facility | null>(null);
    const [toast, setToast] = useState<ToastState | null>(null);
    const [listFilter, setListFilter] = useState<FacilityType | "all">("all");
    const intentAppliedKeyRef = useRef<string | null>(null);

    const [form, setForm] = useState<Partial<Facility>>(emptyForm());

    const isEditOnly = openIntent?.mode === "edit";
    const isBusy = loading || saving || deletingId !== null;

    const selectedType = normalizeFacilityType((form.type as FacilityType | undefined) ?? DEFAULT_FACILITY_TYPE);

    const filteredFacilities = useMemo(() => {
        const deduped = dedupeFacilitiesById(facilities);
        if (listFilter === "all") {
            return deduped;
        }
        return deduped.filter((f) => normalizeFacilityType(f.type) === listFilter);
    }, [facilities, listFilter]);

    const showToast = (message: string, type: ToastState["type"]) => {
        const id = Date.now();
        setToast({ id, message, type });
        window.setTimeout(() => {
            setToast((current) => (current?.id === id ? null : current));
        }, TOAST_TIMEOUT_MS);
    };

    const loadFacilities = async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            const rows = await adminApi.fetchFacilitiesAdmin(signal);
            setFacilities(dedupeFacilitiesById(rows || []));
        } catch {
            setError("Không thể tải danh sách cơ sở");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) {
            intentAppliedKeyRef.current = null;
            return;
        }

        const controller = new AbortController();
        void loadFacilities(controller.signal);
        return () => controller.abort();
    }, [open]);

    const startEdit = (facility: Facility) => {
        setEditing(facility);
        setForm({
            ...facility,
            type: normalizeFacilityType(facility.type),
        });
        setListFilter(normalizeFacilityType(facility.type));
    };

    const startCreate = () => {
        setEditing(null);
        setForm(emptyForm());
    };

    useEffect(() => {
        if (!open || loading || error) {
            return;
        }
        if (!openIntent) {
            intentAppliedKeyRef.current = null;
            return;
        }

        const key = JSON.stringify(openIntent);
        if (intentAppliedKeyRef.current === key) {
            return;
        }

        if (openIntent.mode === "create") {
            startCreate();
            intentAppliedKeyRef.current = key;
            return;
        }

        const match = dedupeFacilitiesById(facilities).find((f) => String(f.id) === String(openIntent.facilityId));
        if (match) {
            startEdit(match);
            intentAppliedKeyRef.current = key;
        }
    }, [open, loading, error, openIntent, facilities]);

    const applySavedFacility = (saved: Facility, fallbackId?: string | number) => {
        const merged: Facility = {
            ...saved,
            id: saved.id ?? fallbackId ?? editing?.id,
            type: normalizeFacilityType(saved.type ?? selectedType),
        };
        setFacilities((prev) => upsertFacilityInList(prev, merged, fallbackId ?? editing?.id));
        onFacilitySaved?.(merged);
        return merged;
    };

    const submit = async () => {
        const name = String(form.name ?? "").trim();
        if (!name) {
            setError("Tên cơ sở không được để trống.");
            return;
        }

        const formType = normalizeFacilityType(form.type);
        const payload = { ...form, name, type: formType };

        try {
            setSaving(true);
            setError(null);

            if (editing) {
                const updated = await adminApi.updateFacility(editing.id, payload);
                applySavedFacility(updated, editing.id);
                showToast("Cập nhật cơ sở thành công", "success");
                if (isEditOnly) {
                    window.setTimeout(() => onClose(), 400);
                    return;
                }
                setEditing(null);
                setForm(emptyForm());
            } else {
                const created = await adminApi.createFacility(payload);
                applySavedFacility(created);
                showToast("Thêm cơ sở thành công", "success");
                setEditing(null);
                setForm(emptyForm());
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Lưu không thành công";
            setError(msg);
            showToast("Lưu cơ sở không thành công", "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (facility: Facility) => {
        const facilityKey = String(facility.id);
        try {
            setDeletingId(facility.id);
            await adminApi.deleteFacility(facility.id);
            setPendingDelete(null);
            setFacilities((prev) => prev.filter((f) => String(f.id) !== facilityKey));
            onFacilityDeleted?.(facility.id);
            showToast("Đã tạm ngưng cơ sở trên bản đồ công khai", "success");
            if (editing && String(editing.id) === facilityKey) {
                setEditing(null);
                setForm(emptyForm());
            }
            if (isEditOnly) {
                window.setTimeout(() => onClose(), 400);
            }
        } catch {
            setError("Xóa không thành công");
            showToast("Xóa cơ sở không thành công", "error");
        } finally {
            setDeletingId(null);
        }
    };

    if (!open) {
        return null;
    }

    const modalTitle = isEditOnly ? "Chỉnh sửa cơ sở y tế" : editing ? "Cập nhật cơ sở" : "Thêm cơ sở mới";

    return (
        <div
            className="fixed inset-0 z-[900] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isBusy) {
                    onClose();
                }
            }}
        >
            <div
                className="flex max-h-[min(90vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="facility-admin-modal-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                    <div>
                        <h3 id="facility-admin-modal-title" className="text-lg font-bold text-slate-900">
                            {modalTitle}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {isEditOnly
                                ? "Thay đổi được đồng bộ ngay lên bảng danh sách — không tạo bản ghi trùng."
                                : "Quản lý cơ sở: mỗi mã ID chỉ xuất hiện một lần trong danh sách."}
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        {!isEditOnly ? (
                            <button
                                type="button"
                                className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                                onClick={startCreate}
                                disabled={isBusy}
                            >
                                + Thêm mới
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                            onClick={onClose}
                        >
                            Đóng
                        </button>
                    </div>
                </div>

                <div className={`min-h-0 flex-1 overflow-y-auto p-6 ${isEditOnly ? "" : "grid gap-6 md:grid-cols-[1fr_1.1fr]"}`}>
                    {!isEditOnly ? (
                        <div className="flex min-h-[280px] flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-slate-800">Danh sách cơ sở</h4>
                                <select
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                                    value={String(listFilter)}
                                    onChange={(e) =>
                                        setListFilter(
                                            e.target.value === "all" ? "all" : (Number(e.target.value) as FacilityType),
                                        )
                                    }
                                    aria-label="Lọc loại trong modal"
                                >
                                    <option value="all">Tất cả</option>
                                    <option value="1">Bệnh viện</option>
                                    <option value="2">Phòng khám</option>
                                    <option value="3">Nhà thuốc</option>
                                </select>
                            </div>
                            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                                {loading ? (
                                    <p className="text-sm text-slate-500">Đang tải...</p>
                                ) : filteredFacilities.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                                        Không có cơ sở trong bộ lọc này.
                                    </p>
                                ) : (
                                    filteredFacilities.map((f) => {
                                        const isActive = editing && String(editing.id) === String(f.id);
                                        return (
                                            <button
                                                key={String(f.id)}
                                                type="button"
                                                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                                    isActive
                                                        ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200"
                                                        : "border-slate-200 bg-white hover:border-slate-300"
                                                }`}
                                                onClick={() => startEdit(f)}
                                                disabled={isBusy}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-slate-900">{f.name}</p>
                                                        <p className="mt-0.5 truncate text-xs text-slate-500">{f.address || "—"}</p>
                                                    </div>
                                                    <span className="shrink-0 font-mono text-[10px] text-slate-400">#{f.id}</span>
                                                </div>
                                                {f.is_active === false ? (
                                                    <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                                        Tạm ngưng
                                                    </span>
                                                ) : null}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-800">{editing ? `Sửa #${editing.id}` : "Thông tin cơ sở"}</h4>
                        <div className="mt-4 grid gap-3">
                            <label>
                                <span className="text-xs font-semibold text-slate-600">Tên cơ sở</span>
                                <input
                                    className={formControlFieldClassNameMt1}
                                    value={form.name ?? ""}
                                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                                    disabled={isBusy}
                                />
                            </label>
                            <label>
                                <span className="text-xs font-semibold text-slate-600">Địa chỉ</span>
                                <input
                                    className={formControlFieldClassNameMt1}
                                    value={form.address ?? ""}
                                    onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                                    disabled={isBusy}
                                />
                            </label>
                            <label>
                                <span className="text-xs font-semibold text-slate-600">Hotline</span>
                                <input
                                    className={formControlFieldClassNameMt1}
                                    value={form.phone ?? ""}
                                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                                    disabled={isBusy}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label>
                                    <span className="text-xs font-semibold text-slate-600">Vĩ độ</span>
                                    <input
                                        className={formControlFieldClassNameMt1}
                                        value={String(form.lat ?? "")}
                                        onChange={(e) => setForm((s) => ({ ...s, lat: Number(e.target.value) }))}
                                        disabled={isBusy}
                                    />
                                </label>
                                <label>
                                    <span className="text-xs font-semibold text-slate-600">Kinh độ</span>
                                    <input
                                        className={formControlFieldClassNameMt1}
                                        value={String(form.lng ?? "")}
                                        onChange={(e) => setForm((s) => ({ ...s, lng: Number(e.target.value) }))}
                                        disabled={isBusy}
                                    />
                                </label>
                            </div>
                            <label>
                                <span className="text-xs font-semibold text-slate-600">Loại cơ sở</span>
                                <select
                                    className={formControlFieldClassNameMt1}
                                    value={String(selectedType)}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, type: Number(e.target.value) as FacilityType }))
                                    }
                                    disabled={isBusy}
                                >
                                    <option value="1">Bệnh viện</option>
                                    <option value="2">Phòng khám</option>
                                    <option value="3">Nhà thuốc</option>
                                </select>
                            </label>
                        </div>

                        {error ? (
                            <p className="mt-3 text-sm font-medium text-red-600" role="alert">
                                {error}
                            </p>
                        ) : null}

                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            {editing ? (
                                <button
                                    type="button"
                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                    onClick={() => setPendingDelete(editing)}
                                    disabled={isBusy}
                                >
                                    Tạm ngưng / xóa
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                onClick={() => {
                                    setEditing(null);
                                    setForm(emptyForm());
                                    setError(null);
                                }}
                                disabled={isBusy}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-slate-400"
                                onClick={() => void submit()}
                                disabled={isBusy}
                            >
                                {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo cơ sở"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {pendingDelete ? (
                <div className="fixed inset-0 z-[910] grid place-items-center bg-black/45 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <h4 className="text-base font-bold text-slate-900">Tạm ngưng cơ sở?</h4>
                        <p className="mt-2 text-sm text-slate-600">
                            <span className="font-semibold">{pendingDelete.name}</span> (mã #{pendingDelete.id}) sẽ ẩn khỏi
                            bản đồ công khai.
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => setPendingDelete(null)}
                                disabled={deletingId !== null}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                                onClick={() => void remove(pendingDelete)}
                                disabled={deletingId !== null}
                            >
                                {deletingId !== null ? "Đang xử lý..." : "Xác nhận"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {toast ? (
                <div className="pointer-events-auto fixed bottom-6 right-6 z-[920]">
                    <div
                        className={`rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
                            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
                        }`}
                    >
                        {toast.message}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
