import {
  CalendarDays,
  CheckCircle2,
  Filter,
  Fingerprint,
  MousePointerClick,
  ReceiptText,
  Search,
  Tags,
  UserCheck,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import TopBar from '../../components/TopBar'
import {
  getAffiliateConversionsApi,
  getErrorMessage,
  type AffiliateConversionItem,
  type AffiliateConversionSummary,
} from '../../services/api'
import { toast } from '../../store/toastStore'

const PAGE_SIZE = 20

const emptySummary: AffiliateConversionSummary = {
  total_conversions: 0,
  valid_conversions: 0,
  total_clicks: 0,
  conversion_rate: 0,
  unique_buyers: 0,
  total_order_value: 0,
  total_commission: 0,
  by_attribution: { cookie: 0, code: 0, manual: 0 },
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const percent = (value: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}%`

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

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)
const firstDayOfMonth = () => {
  const d = new Date()
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

const attributionLabels: Record<AffiliateConversionItem['attribution_type'], string> = {
  cookie: 'Cookie',
  code: 'Mã giới thiệu',
  manual: 'Gán thủ công',
}

const commissionStatusLabels: Record<AffiliateConversionItem['commission_status'], string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
}

const orderStatusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  success: 'Thành công',
  cancelled: 'Đã hủy',
}

export default function ConversionsPage() {
  const [summary, setSummary] = useState<AffiliateConversionSummary>(emptySummary)
  const [conversions, setConversions] = useState<AffiliateConversionItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [attributionType, setAttributionType] = useState('')
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(toIsoDate(new Date()))
  const [appliedDateFrom, setAppliedDateFrom] = useState(firstDayOfMonth())
  const [appliedDateTo, setAppliedDateTo] = useState(toIsoDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadConversions = useCallback(() => {
    getAffiliateConversionsApi({
      search: submittedSearch || undefined,
      status: status || undefined,
      attribution_type: attributionType || undefined,
      date_from: appliedDateFrom || undefined,
      date_to: appliedDateTo || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setSummary(res.data.summary)
        setConversions(res.data.data)
        setTotalCount(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được dữ liệu chuyển đổi.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [submittedSearch, status, attributionType, appliedDateFrom, appliedDateTo, page])

  useEffect(() => {
    loadConversions()
  }, [loadConversions])

  const resetPage = () => setPage(1)

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSubmittedSearch(search.trim())
    resetPage()
  }

  const applyDateFilter = (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    resetPage()
  }

  const clearDateFilter = () => {
    setLoading(true)
    setError('')
    setDateFrom('')
    setDateTo('')
    setAppliedDateFrom('')
    setAppliedDateTo('')
    resetPage()
  }

  const changeAttributionType = (nextAttributionType: string) => {
    if (nextAttributionType === attributionType) return
    setLoading(true)
    setError('')
    setAttributionType(nextAttributionType)
    resetPage()
  }

  const changeStatus = (nextStatus: string) => {
    if (nextStatus === status) return
    setLoading(true)
    setError('')
    setStatus(nextStatus)
    resetPage()
  }

  const changePage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  return (
    <>
      <TopBar title="Chuyển đổi" subtitle="Theo dõi đơn hàng được attribution từ link, mã giới thiệu và cookie" />
      <div className="page-content">
        <section className="conversion-hero">
          <div>
            <span className="eyebrow">Attribution ledger</span>
            <h2>{number(summary.valid_conversions)} chuyển đổi hợp lệ</h2>
            <p>
              Bảng này dùng trực tiếp dữ liệu affiliate_conversions để kiểm tra nguồn ghi nhận đơn,
              trạng thái hoa hồng và hiệu quả chuyển đổi theo từng kênh.
            </p>
          </div>
          <div className="conversion-hero-metrics">
            <div>
              <span>Tỷ lệ chuyển đổi</span>
              <strong>{percent(summary.conversion_rate)}</strong>
            </div>
            <div>
              <span>Hoa hồng gắn attribution</span>
              <strong>{currency(summary.total_commission)}</strong>
            </div>
          </div>
        </section>

        <section className="conversion-summary-grid">
          <article>
            <CheckCircle2 size={18} />
            <span>Conversion hợp lệ</span>
            <strong>{number(summary.valid_conversions)}</strong>
          </article>
          <article>
            <MousePointerClick size={18} />
            <span>Click trong kỳ</span>
            <strong>{number(summary.total_clicks)}</strong>
          </article>
          <article>
            <UserCheck size={18} />
            <span>Người mua đã đăng nhập</span>
            <strong>{number(summary.unique_buyers)}</strong>
          </article>
          <article>
            <ReceiptText size={18} />
            <span>Giá trị đơn</span>
            <strong>{currency(summary.total_order_value)}</strong>
          </article>
        </section>

        <section className="conversion-attribution-grid">
          <article><span>Cookie</span><strong>{number(summary.by_attribution.cookie)}</strong></article>
          <article><span>Mã giới thiệu</span><strong>{number(summary.by_attribution.code)}</strong></article>
          <article><span>Gán thủ công</span><strong>{number(summary.by_attribution.manual)}</strong></article>
        </section>

        <section className="filter-panel" style={{ flexWrap: 'wrap', gap: 12 }}>
          <form className="warehouse-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm mã đơn, campaign hoặc kênh"
            />
            <button className="primary-button compact" type="submit">Tìm</button>
          </form>
          <label className="sort-control">
            <Filter size={16} />
            <select value={attributionType} onChange={(event) => changeAttributionType(event.target.value)}>
              <option value="">Tất cả attribution</option>
              <option value="code">Mã giới thiệu</option>
              <option value="cookie">Cookie</option>
              <option value="manual">Gán thủ công</option>
            </select>
          </label>
          <label className="sort-control">
            <Tags size={16} />
            <select value={status} onChange={(event) => changeStatus(event.target.value)}>
              <option value="">Tất cả hoa hồng</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="paid">Đã thanh toán</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </label>
          <form className="date-filter-row" onSubmit={applyDateFilter}>
            <CalendarDays size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Từ ngày" />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>-</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Đến ngày" />
            <button className="primary-button compact" type="submit">Lọc</button>
            {(appliedDateFrom || appliedDateTo) && (
              <button className="secondary-light-button" type="button" onClick={clearDateFilter}>
                Xóa lọc
              </button>
            )}
          </form>
        </section>

        {loading && <div className="state-panel">Đang tải dữ liệu chuyển đổi...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && (
          <>
            <section className="conversion-list">
              {conversions.length === 0 && (
                <div className="state-panel">Chưa có chuyển đổi phù hợp với bộ lọc.</div>
              )}
              {conversions.map((conversion) => (
                <article className="conversion-row" key={conversion.id}>
                  <div className="conversion-main">
                    <span className={`conversion-badge ${conversion.attribution_type}`}>
                      <Fingerprint size={13} />
                      {attributionLabels[conversion.attribution_type]}
                    </span>
                    <strong>Đơn {conversion.order_code}</strong>
                    <small>{conversion.campaign_name || 'Không gắn campaign'} · {conversion.channel || 'direct'}</small>
                  </div>
                  <div className="conversion-stats">
                    <div>
                      <span>Người mua</span>
                      <strong>{conversion.buyer_label}</strong>
                    </div>
                    <div>
                      <span>Đơn hàng</span>
                      <strong>{orderStatusLabels[conversion.order_status] || conversion.order_status}</strong>
                    </div>
                    <div>
                      <span>Hoa hồng</span>
                      <strong>{currency(conversion.commission_amount)}</strong>
                    </div>
                    <div>
                      <span>Trạng thái</span>
                      <strong>{commissionStatusLabels[conversion.commission_status]}</strong>
                    </div>
                  </div>
                  <div className="conversion-meta">
                    <span>{currency(conversion.order_total)}</span>
                    <small>{dateTime(conversion.created_at)}</small>
                  </div>
                </article>
              ))}
            </section>

            {totalPages > 1 && (
              <div className="pagination-row">
                <button className="secondary-light-button" type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                  Trước
                </button>
                <span>Trang {page} / {totalPages} · {number(totalCount)} bản ghi</span>
                <button className="secondary-light-button" type="button" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>
                  Sau
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
