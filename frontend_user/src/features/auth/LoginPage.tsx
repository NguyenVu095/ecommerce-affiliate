import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import { getErrorMessage } from "../../services/api";
import { googleLoginApi, loginApi } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";
  const googleLoginEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Tách logic gọi API ra authService — không viết axios inline trong component
      const { token, user } = await loginApi(email, password);
      login(token, user);
      navigate(redirectUrl);
    } catch (err: unknown) {
      // Dùng unknown thay vì any để đảm bảo strict type safety
      setError(getErrorMessage(err, "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setLoading(true);
    setError("");

    try {
      const { token, user } = await googleLoginApi(credential);
      login(token, user);
      navigate(redirectUrl);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Đăng nhập Google thất bại. Vui lòng thử lại."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Đăng Nhập</h1>
        <p className="text-slate-500 mt-2">Chào mừng bạn quay trở lại LocalMart!</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded-xl mb-6 text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            required
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
          <input
            type="password"
            required
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-primary-700 disabled:opacity-50 mt-4 transition-colors"
        >
          {loading ? "Đang xử lý..." : "Đăng Nhập"}
        </button>
      </form>

      {googleLoginEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            hoặc
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton
              disabled={loading}
              onCredential={handleGoogleCredential}
              onError={setError}
            />
          </div>
        </>
      )}

      <p className="text-center mt-6 text-slate-500 text-sm">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="text-primary-600 font-semibold hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
