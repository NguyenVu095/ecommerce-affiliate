import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getErrorMessage } from "../../services/api";
import { registerApi } from "../../services/authService";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Dùng success state thay vì alert() — thân thiện hơn, không block UI
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }

    setLoading(true);

    try {
      // Tách logic gọi API ra authService — không viết axios inline trong component
      await registerApi(email, password);
      setSuccess("Đăng ký thành công! Đang chuyển hướng đến trang đăng nhập...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: unknown) {
      // Dùng unknown thay vì any để đảm bảo strict type safety
      setError(getErrorMessage(err, "Đăng ký thất bại. Email có thể đã tồn tại."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Đăng Ký Tài Khoản</h1>
        <p className="text-slate-500 mt-2">Tạo tài khoản để quản lý đơn hàng và làm Affiliate.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded-xl mb-6 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Thông báo thành công — thay thế alert() native để không block UI */}
      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-xl mb-6 text-sm font-medium">
          {success}
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
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu</label>
          <input
            type="password"
            required
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-md hover:bg-slate-800 disabled:opacity-50 mt-4 transition-colors"
        >
          {loading ? "Đang xử lý..." : "Tạo Tài Khoản"}
        </button>
      </form>

      <p className="text-center mt-6 text-slate-500 text-sm">
        Đã có tài khoản?{" "}
        <Link to="/login" className="text-primary-600 font-semibold hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
