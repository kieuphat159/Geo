import { useEffect, useState } from "react";
import AppPageShell from "../components/AppPageShell";
import { btnPrimaryClass, formControlFieldClassNameMt1 } from "../constants/formClasses";
import { getStoredSession } from "../services/auth";
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
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    getMyProfile()
      .then((data) => {
        if (cancelled) return;
        if (data) setProfile(data);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("401") || msg.toLowerCase().includes("đăng nhập")) {
          setStatus({ type: "error", message: "Phiên đăng nhập hết hạn — vui lòng đăng nhập lại." });
        } else {
          setStatus({
            type: "error",
            message: msg || "Không thể tải hồ sơ. Thử tải lại trang hoặc liên hệ quản trị.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const session = getStoredSession();
  const roleId = session?.user?.role_id;
  const roleNote =
    roleId === 1
      ? "Tài khoản Super Admin vẫn có thể lưu hồ sơ — dùng khi gửi SOS từ bản đồ người dùng."
      : roleId === 2
        ? "Tài khoản Admin bệnh viện vẫn có thể lưu hồ sơ — dùng khi gửi SOS từ bản đồ người dùng."
        : null;

  return (
    <AppPageShell
      title="Hồ sơ y tế SOS"
      subtitle="Thông tin dùng khi gửi cấp cứu — bệnh viện nhận được ngay trên ca điều phối."
      maxWidthClass="max-w-2xl"
      backTo={{ href: "/user", label: "Về bản đồ SOS" }}
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-sm text-slate-600">
          Các trường có dấu <span className="font-semibold text-red-600">*</span> nên điền đầy đủ để hỗ trợ cấp cứu nhanh hơn.
        </p>
        {roleNote ? (
          <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">{roleNote}</p>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-600">
              Họ tên <span className="text-red-600">*</span>
            </span>
            <input
              className={formControlFieldClassNameMt1}
              placeholder="Nguyễn Văn A"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-600">Tuổi</span>
            <input
              className={formControlFieldClassNameMt1}
              placeholder="VD: 32"
              type="number"
              min={0}
              max={120}
              value={profile.age ?? ""}
              onChange={(e) => setProfile({ ...profile, age: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-600">SĐT người thân</span>
            <input
              className={formControlFieldClassNameMt1}
              placeholder="09xxxxxxxx"
              value={profile.emergency_contact_phone}
              onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })}
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-600">Nhóm máu</span>
            <input
              className={formControlFieldClassNameMt1}
              placeholder="VD: O+"
              value={profile.blood_type}
              onChange={(e) => setProfile({ ...profile, blood_type: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-600">Bệnh nền</span>
            <textarea
              className={`${formControlFieldClassNameMt1} min-h-24 resize-y`}
              placeholder="Tiền sử bệnh, thuốc đang dùng..."
              value={profile.chronic_conditions}
              onChange={(e) => setProfile({ ...profile, chronic_conditions: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-600">Dị ứng</span>
            <textarea
              className={`${formControlFieldClassNameMt1} min-h-20 resize-y`}
              placeholder="Dị ứng thuốc, thực phẩm..."
              value={profile.allergies}
              onChange={(e) => setProfile({ ...profile, allergies: e.target.value })}
            />
          </label>
        </div>

        {status ? (
          <p
            className={`mt-4 rounded-xl border px-3 py-2 text-sm font-medium ${
              status.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
            role="alert"
          >
            {status.message}
          </p>
        ) : null}

        <div className="mt-6 flex justify-stretch sm:justify-end">
          <button
            className={`${btnPrimaryClass} w-full sm:w-auto`}
            disabled={loading || profileLoading}
            type="button"
            onClick={async () => {
              setLoading(true);
              setStatus(null);
              try {
                const saved = await saveMyProfile(profile);
                setProfile(saved);
                setStatus({ type: "success", message: "Đã lưu hồ sơ y tế thành công." });
              } catch (e) {
                setStatus({
                  type: "error",
                  message: e instanceof Error ? e.message : "Không thể lưu hồ sơ",
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Đang lưu..." : profileLoading ? "Đang tải..." : "Lưu hồ sơ"}
          </button>
        </div>
      </section>
    </AppPageShell>
  );
}
