/**
 * orderService.ts — Tập trung toàn bộ lệnh gọi API liên quan đến đặt hàng.
 *
 * Theo tiêu chuẩn dự án: mọi lệnh gọi API phải được đặt trong thư mục
 * services/ tập trung, không được viết fetch/axios inline trong UI component.
 */

import api from "./api";
import type { UserAddress } from "../store/authStore";

// ─── Kiểu dữ liệu (Interfaces) ────────────────────────────────────────────────

/** Phương thức thanh toán lấy từ DB */
export interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  description?: string;
}

/** Phương thức vận chuyển lấy từ DB */
export interface ShippingMethod {
  id: number;
  name: string;
  estimated_delivery?: string;
  service_type_id?: number;
}

/** Payload tạo đơn hàng gửi lên backend */
export interface CreateOrderPayload {
  shipping_method_id: number;
  payment_method_id: number;
  coupon_id: null;
  coupon_code: string | null;
  affiliate_referral_code: string | null;
  affiliate_link_id: number | null;
  receiver_name: string;
  receiver_phone: string;
  receiver_email: string;
  shipping_full_address: string;
  to_district_id: number | null;
  to_ward_code: string | null;
  shipping_fee: number;
  discount_amount: number;
  note: string | null;
  items: { variant_id: number; quantity: number }[];
}

/** Phản hồi khi tạo đơn hàng thành công */
export interface CreateOrderResponse {
  id: number;
  order_code: string;
  total_final: number;
  payment_method_code?: string;
}

/** Phản hồi khi lấy URL thanh toán VNPAY */
export interface VnpayUrlResponse {
  payment_url: string;
}

export interface OrderItemProduct {
  product_id: number;
  product_name: string;
  thumbnail: string | null;
  attributes: Record<string, string> | null;
}

export interface OrderItemReview {
  id: number;
  rating: number;
  comment: string | null;
  images: string[] | null;
  status: string;
}

export interface OrderItem {
  id: number;
  variant_id: number;
  quantity: number;
  price: number;
  sku: string | null;
  product: OrderItemProduct | null;
  review: OrderItemReview | null;
}

export interface Order {
  id: number;
  order_code: string;
  total_base_price: number;
  shipping_fee: number;
  discount_amount: number;
  total_final: number;
  status: "pending" | "confirmed" | "shipping" | "success" | "cancelled";
  payment_status: "unpaid" | "paid" | "refunded";
  payment_method_code: string | null;
  ghn_status: string | null;
  expected_delivery_time: string | null;
  shipping_order_code: string | null;
  shipping_full_address: string;
  receiver_name: string | null;
  receiver_phone: string | null;
  coupon_code: string | null;
  note: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface PaginatedOrders {
  data: Order[];
  has_more: boolean;
}

// ─── Hàm gọi API ──────────────────────────────────────────────────────────────

/**
 * Lấy danh sách phương thức thanh toán từ DB.
 */
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const res = await api.get<PaymentMethod[]>("/api/orders/payment-methods");
  return res.data;
}

/**
 * Lấy danh sách phương thức vận chuyển từ DB.
 */
export async function getShippingMethods(): Promise<ShippingMethod[]> {
  const res = await api.get<ShippingMethod[]>("/api/orders/shipping-methods");
  return res.data;
}

/**
 * Lấy danh sách địa chỉ đã lưu của người dùng hiện tại.
 * Yêu cầu đã xác thực (interceptor tự đính kèm Bearer token).
 */
export async function getUserAddresses(): Promise<UserAddress[]> {
  const res = await api.get<UserAddress[]>("/api/auth/me/addresses");
  return res.data;
}

/**
 * Tạo đơn hàng mới.
 *
 * @param payload - Dữ liệu đơn hàng đầy đủ bao gồm thông tin người nhận,
 *                  địa chỉ GHN, phương thức vận chuyển, thanh toán và giỏ hàng.
 * @returns Đơn hàng vừa được tạo (id, order_code, total_final).
 */
export async function createOrder(
  payload: CreateOrderPayload
): Promise<CreateOrderResponse> {
  const res = await api.post<CreateOrderResponse>("/api/orders/", payload);
  return res.data;
}

/**
 * Lấy URL cổng thanh toán VNPAY cho đơn hàng.
 * Backend sẽ ký số URL và trả về link chuyển hướng.
 *
 * @param orderId   - ID đơn hàng trong DB.
 * @param orderCode - Mã đơn hàng hiển thị.
 * @param contact   - Số điện thoại hoặc email của người đặt.
 */
export async function getVnpayUrl(
  orderId: number,
  orderCode: string,
  contact: string
): Promise<string> {
  const res = await api.get<VnpayUrlResponse>(
    `/api/orders/${orderId}/vnpay-url`,
    {
      params: { order_code: orderCode, contact },
    }
  );
  return res.data.payment_url;
}

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại (phục vụ lịch sử mua hàng).
 */
export async function getMyOrders(params: { skip: number; limit: number }): Promise<Order[] | PaginatedOrders> {
  const res = await api.get<Order[] | PaginatedOrders>("/api/orders/me", { params });
  return res.data;
}

/**
 * Tra cứu thông tin đơn hàng bất kỳ bằng mã đơn hàng và số điện thoại/email liên hệ.
 */
export async function lookupOrder(orderCode: string, contact: string): Promise<Order> {
  const res = await api.get<Order>("/api/orders/lookup", {
    params: { order_code: orderCode, contact },
  });
  return res.data;
}

/**
 * Hủy đơn hàng của người dùng hiện tại.
 */
export async function cancelOrder(orderId: number): Promise<void> {
  await api.patch(`/api/orders/${orderId}/cancel`, {});
}
