/**
 * authService.ts — Tập trung toàn bộ lệnh gọi API liên quan đến xác thực.
 *
 * Theo tiêu chuẩn dự án: mọi lệnh gọi API phải được đặt trong thư mục
 * services/ tập trung, không được viết fetch/axios inline trong UI component.
 */

import api from "./api";
import type { User } from "../store/authStore";

/** Payload trả về từ POST /api/auth/login */
export interface LoginResponse {
  access_token: string;
  token_type: string;
}

/**
 * Đăng nhập: gửi email/password, nhận access_token.
 * Sau đó dùng token để lấy thông tin user hiện tại (/me).
 *
 * Lý do gọi /me riêng sau login: interceptor chưa có token trong store
 * tại thời điểm này, nên phải truyền Authorization header thủ công.
 */
export async function loginApi(
  email: string,
  password: string
): Promise<{ token: string; user: User }> {
  const loginRes = await api.post<LoginResponse>("/api/auth/login", {
    email,
    password,
  });
  const token = loginRes.data.access_token;

  const meRes = await api.get<User>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return { token, user: meRes.data };
}

/** Đăng ký tài khoản mới với email và mật khẩu. */
export async function registerApi(
  email: string,
  password: string
): Promise<void> {
  await api.post("/api/auth/register", { email, password });
}
