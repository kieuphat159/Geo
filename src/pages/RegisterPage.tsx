import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithGoogle, register } from "../services/auth";

function routeByRole(roleId: number): string {
  const normalizedRoleId = Number(roleId);
  if (normalizedRoleId === 1) return "/super-admin";
  if (normalizedRoleId === 2) return "/admin";
  return "/";
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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
            setError("Không lấy được thông tin Google.");
            return;
          }

          setLoading(true);
          setError(null);
          try {
            const session = await loginWithGoogle(response.credential);
            navigate(routeByRole(session.user.role_id), { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Đăng ký bằng Google thất bại");
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
        text: "signup_with",
        width: 320,
      });
    };

    if (!existingScript) {
      script.onload = initializeGoogleButton;
      document.head.appendChild(script);
      return;
    }

    initializeGoogleButton();
  }, [googleClientId, navigate]);

  return (
    <main className="min-h-dvh bg-slate-100 grid place-items-center p-4">
      <form
        className="w-full max-w-md rounded-2xl bg-white shadow p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setLoading(true);
          try {
            const normalizedEmail = email.trim().toLowerCase();
            const session = await register(normalizedEmail, password);
            navigate(routeByRole(session.user.role_id), { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Không thể đăng ký");
          } finally {
            setLoading(false);
          }
        }}
      >
        <h1 className="text-xl font-bold text-slate-900">Tạo tài khoản mới</h1>
        <p className="mt-1 text-sm text-slate-600">Đăng ký mặc định bằng email và mật khẩu.</p>

        <label className="block mt-4">
          <span className="text-sm font-semibold text-slate-700">Email</span>
          <input
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-slate-700 placeholder:text-slate-400"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="block mt-3">
          <span className="text-sm font-semibold text-slate-700">Mật khẩu</span>
          <input
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-slate-700 placeholder:text-slate-400"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error ? <p className="mt-3 text-sm text-red-600 font-semibold">{error}</p> : null}

        <button
          className="mt-5 h-11 w-full rounded-lg bg-slate-900 text-white font-semibold disabled:bg-slate-400"
          type="submit"
          disabled={loading}
        >
          {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>

        <div className="mt-4">
          {googleClientId ? (
            <div ref={googleButtonRef} className="flex justify-center" />
          ) : (
            <p className="text-xs text-slate-500">Google login chưa được cấu hình (thiếu `VITE_GOOGLE_CLIENT_ID`).</p>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-semibold text-blue-700 hover:underline">
            Đăng nhập bằng email
          </Link>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <Link to="/user" className="font-semibold text-slate-700 hover:underline">
            Về trang chủ
          </Link>
        </p>
      </form>
    </main>
  );
}
