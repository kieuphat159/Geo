import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthFormLayout from "../components/AuthFormLayout";
import { authFieldClass, btnPrimaryClass } from "../constants/formClasses";
import { useSosReconcile } from "../context/SosReconcileContext";
import type { AuthSession } from "../services/auth";
import { homePathForRoleId, login, loginWithGoogle, normalizeKnownRoleId } from "../services/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const { checkForReconcileOffer, queueNavigation } = useSosReconcile();

  const completeAuth = async (session: AuthSession) => {
    const roleId = normalizeKnownRoleId(session);
    const destination = homePathForRoleId(roleId);
    if (roleId !== 3) {
      navigate(destination, { replace: true });
      return;
    }

    const offer = await checkForReconcileOffer();
    if (offer.kind === "prompt") {
      queueNavigation(destination);
      return;
    }

    navigate(destination, { replace: true });
  };

  useEffect(() => {
    if (!googleClientId || typeof window === "undefined") {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    const script = existingScript ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";

    const initializeGoogleButton = () => {
      const googleApi = (window as Window & {
        google?: {
          accounts?: {
            id?: {
              initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
              renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
            };
          };
        };
      }).google;

      if (!googleApi?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      googleApi.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setError("Không lấy được thông tin Google đăng nhập.");
            return;
          }

          setLoading(true);
          setError(null);
          try {
            const session = await loginWithGoogle(response.credential);
            await completeAuth(session);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Đăng nhập Google thất bại");
          } finally {
            setLoading(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      googleApi.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        shape: "pill",
        size: "large",
        text: "signin_with",
        width: 320,
      });
    };

    if (!existingScript) {
      script.onload = initializeGoogleButton;
      document.head.appendChild(script);
      return;
    }

    initializeGoogleButton();
  }, [googleClientId]);

  return (
    <AuthFormLayout
      title="Đăng nhập hệ thống SOS"
      subtitle="Một cổng chung cho User, Admin bệnh viện và Super Admin."
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
          const session = await login(email, password);
          await completeAuth(session);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Không thể đăng nhập");
        } finally {
          setLoading(false);
        }
      }}
      footerLinks={[
        { label: "Chưa có tài khoản? Đăng ký ngay", href: "/register", emphasis: true },
        { label: "← Về trang chủ / bản đồ SOS", href: "/user" },
      ]}
    >
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Email</span>
        <input className={authFieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-600">Mật khẩu</span>
        <input
          className={authFieldClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button className={`mt-5 h-11 w-full ${btnPrimaryClass}`} type="submit" disabled={loading}>
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      <div className="mt-4 border-t border-slate-100 pt-4">
        {googleClientId ? (
          <div ref={googleButtonRef} className="flex justify-center" />
        ) : (
          <p className="text-center text-xs text-slate-500">Google login chưa được cấu hình.</p>
        )}
      </div>
    </AuthFormLayout>
  );
}
