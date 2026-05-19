import { useEffect, useRef, useState } from "react";
import { formControlClassName } from "../constants/formClasses";
import type { Facility, FacilityType } from "../types/guest";

const facilityFormFieldClass = `w-full rounded border border-slate-200 px-2 py-1 ${formControlClassName}`;
import * as adminApi from "../services/adminApi";

export type FacilityAdminModalIntent =
    | { mode: "create" }
    | { mode: "edit"; facilityId: string | number };

interface FacilityAdminModalProps {
    open: boolean;
    onClose: () => void;
    /** Khi mở modal từ dashboard: tạo mới hoặc sửa cơ sở cụ thể */
    openIntent?: FacilityAdminModalIntent | null;
}

const DEFAULT_FACILITY_TYPE: FacilityType = 1;
const TOAST_TIMEOUT_MS = 2200;
const REMOVE_ANIMATION_MS = 220;

type ToastState = {
    id: number;
    message: string;
    type: "success" | "error";
};

export default function FacilityAdminModal({ open, onClose, openIntent = null }: FacilityAdminModalProps) {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | number | null>(null);
    const [removingIds, setRemovingIds] = useState<string[]>([]);
    const [pendingDelete, setPendingDelete] = useState<Facility | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Facility | null>(null);
    const [toast, setToast] = useState<ToastState | null>(null);
    const intentAppliedKeyRef = useRef<string | null>(null);

    const [form, setForm] = useState<Partial<Facility>>({
        name: "",
        address: "",
        lat: 0,
        lng: 0,
        type: DEFAULT_FACILITY_TYPE,
    });

    const selectedType = (form.type as FacilityType | undefined) ?? DEFAULT_FACILITY_TYPE;
    const filteredFacilities = facilities.filter((facility) => facility.type === selectedType);
    const isBusy = loading || saving || deletingId !== null;

    const showToast = (message: string, type: ToastState["type"]) => {
        const id = Date.now();
        setToast({ id, message, type });
        window.setTimeout(() => {
            setToast((current) => (current?.id === id ? null : current));
        }, TOAST_TIMEOUT_MS);
    };

    useEffect(() => {
        if (!open) {
            intentAppliedKeyRef.current = null;
            return;
        }

        let mounted = true;
        const controller = new AbortController();

        setLoading(true);
        setError(null);

        adminApi
            .fetchFacilitiesAdmin(controller.signal)
            .then((rows) => {
                if (!mounted) return;
                setFacilities(rows || []);
            })
            .catch(() => setError("Không thể tải danh sách cơ sở"))
            .finally(() => mounted && setLoading(false));

        return () => {
            mounted = false;
            controller.abort();
        };
    }, [open]);

    const startEdit = (facility: Facility) => {
        setEditing(facility);
        setForm({ ...facility });
    };

    const startCreate = () => {
        setEditing(null);
        setForm({ name: "", address: "", lat: 10.7769, lng: 106.7009, type: DEFAULT_FACILITY_TYPE });
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

        const match = facilities.find((f) => String(f.id) === String(openIntent.facilityId));
        if (match) {
            startEdit(match);
            intentAppliedKeyRef.current = key;
        }
    }, [open, loading, error, openIntent, facilities]);

    const submit = async () => {
        const formType = (form.type as FacilityType | undefined) ?? DEFAULT_FACILITY_TYPE;
        try {
            setSaving(true);
            setError(null);

            if (editing) {
                const updated = await adminApi.updateFacility(editing.id, form as Partial<Facility>);
                setFacilities((prev) =>
                    prev.map((f) =>
                        String(f.id) === String(updated.id)
                            ? { ...updated, type: formType }
                            : f,
                    ),
                );
                showToast("Cập nhật cơ sở thành công", "success");
            } else {
                const created = await adminApi.createFacility(form as Partial<Facility>);
                setFacilities((prev) => [{ ...created, type: formType }, ...prev]);
                showToast("Thêm cơ sở thành công", "success");
            }

            setEditing(null);
            setForm({ name: "", address: "", lat: 0, lng: 0, type: DEFAULT_FACILITY_TYPE });
        } catch {
            setError("Lưu không thành công");
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
            setRemovingIds((prev) => (prev.includes(facilityKey) ? prev : [...prev, facilityKey]));
            window.setTimeout(() => {
                setFacilities((prev) => prev.filter((f) => String(f.id) !== facilityKey));
                setRemovingIds((prev) => prev.filter((id) => id !== facilityKey));
            }, REMOVE_ANIMATION_MS);
            showToast("Xóa cơ sở thành công", "success");
        } catch {
            setError("Xóa không thành công");
            showToast("Xóa cơ sở không thành công", "error");
        } finally {
            setDeletingId(null);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[900] grid place-items-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl transition-all duration-200 ease-out">
                <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-bold text-slate-900">Quản lý cơ sở y tế</h3>
                    <div className="flex gap-2">
                        <button className="rounded-md bg-slate-100 px-3 py-2 transition-colors hover:bg-slate-200" onClick={startCreate} disabled={isBusy}>
                            Thêm mới
                        </button>
                        <button className="rounded-md bg-slate-900 px-3 py-2 text-white" onClick={onClose}>
                            Đóng
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                        {loading ? (
                            <div>Đang tải...</div>
                        ) : error ? (
                            <div className="text-red-600">{error}</div>
                        ) : filteredFacilities.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
                                Chưa có cơ sở theo loại đã chọn
                            </div>
                        ) : (
                            filteredFacilities.map((f) => {
                                const isRemoving = removingIds.includes(String(f.id));
                                return (
                                <div
                                    key={String(f.id)}
                                    className={`flex items-center justify-between gap-2 rounded-lg border p-2 transition-all duration-200 ${
                                        isRemoving
                                            ? "pointer-events-none scale-[0.98] border-transparent opacity-0"
                                            : "opacity-100 hover:border-slate-300"
                                    }`}
                                >
                                    <div>
                                        <div className="font-semibold">{f.name}</div>
                                        <div className="text-xs text-slate-600">{f.address}</div>
                                        {f.is_active === false ? (
                                            <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                                Tạm ngưng
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="rounded-md bg-amber-50 px-2 py-1 text-amber-700 transition-colors hover:bg-amber-100" onClick={() => startEdit(f)} disabled={isBusy}>
                                            Sửa
                                        </button>
                                        <button
                                            className="rounded-md bg-red-50 px-2 py-1 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            onClick={() => setPendingDelete(f)}
                                            disabled={isBusy}
                                        >
                                            {deletingId !== null && String(deletingId) === String(f.id) ? "Đang xóa..." : "Xóa"}
                                        </button>
                                    </div>
                                </div>
                            );
                            })
                        )}
                    </div>

                    <div>
                        <h4 className="font-semibold">{editing ? "Sửa cơ sở" : "Tạo cơ sở mới"}</h4>
                        <div className="mt-2 grid gap-2">
                            <input className={facilityFormFieldClass} placeholder="Tên" value={form.name ?? ""} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                            <input className={facilityFormFieldClass} placeholder="Địa chỉ" value={form.address ?? ""} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
                            <div className="flex gap-2">
                                <input className={`w-1/2 ${facilityFormFieldClass}`} placeholder="Lat" value={String(form.lat ?? "")}
                                    onChange={(e) => setForm((s) => ({ ...s, lat: Number(e.target.value) }))} />
                                <input className={`w-1/2 ${facilityFormFieldClass}`} placeholder="Lng" value={String(form.lng ?? "")}
                                    onChange={(e) => setForm((s) => ({ ...s, lng: Number(e.target.value) }))} />
                            </div>
                            <input className={facilityFormFieldClass} placeholder="Hotline" value={form.phone ?? ""} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
                            <select
                                className={facilityFormFieldClass}
                                aria-label="Loại cơ sở"
                                value={String(selectedType)}
                                onChange={(e) => setForm((s) => ({ ...s, type: Number(e.target.value) as FacilityType }))}
                            >
                                <option value="1">Bệnh viện</option>
                                <option value="2">Phòng khám</option>
                                <option value="3">Nhà thuốc</option>
                            </select>


                            <div className="mt-2 flex gap-2">
                                <button className="rounded-md bg-slate-900 px-3 py-2 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400" onClick={submit} disabled={isBusy}>
                                    {saving ? "Đang lưu..." : "Lưu"}
                                </button>
                                <button className="rounded-md bg-slate-100 px-3 py-2 transition-colors hover:bg-slate-200" onClick={() => { setEditing(null); setForm({ name: "", address: "", lat: 0, lng: 0, type: DEFAULT_FACILITY_TYPE }); }} disabled={isBusy}>
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {pendingDelete ? (
                <div className="fixed inset-0 z-[910] grid place-items-center bg-black/45 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl transition-all duration-200 ease-out">
                        <h4 className="text-base font-semibold">Xác nhận xóa cơ sở</h4>
                        <p className="mt-2 text-sm text-slate-600">
                            Bạn có chắc muốn xóa <span className="font-semibold text-slate-800">{pendingDelete.name}</span> không?
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                className="rounded-md bg-slate-100 px-3 py-2 text-sm transition-colors hover:bg-slate-200"
                                onClick={() => setPendingDelete(null)}
                                disabled={deletingId !== null}
                            >
                                Hủy
                            </button>
                            <button
                                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                                onClick={() => remove(pendingDelete)}
                                disabled={deletingId !== null}
                            >
                                {deletingId !== null ? "Đang xóa..." : "Xác nhận xóa"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {toast ? (
                <div className="pointer-events-none fixed bottom-6 right-6 z-[920]">
                    <div
                        className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
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
