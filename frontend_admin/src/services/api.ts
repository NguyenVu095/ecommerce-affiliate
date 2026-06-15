import axios from 'axios'
import { useAuthStore, type AdminUser } from '../store/authStore'

export type { AdminUser } from '../store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
})

export interface PaginatedResponse<T> {
  total: number
  page: number
  page_size: number
  total_pages: number
  data: T[]
}

export interface MessageResponse {
  message: string
}

export interface LoginResponse {
  access_token: string
  token_type?: string
}

export interface AdminStatsResponse {
  total_orders: number
  orders_today: number
  pending_orders: number
  confirmed_orders: number
  shipping_orders: number
  cancelled_orders: number
  revenue_today: number
  revenue_total: number
}

export interface AdminRevenueChartFilter {
  year?: number
  month?: number
}

export interface AdminRevenueChartPoint {
  date: string
  day: number
  orders: number
  revenue: number
}

export interface AdminRevenueChartResponse {
  year: number
  month: number
  total_orders: number
  total_revenue: number
  average_order_value: number
  data: AdminRevenueChartPoint[]
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipping' | 'success' | 'cancelled'
export type PaymentStatus = 'paid' | 'unpaid' | 'refunded' | string

export interface AdminPaymentRefund {
  id: number
  request_id: string
  amount: number
  status: string
  reason: string
  response_code: string | null
  transaction_status: string | null
  created_at: string | null
  completed_at: string | null
}

export interface AdminPaymentTransaction {
  id: number
  order_id: number
  provider: string
  txn_ref: string
  amount: number
  currency: string
  status: string
  gateway_transaction_no: string | null
  response_code: string | null
  transaction_status: string | null
  bank_code: string | null
  card_type: string | null
  pay_date: string | null
  confirmed_at: string | null
  last_reconciled_at: string | null
  created_at: string | null
  refunds: AdminPaymentRefund[]
}

export interface AdminOrderItem {
  id: number
  variant_id: number
  quantity: number
  price: number
  sku: string | null
  product_name: string | null
  variant_name: string | null
}

export interface AdminOrder {
  id: number
  order_code: string
  status: OrderStatus | string
  payment_status: PaymentStatus
  user_id: number | null
  user_email: string | null
  user_name: string | null
  coupon_code: string | null
  receiver_name: string | null
  receiver_phone: string | null
  receiver_email: string | null
  total_base_price: number
  shipping_fee: number
  discount_amount: number
  total_final: number
  shipping_full_address: string
  note: string | null
  shipping_order_code: string | null
  ghn_status: string | null
  expected_delivery_time: string | null
  created_at: string | null
  items: AdminOrderItem[]
}

export interface OrderFilter {
  page?: number
  page_size?: number
  status?: string
  payment_status?: string
  search?: string
  date_from?: string
  date_to?: string
}

export interface OrderStatusResponse extends MessageResponse {
  order_id: number
  status: string
}

export interface ProductFilter {
  page?: number
  page_size?: number
  search?: string
  category_id?: number
  status?: number
  gender?: number
}

export interface AdminProduct {
  id: number
  name: string
  slug: string
  category_id: number | null
  category_name: string | null
  description: string | null
  base_price: number
  commission_rate: number
  thumbnail: string | null
  gender: number
  status: number
  total_stock: number
  variant_count: number
  created_at: string | null
}

export interface AdminProductVariant {
  id: number
  sku: string | null
  attributes: Record<string, string> | null
  price: number
  sale_price: number | null
  stock: number
  image_url: string | null
  weight: number
  length: number
  width: number
  height: number
  status: number
}

export interface AdminProductDetail extends Omit<AdminProduct, 'total_stock' | 'variant_count'> {
  variants: AdminProductVariant[]
}

export interface AdminProductVariantPayload {
  id?: number
  sku?: string
  attributes?: Record<string, string>
  price: number
  sale_price: number | null
  stock: number
  image_url: string | null
  weight: number
  length: number
  width: number
  height: number
}

export interface AdminProductPayload {
  name: string
  slug: string
  category_id: number | null
  description: string | null
  base_price: number
  commission_rate: number
  thumbnail: string | null
  gender: number
  status: number
  variants: AdminProductVariantPayload[]
  delete_variant_ids?: number[]
}

export interface AdminProductMutationResponse extends MessageResponse {
  product_id: number
  status?: number
}

export interface BulkProductStatusResponse extends MessageResponse {
  updated: number
}

export interface BulkProductDeleteResponse extends MessageResponse {
  deleted: number
}

export interface AdminCategoryFlat {
  id: number
  name: string
  slug: string
  parent_id: number | null
  status: number
}

export type CouponType = 'percent' | 'fixed'
export type CouponApplicableType = 'all'
export type CouponComputedStatus = 'active' | 'inactive' | 'expired' | 'scheduled' | 'out'

export interface CouponFilter {
  page?: number
  page_size?: number
  search?: string
  status?: number
  type?: string
}

export interface AdminCoupon {
  id: number
  code: string
  type: CouponType
  value: number
  min_order: number
  max_discount: number | null
  quantity: number
  max_uses_per_user: number
  applicable_type: CouponApplicableType
  start_at: string | null
  expired_at: string | null
  status: number
  computed_status: CouponComputedStatus
  used_count: number
  created_at: string | null
}

export interface AdminCouponPayload {
  code: string
  type: CouponType
  value: number
  min_order: number
  max_discount: number | null
  quantity: number
  max_uses_per_user: number
  applicable_type: CouponApplicableType
  start_at: string | null
  expired_at: string | null
  status: number
}

export interface AdminCouponMutationResponse extends MessageResponse {
  coupon_id: number
  code?: string
  status?: number
}

export interface CouponUsageStats {
  coupon_id: number
  code: string
  total_used: number
  quantity: number
  total_revenue: number
  total_discount: number
  daily_data: Array<{ date: string; count: number }>
  top_users: Array<{ user_id: number; name: string; email: string; times: number }>
}

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled'
export type BatchCommissionStatus = 'approved' | 'cancelled'
export type AttributionType = 'cookie' | 'code' | 'manual'
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface AdminAffiliateFilter {
  page?: number
  page_size?: number
  search?: string
  status?: number
}

export interface AdminAffiliateCommissionFilter {
  page?: number
  page_size?: number
  search?: string
  status?: string
}

export interface AdminAffiliateConversionFilter {
  page?: number
  page_size?: number
  search?: string
  status?: string
  attribution_type?: string
  date_from?: string
  date_to?: string
}

export interface AdminAffiliateWithdrawalFilter {
  page?: number
  page_size?: number
  search?: string
  status?: string
}

export interface AdminAffiliateStats {
  total_affiliates: number
  total_links: number
  active_links: number
  total_clicks: number
  total_orders: number
  conversion_rate: number
  revenue_attributed: number
  total_commission: number
  pending_commission: number
  approved_commission: number
  paid_commission: number
  cancelled_commission: number
  payable_commission: number
}

export interface AdminAffiliateRow {
  id: number
  full_name: string
  email: string
  phone: string | null
  status: number
  referral_code: string
  created_at: string | null
  last_activity_at: string | null
  link_count: number
  active_link_count: number
  click_count: number
  order_count: number
  conversion_rate: number
  pending_commission: number
  approved_commission: number
  paid_commission: number
  cancelled_commission: number
  total_commission: number
}

export interface AdminCommissionRow {
  id: number
  user_id: number
  user_name: string
  user_email: string
  referral_code: string
  order_id: number
  order_code: string
  order_status: string
  order_total: number
  commission_rate: number
  amount: number
  status: CommissionStatus
  campaign_name: string | null
  channel: string | null
  note: string | null
  created_at: string | null
  approved_at: string | null
  paid_at: string | null
}

export interface AdminConversionSummary {
  total_conversions: number
  valid_conversions: number
  total_clicks: number
  conversion_rate: number
  unique_buyers: number
  total_order_value: number
  total_commission: number
  by_attribution: Record<AttributionType, number>
}

export interface AdminConversionRow {
  id: number
  order_id: number
  order_code: string
  order_status: string
  referrer_user_id: number
  referrer_name: string
  referrer_email: string
  referral_code: string
  referred_user_id: number | null
  buyer_name: string | null
  buyer_email: string | null
  commission_id: number
  commission_status: CommissionStatus
  order_total: number
  commission_amount: number
  attribution_type: AttributionType
  campaign_name: string | null
  channel: string | null
  created_at: string | null
}

export interface AdminConversionListResponse extends PaginatedResponse<AdminConversionRow> {
  summary: AdminConversionSummary
}

export interface AdminCommissionStatusResponse extends MessageResponse {
  commission_id?: number
  status: CommissionStatus | BatchCommissionStatus
  approved_at?: string | null
  paid_at?: string | null
  updated?: number
}

export interface AdminWithdrawalRow {
  id: number
  user_id: number
  user_name: string
  user_email: string
  referral_code: string
  amount: number
  status: WithdrawalStatus
  bank_name: string
  bank_account: string
  bank_owner: string
  note: string | null
  admin_note: string | null
  created_at: string | null
  processed_at: string | null
}

export interface AdminWithdrawalStatusResponse extends MessageResponse {
  withdrawal_id: number
  status: WithdrawalStatus
  processed_at: string
}

export interface AdminUserFilter {
  page?: number
  page_size?: number
  search?: string
  role?: number
  status?: number
}

export interface AdminUserRow {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: number
  status: number
  referral_code: string | null
  auth_provider: string
  avatar: string | null
  created_at: string | null
  updated_at: string | null
  order_count: number
}

export interface AdminUserStatusResponse extends MessageResponse {
  user_id: number
  status: number
}

export interface AdminCategoryFilter {
  page?: number
  page_size?: number
  search?: string
  status?: number
}

export interface AdminCategoryRow {
  id: number
  name: string
  slug: string
  parent_id: number | null
  parent_name: string | null
  status: number
  product_count: number
  created_at: string | null
}

export interface AdminCategoryPayload {
  name: string
  slug: string
  parent_id: number | null
  status: number
}

export interface AdminCategoryMutationResponse extends MessageResponse {
  category_id: number
  status?: number
}

export interface ShipperNextStatus {
  key: string
  label: string
}

export interface ShipperOrderItem {
  name: string
  variant: string | null
  sku: string | null
  quantity: number
}

export interface ShipperOrder {
  id: number
  order_code: string
  order_status: string
  ghn_status: string
  ghn_label: string
  next_statuses: ShipperNextStatus[]
  receiver_name: string | null
  receiver_phone: string | null
  receiver_email: string | null
  total_final: number
  shipping_fee: number
  payment_status: string
  payment_method_code: string
  cod_amount: number
  address: string
  note: string | null
  items: ShipperOrderItem[]
  shipping_order_code: string | null
  expected_delivery_time: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ShipperStatusResponse {
  success: boolean
  ghn_status: string
  ghn_label: string
  order_status: string
  next_statuses: ShipperNextStatus[]
}

export interface ShipmentDetailsResponse {
  message: string
  order_id: number
  shipping_order_code: string
  expected_delivery_time: string | null
}

interface ErrorDetailObject {
  message?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatValidationDetail(item: unknown): string {
  if (isRecord(item) && typeof item.msg === 'string') {
    return item.msg
  }
  return JSON.stringify(item)
}

function getDetailMessage(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    return detail.map((item) => formatValidationDetail(item)).join(', ')
  }

  if (isRecord(detail)) {
    const detailObject = detail as ErrorDetailObject
    if (typeof detailObject.message === 'string') {
      return detailObject.message
    }
    return JSON.stringify(detailObject)
  }

  return null
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data?.detail
      const accountLocked = err.response?.status === 403 && detail === 'Your account has been locked or disabled.'
      if (err.response?.status === 401 || accountLocked) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

export const loginApi = (email: string, password: string) =>
  api.post<LoginResponse>('/api/auth/login', { email, password })

export const getMeApi = (token?: string) =>
  api.get<AdminUser>('/api/auth/me', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)

export const getStatsApi = () => api.get<AdminStatsResponse>('/api/admin/stats')

export const getAdminRevenueChartApi = (params: AdminRevenueChartFilter = {}) =>
  api.get<AdminRevenueChartResponse>('/api/admin/revenue-chart', { params })

export const getOrdersApi = (params: OrderFilter = {}) =>
  api.get<PaginatedResponse<AdminOrder>>('/api/admin/orders', { params })

export const getOrderDetailApi = (id: number) =>
  api.get<AdminOrder>(`/api/admin/orders/${id}`)

export const updateOrderStatusApi = (id: number, status: string, note?: string) =>
  api.patch<OrderStatusResponse>(`/api/admin/orders/${id}/status`, { status, note })

export const getOrderPaymentTransactionsApi = (id: number) =>
  api.get<AdminPaymentTransaction[]>(`/api/admin/orders/${id}/payment-transactions`)

export const reconcilePaymentTransactionApi = (id: number) =>
  api.post<AdminPaymentTransaction>(`/api/admin/payment-transactions/${id}/reconcile`)

export const refundOrderPaymentApi = (id: number, reason: string) =>
  api.post<{ message: string; refund_id: number; order_id: number; status: string }>(
    `/api/admin/orders/${id}/refund`,
    { reason },
  )

export const getAdminProductsApi = (params: ProductFilter = {}) =>
  api.get<PaginatedResponse<AdminProduct>>('/api/admin/products', { params })

export const getAdminProductApi = (id: number) =>
  api.get<AdminProductDetail>(`/api/admin/products/${id}`)

export const createAdminProductApi = (data: AdminProductPayload) =>
  api.post<AdminProductMutationResponse>('/api/admin/products', data)

export const updateAdminProductApi = (id: number, data: AdminProductPayload) =>
  api.put<AdminProductMutationResponse>(`/api/admin/products/${id}`, data)

export const toggleAdminProductStatusApi = (id: number) =>
  api.patch<AdminProductMutationResponse>(`/api/admin/products/${id}/status`)

export const deleteAdminProductApi = (id: number) =>
  api.delete<AdminProductMutationResponse>(`/api/admin/products/${id}`)

export const getAdminCategoriesFlatApi = () =>
  api.get<AdminCategoryFlat[]>('/api/admin/categories-flat')

export const getAdminCouponsApi = (params: CouponFilter = {}) =>
  api.get<PaginatedResponse<AdminCoupon>>('/api/admin/coupons', { params })

export const getAdminCouponApi = (id: number) =>
  api.get<AdminCoupon>(`/api/admin/coupons/${id}`)

export const createAdminCouponApi = (data: AdminCouponPayload) =>
  api.post<AdminCouponMutationResponse>('/api/admin/coupons', data)

export const updateAdminCouponApi = (id: number, data: AdminCouponPayload) =>
  api.put<AdminCouponMutationResponse>(`/api/admin/coupons/${id}`, data)

export const toggleAdminCouponStatusApi = (id: number) =>
  api.patch<AdminCouponMutationResponse>(`/api/admin/coupons/${id}/status`)

export const deleteAdminCouponApi = (id: number) =>
  api.delete<AdminCouponMutationResponse>(`/api/admin/coupons/${id}`)

export const getAdminAffiliateStatsApi = () =>
  api.get<AdminAffiliateStats>('/api/admin/affiliate-stats')

export const getAdminAffiliatesApi = (params: AdminAffiliateFilter = {}) =>
  api.get<PaginatedResponse<AdminAffiliateRow>>('/api/admin/affiliates', { params })

export const getAdminAffiliateCommissionsApi = (params: AdminAffiliateCommissionFilter = {}) =>
  api.get<PaginatedResponse<AdminCommissionRow>>('/api/admin/affiliate-commissions', { params })

export const getAdminAffiliateConversionsApi = (params: AdminAffiliateConversionFilter = {}) =>
  api.get<AdminConversionListResponse>('/api/admin/affiliate-conversions', { params })

export const getAdminAffiliateWithdrawalsApi = (params: AdminAffiliateWithdrawalFilter = {}) =>
  api.get<PaginatedResponse<AdminWithdrawalRow>>('/api/admin/affiliate-withdrawals', { params })

export const updateAdminAffiliateCommissionStatusApi = (
  id: number,
  status: BatchCommissionStatus,
  note?: string,
) => api.patch<AdminCommissionStatusResponse>(`/api/admin/affiliate-commissions/${id}/status`, { status, note })

export const updateAdminAffiliateWithdrawalStatusApi = (
  id: number,
  status: Exclude<WithdrawalStatus, 'pending'>,
  adminNote?: string,
) => api.patch<AdminWithdrawalStatusResponse>(`/api/admin/affiliate-withdrawals/${id}/status`, {
  status,
  admin_note: adminNote,
})

export const getAdminUsersApi = (params: AdminUserFilter = {}) =>
  api.get<PaginatedResponse<AdminUserRow>>('/api/admin/users', { params })

export const toggleAdminUserStatusApi = (id: number) =>
  api.patch<AdminUserStatusResponse>(`/api/admin/users/${id}/status`)

export const getAdminCategoriesApi = (params: AdminCategoryFilter = {}) =>
  api.get<PaginatedResponse<AdminCategoryRow>>('/api/admin/categories', { params })

export const createAdminCategoryApi = (data: AdminCategoryPayload) =>
  api.post<AdminCategoryMutationResponse>('/api/admin/categories', data)

export const updateAdminCategoryApi = (id: number, data: AdminCategoryPayload) =>
  api.put<AdminCategoryMutationResponse>(`/api/admin/categories/${id}`, data)

export const toggleAdminCategoryStatusApi = (id: number) =>
  api.patch<AdminCategoryMutationResponse>(`/api/admin/categories/${id}/status`)

export const deleteAdminCategoryApi = (id: number) =>
  api.delete<AdminCategoryMutationResponse>(`/api/admin/categories/${id}`)

export const bulkProductStatusApi = (ids: number[], status: 0 | 1) =>
  api.patch<BulkProductStatusResponse>('/api/admin/products/bulk-status', { ids, status })

export const bulkProductDeleteApi = (ids: number[]) =>
  api.delete<BulkProductDeleteResponse>('/api/admin/products/bulk-delete', { data: { ids } })

export const batchCommissionStatusApi = (
  ids: number[],
  status: BatchCommissionStatus,
  note?: string,
) => api.patch<AdminCommissionStatusResponse>('/api/admin/affiliate-commissions/batch', { ids, status, note })

export const getCouponUsageStatsApi = (couponId: number) =>
  api.get<CouponUsageStats>(`/api/admin/coupons/${couponId}/usage-stats`)

export const getShipperOrdersApi = () =>
  api.get<ShipperOrder[]>('/api/shipper/orders')

export const updateShipperOrderStatusApi = (orderId: number, ghnStatus: string, note?: string) =>
  api.patch<ShipperStatusResponse>(`/api/shipper/orders/${orderId}/status`, {
    ghn_status: ghnStatus,
    note,
  })

export const updateShipmentDetailsApi = (
  orderId: number,
  shippingOrderCode: string,
  expectedDeliveryTime?: string,
) => api.patch<ShipmentDetailsResponse>(`/api/shipper/orders/${orderId}/shipment`, {
  shipping_order_code: shippingOrderCode,
  expected_delivery_time: expectedDeliveryTime || null,
})

export function getErrorMessage(err: unknown, fallback = 'Đã xảy ra lỗi'): string {
  if (axios.isAxiosError(err) && err.response?.data && isRecord(err.response.data)) {
    const detailMessage = getDetailMessage(err.response.data.detail)
    if (detailMessage) {
      return detailMessage
    }
  }

  return err instanceof Error ? err.message : fallback
}

export default api
