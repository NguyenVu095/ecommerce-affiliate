import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Clock,
  CreditCard,
  FolderTree,
  Package,
  Percent,
  RefreshCw,
  ShoppingBag,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Users2,
} from 'lucide-react'
import TopBar from '../../components/TopBar'
import { getAdminAffiliateStatsApi, getAdminRevenueChartApi, getOrdersApi, getStatsApi } from '../../services/api'

interface Stats {
  total_orders: number
  orders_today: number
  pending_orders: number
  confirmed_orders: number
  shipping_orders: number
  cancelled_orders: number
  revenue_today: number
  revenue_total: number
}

interface AffiliateStats {
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
  payable_commission: number
}

interface OrderRow {
  id: number
  order_code: string
  status: string
  payment_status: string
  receiver_name: string | null
  receiver_phone: string | null
  total_final: number
  created_at: string | null
  user_name?: string | null
  user_email?: string | null
}

interface RevenueChartPoint {
  date: string
  day: number
  orders: number
  revenue: number
}

interface RevenueChart {
  year: number
  month: number
  total_orders: number
  total_revenue: number
  average_order_value: number
  data: RevenueChartPoint[]
}

type IconType = typeof ShoppingBag

const emptyStats: Stats = {
  total_orders: 0,
  orders_today: 0,
  pending_orders: 0,
  confirmed_orders: 0,
  shipping_orders: 0,
  cancelled_orders: 0,
  revenue_today: 0,
  revenue_total: 0,
}

const emptyAffiliateStats: AffiliateStats = {
  total_affiliates: 0,
  total_links: 0,
  active_links: 0,
  total_clicks: 0,
  total_orders: 0,
  conversion_rate: 0,
  revenue_attributed: 0,
  total_commission: 0,
  pending_commission: 0,
  approved_commission: 0,
  paid_commission: 0,
  payable_commission: 0,
}

const currentMonth = new Date()
const emptyRevenueChart: RevenueChart = {
  year: currentMonth.getFullYear(),
  month: currentMonth.getMonth() + 1,
  total_orders: 0,
  total_revenue: 0,
  average_order_value: 0,
  data: [],
}

const requestDashboardSnapshot = (year: number, month: number) => {
  const affiliateRequest = getAdminAffiliateStatsApi().catch(() => ({ data: emptyAffiliateStats }))
  const revenueChartRequest = getAdminRevenueChartApi({ year, month }).catch(() => ({ data: emptyRevenueChart }))
  const recentOrderRequest = getOrdersApi({ page: 1, page_size: 6 }).catch(() => ({
    data: { data: [] as OrderRow[] },
  }))

  return Promise.all([
    getStatsApi(),
    affiliateRequest,
    revenueChartRequest,
    recentOrderRequest,
  ])
}

const statusLabel: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  success: 'Thành công',
  cancelled: 'Đã hủy',
}

const paymentLabel: Record<string, string> = {
  paid: 'Đã thanh toán',
  unpaid: 'Chưa thanh toán',
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const percent = (value: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Chưa có'

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: string
  detail: string
  icon: IconType
  color: string
  bg: string
}) {
  return (
    <div className="admin-card" style={{ padding: 18, minHeight: 136 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: '#1a1d2e', marginTop: 8, lineHeight: 1.15 }}>
            {value}
          </div>
        </div>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={19} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{detail}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const className = `badge badge-${status}`
  return <span className={className}>{statusLabel[status] || status}</span>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [affiliateStats, setAffiliateStats] = useState<AffiliateStats>(emptyAffiliateStats)
  const [revenueChart, setRevenueChart] = useState<RevenueChart>(emptyRevenueChart)
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const now = new Date()
  const [chartYear, setChartYear] = useState(now.getFullYear())
  const [chartMonth, setChartMonth] = useState(now.getMonth() + 1)
  const [chartLoading, setChartLoading] = useState(false)

  const fetchChart = async (year: number, month: number) => {
    setChartLoading(true)
    try {
      const res = await getAdminRevenueChartApi({ year, month })
      setRevenueChart(res.data)
    } catch {
      // silent – dashboard still shows without chart
    } finally {
      setChartLoading(false)
    }
  }

  const fetchDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, affiliateRes, revenueChartRes, ordersRes] = await requestDashboardSnapshot(chartYear, chartMonth)

      setStats(statsRes.data)
      setAffiliateStats(affiliateRes.data)
      setRevenueChart(revenueChartRes.data)
      setRecentOrders(ordersRes.data.data || [])
    } catch {
      setError('Không thể tải dữ liệu dashboard. Vui lòng kiểm tra backend hoặc đăng nhập lại.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    requestDashboardSnapshot(emptyRevenueChart.year, emptyRevenueChart.month)
      .then(([statsRes, affiliateRes, revenueChartRes, ordersRes]) => {
        setStats(statsRes.data)
        setAffiliateStats(affiliateRes.data)
        setRevenueChart(revenueChartRes.data)
        setRecentOrders(ordersRes.data.data || [])
      })
      .catch(() => {
        setError('Không thể tải dữ liệu dashboard. Vui lòng kiểm tra backend hoặc đăng nhập lại.')
      })
      .finally(() => setLoading(false))
  }, [])

  const completedOrders = Math.max(
    0,
    stats.total_orders - stats.pending_orders - stats.confirmed_orders - stats.shipping_orders - stats.cancelled_orders,
  )
  const nonCancelledOrders = Math.max(0, stats.total_orders - stats.cancelled_orders)
  const averageOrderValue = nonCancelledOrders > 0 ? stats.revenue_total / nonCancelledOrders : 0
  const fulfillmentRate = stats.total_orders > 0 ? (completedOrders / stats.total_orders) * 100 : 0
  const activeWorkload = stats.pending_orders + stats.confirmed_orders + stats.shipping_orders

  const metricCards = useMemo(() => ([
    {
      label: 'Doanh thu hôm nay',
      value: currency(stats.revenue_today),
      detail: `Tổng doanh thu ghi nhận: ${currency(stats.revenue_total)}`,
      icon: TrendingUp,
      color: '#10b981',
      bg: '#dcfce7',
    },
    {
      label: 'Đơn hàng hôm nay',
      value: number(stats.orders_today),
      detail: `${number(stats.total_orders)} đơn hàng trong hệ thống`,
      icon: ShoppingBag,
      color: '#6366f1',
      bg: '#eef2ff',
    },
    {
      label: 'Cần xử lý',
      value: number(stats.pending_orders),
      detail: `${number(activeWorkload)} đơn đang nằm trong quy trình vận hành`,
      icon: AlertTriangle,
      color: '#f59e0b',
      bg: '#fef3c7',
    },
    {
      label: 'Hoa hồng cần trả',
      value: currency(affiliateStats.payable_commission),
      detail: `${currency(affiliateStats.pending_commission)} hoa hồng đang chờ duyệt`,
      icon: Banknote,
      color: '#0891b2',
      bg: '#cffafe',
    },
  ]), [
    activeWorkload,
    affiliateStats.payable_commission,
    affiliateStats.pending_commission,
    stats.orders_today,
    stats.pending_orders,
    stats.revenue_today,
    stats.revenue_total,
    stats.total_orders,
  ])

  const quickActions = [
    { to: '/orders?status=pending', label: 'Duyệt đơn chờ', icon: Clock, color: '#92400e', bg: '#fef3c7' },
    { to: '/orders', label: 'Quản lý đơn hàng', icon: ShoppingBag, color: '#4338ca', bg: '#eef2ff' },
    { to: '/products', label: 'Cập nhật sản phẩm', icon: Package, color: '#047857', bg: '#dcfce7' },
    { to: '/categories', label: 'Danh mục sản phẩm', icon: FolderTree, color: '#7c3aed', bg: '#ede9fe' },
    { to: '/coupons', label: 'Quản lý coupon', icon: Tag, color: '#be123c', bg: '#ffe4e6' },
    { to: '/affiliates', label: 'Đối soát affiliate', icon: Users, color: '#0e7490', bg: '#cffafe' },
    { to: '/users', label: 'Khách hàng', icon: Users2, color: '#0891b2', bg: '#e0f2fe' },
    { to: '/shipping', label: 'Theo dõi vận chuyển', icon: Truck, color: '#1d4ed8', bg: '#dbeafe' },
  ]

  const maxDailyRevenue = Math.max(1, ...revenueChart.data.map(point => point.revenue))
  const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' })
    .format(new Date(revenueChart.year, revenueChart.month - 1, 1))
  const bestRevenueDay = revenueChart.data.reduce<RevenueChartPoint | null>(
    (best, point) => (!best || point.revenue > best.revenue ? point : best),
    null,
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar title="Dashboard" subtitle="Tổng quan vận hành, doanh thu và affiliate" />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 72 }}>
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 12px' }} className="animate-spin" />
              Đang tải dữ liệu dashboard...
            </div>
          </div>
        ) : error ? (
          <div className="admin-card" style={{ padding: 28, textAlign: 'center' }}>
            <AlertTriangle size={34} color="#ef4444" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, color: '#1a1d2e', marginBottom: 6 }}>Không tải được dashboard</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 18 }}>{error}</div>
            <button className="btn btn-primary" onClick={fetchDashboard}>
              <RefreshCw size={15} />
              Thử lại
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <section className="admin-card" style={{
              padding: '20px 22px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              borderLeft: stats.pending_orders > 0 ? '4px solid #f59e0b' : '4px solid #10b981',
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Bảng điều khiển vận hành
                </div>
                <h2 style={{ fontSize: 21, fontWeight: 800, color: '#1a1d2e', marginBottom: 6 }}>
                  {stats.pending_orders > 0
                    ? `${number(stats.pending_orders)} đơn đang chờ xác nhận`
                    : 'Không có đơn chờ xác nhận'}
                </h2>
                <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5, maxWidth: 760 }}>
                  Tỷ lệ hoàn tất hiện tại {percent(fulfillmentRate)}. Giá trị đơn trung bình khoảng {currency(averageOrderValue)} trên các đơn không bị hủy.
                </p>
              </div>
              <button className="btn btn-ghost" onClick={fetchDashboard} style={{ flexShrink: 0 }}>
                <RefreshCw size={15} />
                Làm mới
              </button>
            </section>

            <section style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}>
              {metricCards.map(card => (
                <MetricCard key={card.label} {...card} />
              ))}
            </section>

            <section style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.8fr)',
              gap: 20,
              marginBottom: 20,
            }}>
              <div className="admin-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1d2e' }}>Biểu đồ doanh thu</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                      Doanh thu theo ngày trong {monthLabel}.
                    </p>
                  </div>
                  {/* Month/Year picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <select
                      className="admin-select"
                      style={{ padding: '5px 10px', fontSize: 13 }}
                      value={chartMonth}
                      onChange={e => {
                        const m = Number(e.target.value)
                        setChartMonth(m)
                        fetchChart(chartYear, m)
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Intl.DateTimeFormat('vi-VN', { month: 'long' }).format(new Date(2000, i, 1))}
                        </option>
                      ))}
                    </select>
                    <select
                      className="admin-select"
                      style={{ padding: '5px 10px', fontSize: 13 }}
                      value={chartYear}
                      onChange={e => {
                        const y = Number(e.target.value)
                        setChartYear(y)
                        fetchChart(y, chartMonth)
                      }}
                    >
                      {Array.from({ length: 4 }, (_, i) => now.getFullYear() - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    {chartLoading && (
                      <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
                  {[
                    { label: 'Doanh thu tháng', value: currency(revenueChart.total_revenue), color: '#10b981' },
                    { label: 'Đơn phát sinh', value: number(revenueChart.total_orders), color: '#6366f1' },
                    { label: 'Giá trị TB', value: currency(revenueChart.average_order_value), color: '#0891b2' },
                  ].map(item => (
                    <div key={item.label} style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: item.color, whiteSpace: 'nowrap' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{
                  height: 220,
                  border: '1px solid #eef2f7',
                  borderRadius: 8,
                  background: '#fbfcfe',
                  padding: '16px 14px 10px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'stretch',
                }}>
                  <div style={{ width: 74, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                    <span>{currency(maxDailyRevenue)}</span>
                    <span>{bestRevenueDay && bestRevenueDay.revenue > 0 ? `Cao nhất: ngày ${bestRevenueDay.day}` : 'Chưa có doanh thu'}</span>
                    <span>0</span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, minWidth: 0, height: '100%' }}>
                    {revenueChart.data.length === 0 ? (
                      <div style={{ flex: 1, textAlign: 'center', alignSelf: 'center', color: '#9ca3af', fontSize: 13 }}>
                        Chưa có dữ liệu doanh thu tháng này.
                      </div>
                    ) : (
                      revenueChart.data.map(point => {
                        const height = point.revenue > 0
                          ? Math.max(8, (point.revenue / maxDailyRevenue) * 164)
                          : 2
                        const showDay = point.day === 1 || point.day % 5 === 0 || point.day === revenueChart.data.length

                        return (
                          <div
                            key={point.date}
                            style={{
                              flex: '1 1 0',
                              minWidth: 5,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 6,
                            }}
                            title={`Ngày ${point.day}: ${currency(point.revenue)} · ${number(point.orders)} đơn`}
                          >
                            <div style={{
                              width: '100%',
                              maxWidth: 18,
                              height,
                              borderRadius: '6px 6px 2px 2px',
                              background: point.revenue > 0 ? 'linear-gradient(180deg, #34d399, #059669)' : '#e5e7eb',
                              boxShadow: point.revenue > 0 ? '0 4px 10px rgba(16,185,129,0.18)' : 'none',
                            }} />
                            <div style={{ height: 14, fontSize: 10, color: '#9ca3af', lineHeight: '14px' }}>
                              {showDay ? point.day : ''}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1d2e' }}>Affiliate snapshot</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Hiệu quả traffic và hoa hồng cần đối soát.</p>
                  </div>
                  <Users size={22} color="#0891b2" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Affiliate', value: number(affiliateStats.total_affiliates), icon: Users },
                    { label: 'Link active', value: number(affiliateStats.active_links), icon: Tag },
                    { label: 'Click', value: number(affiliateStats.total_clicks), icon: Percent },
                    { label: 'Đơn', value: number(affiliateStats.total_orders), icon: ShoppingBag },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 12, background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                        <Icon size={14} />
                        {label}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1d2e' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#6b7280' }}>Tỷ lệ chuyển đổi</span>
                    <strong style={{ color: '#0891b2' }}>{percent(affiliateStats.conversion_rate)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#6b7280' }}>Hoa hồng đã duyệt</span>
                    <strong style={{ color: '#15803d' }}>{currency(affiliateStats.approved_commission)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#6b7280' }}>Đã thanh toán</span>
                    <strong style={{ color: '#1d4ed8' }}>{currency(affiliateStats.paid_commission)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="admin-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f3f4f6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1d2e' }}>Đơn hàng mới nhất</h3>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>6 đơn gần nhất để admin nắm nhanh tình hình.</p>
                </div>
                <Link to="/orders" className="btn btn-ghost" style={{ textDecoration: 'none', padding: '7px 12px', fontSize: 13 }}>
                  Tất cả đơn
                  <ArrowRight size={14} />
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div style={{ padding: 42, textAlign: 'center', color: '#6b7280' }}>
                  Chưa có đơn hàng để hiển thị.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Mã đơn</th>
                        <th>Khách hàng</th>
                        <th>Trạng thái</th>
                        <th>Thanh toán</th>
                        <th>Tổng tiền</th>
                        <th>Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map(order => (
                        <tr key={order.id}>
                          <td>
                            <Link to={`/orders/${order.id}`} style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 13, textDecoration: 'none' }}>
                              {order.order_code}
                            </Link>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#1a1d2e' }}>{order.receiver_name || order.user_name || 'Khách lẻ'}</div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>{order.receiver_phone || order.user_email || 'Chưa có liên hệ'}</div>
                          </td>
                          <td><StatusBadge status={order.status} /></td>
                          <td>
                            <span className={order.payment_status === 'paid' ? 'badge badge-paid' : 'badge badge-unpaid'}>
                              {paymentLabel[order.payment_status] || order.payment_status}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{currency(order.total_final)}</td>
                          <td style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>{dateTime(order.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1d2e' }}>Thao tác nhanh</h3>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Các luồng admin thường dùng trong ngày.</p>
                </div>
                <CreditCard size={21} color="#6366f1" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                {quickActions.map(({ to, label, icon: Icon, color, bg }) => (
                  <Link
                    key={to}
                    to={to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      border: '1px solid #eef2f7',
                      borderRadius: 8,
                      padding: '12px 14px',
                      color: '#1a1d2e',
                      textDecoration: 'none',
                      background: '#fff',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
                      <span style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={16} color={color} />
                      </span>
                      {label}
                    </span>
                    <ArrowRight size={15} color="#9ca3af" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
