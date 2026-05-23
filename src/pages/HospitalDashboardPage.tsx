import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import AppPageShell from "../components/AppPageShell";
import AppToast from "../components/AppToast";
import AdminDispatchMap from "../components/AdminDispatchMap";
import EmergencyTable from "../components/EmergencyTable";
import { formControlFieldClassName } from "../constants/formClasses";
import * as adminApi from "../services/adminApi";
import { getStoredSession } from "../services/auth";
import type { EmergencyCase } from "../types/emergency";
import {
  dedupeAmbulancesByPlate,
  isValidAmbulancePlate,
  normalizeAmbulancePlate,
} from "../utils/ambulancePlate";
import { normalizeEmergencyRows } from "../utils/emergencyStatus";

const HCMC_CENTER: [number, number] = [10.7769, 106.7009];

export default function HospitalDashboardPage() {
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  const [ambulances, setAmbulances] = useState<any[]>([]);
  const [newPlate, setNewPlate] = useState("");
  const [ambulanceFormError, setAmbulanceFormError] = useState<string | null>(null);
  const [ambulanceSaving, setAmbulanceSaving] = useState(false);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const facilityId = getStoredSession()?.user?.facility_id ?? null;
  const [ambulancePositionsByRequest, setAmbulancePositionsByRequest] = useState<Record<number, [number, number]>>({});

  const socketRef = useRef<Socket | null>(null);
  const joinedRequestIdsRef = useRef<Set<number>>(new Set());
  const emergenciesRef = useRef<any[]>([]);
  const lastSosFocusRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => {
    emergenciesRef.current = emergencies;
  }, [emergencies]);

  const patientMarkers = useMemo(() => {
    return emergencies
      .filter((e: EmergencyCase) => typeof e.latitude === "number" && typeof e.longitude === "number")
      .map((e: any) => ({ requestId: Number(e.id), lat: e.latitude, lng: e.longitude }));
  }, [emergencies]);

  const stats = useMemo(() => {
    const available = ambulances.filter((a) => a.status === "available").length;
    const onMission = ambulances.filter((a) => a.status === "dispatched").length;
    const waiting = emergencies.filter((e) => e.status === "WAITING").length;
    return { available, onMission, waiting };
  }, [ambulances, emergencies]);

  const resolveSocketUrl = useCallback(() => {
    const configuredWs = import.meta.env.VITE_WS_URL as string | undefined;
    if (configuredWs) {
      const u = new URL(configuredWs, window.location.origin);
      if (u.protocol === "ws:") u.protocol = "http:";
      if (u.protocol === "wss:") u.protocol = "https:";
      return u.toString();
    }

    const configuredApi = import.meta.env.VITE_API_URL as string | undefined;
    if (configuredApi) {
      const u = new URL(configuredApi, window.location.origin);
      if (u.protocol === "ws:") u.protocol = "http:";
      if (u.protocol === "wss:") u.protocol = "https:";
      return u.origin;
    }

    return "http://localhost:3000";
  }, []);

  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
      window.setTimeout(() => ctx.close?.(), 350);
    } catch {
      // ignore audio errors
    }
  }, []);

  const joinRequestRooms = useCallback(
    (socket: Socket, rows: any[]) => {
      rows.forEach((row) => {
        const requestId = Number(row.id);
        const token = row.tracking_token;
        if (!Number.isFinite(requestId) || !token) return;
        if (joinedRequestIdsRef.current.has(requestId)) return;
        joinedRequestIdsRef.current.add(requestId);
        socket.emit("join_request_room", { requestId, token });
      });
    },
    [joinedRequestIdsRef],
  );

  const refreshEmergencies = useCallback(async (signal?: AbortSignal) => {
    const rows = normalizeEmergencyRows((await adminApi.fetchEmergencies(signal)) || []);
    setEmergencies(rows);
    if (socketRef.current) {
      joinRequestRooms(socketRef.current, rows || []);
    }
    return rows || [];
  }, [joinRequestRooms]);

  const handleDispatch = useCallback(
    async (emergencyId: string, ambulanceId: number) => {
      try {
        if (!Number.isFinite(ambulanceId) || ambulanceId <= 0) {
          setPollError("Chọn xe cứu thương hợp lệ trước khi điều động.");
          return;
        }

        const emergencyRequestId = Number(emergencyId);

        setEmergencies((prev) =>
          prev.map((row) => (Number(row.id) === emergencyRequestId ? { ...row, status: "ASSIGNED" } : row)),
        );

        await adminApi.assignAmbulance(emergencyRequestId, ambulanceId);
        try {
          await adminApi.startTrackingSimulation(ambulanceId, emergencyRequestId, 3000);
        } catch {
          // Keep assigned state; tracking simulation failure should not hide successful dispatch.
        }
        await refreshEmergencies();
        const updatedAmbulances = await adminApi.fetchAmbulances();
        setAmbulances(dedupeAmbulancesByPlate(updatedAmbulances || []));
        setPollError(null);
      } catch {
        setPollError("Không thể điều động xe cho ca cấp cứu");
      }
    },
    [refreshEmergencies],
  );

  const reloadAmbulances = useCallback(async () => {
    try {
      const rows = await adminApi.fetchAmbulances();
      setAmbulances(dedupeAmbulancesByPlate(rows || []));
    } catch {
      // ignore
    }
  }, []);

  const handleAddAmbulance = useCallback(async () => {
    const plate = normalizeAmbulancePlate(newPlate);
    if (!plate) {
      setAmbulanceFormError("Nhập biển số xe cứu thương.");
      return;
    }
    if (!isValidAmbulancePlate(plate)) {
      setAmbulanceFormError("Biển số không hợp lệ (4–20 ký tự, chữ/số và dấu «-», ví dụ 59H-CR-06).");
      return;
    }
    if (facilityId == null || !Number.isFinite(Number(facilityId))) {
      setAmbulanceFormError("Tài khoản chưa gắn bệnh viện — không thể thêm xe.");
      return;
    }

    const duplicateLocal = ambulances.some(
      (a) => normalizeAmbulancePlate(String(a.plate_number ?? "")) === plate,
    );
    if (duplicateLocal) {
      setAmbulanceFormError(`Biển số ${plate} đã có trong đội xe — không thể thêm trùng.`);
      return;
    }

    setAmbulanceSaving(true);
    setAmbulanceFormError(null);
    try {
      await adminApi.createAmbulance({ plate_number: plate, facility_id: Number(facilityId) });
      setNewPlate("");
      await reloadAmbulances();
    } catch (e) {
      setAmbulanceFormError(e instanceof Error ? e.message : "Không thể thêm xe cứu thương");
    } finally {
      setAmbulanceSaving(false);
    }
  }, [ambulances, facilityId, newPlate, reloadAmbulances]);

  const handleSetAmbulanceMaintenance = useCallback(
    async (ambulanceId: number) => {
      try {
        await adminApi.updateAmbulanceStatus(ambulanceId, "maintenance");
        await reloadAmbulances();
      } catch {
        setAmbulanceFormError("Không thể cập nhật trạng thái xe");
      }
    },
    [reloadAmbulances],
  );

  const handleSetAmbulanceAvailable = useCallback(
    async (ambulanceId: number) => {
      try {
        await adminApi.updateAmbulanceStatus(ambulanceId, "available");
        await reloadAmbulances();
      } catch {
        setAmbulanceFormError("Không thể cập nhật trạng thái xe");
      }
    },
    [reloadAmbulances],
  );

  const ambulanceStatusUi = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === "available") {
      return { label: "Sẵn sàng", cls: "border-emerald-200 bg-emerald-50 text-emerald-900" };
    }
    if (s === "dispatched") {
      return { label: "Đang chạy ca", cls: "border-indigo-200 bg-indigo-50 text-indigo-900" };
    }
    return { label: "Bảo trì", cls: "border-slate-200 bg-slate-100 text-slate-700" };
  };

  const normalizeSocketEmergencyStatus = (raw: unknown): "WAITING" | "ASSIGNED" | "ON_THE_WAY" | "COMPLETED" | null => {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "COMPLETED" || s === "DONE") return "COMPLETED";
    if (s === "ASSIGNED") return "ASSIGNED";
    if (s === "ON_THE_WAY" || s === "IN_PROGRESS" || s === "ARRIVED") return "ON_THE_WAY";
    if (s === "WAITING" || s === "PENDING") return "WAITING";
    return null;
  };

  // Initial load once. After that, dashboard syncs by realtime socket events.
  useEffect(() => {
    const controller = new AbortController();
    refreshEmergencies(controller.signal).catch((e) => {
      if ((e as { name?: string }).name === "AbortError") return;
      setPollError("Không thể tải danh sách ca cấp cứu");
    });

    return () => {
      controller.abort();
    };
  }, [refreshEmergencies]);

  // Load ambulances for TC10 "Điều động xe"
  useEffect(() => {
    let mounted = true;
    adminApi
      .fetchAmbulances()
      .then((rows) => {
        if (!mounted) return;
        setAmbulances(dedupeAmbulancesByPlate(rows || []));
      })
      .catch(() => {
        // ignore
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Realtime socket wiring (TC09-TC10)
  useEffect(() => {
    const socket = io(resolveSocketUrl(), { transports: ["websocket"], reconnection: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      const facilityId = getStoredSession()?.user?.facility_id;
      socket.emit("join-role-room", {
        role_id: 2,
        ...(facilityId != null ? { facility_id: facilityId } : {}),
      });
      joinRequestRooms(socket, emergenciesRef.current);
    });

    socket.on("sos_alert", (payload: any) => {
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      const now = Date.now();
      const prev = lastSosFocusRef.current;
      if (
        prev &&
        Math.abs(prev.lat - lat) < 0.00001 &&
        Math.abs(prev.lng - lng) < 0.00001 &&
        now - prev.at < 30_000
      ) {
        return;
      }
      lastSosFocusRef.current = { lat, lng, at: now };
      setFocusPosition([lat, lng]);
      setShowAlert(true);
      playBeep();
      window.setTimeout(() => setShowAlert(false), 5000);
      // New SOS created -> refresh list once (no polling).
      refreshEmergencies()
        .then(() => reloadAmbulances())
        .catch(() => {
          setPollError("Không thể đồng bộ ca cấp cứu mới");
        });
    });

    socket.on("tracking_update", (payload: any) => {
      const requestId = payload?.emergency_request_id;
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (!Number.isFinite(requestId) || typeof lat !== "number" || typeof lng !== "number") return;
      setAmbulancePositionsByRequest((prev) => ({ ...prev, [requestId]: [lat, lng] }));

      const nextStatus = normalizeSocketEmergencyStatus(payload?.status);
      if (nextStatus === "COMPLETED") {
        setEmergencies((prev) =>
          prev.map((row) => (Number(row.id) === Number(requestId) ? { ...row, status: "COMPLETED" } : row)),
        );
        refreshEmergencies()
          .then(() => reloadAmbulances())
          .catch(() => {
            setPollError("Không thể đồng bộ trạng thái hoàn thành ca cấp cứu");
          });
        return;
      }

      // Default to moving state if backend status is absent in payload.
      const fallbackStatus = nextStatus ?? "ON_THE_WAY";
      setEmergencies((prev) =>
        prev.map((row) =>
          Number(row.id) === Number(requestId) && row.status !== "COMPLETED"
            ? { ...row, status: fallbackStatus }
            : row,
        ),
      );
    });

    socket.on("tracking_ended", () => {
      // Request room closed on backend; reload list to reflect completed/cancelled state.
      refreshEmergencies()
        .then(() => reloadAmbulances())
        .catch(() => {
          setPollError("Không thể đồng bộ trạng thái ca cấp cứu");
        });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      joinedRequestIdsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRequestRooms, playBeep, refreshEmergencies, reloadAmbulances, resolveSocketUrl]);

  // Safety sync: while there are active cases, periodically reconcile with backend
  // so UI cannot stay stuck in "Đang di chuyển" after connection glitches.
  useEffect(() => {
    const hasActiveCases = emergencies.some((row) => {
      const s = String(row.status).toUpperCase();
      return s === "WAITING" || s === "ASSIGNED" || s === "ON_THE_WAY" || s === "ARRIVED";
    });

    if (!hasActiveCases) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshEmergencies()
        .then(() => reloadAmbulances())
        .catch(() => {
          // Silent retry loop; avoid spamming UI with transient network errors.
        });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [emergencies, refreshEmergencies, reloadAmbulances]);

  // Avoid stale map focus when user switches browser tabs.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setFocusPosition(null);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <AppPageShell
      title="Trung tâm điều phối"
      subtitle="Màn hình nhận ca SOS và điều phối xe cứu thương"
      backTo={{ href: "/user", label: "Về bản đồ khẩn cấp" }}
    >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] xl:grid-cols-[1.8fr_1fr]">
          <section className="lg:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Xe đang sẵn sàng</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.available}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Xe đang làm nhiệm vụ</p>
              <p className="mt-1 text-2xl font-bold text-indigo-700">{stats.onMission}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Ca chờ điều phối</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{stats.waiting}</p>
            </article>
          </section>

          <section className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Đội xe cứu thương</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Biển số theo bệnh viện — chọn xe khi điều động ca chờ. Trạng thái cập nhật theo thao tác điều phối.
                </p>
              </div>
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddAmbulance();
              }}
            >
              <label className="flex-1">
                <span className="text-xs font-semibold text-slate-600">Thêm xe mới (biển số)</span>
                <input
                  className={`mt-1 ${formControlFieldClassName}`}
                  value={newPlate}
                  onChange={(e) => {
                    setNewPlate(e.target.value);
                    if (ambulanceFormError) setAmbulanceFormError(null);
                  }}
                  placeholder="VD: 59H-CR-06"
                  disabled={ambulanceSaving}
                  autoComplete="off"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Biển số không trùng trong toàn hệ thống (không thêm lại 59H-CR-01 … 05 đã có).
                </span>
              </label>
              <button
                type="submit"
                className="h-10 w-full shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 sm:w-auto"
                disabled={ambulanceSaving}
              >
                {ambulanceSaving ? "Đang lưu..." : "Thêm xe"}
              </button>
            </form>
            {ambulanceFormError ? (
              <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                {ambulanceFormError}
              </p>
            ) : null}
            {ambulances.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Chưa có xe — thêm biển số ở trên hoặc chạy seed ambulances cho môi trường dev.
              </p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {ambulances.map((a: any) => {
                  const ui = ambulanceStatusUi(String(a.status));
                  const status = String(a.status).toLowerCase();
                  return (
                    <li
                      key={String(a.id)}
                      className={`min-w-[140px] max-w-full rounded-xl border px-3 py-2 shadow-sm ${ui.cls}`}
                    >
                      <p className="break-all font-mono text-sm font-bold tracking-tight">{a.plate_number}</p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">{ui.label}</p>
                      {status === "maintenance" ? (
                        <button
                          type="button"
                          className="mt-2 text-[11px] font-semibold text-emerald-800 underline"
                          onClick={() => void handleSetAmbulanceAvailable(Number(a.id))}
                        >
                          Đưa về sẵn sàng
                        </button>
                      ) : status === "available" ? (
                        <button
                          type="button"
                          className="mt-2 text-[11px] font-semibold text-slate-700 underline"
                          onClick={() => void handleSetAmbulanceMaintenance(Number(a.id))}
                        >
                          Bảo trì
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Danh sách ca cấp cứu</h2>
              <p className="mt-1 text-sm text-slate-500">Các yêu cầu đang chờ phản hồi từ trung tâm</p>
            </div>
            <div className="flex-1 overflow-x-auto bg-slate-50/30 p-4 sm:p-6">
              {pollError ? <div className="text-red-600">{pollError}</div> : null}
              <EmergencyTable
                rows={emergencies}
                ambulances={ambulances}
                onDispatch={handleDispatch}
              />
            </div>
          </section>

          <section
            className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            aria-label="Bản đồ theo dõi"
          >
            <div className="border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Bản đồ điều phối</h2>
            </div>
            <div className="relative flex flex-1 flex-col p-4 sm:p-6">
              <div className="h-full min-h-[360px] w-full">
                <AdminDispatchMap
                  defaultCenter={HCMC_CENTER}
                  patientMarkers={patientMarkers}
                  ambulancePositionsByRequest={ambulancePositionsByRequest}
                  focusPosition={focusPosition}
                />
              </div>
            </div>
          </section>
        </div>
      {showAlert ? (
        <AppToast variant="solid-error" onClose={() => setShowAlert(false)}>
          <strong>Có ca cấp cứu mới đang chờ xử lý</strong>
        </AppToast>
      ) : null}
    </AppPageShell>
  );
}
