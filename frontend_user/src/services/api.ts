import axios from "axios";
import { useAuthStore } from "../store/authStore";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(
  (config) => {
    const authStorageStr = sessionStorage.getItem("ecommerce-auth-storage");
    if (authStorageStr) {
      try {
        const authStorage = JSON.parse(authStorageStr);
        const token = authStorage.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e) {
        console.error("Failed to parse auth storage", e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      const accountLocked = status === 403 && detail === "Your account has been locked or disabled.";
      if (status === 401 || accountLocked) {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/** Kiểu của một phần tử lỗi validation Pydantic từ FastAPI (422 detail array). */
interface ValidationErrorItem {
  msg?: string;
  [key: string]: unknown;
}

/**
 * Trích xuất thông báo lỗi thân thiện từ AxiosError hoặc Error thông thường.
 * Hỗ trợ cả chuỗi lỗi đơn lẫn mảng lỗi validation Pydantic của FastAPI.
 *
 * @param err   - Đối tượng lỗi bất kỳ (unknown để đảm bảo strict type safety).
 * @param fallback - Chuỗi dự phòng nếu không thể đọc được lỗi.
 * @returns     Thông báo lỗi dạng chuỗi.
 */
export function getErrorMessage(err: unknown, fallback = "Đã xảy ra lỗi"): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const detail = err.response.data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      // Mảng ValidationError từ Pydantic FastAPI — mỗi phần tử có field .msg
      return (detail as ValidationErrorItem[]).map((d) => d.msg ?? JSON.stringify(d)).join(", ");
    }
    if (detail && typeof detail === "object") {
      const detailObj = detail as Record<string, unknown>;
      return typeof detailObj.message === "string" ? detailObj.message : JSON.stringify(detail);
    }
  }
  return err instanceof Error ? err.message : fallback;
}

export default api;
