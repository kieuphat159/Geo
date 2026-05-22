import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SosReconcileModal from "../components/SosReconcileModal";
import {
    linkAnonymousSosSession,
    markAnonymousSosDeclined,
    readAnonymousSosSession,
    resolveAnonymousReconcileOffer,
    type ReconcileOffer,
} from "../services/anonymousSosSession";
import { getStoredSession, normalizeKnownRoleId } from "../services/auth";

type SosReconcileContextValue = {
    offer: ReconcileOffer;
    reconcileModalOpen: boolean;
    loading: boolean;
    error: string | null;
    checkForReconcileOffer: () => Promise<ReconcileOffer>;
    openReconcilePrompt: () => Promise<ReconcileOffer>;
    declineReconcile: () => void;
    confirmReconcile: () => Promise<boolean>;
    queueNavigation: (path: string) => void;
    finishPendingNavigation: () => void;
    clearReconcileOffer: () => void;
    /** Bumped after successful link so banners can refresh. */
    reconcileGeneration: number;
};

const SosReconcileContext = createContext<SosReconcileContextValue | null>(null);

export function SosReconcileProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [offer, setOffer] = useState<ReconcileOffer>({ kind: "none" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingDestination, setPendingDestination] = useState<string | null>(null);
    const [reconcileGeneration, setReconcileGeneration] = useState(0);
    const autoCheckKeyRef = useRef<string | null>(null);

    const markAutoCheckDone = useCallback((nextOffer: ReconcileOffer) => {
        const session = getStoredSession();
        const stored = readAnonymousSosSession();
        if (!session?.token || !stored) {
            return;
        }
        const stableKey = `${session.user.id}:${stored.request_id}`;
        autoCheckKeyRef.current =
            nextOffer.kind === "none" ? `${stableKey}:none` : stableKey;
    }, []);

    const isUserRoleSession = useCallback((): boolean => {
        const session = getStoredSession();
        return normalizeKnownRoleId(session) === 3 && Boolean(session?.token);
    }, []);

    const checkForReconcileOffer = useCallback(async (): Promise<ReconcileOffer> => {
        if (!isUserRoleSession()) {
            setOffer({ kind: "none" });
            setError(null);
            setPendingDestination(null);
            autoCheckKeyRef.current = null;
            return { kind: "none" } satisfies ReconcileOffer;
        }

        const nextOffer = await resolveAnonymousReconcileOffer();
        setOffer(nextOffer);
        setError(null);
        markAutoCheckDone(nextOffer);
        return nextOffer;
    }, [isUserRoleSession, markAutoCheckDone]);

    const openReconcilePrompt = useCallback(async (): Promise<ReconcileOffer> => {
        if (!isUserRoleSession()) {
            setOffer({ kind: "none" });
            return { kind: "none" } satisfies ReconcileOffer;
        }

        const stored = readAnonymousSosSession();
        if (!stored) {
            setOffer({ kind: "none" });
            return { kind: "none" } satisfies ReconcileOffer;
        }

        return checkForReconcileOffer();
    }, [checkForReconcileOffer, isUserRoleSession]);

    const declineReconcile = useCallback(() => {
        if (offer.kind === "prompt") {
            markAnonymousSosDeclined(offer.session.request_id);
        }
        setOffer({ kind: "none" });
        setError(null);
        setReconcileGeneration((value) => value + 1);
    }, [offer]);

    const confirmReconcile = useCallback(async () => {
        if (offer.kind !== "prompt") {
            return true;
        }

        setLoading(true);
        setError(null);
        const linked = await linkAnonymousSosSession(offer.session.session_token, offer.session.request_id);
        setLoading(false);

        if (!linked) {
            setError("Không thể liên kết SOS. Vui lòng thử lại hoặc tiếp tục ẩn danh.");
            return false;
        }

        setOffer({ kind: "none" });
        setReconcileGeneration((value) => value + 1);
        return true;
    }, [offer]);

    const queueNavigation = useCallback((path: string) => {
        setPendingDestination(path);
    }, []);

    const finishPendingNavigation = useCallback(() => {
        if (pendingDestination) {
            navigate(pendingDestination, { replace: true });
        }
        setPendingDestination(null);
    }, [navigate, pendingDestination]);

    const clearReconcileOffer = useCallback(() => {
        setOffer({ kind: "none" });
        setError(null);
    }, []);

    useEffect(() => {
        const session = getStoredSession();
        const roleId = normalizeKnownRoleId(session);

        if (roleId !== 3 || !session?.token) {
            autoCheckKeyRef.current = null;
            setOffer({ kind: "none" });
            setPendingDestination(null);
            setError(null);
            return;
        }

        const stored = readAnonymousSosSession();
        if (!stored) {
            autoCheckKeyRef.current = null;
            return;
        }

        const stableKey = `${session.user.id}:${stored.request_id}`;
        if (autoCheckKeyRef.current === stableKey) {
            return;
        }

        let cancelled = false;
        void checkForReconcileOffer().then(() => {
            if (cancelled) {
                return;
            }
        });

        return () => {
            cancelled = true;
        };
    }, [location.pathname, location.key, checkForReconcileOffer]);

    const reconcileModalOpen = offer.kind === "prompt" && isUserRoleSession();
    const reconcileRequestId = offer.kind === "prompt" ? offer.session.request_id : 0;
    const reconcileIsActive = offer.kind === "prompt" ? offer.isActive : false;

    const handleDecline = () => {
        declineReconcile();
        finishPendingNavigation();
    };

    const handleConfirm = async () => {
        const ok = await confirmReconcile();
        if (ok) {
            finishPendingNavigation();
        }
    };

    const value: SosReconcileContextValue = {
        offer,
        reconcileModalOpen,
        loading,
        error,
        checkForReconcileOffer,
        openReconcilePrompt,
        declineReconcile,
        confirmReconcile,
        queueNavigation,
        finishPendingNavigation,
        clearReconcileOffer,
        reconcileGeneration,
    };

    return (
        <SosReconcileContext.Provider value={value}>
            {children}
            <SosReconcileModal
                open={reconcileModalOpen}
                isActive={reconcileIsActive}
                requestId={reconcileRequestId}
                loading={loading}
                error={error}
                onDecline={handleDecline}
                onConfirm={handleConfirm}
            />
        </SosReconcileContext.Provider>
    );
}

export function useSosReconcile(): SosReconcileContextValue {
    const context = useContext(SosReconcileContext);
    if (!context) {
        throw new Error("useSosReconcile must be used within SosReconcileProvider");
    }
    return context;
}
