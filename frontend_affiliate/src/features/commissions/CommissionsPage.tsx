import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
  XCircle,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import TopBar from '../../components/TopBar'
import {
  getAffiliateCommissionsApi,
  getErrorMessage,
  type AffiliateCommissionItem,
  type AffiliateCommissionSummary,
} from '../../services/api'
import { toast } from '../../store/toastStore'

const emptySummary: AffiliateCommissionSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  paid: 0,
  cancelled: 0,
  orders: 0,
  average_rate: 0,
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

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

const statusLabels: Record<string, string> = {
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

const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const PAGE_SIZE = 20

// Chuyển Date thành chuỗi YYYY-MM-DD
const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

// Ngày đầu tháng hiện tại
const firstDayOfMonth = () => {
  const d = new Date()
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<AffiliateCommissionItem[]>([])
  const [summary, setSummary] = useState<AffiliateCommissionSummary>(emptySummary)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(toIsoDate(new Date()))
  const [appliedDateFrom, setAppliedDateFrom] = useState(firstDayOfMonth())
  const [appliedDateTo, setAppliedDateTo] = useState(toIsoDate(new Date()))

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCommissions = useCallback(() => {
    getAffiliateCommissionsApi({
      status: status || undefined,
      search: submittedSearch || undefined,
      date_from: appliedDateFrom || undefined,
      date_to: appliedDateTo || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setSummary(res.data.summary)
        setCommissions(res.data.data)
        setTotalCount(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được dữ liệu hoa hồng.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [status, submittedSearch, appliedDateFrom, appliedDateTo, page])

  useEffect(() => {
    loadCommissions()
  }, [loadCommissions])

  const resetPage = () => setPage(1)

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const nextSearch = search.trim()
    if (nextSearch === submittedSearch) return
    setLoading(true)
    setError('')
    setSubmittedSearch(nextSearch)
    resetPage()
  }

  const changeStatus = (nextStatus: string) => {
    if (nextStatus === status) return
    setLoading(true)
    setError('')
    setStatus(nextStatus)
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

  const changePage = (nextPage: number) => {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) return
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  return (
    <>
      <TopBar title="Hoa hồng" subtitle="Theo dõi hoa hồng theo đơn hàng, trạng thái duyệt và thanh toán" />
      <div className="page-content">
        <section className="commission-hero">
          <div>
            <span className="eyebrow">Commission ledger</span>
            <h2>{currency(summary.total)} hoa hồng ghi nhận</h2>
            <p>
              Tổng hợp các khoản hoa hồng phát sinh từ đơn hàng affiliate. Theo dõi khoản chờ duyệt, đã duyệt và
              đã thanh toán để chủ động kế hoạch rút tiền.
            </p>
          </div>
          <div className="commission-hero-metrics">
            <div>
              <span>Có thể rút</span>
              <strong>{currency(summary.approved)}</strong>
            </div>
            <div>
              <span>Tỷ lệ trung bình</span>
              <strong>{summary.average_rate}%</strong>
            </div>
          </div>
        </section>

        <section className="commission-summary-grid">
          <article>
            <Banknote size={18} />
            <span>Tổng hoa hồng</span>
            <strong>{currency(summary.total)}</strong>
          </article>
          <article>
            <Clock3 size={18} />
            <span>Chờ duyệt</span>
            <strong>{currency(summary.pending)}</strong>
          </article>
          <article>
            <CheckCircle2 size={18} />
            <span>Đã duyệt</span>
            <strong>{currency(summary.approved)}</strong>
          </article>
          <article>
            <WalletCards size={18} />
            <span>Đã thanh toán</span>
            <strong>{currency(summary.paid)}</strong>
          </article>
        </section>

        {/* Filters */}
        <section className="filter-panel" style={{ flexWrap: 'wrap', gap: 12 }}>
          <form className="warehouse-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo mã đơn, campaign hoặc kênh"
            />
            <button className="primary-button compact" type="submit">
              Tìm
            </button>
          </form>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <select value={status} onChange={(event) => changeStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <form className="date-filter-row" onSubmit={applyDateFilter}>
            <CalendarDays size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Từ ngày"
            />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Đến ngày"
            />
            <button className="primary-button compact" type="submit">Lọc</button>
            {(appliedDateFrom || appliedDateTo) && (
              <button className="secondary-light-button" type="button" onClick={clearDateFilter}
                style={{ minHeight: 38, padding: '0 10px', fontSize: 12 }}>
                Xóa lọc
              </button>
            )}
          </form>
        </section>

        {loading && <div className="state-panel">Đang tải dữ liệu hoa hồng...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && (
          <>
            <section className="commission-insight-row">
              <article>
                <ReceiptText size={18} />
                <div>
                  <span>Số đơn có hoa hồng</span>
                  <strong>{number(summary.orders)}</strong>
                </div>
              </article>
              <article>
                <XCircle size={18} />
                <div>
                  <span>Hoa hồng bị hủy</span>
                  <strong>{currency(summary.cancelled)}</strong>
                </div>
              </article>
            </section>

            <section className="commission-list">
              {commissions.length === 0 && (
                <div className="state-panel">Chưa có hoa hồng phù hợp với bộ lọc.</div>
              )}
              {commissions.map((commission) => (
                <article className="commission-row" key={commission.id}>
                  <div className="commission-main">
                    <span className={`commission-status ${commission.status}`}>
                      {statusLabels[commission.status]}
                    </span>
                    <strong>Đơn {commission.order_code}</strong>
                    <small>
                      {commission.campaign_name || 'Không gắn campaign'} · {commission.channel || 'direct'}
                    </small>
                  </div>
                  <div className="commission-stats">
                    <div>
                      <span>Giá trị đơn</span>
                      <strong>{currency(commission.order_total)}</strong>
                    </div>
                    <div>
                      <span>Tỷ lệ</span>
                      <strong>{commission.commission_rate}%</strong>
                    </div>
                    <div>
                      <span>Hoa hồng</span>
                      <strong>{currency(commission.amount)}</strong>
                    </div>
                    <div>
                      <span>Đơn hàng</span>
                      <strong>{orderStatusLabels[commission.order_status] || commission.order_status}</strong>
                    </div>
                  </div>
                  <div className="commission-timeline">
                    <span>Tạo: {dateTime(commission.created_at)}</span>
                    <span>Duyệt: {dateTime(commission.approved_at)}</span>
                    <span>Thanh toán: {dateTime(commission.paid_at)}</span>
                  </div>
                </article>
              ))}
            </section>

            {/* Phân trang */}
            {totalPages > 1 && (
              <div className="pagination-row">
                <button
                  className="secondary-light-button"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => changePage(page - 1)}
                >
                  Trước
                </button>
                <span>
                  Trang {page} / {totalPages}&nbsp;·&nbsp;{number(totalCount)} bản ghi
                </span>
                <button
                  className="secondary-light-button"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => changePage(page + 1)}
                >
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
