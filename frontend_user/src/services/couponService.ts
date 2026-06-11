/**
 * couponService.ts — Tập trung toàn bộ lệnh gọi API liên quan đến mã giảm giá.
 *
 * Theo tiêu chuẩn dự án: mọi lệnh gọi API phải được đặt trong thư mục
 * services/ tập trung, không được viết fetch/axios inline trong UI component.
 */

import api from "./api";

// ─── Kiểu dữ liệu (Interfaces) ────────────────────────────────────────────────

/**
 * Mã giảm giá trả về từ API /available.
 * Bao gồm trạng thái hội đủ điều kiện để hiển thị lý do không áp dụng được.
 */
export interface CouponItem {
  id: number;
  code: string;
  type: string;
  value: number;
  max_discount: number | null;
  min_order: number;
  description: string;
  expired_at: string | null;
  /** true nếu người dùng đủ điều kiện dùng coupon này với đơn hàng hiện tại */
  is_eligible: boolean;
  /** true nếu coupon này người dùng đã từng dùng */
  is_used: boolean;
  /** Lý do không đủ điều kiện (null nếu đủ điều kiện) */
  ineligible_reason: string | null;
}

/** Phản hồi từ API kiểm tra coupon hợp lệ */
export interface ValidateCouponResponse {
  valid: boolean;
  discount_amount: number;
  message: string;
}

// ─── Hàm gọi API ──────────────────────────────────────────────────────────────

/**
 * Lấy danh sách coupon có sẵn cho đơn hàng hiện tại.
 * Backend trả về trạng thái is_eligible để frontend quyết định enable/disable.
 *
 * @param orderTotal - Tổng giá trị giỏ hàng hiện tại (dùng để lọc min_order).
 */
export async function getAvailableCoupons(
  orderTotal: number
): Promise<CouponItem[]> {
  const res = await api.get<CouponItem[]>(
    `/api/coupons/available?order_total=${orderTotal}`
  );
  return res.data;
}

/**
 * Kiểm tra tính hợp lệ của coupon và lấy số tiền giảm thực tế.
 * Cần gọi API riêng (không tin tưởng 100% client-side) để đảm bảo tính bảo mật.
 *
 * @param code       - Mã coupon người dùng chọn.
 * @param orderTotal - Tổng giá trị đơn hàng để backend tính toán discount_amount.
 */
export async function validateCoupon(
  code: string,
  orderTotal: number
): Promise<ValidateCouponResponse> {
  const res = await api.post<ValidateCouponResponse>("/api/coupons/validate", {
    code,
    order_total: orderTotal,
  });
  return res.data;
}
