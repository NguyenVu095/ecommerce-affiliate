import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Link2,
  MousePointerClick,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { getAffiliateDashboardApi, getErrorMessage, type AffiliateDashboardResponse } from '../../services/api'

// Formatters
const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const shortDate = (isoDate: string) => {
  const d = new Date(isoDate)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

const formatChange = (value: number, suffix = '%') => {
  if (value > 0) return `+${value}${suffix}`
  return `${value}${suffix}`
}

// Dynamic hero content
function buildHeroContent(dashboard: AffiliateDashboardResponse): {
  headline: string
  subline: string
  tone: 'positive' | 'neutral' | 'warning'
} {
  const change = dashboard.month_commission.change
  const commission = dashboard.month_commission.value
  const topProduct = dashboard.top_products[0]
  const hasActivity = commission > 0

  if (change >= 20 && hasActivity) {
    return {
      tone: 'positive',
      headline: `Tháng này tăng trưởng mạnh +${change}% so với tháng trước! 🎉`,
      subline: topProduct
        ? `"${topProduct.name}" đang là sản phẩm đóng góp hoa hồng cao nhất. Tiếp tục đẩy mạnh và mở rộng sang sản phẩm cùng danh mục để tối đa doanh thu.`
        : 'Hiệu quả đang rất tốt. Hãy tạo thêm link mới để nhân rộng kết quả.',
    }
  }
  if (change > 0 && hasActivity) {
    return {
      tone: 'positive',
      headline: `Đang tăng trưởng tốt — hoa hồng tháng này đạt ${currency(commission)}.`,
      subline: topProduct
        ? `"${topProduct.name}" đang dẫn đầu với ${number(topProduct.orders)} đơn. Chia sẻ thêm link để duy trì đà tăng.`
        : 'Mọi thứ đang đi đúng hướng. Tiếp tục tạo link và theo dõi hiệu quả từng kênh.',
    }
  }
  if (change < -10) {
    return {
      tone: 'warning',
      headline: `Hoa hồng giảm ${Math.abs(change)}% so với tháng trước — hãy xem lại chiến lược.`,
      subline: `Thử tạo link cho sản phẩm có commission rate cao hoặc mở rộng sang kênh mới để lấy lại đà tăng trưởng.`,
    }
  }
  if (!hasActivity) {
    return {
      tone: 'neutral',
      headline: 'Chào mừng bạn đến với Affiliate Hub! 👋',
      subline:
        'Bắt đầu bằng cách tạo link affiliate cho sản phẩm yêu thích. Mỗi lượt mua hàng qua link của bạn đều mang lại hoa hồng.',
    }
  }
  return {
    tone: 'neutral',
    headline: `Hoa hồng tháng này: ${currency(commission)} — ổn định so với tháng trước.`,
    subline:
      'Duy trì tần suất chia sẻ link để không bị tụt thứ hạng. Kiểm tra phần Hoa hồng để xem đơn nào đang chờ duyệt.',
  }
}

// Enhanced bar chart
interface ChartTooltip {
  x: number
  y: number
  date: string
  commission: number
  visible: boolean
}

function CommissionChart({ data }: { data: Array<{ date: string; commission: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<ChartTooltip>({
    x: 0,
    y: 0,
    date: '',
    commission: 0,
    visible: false,
  })

  if (data.length === 0) return null

  const maxValue = Math.max(...data.map((d) => d.commission), 1)

  // Y-axis: 4 labels từ 0 đến max, format ngắn gọn
  const yLabels = [0, 0.33, 0.67, 1].map((ratio) => {
    const val = maxValue * ratio
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(val >= 10_000_000 ? 0 : 1)}M`
    if (val >= 1_000) return `${Math.round(val / 1_000)}K`
    return val === 0 ? '0' : val.toFixed(0)
  })

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>, point: { date: string; commission: number }) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const colRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
    if (!rect) return
    const x = colRect.left - rect.left + colRect.width / 2
    setTooltip({
      x,
      y: 0,
      date: point.date,
      commission: point.commission,
      visible: true,
    })
  }

  const handleMouseLeave = () => setTooltip((t) => ({ ...t, visible: false }))

  return (
    <div className="chart-enhanced" ref={containerRef}>
      {/* Y-axis labels */}
      <div className="chart-y-axis" aria-hidden="true">
        {[...yLabels].reverse().map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      {/* Bars area */}
      <div className="chart-bars-area">
        {/* Y-axis grid lines */}
        <div className="chart-grid-lines" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="chart-grid-line" />
          ))}
        </div>

        {/* Bars */}
        <div className="chart-bars-row">
          {data.map((point) => {
            const heightPct = maxValue > 0 ? Math.max((point.commission / maxValue) * 100, point.commission > 0 ? 4 : 0) : 0
            return (
              <div
                className="chart-col"
                key={point.date}
                onMouseEnter={(e) => handleMouseEnter(e, point)}
                onMouseLeave={handleMouseLeave}
                role="img"
                aria-label={`${shortDate(point.date)}: ${currency(point.commission)}`}
              >
                <div className="chart-col-inner">
                  <div
                    className="chart-bar"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="chart-x-label">{shortDate(point.date)}</span>
              </div>
            )
          })}
        </div>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="chart-tooltip"
            style={{ left: `${tooltip.x}px` }}
          >
            <strong>{tooltip.date}</strong>
            <span>{currency(tooltip.commission)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState<AffiliateDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getAffiliateDashboardApi()
      .then((res) => setDashboard(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Không tải được dữ liệu dashboard.')))
      .finally(() => setLoading(false))
  }, [])

  const stats = dashboard
    ? [
        {
          label: dashboard.month_commission.label,
          value: currency(dashboard.month_commission.value),
          change: formatChange(dashboard.month_commission.change),
          positive: dashboard.month_commission.change >= 0,
          icon: Banknote,
          tone: 'green',
        },
        {
          label: dashboard.month_clicks.label,
          value: number(dashboard.month_clicks.value),
          change: formatChange(dashboard.month_clicks.change),
          positive: dashboard.month_clicks.change >= 0,
          icon: MousePointerClick,
          tone: 'blue',
        },
        {
          label: dashboard.success_orders.label,
          value: number(dashboard.success_orders.value),
          change: formatChange(dashboard.success_orders.change),
          positive: dashboard.success_orders.change >= 0,
          icon: ShoppingCart,
          tone: 'orange',
        },
        {
          label: dashboard.conversion_rate.label,
          value: `${dashboard.conversion_rate.value}%`,
          change: formatChange(dashboard.conversion_rate.change, ' điểm'),
          positive: dashboard.conversion_rate.change >= 0,
          icon: TrendingUp,
          tone: 'violet',
        },
      ]
    : []

  const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date())
  const hero = dashboard ? buildHeroContent(dashboard) : null
  const commissionChange = dashboard?.month_commission.change ?? 0
  const pillClass = commissionChange >= 0 ? 'success' : 'danger'

  return (
    <>
      <TopBar title="Dashboard affiliate" subtitle="Tổng quan hiệu quả tiếp thị và hoa hồng của bạn" />
      <div className="page-content">
        {loading && <div className="state-panel">Đang tải dữ liệu dashboard...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && dashboard && (
          <>
            <section className={`hero-panel hero-tone-${hero?.tone}`}>
              <div>
                <span className="eyebrow">{monthLabel}</span>
                <h2>{hero?.headline}</h2>
                <p>{hero?.subline}</p>
              </div>
              <div className="hero-actions">
                <button className="primary-button" type="button" onClick={() => navigate('/products')}>
                  <Link2 size={17} />
                  Tạo link nhanh
                </button>
                <button className="secondary-button" type="button" onClick={() => navigate('/products')}>
                  Kho sản phẩm
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </section>

            <section className="stat-grid">
              {stats.map(({ label, value, change, positive, icon: Icon, tone }) => (
                <article className="metric-card" key={label}>
                  <div className={`metric-icon ${tone}`}>
                    <Icon size={19} />
                  </div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small className={positive ? 'change-positive' : 'change-negative'}>
                    {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {change} so với tháng trước
                  </small>
                </article>
              ))}
            </section>

            <section className="dashboard-grid">
              <article className="panel wide">
                <div className="panel-header">
                  <div>
                    <h3>Doanh thu hoa hồng</h3>
                    <p>12 ngày gần nhất · Hover vào cột để xem chi tiết</p>
                  </div>
                  <span className={`pill ${pillClass}`}>
                    {commissionChange >= 0 ? (
                      <TrendingUp size={12} style={{ marginRight: 4 }} />
                    ) : (
                      <TrendingDown size={12} style={{ marginRight: 4 }} />
                    )}
                    {formatChange(commissionChange)}
                  </span>
                </div>
                <CommissionChart data={dashboard.chart} />
              </article>

              {/* Balance */}
              <article className="panel balance-panel">
                <div className="panel-header">
                  <div>
                    <h3>Số dư</h3>
                    <p>Cập nhật tạm tính</p>
                  </div>
                  <CheckCircle2 size={20} className="success-icon" />
                </div>
                <strong className="balance-value">
                  {currency(dashboard.balance.available + dashboard.balance.pending)}
                </strong>
                <div className="balance-list">
                  <div>
                    <span>Có thể rút</span>
                    <strong>{currency(dashboard.balance.available)}</strong>
                  </div>
                  <div>
                    <span>Chờ duyệt</span>
                    <strong>{currency(dashboard.balance.pending)}</strong>
                  </div>
                </div>
                <button className="primary-button full" type="button" onClick={() => navigate('/payments')}>
                  Yêu cầu rút tiền
                </button>
              </article>

              {/* Top products */}
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h3>Sản phẩm hiệu quả</h3>
                    <p>Theo hoa hồng tháng này</p>
                  </div>
                  <PackageCheck size={20} />
                </div>
                <div className="product-list">
                  {dashboard.top_products.length === 0 && (
                    <p className="empty-text">Chưa có sản phẩm phát sinh hoa hồng trong tháng này.</p>
                  )}
                  {dashboard.top_products.map((product, idx) => (
                    <div className="product-row" key={product.name}>
                      <div className="product-rank">{idx + 1}</div>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{number(product.orders)} đơn · {currency(product.revenue)}</span>
                      </div>
                      <b>{currency(product.commission)}</b>
                    </div>
                  ))}
                </div>
              </article>

              {/* Recent activities */}
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <h3>Hoạt động mới</h3>
                    <p>Ghi nhận gần đây</p>
                  </div>
                  <Sparkles size={18} style={{ color: 'var(--muted)' }} />
                </div>
                <div className="activity-list">
                  {dashboard.recent_activities.length === 0 && (
                    <p className="empty-text">Chưa có hoạt động hoa hồng gần đây.</p>
                  )}
                  {dashboard.recent_activities.map((item) => (
                    <div className="activity-row" key={`${item.title}-${item.meta}`}>
                      <span className={`dot ${item.status}`} />
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.meta}</small>
                      </div>
                      <b>{currency(item.amount)}</b>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </>
  )
}
