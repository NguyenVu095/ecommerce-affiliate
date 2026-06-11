import { BarChart2, MousePointerClick, ReceiptText, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getErrorMessage,
  getLinkAnalyticsApi,
  type LinkAnalyticsDayPoint,
  type LinkAnalyticsResponse,
} from '../../services/api'

interface Props {
  linkId: number
  campaignName: string
  onClose: () => void
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const DAY_OPTIONS = [7, 14, 30, 60, 90]

function BarGroup({
  point,
  maxClicks,
  maxCommission,
}: {
  point: LinkAnalyticsDayPoint
  maxClicks: number
  maxCommission: number
}) {
  const clickH = maxClicks > 0 ? Math.max(4, Math.round((point.clicks / maxClicks) * 80)) : 0
  const commH = maxCommission > 0 ? Math.max(4, Math.round((point.commission / maxCommission) * 80)) : 0
  const dayLabel = point.date.slice(5) // MM-DD

  return (
    <div className="analytics-bar-group" title={`${point.date}\n${number(point.clicks)} click · ${point.orders} đơn · ${currency(point.commission)}`}>
      <div className="analytics-bars">
        <div className="analytics-bar click-bar" style={{ height: `${clickH}px` }} />
        <div className="analytics-bar commission-bar" style={{ height: `${commH}px` }} />
      </div>
      <span className="analytics-day-label">{dayLabel}</span>
    </div>
  )
}

export default function LinkAnalyticsModal({ linkId, campaignName, onClose }: Props) {
  const [analytics, setAnalytics] = useState<LinkAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [daysRange, setDaysRange] = useState(30)

  useEffect(() => {
    getLinkAnalyticsApi(linkId, daysRange)
      .then((res) => setAnalytics(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Không tải được analytics.')))
      .finally(() => setLoading(false))
  }, [linkId, daysRange])

  const maxClicks = analytics ? Math.max(...analytics.days.map((d) => d.clicks), 1) : 1
  const maxCommission = analytics ? Math.max(...analytics.days.map((d) => d.commission), 1) : 1

  // Với nhiều ngày (>30) chỉ hiển thị 1/N bar để tránh overflow
  const displayDays = analytics
    ? daysRange > 30
      ? analytics.days.filter((_, i) => i % Math.ceil(daysRange / 30) === 0)
      : analytics.days
    : []

  const changeDaysRange = (nextDaysRange: number) => {
    if (nextDaysRange === daysRange) return
    setLoading(true)
    setError('')
    setDaysRange(nextDaysRange)
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="analytics-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="analytics-modal-header">
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>
              <BarChart2 size={14} style={{ display: 'inline', marginRight: 5 }} />
              Analytics
            </div>
            <h3>{campaignName}</h3>
            {analytics && (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {analytics.product_name} · {analytics.channel}
              </p>
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Đóng analytics"
          >
            <X size={20} />
          </button>
        </div>

        {/* Day range selector */}
        <div className="analytics-day-selector">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              className={daysRange === d ? 'primary-button compact' : 'secondary-light-button'}
              type="button"
              style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}
              onClick={() => changeDaysRange(d)}
            >
              {d} ngày
            </button>
          ))}
        </div>

        {loading && <div className="state-panel" style={{ margin: '24px 0' }}>Đang tải dữ liệu...</div>}
        {error && <div className="state-panel error" style={{ margin: '24px 0' }}>{error}</div>}

        {analytics && !loading && (
          <>
            {/* Tổng summary */}
            <div className="analytics-summary-row">
              <article>
                <MousePointerClick size={16} />
                <span>Tổng click</span>
                <strong>{number(analytics.total_clicks)}</strong>
              </article>
              <article>
                <ReceiptText size={16} />
                <span>Tổng đơn</span>
                <strong>{number(analytics.total_orders)}</strong>
              </article>
              <article>
                <span style={{ fontSize: 16 }}>₫</span>
                <span>Hoa hồng</span>
                <strong>{currency(analytics.total_commission)}</strong>
              </article>
              <article>
                <span style={{ fontSize: 16 }}>%</span>
                <span>CVR</span>
                <strong>
                  {analytics.total_clicks > 0
                    ? `${Math.round((analytics.total_orders / analytics.total_clicks) * 1000) / 10}%`
                    : '0%'}
                </strong>
              </article>
            </div>

            {/* Chú thích */}
            <div className="analytics-legend">
              <span><span className="legend-dot click" />Click</span>
              <span><span className="legend-dot commission" />Hoa hồng</span>
            </div>

            {/* Bar chart */}
            <div className="analytics-chart">
              {displayDays.map((point) => (
                <BarGroup
                  key={point.date}
                  point={point}
                  maxClicks={maxClicks}
                  maxCommission={maxCommission}
                />
              ))}
            </div>

            {/* Bảng chi tiết 5 ngày gần nhất */}
            <div className="analytics-table-title">5 ngày gần nhất</div>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Click</th>
                  <th>Đơn</th>
                  <th>Hoa hồng</th>
                </tr>
              </thead>
              <tbody>
                {[...analytics.days].reverse().slice(0, 5).map((point) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td>{number(point.clicks)}</td>
                    <td>{number(point.orders)}</td>
                    <td>{currency(point.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
