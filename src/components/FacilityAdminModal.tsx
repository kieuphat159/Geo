import { useEffect, useState } from "react";
import { guestStrings } from "../constants/guestStrings";
import type { Facility, FacilityType } from "../types/guest";
import * as adminApi from "../services/adminApi";

interface FacilityAdminModalProps {
    open: boolean;
    onClose: () => void;
}

export default function FacilityAdminModal({ open, onClose }: FacilityAdminModalProps) {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Facility | null>(null);

    const [form, setForm] = useState<Partial<Facility>>({ name: "", address: "", lat: 0, lng: 0, type: 3 as FacilityType });

    useEffect(() => {
        if (!open) return;

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
        setForm({ name: "", address: "", lat: 10.7769, lng: 106.7009, type: 3 as FacilityType });
    };

    const submit = async () => {
        try {
            setLoading(true);
            setError(null);

            if (editing) {
                const updated = await adminApi.updateFacility(editing.id, form as Partial<Facility>);
                setFacilities((prev) => prev.map((f) => (String(f.id) === String(updated.id) ? updated : f)));
            } else {
                const created = await adminApi.createFacility(form as Partial<Facility>);
                setFacilities((prev) => [created, ...prev]);
            }

            setEditing(null);
            setForm({ name: "", address: "", lat: 0, lng: 0, type: 3 });
        } catch (e) {
            setError("Lưu không thành công");
        } finally {
            setLoading(false);
        }
    };

    const remove = async (id: string | number) => {
        if (!confirm("Xóa cơ sở này?")) return;

        try {
            setLoading(true);
            await adminApi.deleteFacility(id);
            setFacilities((prev) => prev.filter((f) => String(f.id) !== String(id)));
        } catch {
            setError("Xóa không thành công");
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[900] grid place-items-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-bold">Quản lý cơ sở y tế</h3>
                    <div className="flex gap-2">
                        <button className="rounded-md bg-slate-100 px-3 py-2" onClick={startCreate}>
                            Thêm mới
                        </button>
                        <button className="rounded-md bg-slate-900 px-3 py-2 text-white" onClick={onClose}>
                            Đóng
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        {loading ? (
                            <div>Đang tải...</div>
                        ) : error ? (
                            <div className="text-red-600">{error}</div>
                        ) : (
                            facilities.map((f) => (
                                <div key={String(f.id)} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                                    <div>
                                        <div className="font-semibold">{f.name}</div>
                                        <div className="text-xs text-slate-600">{f.address}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="rounded-md bg-amber-50 px-2 py-1 text-amber-700" onClick={() => startEdit(f)}>
                                            Sửa
                                        </button>
                                        <button className="rounded-md bg-red-50 px-2 py-1 text-red-700" onClick={() => remove(f.id)}>
                                            Xóa
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div>
                        <h4 className="font-semibold">{editing ? "Sửa cơ sở" : "Tạo cơ sở mới"}</h4>
                        <div className="mt-2 grid gap-2">
                            <input className="w-full rounded border px-2 py-1" placeholder="Tên" value={form.name ?? ""} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                            <input className="w-full rounded border px-2 py-1" placeholder="Địa chỉ" value={form.address ?? ""} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
                            <div className="flex gap-2">
                                <input className="w-1/2 rounded border px-2 py-1" placeholder="Lat" value={String(form.lat ?? "")}
                                    onChange={(e) => setForm((s) => ({ ...s, lat: Number(e.target.value) }))} />
                                <input className="w-1/2 rounded border px-2 py-1" placeholder="Lng" value={String(form.lng ?? "")}
                                    onChange={(e) => setForm((s) => ({ ...s, lng: Number(e.target.value) }))} />
                            </div>
                            <input className="w-full rounded border px-2 py-1" placeholder="Hotline" value={form.phone ?? ""} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
                            <select className="w-full rounded border px-2 py-1" value={String(form.type ?? 3)} onChange={(e) => setForm((s) => ({ ...s, type: Number(e.target.value) as FacilityType }))}>
                                <option value="1">Bệnh viện</option>
                                <option value="2">Phòng khám</option>
                                <option value="3">Nhà thuốc</option>
                            </select>


                            <div className="mt-2 flex gap-2">
                                <button className="rounded-md bg-slate-900 px-3 py-2 text-white" onClick={submit} disabled={loading}>
                                    Lưu
                                </button>
                                <button className="rounded-md bg-slate-100 px-3 py-2" onClick={() => { setEditing(null); setForm({ name: "", address: "", lat: 0, lng: 0, type: 3 as FacilityType }); }}>
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
