import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LocationPermissionPopup from "../components/LocationPermissionPopup";
import SosButton from "../components/SosButton";
import VietnamMap from "../components/VietnamMap";

export default function UserPage() {
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string>("Chưa cấp quyền vị trí.");

  const canUseGeolocation = useMemo(() => typeof navigator !== "undefined" && !!navigator.geolocation, []);

  useEffect(() => {
    const cachedLocation = localStorage.getItem("lastKnownUserLocation");
    if (!cachedLocation) {
      return;
    }

    try {
      const parsed = JSON.parse(cachedLocation) as { latitude: number; longitude: number };
      setCurrentPosition([parsed.latitude, parsed.longitude]);
      setGeoMessage("Đã tải vị trí gần nhất từ bộ nhớ trình duyệt.");
    } catch {
      localStorage.removeItem("lastKnownUserLocation");
    }
  }, []);

  const requestLocationPermission = () => {
    if (!canUseGeolocation) {
      setShowPermissionHelp(true);
      setGeoMessage("Trình duyệt này không hỗ trợ geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition: [number, number] = [position.coords.latitude, position.coords.longitude];
        setCurrentPosition(nextPosition);
        localStorage.setItem(
          "lastKnownUserLocation",
          JSON.stringify({ latitude: nextPosition[0], longitude: nextPosition[1] })
        );
        setGeoMessage("Đã cập nhật vị trí hiện tại.");
        setShowPermissionHelp(false);
      },
      () => {
        setGeoMessage("Bạn đã từ chối quyền vị trí hoặc chưa bật GPS.");
        setShowPermissionHelp(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleSosClick = () => {
    if (!currentPosition) {
      setGeoMessage("Không thể gửi SOS: Xin vui lòng cấp quyền vị trí trước!");
      requestLocationPermission();
      setShowPermissionHelp(true);
      return;
    }
    
    // Giả lập gọi API gửi SOS với toạ độ
    window.alert(
      `🚨 ĐÃ GỬI TÍN HIỆU SOS KHẨN CẤP!\n\nTọa độ của bạn:\n📍 Vĩ độ: ${currentPosition[0].toFixed(5)}\n📍 Kinh độ: ${currentPosition[1].toFixed(5)}\n\nĐội cứu hộ đang trên đường tới.`
    );
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-slate-900">
      <VietnamMap currentPosition={currentPosition} />

      {/* Top Glass App Bar */}
      <div className="absolute left-0 right-0 top-0 z-[600] bg-gradient-to-b from-slate-900/60 to-transparent pt-[max(1rem,env(safe-area-inset-top))] pb-8">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-1.5 shadow-lg backdrop-blur-md">
            <button
              className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50 active:scale-95 flex items-center justify-center gap-2"
              type="button"
              onClick={requestLocationPermission}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500">
                <path fillRule="evenodd" d="M11.986 3H12a2 2 0 012 2v6a2 2 0 01-1.5 1.937V7A2.5 2.5 0 0010 4.5H8.063A2 2 0 0110 3h1.986zM2 7a2 2 0 012-2h4a2 2 0 012 2v7.942l-4.184-4.185a.5.5 0 00-.707 0L2 14.942V7z" clipRule="evenodd" />
              </svg>
              Định vị
            </button>
            <Link
              className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-white/10 flex items-center justify-center gap-2"
              to="/hospital"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
              </svg>
              Bệnh viện
            </Link>
          </div>
        </div>
      </div>

      {/* Floating Status Pill */}
      <div
        className="pointer-events-none absolute bottom-40 left-0 right-0 z-[650] flex justify-center px-4"
        aria-live="polite"
      >
        <div className="inline-flex animate-[slide-up_0.5s_ease-out] items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 shadow-xl backdrop-blur-md">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
          </span>
          {geoMessage}
        </div>
      </div>

      {/* Centered SOS Button */}
      <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
        <div className="mt-12">
          <SosButton onClick={handleSosClick} />
        </div>
      </div>

      <LocationPermissionPopup open={showPermissionHelp} onClose={() => setShowPermissionHelp(false)} />
    </main>
  );
}
