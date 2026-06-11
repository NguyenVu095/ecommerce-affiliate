import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrdersApi, type OrderFilter } from '../../services/api'
import TopBar from '../../components/TopBar'
import { Search, Eye, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Download, Calendar, X } from 'lucide-react'
import { toast } from '../../store/toastStore'

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

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'shipping', label: 'Đang giao' },
  { value: 'success', label: 'Thành công' },
  { value: 'cancelled', label: 'Đã huỷ' },
]

const PAYMENT_OPTIONS = [
  { value: '', label: 'Thanh toán' },
  { value: 'unpaid', label: 'Chưa TT' },
  { value: 'paid', label: 'Đã TT' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  success: 'Thành công',
  cancelled: 'Đã huỷ',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function OrderListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportingCsv, setExportingCsv] = useState(false)

  const page = Number(searchParams.get('page') || 1)
  const status = searchParams.get('status') || ''
  const paymentStatus = searchParams.get('payment_status') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const hasDateFilter = !!(dateFrom || dateTo)

  const buildOrderFilter = useCallback((exportAll = false): OrderFilter => ({
    page: exportAll ? 1 : page,
    page_size: exportAll ? 9999 : 15,
    status: status || undefined,
    payment_status: paymentStatus || undefined,
    search: search || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [page, status, paymentStatus, search, dateFrom, dateTo])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getOrdersApi(buildOrderFilter())
      setOrders(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.total_pages)
    } catch {
      setError('Không thể tải danh sách đơn hàng. Vui lòng kiểm tra kết nối hoặc thử lại.')
    } finally {
      setLoading(false)
    }
  }, [buildOrderFilter])

  useEffect(() => {
    getOrdersApi(buildOrderFilter())
      .then((res) => {
        setOrders(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch(() => {
        setError('Không thể tải danh sách đơn hàng. Vui lòng kiểm tra kết nối hoặc thử lại.')
      })
      .finally(() => setLoading(false))
  }, [buildOrderFilter])

  const setParam = (key: string, value: string) => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value); else p.delete(key)
    p.set('page', '1')
    setSearchParams(p)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setParam('search', search)
  }

  const handleExportCsv = async () => {
    setExportingCsv(true)
    try {
      const res = await getOrdersApi(buildOrderFilter(true))
      const rows: OrderRow[] = res.data.data || []
      const headers = ['Mã đơn', 'Khách hàng', 'SĐT', 'Email', 'Trạng thái', 'Thanh toán', 'Tổng tiền', 'Ngày tạo']
      const csvRows = [
        headers.join(','),
        ...rows.map(o => [
          o.order_code,
          `"${(o.receiver_name || o.user_name || '').replace(/"/g, '""')}"`,
          o.receiver_phone || '',
          o.user_email || '',
          STATUS_LABEL[o.status] || o.status,
          o.payment_status === 'paid' ? 'Đã TT' : 'Chưa TT',
          o.total_final,
          o.created_at ? fmtDate(o.created_at) : '',
        ].join(','))
      ]
      const csvContent = '\uFEFF' + csvRows.join('\n') // BOM for Excel UTF-8
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const fileName = `orders_${new Date().toISOString().slice(0, 10)}.csv`
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Xuất CSV thất bại. Vui lòng thử lại.')
    } finally {
      setExportingCsv(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar
        title="Quản lý Đơn Hàng"
        subtitle={`${total} đơn hàng`}
      />

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Filters */}
        <div className="admin-card animate-fade-in" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: '1 1 280px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="admin-input"
                style={{ width: '100%', paddingLeft: 32 }}
                placeholder="Tìm mã đơn, tên, SĐT..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary">Tìm</button>
          </form>

          {/* Status filter */}
          <select
            className="admin-select"
            value={status}
            onChange={e => setParam('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Payment filter */}
          <select
            className="admin-select"
            value={paymentStatus}
            onChange={e => setParam('payment_status', e.target.value)}
          >
            {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="#9ca3af" />
            <input
              type="date"
              className="admin-input"
              style={{ width: 148, fontSize: 13 }}
              value={dateFrom}
              onChange={e => setParam('date_from', e.target.value)}
              title="Từ ngày"
            />
            <span style={{ color: '#9ca3af', fontSize: 13 }}>→</span>
            <input
              type="date"
              className="admin-input"
              style={{ width: 148, fontSize: 13 }}
              value={dateTo}
              onChange={e => setParam('date_to', e.target.value)}
              title="Đến ngày"
            />
            {hasDateFilter && (
              <button
                className="btn btn-ghost"
                style={{ padding: '6px 8px', color: '#ef4444', borderColor: '#fecaca' }}
                onClick={() => {
                  const p = new URLSearchParams(searchParams)
                  p.delete('date_from')
                  p.delete('date_to')
                  p.set('page', '1')
                  setSearchParams(p)
                }}
                title="Xóa filter ngày"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button className="btn btn-ghost" onClick={fetchOrders}>
            <RefreshCw size={14} />
            Làm mới
          </button>

          <button
            className="btn btn-ghost"
            onClick={handleExportCsv}
            disabled={exportingCsv}
            title="Xuất danh sách ra file CSV"
          >
            {exportingCsv
              ? <RefreshCw size={14} className="animate-spin" />
              : <Download size={14} />}
            {exportingCsv ? 'Đang xuất...' : 'Xuất CSV'}
          </button>
        </div>

        {/* Table */}
        <div className="admin-card animate-fade-in">
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 12px' }} className="animate-spin" />
              Đang tải đơn hàng...
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#1a1d2e', marginBottom: 6 }}>Không tải được đơn hàng</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{error}</div>
              <button className="btn btn-primary" onClick={fetchOrders}>
                <RefreshCw size={14} />
                Thử lại
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 500 }}>Không có đơn hàng nào</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>
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
                    <th>Ngày tạo</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#6366f1' }}>
                          {order.order_code}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{order.receiver_name || order.user_name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{order.receiver_phone || order.user_email || ''}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${order.status}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${order.payment_status}`}>
                          {order.payment_status === 'paid' ? 'Đã TT' : 'Chưa TT'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmt(order.total_final)}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {order.created_at ? fmtDate(order.created_at) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => navigate(`/orders/${order.id}`)}
                        >
                          <Eye size={14} />
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px', borderTop: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Trang {page} / {totalPages} · {total} đơn
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 10px' }}
                  disabled={page <= 1}
                  onClick={() => setParam('page', String(page - 1))}
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                  return (
                    <button
                      key={p}
                      onClick={() => setParam('page', String(p))}
                      style={{
                        width: 32, height: 32, borderRadius: 6, border: 'none',
                        background: p === page ? '#6366f1' : 'transparent',
                        color: p === page ? '#fff' : 'var(--text-secondary)',
                        fontWeight: p === page ? 600 : 400,
                        cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 10px' }}
                  disabled={page >= totalPages}
                  onClick={() => setParam('page', String(page + 1))}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
