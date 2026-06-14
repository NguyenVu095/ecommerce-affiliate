import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Truck,
  User,
  XCircle,
} from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getErrorMessage,
  getShipperOrdersApi,
  updateShipmentDetailsApi,
  updateShipperOrderStatusApi,
  type ShipperNextStatus,
  type ShipperOrder,
} from '../../services/api'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ready_to_pick:     { bg: '#fef3c7', color: '#92400e' },
  picking:           { bg: '#dbeafe', color: '#1d4ed8' },
  delivering:        { bg: '#e0f2fe', color: '#0369a1' },
  delivered:         { bg: '#dcfce7', color: '#15803d' },
  delivery_fail:     { bg: '#fee2e2', color: '#b91c1c' },
  waiting_to_return: { bg: '#fce7f3', color: '#9d174d' },
  returned:          { bg: '#f3f4f6', color: '#374151' },
  cancel:            { bg: '#f3f4f6', color: '#6b7280' },
}

const SHIPPING_STATUSES = [
  { key: 'ready_to_pick', label: 'Chờ lấy hàng' },
  { key: 'picking', label: 'Đang lấy hàng' },
  { key: 'delivering', label: 'Đang giao' },
  { key: 'delivery_fail', label: 'Giao thất bại' },
  { key: 'waiting_to_return', label: 'Chờ hoàn hàng' },
  { key: 'delivered', label: 'Giao thành công' },
  { key: 'returned', label: 'Đã hoàn hàng' },
  { key: 'cancel', label: 'Đã hủy' },
]

const TERMINAL_STATUSES = new Set(['delivered', 'returned', 'cancel'])
const REASON_REQUIRED_STATUSES = new Set(['delivery_fail', 'waiting_to_return', 'returned', 'cancel'])

const fmt = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const fmtDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Chưa có'

export default function ShipperPage() {
  const [orders, setOrders] = useState<ShipperOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [view, setView] = useState<'active' | 'history'>('active')
  const [search, setSearch] = useState('')
  const [pendingAction, setPendingAction] = useState<{
    order: ShipperOrder
    status: ShipperNextStatus
  } | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [shipmentEdit, setShipmentEdit] = useState<ShipperOrder | null>(null)
  const [shippingCode, setShippingCode] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getShipperOrdersApi()
      setOrders(response.data)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Không thể tải danh sách vận chuyển.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getShipperOrdersApi()
      .then(response => setOrders(response.data))
      .catch((err: unknown) => {
        setError(getErrorMessage(err, 'Không thể tải danh sách vận chuyển.'))
      })
      .finally(() => setLoading(false))
  }, [])

  const { filtered, statusCounts, activeCount, historyCount } = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const summary = orders.reduce(
      (acc, order) => {
        const terminal = TERMINAL_STATUSES.has(order.ghn_status)
        const matchesView = (view === 'history') === terminal
        const matchesStatus = !statusFilter || order.ghn_status === statusFilter
        const matchesSearch = !normalizedSearch || [
          order.order_code,
          order.shipping_order_code,
          order.receiver_name,
          order.receiver_phone,
          order.address,
        ].some(value => value?.toLowerCase().includes(normalizedSearch))

        return {
          rows: matchesView && matchesStatus && matchesSearch
            ? [...acc.rows, order]
            : acc.rows,
          counts: {
            ...acc.counts,
            [order.ghn_status]: (acc.counts[order.ghn_status] || 0) + 1,
          },
          active: acc.active + (terminal ? 0 : 1),
          history: acc.history + (terminal ? 1 : 0),
        }
      },
      {
        rows: [] as ShipperOrder[],
        counts: {} as Record<string, number>,
        active: 0,
        history: 0,
      },
    )

    return {
      filtered: summary.rows,
      statusCounts: summary.counts,
      activeCount: summary.active,
      historyCount: summary.history,
    }
  }, [orders, search, statusFilter, view])

  const openAction = (order: ShipperOrder, status: ShipperNextStatus) => {
    setPendingAction({ order, status })
    setActionNote('')
  }

  const openShipmentEdit = (order: ShipperOrder) => {
    setShipmentEdit(order)
    setShippingCode(order.shipping_order_code || '')
    setExpectedDelivery(
      order.expected_delivery_time
        ? new Date(order.expected_delivery_time).toISOString().slice(0, 16)
        : '',
    )
  }

  const saveShipmentDetails = async () => {
    if (!shipmentEdit || shippingCode.trim().length < 3) return
    setUpdatingId(shipmentEdit.id)
    try {
      await updateShipmentDetailsApi(
        shipmentEdit.id,
        shippingCode.trim(),
        expectedDelivery || undefined,
      )
      showToast(`Đã cập nhật vận đơn cho ${shipmentEdit.order_code}.`)
      setShipmentEdit(null)
      await fetchOrders()
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Không thể cập nhật thông tin vận đơn.'), 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const confirmAction = async () => {
    if (!pendingAction) return
    const requiresReason = REASON_REQUIRED_STATUSES.has(pendingAction.status.key)
    if (requiresReason && actionNote.trim().length < 5) return

    setUpdatingId(pendingAction.order.id)
    try {
      await updateShipperOrderStatusApi(
        pendingAction.order.id,
        pendingAction.status.key,
        actionNote.trim() || undefined,
      )
      showToast(`Đã cập nhật ${pendingAction.order.order_code} sang "${pendingAction.status.label}".`)
      setPendingAction(null)
      setActionNote('')
      await fetchOrders()
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Cập nhật vận chuyển thất bại.'), 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Vận chuyển" subtitle={`${activeCount} đơn đang xử lý`} />

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1100,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {pendingAction && (
        <div
          onClick={() => setPendingAction(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: 460, maxWidth: '100%', borderRadius: 16, background: '#fff', padding: 26 }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: '#eef2ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <Truck size={22} color="#4f46e5" />
            </div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Xác nhận cập nhật vận chuyển</h2>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              Chuyển đơn <strong>{pendingAction.order.order_code}</strong> sang{' '}
              <strong>{pendingAction.status.label}</strong>.
            </p>
            {['cancel', 'returned'].includes(pendingAction.status.key)
              && pendingAction.order.payment_status === 'paid' && (
              <div style={{
                marginBottom: 14, padding: '9px 12px', borderRadius: 8,
                background: '#fff7ed', color: '#c2410c', fontSize: 13, fontWeight: 600,
              }}>
                Hệ thống sẽ gửi yêu cầu hoàn tiền VNPay và hoàn lại tồn kho.
              </div>
            )}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Ghi chú {REASON_REQUIRED_STATUSES.has(pendingAction.status.key) ? '(bắt buộc)' : '(tùy chọn)'}
            </label>
            <textarea
              autoFocus
              value={actionNote}
              onChange={event => setActionNote(event.target.value)}
              rows={3}
              placeholder="Nhập ghi chú cập nhật..."
              style={{
                width: '100%', resize: 'none', border: '1px solid #d1d5db',
                borderRadius: 8, padding: '10px 12px', font: 'inherit', fontSize: 13,
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setPendingAction(null)}>Hủy bỏ</button>
              <button
                className="btn btn-primary"
                disabled={
                  updatingId === pendingAction.order.id
                  || (
                    REASON_REQUIRED_STATUSES.has(pendingAction.status.key)
                    && actionNote.trim().length < 5
                  )
                }
                onClick={() => void confirmAction()}
              >
                {updatingId === pendingAction.order.id ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {shipmentEdit && (
        <div
          onClick={() => setShipmentEdit(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: 440, maxWidth: '100%', borderRadius: 16, background: '#fff', padding: 26 }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Thông tin vận đơn</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>{shipmentEdit.order_code}</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Mã vận đơn
            </label>
            <input
              autoFocus
              className="admin-input"
              value={shippingCode}
              onChange={event => setShippingCode(event.target.value)}
              placeholder="Ví dụ: GHN123456789"
              style={{ width: '100%', marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Thời gian dự kiến giao
            </label>
            <input
              className="admin-input"
              type="datetime-local"
              value={expectedDelivery}
              onChange={event => setExpectedDelivery(event.target.value)}
              style={{ width: '100%', marginBottom: 18 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setShipmentEdit(null)}>Hủy bỏ</button>
              <button
                className="btn btn-primary"
                disabled={updatingId === shipmentEdit.id || shippingCode.trim().length < 3}
                onClick={() => void saveShipmentDetails()}
              >
                {updatingId === shipmentEdit.id ? 'Đang lưu...' : 'Lưu vận đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div className="admin-card animate-fade-in" style={{ padding: '14px 20px', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search size={15} style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)', color: '#94a3b8',
              }} />
              <input
                className="admin-input"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Tìm mã đơn, người nhận, SĐT, địa chỉ..."
                style={{ width: '100%', paddingLeft: 34 }}
              />
            </div>
            <select
              className="admin-select"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              style={{ minWidth: 190 }}
            >
              <option value="">Tất cả trạng thái</option>
              {SHIPPING_STATUSES.map(status => (
                <option key={status.key} value={status.key}>
                  {status.label} {statusCounts[status.key] ? `(${statusCounts[status.key]})` : ''}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" onClick={() => void fetchOrders()}>
              <RefreshCw size={15} /> Làm mới
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className={view === 'active' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setView('active')
                setStatusFilter('')
              }}
            >
              Đang xử lý ({activeCount})
            </button>
            <button
              className={view === 'history' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setView('history')
                setStatusFilter('')
              }}
            >
              Lịch sử ({historyCount})
            </button>
          </div>
        </div>

        {loading ? (
          <EmptyState loading />
        ) : error ? (
          <EmptyState error={error} onRetry={() => void fetchOrders()} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map(order => (
              <ShippingCard
                key={order.id}
                order={order}
                onAction={openAction}
                onEditShipment={openShipmentEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShippingCard({
  order,
  onAction,
  onEditShipment,
}: {
  order: ShipperOrder
  onAction: (order: ShipperOrder, status: ShipperNextStatus) => void
  onEditShipment: (order: ShipperOrder) => void
}) {
  const color = STATUS_COLORS[order.ghn_status] || { bg: '#f3f4f6', color: '#374151' }
  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #eef2f7',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{order.order_code}</div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
            Tạo lúc {fmtDate(order.created_at)}
          </div>
        </div>
        <span style={{
          padding: '5px 11px', borderRadius: 999, background: color.bg,
          color: color.color, fontSize: 12, fontWeight: 800,
        }}>
          {order.ghn_label}
        </span>
        <span className={`badge badge-${order.payment_status}`} style={{ fontSize: 12, padding: '5px 11px' }}>
          {order.payment_status === 'paid'
            ? 'Đã thanh toán'
            : order.payment_status === 'refunded'
              ? 'Đã hoàn tiền'
              : 'Chưa thanh toán'}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(260px, 0.75fr)',
        gap: 20, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <InfoLine icon={<User size={15} />} label="Người nhận">
            <strong>{order.receiver_name || 'Chưa có tên'}</strong>
          </InfoLine>
          <InfoLine icon={<Phone size={15} />} label="Điện thoại">
            <a href={order.receiver_phone ? `tel:${order.receiver_phone}` : undefined} style={{ color: '#2563eb' }}>
              {order.receiver_phone || 'Chưa có'}
            </a>
          </InfoLine>
          {order.receiver_email && (
            <InfoLine icon={<Mail size={15} />} label="Email">{order.receiver_email}</InfoLine>
          )}
          <InfoLine icon={<MapPin size={15} />} label="Địa chỉ">{order.address}</InfoLine>
          <InfoLine icon={<Package size={15} />} label={`Sản phẩm (${totalQuantity})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {order.items.map((item, index) => (
                <span key={`${item.sku || item.name}-${index}`}>
                  {item.name}{item.variant ? ` - ${item.variant}` : ''} × {item.quantity}
                  {item.sku ? <small style={{ color: '#94a3b8' }}> ({item.sku})</small> : null}
                </span>
              ))}
            </div>
          </InfoLine>
          {order.note && (
            <div style={{
              padding: '8px 11px', background: '#fffbeb', color: '#92400e',
              border: '1px solid #fde68a', borderRadius: 8, fontSize: 12,
            }}>
              Ghi chú khách hàng: {order.note}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SummaryRow label="Tổng đơn" value={fmt(order.total_final)} strong />
          <SummaryRow label="Phí vận chuyển" value={fmt(order.shipping_fee)} />
          <SummaryRow label="Thanh toán" value={order.payment_method_code || 'Chưa rõ'} />
          {order.cod_amount > 0 && (
            <div style={{
              padding: '9px 11px', borderRadius: 8, background: '#fff7ed',
              color: '#c2410c', display: 'flex', gap: 8, alignItems: 'center',
              fontSize: 13, fontWeight: 800,
            }}>
              <CircleDollarSign size={16} /> Thu hộ {fmt(order.cod_amount)}
            </div>
          )}
          <InfoLine icon={<ClipboardList size={15} />} label="Mã vận đơn">
            {order.shipping_order_code || 'Chưa tạo mã vận đơn'}
          </InfoLine>
          <InfoLine icon={<CalendarClock size={15} />} label="Dự kiến giao">
            {fmtDate(order.expected_delivery_time)}
          </InfoLine>
          {!TERMINAL_STATUSES.has(order.ghn_status) && (
            <button
              className="btn btn-ghost"
              onClick={() => onEditShipment(order)}
              style={{ justifyContent: 'center' }}
            >
              <Pencil size={14} /> Cập nhật vận đơn
            </button>
          )}

          {order.next_statuses.length > 0 ? (
            <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Thao tác tiếp theo
              </div>
              {order.next_statuses.map(status => {
                const buttonColor = STATUS_COLORS[status.key] || { bg: '#f3f4f6', color: '#374151' }
                return (
                  <button
                    key={status.key}
                    onClick={() => onAction(order, status)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      border: 0, borderRadius: 8, padding: '8px 11px', cursor: 'pointer',
                      background: buttonColor.bg, color: buttonColor.color,
                      fontSize: 12, fontWeight: 800,
                    }}
                  >
                    {status.label}<ChevronRight size={14} />
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{
              marginTop: 5, padding: '8px 11px', borderRadius: 8,
              background: '#f8fafc', color: '#64748b', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <CheckCircle size={14} /> Quy trình đã kết thúc
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoLine({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px 92px minmax(0, 1fr)', gap: 7, fontSize: 13 }}>
      <span style={{ color: '#94a3b8', marginTop: 1 }}>{icon}</span>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: '#334155', minWidth: 0 }}>{children}</span>
    </div>
  )
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: strong ? '#4f46e5' : '#334155', fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  )
}

function EmptyState({
  loading = false,
  error,
  onRetry,
}: {
  loading?: boolean
  error?: string
  onRetry?: () => void
}) {
  return (
    <div className="admin-card" style={{ padding: 54, textAlign: 'center' }}>
      {loading ? (
        <RefreshCw size={34} className="animate-spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
      ) : error ? (
        <AlertTriangle size={36} style={{ margin: '0 auto 12px', color: '#ef4444' }} />
      ) : (
        <Truck size={46} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
      )}
      <div style={{ fontWeight: 700, color: '#334155', marginBottom: 5 }}>
        {loading ? 'Đang tải dữ liệu...' : error ? 'Không tải được dữ liệu' : 'Không có đơn phù hợp'}
      </div>
      {error && <div style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {onRetry && <button className="btn btn-primary" onClick={onRetry}>Thử lại</button>}
    </div>
  )
}
