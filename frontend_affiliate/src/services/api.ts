import axios from 'axios'
import { useAuthStore, type AffiliateUser } from '../store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
})

export interface LoginResponse {
  access_token: string
  token_type?: string
}

export interface DashboardMetric {
  label: string
  value: number
  change: number
}

export interface AffiliateDashboardResponse {
  month_commission: DashboardMetric
  month_clicks: DashboardMetric
  success_orders: DashboardMetric
  conversion_rate: DashboardMetric
  balance: {
    available: number
    pending: number
    paid_total: number
  }
  chart: Array<{ date: string; commission: number }>
  top_products: Array<{
    product_id: number | null
    name: string
    orders: number
    revenue: number
    commission: number
  }>
  recent_activities: Array<{
    title: string
    meta: string
    amount: number
    status: string
    created_at?: string
  }>
}

export interface AffiliateProductParams {
  page?: number
  page_size?: number
  search?: string
  category_id?: number
  sort?: string
}

export interface AffiliateProduct {
  id: number
  name: string
  category_name: string | null
  description: string | null
  thumbnail: string | null
  base_price: number
  sale_price: number | null
  stock: number
  commission_rate: number
  estimated_commission: number
  month_orders: number
  month_commission: number
}

export interface AffiliateProductListResponse {
  total: number
  page: number
  page_size: number
  total_pages: number
  data: AffiliateProduct[]
}

export interface AffiliateLinkCreatePayload {
  product_id: number
  campaign_name: string
  channel?: string
}

export interface AffiliateLinkParams {
  search?: string
  status?: string
  page?: number
  page_size?: number
}

export type AffiliateLinkStatus = 'active' | 'paused'

export interface AffiliateLink {
  id: number
  product_id: number
  product_name: string
  product_thumbnail: string | null
  campaign_name: string
  channel: string
  status: AffiliateLinkStatus
  tracking_url: string
  clicks: number
  orders: number
  commission: number
  created_at: string
}

export interface AffiliateLinkSummary {
  total_links: number
  active_links: number
  total_clicks: number
  total_orders: number
  total_commission: number
}

export interface AffiliateLinkListResponse {
  summary: AffiliateLinkSummary
  total: number
  page: number
  page_size: number
  total_pages: number
  data: AffiliateLink[]
}

export type AffiliateLinkUpdatePayload = Partial<{
  campaign_name: string
  channel: string
  status: AffiliateLinkStatus
}>

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled'

export interface AffiliateCommissionParams {
  search?: string
  status?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export interface AffiliateCommissionSummary {
  total: number
  pending: number
  approved: number
  paid: number
  cancelled: number
  orders: number
  average_rate: number
}

export interface AffiliateCommissionItem {
  id: number
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
  created_at: string
  approved_at: string | null
  paid_at: string | null
}

export interface AffiliateCommissionListResponse {
  summary: AffiliateCommissionSummary
  total: number
  page: number
  page_size: number
  total_pages: number
  data: AffiliateCommissionItem[]
}

export type AttributionType = 'cookie' | 'code' | 'manual'

export interface AffiliateConversionParams {
  search?: string
  status?: string
  attribution_type?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export interface AffiliateConversionSummary {
  total_conversions: number
  valid_conversions: number
  total_clicks: number
  conversion_rate: number
  unique_buyers: number
  total_order_value: number
  total_commission: number
  by_attribution: Record<AttributionType, number>
}

export interface AffiliateConversionItem {
  id: number
  order_id: number
  order_code: string
  order_status: string
  referred_user_id: number | null
  buyer_label: string
  commission_id: number
  commission_status: CommissionStatus
  order_total: number
  commission_amount: number
  attribution_type: AttributionType
  campaign_name: string | null
  channel: string | null
  created_at: string
}

export interface AffiliateConversionListResponse {
  summary: AffiliateConversionSummary
  total: number
  page: number
  page_size: number
  total_pages: number
  data: AffiliateConversionItem[]
}

export interface WithdrawalCreatePayload {
  amount: number
  bank_name: string
  bank_account: string
  bank_owner: string
  note?: string
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface WithdrawalBalance {
  available: number
  pending: number
  paid_total: number
}

export interface WithdrawalItem {
  id: number
  amount: number
  status: WithdrawalStatus
  bank_name: string
  bank_account: string
  bank_owner: string
  note: string | null
  admin_note: string | null
  created_at: string
  processed_at: string | null
}

export interface WithdrawalListResponse {
  balance: WithdrawalBalance
  pending_withdrawal: number
  net_available: number
  total: number
  data: WithdrawalItem[]
}

export interface LinkAnalyticsDayPoint {
  date: string
  clicks: number
  orders: number
  commission: number
}

export interface LinkAnalyticsResponse {
  link_id: number
  product_name: string
  campaign_name: string
  channel: string
  tracking_url: string
  total_clicks: number
  total_orders: number
  total_commission: number
  days: LinkAnalyticsDayPoint[]
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
  api.get<AffiliateUser>('/api/auth/me', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)

export const getAffiliateDashboardApi = () => api.get<AffiliateDashboardResponse>('/api/affiliate/dashboard')

export const getAffiliateProductsApi = (params: AffiliateProductParams = {}) =>
  api.get<AffiliateProductListResponse>('/api/affiliate/products', { params })

export const getAffiliateLinksApi = (params: AffiliateLinkParams = {}) =>
  api.get<AffiliateLinkListResponse>('/api/affiliate/links', { params })

export const createAffiliateLinkApi = (payload: AffiliateLinkCreatePayload) =>
  api.post<AffiliateLink>('/api/affiliate/links', payload)

export const updateAffiliateLinkApi = (linkId: number, payload: AffiliateLinkUpdatePayload) =>
  api.patch<AffiliateLink>(`/api/affiliate/links/${linkId}`, payload)

export const deleteAffiliateLinkApi = (linkId: number) => api.delete<void>(`/api/affiliate/links/${linkId}`)

export const getAffiliateCommissionsApi = (params: AffiliateCommissionParams = {}) =>
  api.get<AffiliateCommissionListResponse>('/api/affiliate/commissions', { params })

export const getAffiliateConversionsApi = (params: AffiliateConversionParams = {}) =>
  api.get<AffiliateConversionListResponse>('/api/affiliate/conversions', { params })

export const getWithdrawalsApi = () => api.get<WithdrawalListResponse>('/api/affiliate/withdrawals')

export const createWithdrawalApi = (payload: WithdrawalCreatePayload) =>
  api.post<WithdrawalItem>('/api/affiliate/withdrawals', payload)

export const getLinkAnalyticsApi = (linkId: number, days = 30) =>
  api.get<LinkAnalyticsResponse>(`/api/affiliate/links/${linkId}/analytics`, { params: { days } })

/**
 * Chuẩn hóa lỗi API từ Axios/FastAPI về chuỗi hiển thị an toàn.
 * Dùng `unknown` + type guards để tránh kiểu dữ liệu lỏng và vẫn xử lý đủ 3 dạng detail:
 * string, mảng validation lỗi, hoặc object có `message`.
 */
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
