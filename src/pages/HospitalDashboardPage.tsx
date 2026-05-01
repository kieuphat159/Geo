import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import AdminDispatchMap from "../components/AdminDispatchMap";
import EmergencyTable from "../components/EmergencyTable";
import * as adminApi from "../services/adminApi";
import type { EmergencyCase } from "../types/emergency";

const HCMC_CENTER: [number, number] = [10.7769, 106.7009];

export default function HospitalDashboardPage() {
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  const [ambulances, setAmbulances] = useState<any[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const [ambulancePositionsByRequest, setAmbulancePositionsByRequest] = useState<Record<number, [number, number]>>({});

  const socketRef = useRef<Socket | null>(null);
  const joinedRequestIdsRef = useRef<Set<number>>(new Set());
  const emergenciesRef = useRef<any[]>([]);

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
    const rows = await adminApi.fetchEmergencies(signal);
    setEmergencies(rows || []);
    if (socketRef.current) {
      joinRequestRooms(socketRef.current, rows || []);
    }
    return rows || [];
  }, [joinRequestRooms]);

  const handleDispatch = useCallback(
    async (emergencyId: string) => {
      try {
        // Prefer already-loaded ambulances, but if missing/empty, re-fetch to avoid "return early".
        let ambulanceCandidates = ambulances;
        if (!ambulanceCandidates || ambulanceCandidates.length === 0) {
          ambulanceCandidates = await adminApi.fetchAmbulances();
        }

        const ambulance =
          ambulanceCandidates.find((a) => a.status === "available") ?? ambulanceCandidates[0];
        if (!ambulance?.id) {
          // No available ambulance to dispatch.
          return;
        }

        const emergencyRequestId = Number(emergencyId);
        const ambulanceId = Number(ambulance.id);

        // Optimistic UI: reflect dispatch immediately.
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
        setAmbulances(updatedAmbulances || []);
        setPollError(null);
      } catch {
        setPollError("Không thể điều động xe cho ca cấp cứu");
      }
    },
    [ambulances, refreshEmergencies],
  );

  const handleArrived = useCallback(async (emergencyId: string) => {
    try {
      const id = Number(emergencyId);
      // Optimistic UI: show arrived state right after click.
      setEmergencies((prev) =>
        prev.map((row) => (Number(row.id) === id ? { ...row, status: "ARRIVED" } : row)),
      );
      await adminApi.updateEmergencyStatus(id, "in_progress");
      await refreshEmergencies();
      setPollError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không thể cập nhật trạng thái đã đến nơi";
      setPollError(msg);
    }
  }, [refreshEmergencies]);

  const handleComplete = useCallback(async (emergencyId: string) => {
    try {
      const id = Number(emergencyId);
      // Optimistic UI: completed should be visible immediately.
      setEmergencies((prev) =>
        prev.map((row) => (Number(row.id) === id ? { ...row, status: "COMPLETED" } : row)),
      );
      await adminApi.updateEmergencyStatus(id, "completed");
      await refreshEmergencies();
      setPollError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không thể cập nhật trạng thái hoàn thành";
      setPollError(msg);
    }
  }, [refreshEmergencies]);

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
        setAmbulances(rows || []);
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
      socket.emit("join-role-room", { role_id: 2 });
      joinRequestRooms(socket, emergenciesRef.current);
    });

    socket.on("sos_alert", (payload: any) => {
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      setFocusPosition([lat, lng]);
      setShowAlert(true);
      playBeep();
      window.setTimeout(() => setShowAlert(false), 5000);
      // New SOS created -> refresh list once (no polling).
      refreshEmergencies().catch(() => {
        setPollError("Không thể đồng bộ ca cấp cứu mới");
      });
    });

    socket.on("tracking_update", (payload: any) => {
      const requestId = payload?.emergency_request_id;
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (!Number.isFinite(requestId) || typeof lat !== "number" || typeof lng !== "number") return;
      setAmbulancePositionsByRequest((prev) => ({ ...prev, [requestId]: [lat, lng] }));
      // GPS updates imply ambulance is moving; reflect status realtime on UI.
      setEmergencies((prev) =>
        prev.map((row) =>
          Number(row.id) === Number(requestId) && row.status !== "ARRIVED" && row.status !== "COMPLETED"
            ? { ...row, status: "ON_THE_WAY" }
            : row,
        ),
      );
    });

    socket.on("tracking_ended", () => {
      // Request room closed on backend; reload list to reflect completed/cancelled state.
      refreshEmergencies().catch(() => {
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
  }, [joinRequestRooms, playBeep, refreshEmergencies, resolveSocketUrl]);

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

          <section className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-white px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Danh sách ca cấp cứu</h2>
              <p className="mt-1 text-sm text-slate-500">Các yêu cầu đang chờ phản hồi từ trung tâm</p>
            </div>
            <div className="bg-slate-50/30 p-6 flex-1">
              {pollError ? <div className="text-red-600">{pollError}</div> : null}
              <EmergencyTable
                rows={emergencies}
                onDispatch={handleDispatch}
                onArrived={handleArrived}
                onComplete={handleComplete}
              />
            </div>
          </section>

          <section
            className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            aria-label="Bản đồ theo dõi"
          >
            <div className="border-b border-slate-100 bg-white px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Bản đồ điều phối</h2>
            </div>
            <div className="p-6 flex-1 flex flex-col relative">
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
      </div>
      {showAlert ? (
        <div className="fixed right-6 top-6 z-[950] rounded-xl bg-red-600 px-4 py-3 text-white shadow-lg">
          <strong>Có ca cấp cứu mới đang chờ xử lý</strong>
        </div>
      ) : null}
    </main>
  );
}
