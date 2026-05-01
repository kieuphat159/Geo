import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyProfile, saveMyProfile, type UserMedicalProfile } from "../services/profileApi";

const EMPTY_PROFILE: UserMedicalProfile = {
  full_name: "",
  age: null,
  emergency_contact_phone: "",
  blood_type: "",
  chronic_conditions: "",
  allergies: "",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserMedicalProfile>(EMPTY_PROFILE);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMyProfile().then((data) => {
      if (data) setProfile(data);
    }).catch(() => {
      setStatus("Không thể tải hồ sơ, vui lòng đăng nhập USER.");
    });
  }, []);

  return (
    <main className="min-h-dvh bg-slate-100 p-4">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Hồ sơ y tế SOS</h1>
          <Link to="/user" className="text-sm font-semibold text-slate-700">Về trang SOS</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-4">
          <input className="h-11 rounded-lg border px-3" placeholder="Họ tên" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
          <input className="h-11 rounded-lg border px-3" placeholder="Tuổi" type="number" value={profile.age ?? ""} onChange={(e) => setProfile({ ...profile, age: e.target.value ? Number(e.target.value) : null })} />
          <input className="h-11 rounded-lg border px-3" placeholder="SĐT người thân" value={profile.emergency_contact_phone} onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })} />
          <input className="h-11 rounded-lg border px-3" placeholder="Nhóm máu" value={profile.blood_type} onChange={(e) => setProfile({ ...profile, blood_type: e.target.value })} />
          <textarea className="rounded-lg border px-3 py-2 min-h-20" placeholder="Bệnh nền" value={profile.chronic_conditions} onChange={(e) => setProfile({ ...profile, chronic_conditions: e.target.value })} />
          <textarea className="rounded-lg border px-3 py-2 min-h-20" placeholder="Dị ứng" value={profile.allergies} onChange={(e) => setProfile({ ...profile, allergies: e.target.value })} />
        </div>
        <button
          className="mt-4 h-11 px-4 rounded-lg bg-slate-900 text-white font-semibold disabled:bg-slate-400"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setStatus(null);
            try {
              const saved = await saveMyProfile(profile);
              setProfile(saved);
              setStatus("Đã cập nhật hồ sơ.");
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "Không thể lưu hồ sơ");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Đang lưu..." : "Lưu hồ sơ"}
        </button>
        {status ? <p className="mt-3 text-sm font-semibold text-slate-700">{status}</p> : null}
      </div>
    </main>
  );
}
