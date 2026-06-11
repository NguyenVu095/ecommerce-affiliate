import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Truck, MapPin, Package, CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getErrorMessage,
  getShipperOrdersApi,
  updateShipperOrderStatusApi,
  type ShipperOrder,
} from '../../services/api'

const GHN_COLORS: Record<string, { bg: string; color: string }> = {
  ready_to_pick:     { bg: '#fef3c7', color: '#92400e' },
  picking:           { bg: '#dbeafe', color: '#1d4ed8' },
  delivering:        { bg: '#e0f2fe', color: '#0369a1' },
  delivered:         { bg: '#dcfce7', color: '#15803d' },
  delivery_fail:     { bg: '#fee2e2', color: '#b91c1c' },
  waiting_to_return: { bg: '#fce7f3', color: '#9d174d' },
  returned:          { bg: '#f3f4f6', color: '#374151' },
  cancel:            { bg: '#f3f4f6', color: '#6b7280' },
}

const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const GHN_STATUSES = [
  { key: 'ready_to_pick',     label: 'Chờ lấy hàng' },
  { key: 'picking',           label: 'Đang lấy hàng' },
  { key: 'delivering',        label: 'Đang giao' },
  { key: 'delivered',         label: 'Giao thành công' },
  { key: 'delivery_fail',     label: 'Giao thất bại' },
  { key: 'waiting_to_return', label: 'Chờ hoàn hàng' },
  { key: 'returned',          label: 'Đã hoàn hàng' },
  { key: 'cancel',            label: 'Đã hủy' },
]

export default function ShipperPage() {
  const [orders, setOrders] = useState<ShipperOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Filter
  const [ghnFilter, setGhnFilter] = useState('')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getShipperOrdersApi()
      setOrders(res.data)
    } catch {
      setError('Không thể tải danh sách đơn hàng vận chuyển. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getShipperOrdersApi()
      .then((res) => setOrders(res.data))
      .catch(() => {
        setError('Không thể tải danh sách đơn hàng vận chuyển. Vui lòng thử lại.')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleUpdateStatus = async (order: ShipperOrder, newGhnStatus: string, label: string) => {
    setUpdatingId(order.id)
    try {
      await updateShipperOrderStatusApi(order.id, newGhnStatus)
      showToast(`Đã cập nhật đơn ${order.order_code} → "${label}"`)
      await fetchOrders()
    } catch (e: unknown) {
      showToast(getErrorMessage(e, 'Cập nhật thất bại'), 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const { filtered, statusCounts } = useMemo(() => {
    // Một vòng quét O(N) vừa đếm trạng thái vừa tạo danh sách lọc, tránh filter + reduce riêng lẻ mỗi render.
    return orders.reduce(
      (acc, order) => {
        acc.statusCounts[order.ghn_status] = (acc.statusCounts[order.ghn_status] || 0) + 1
        if (!ghnFilter || order.ghn_status === ghnFilter) acc.filtered.push(order)
        return acc
      },
      { filtered: [] as ShipperOrder[], statusCounts: {} as Record<string, number> },
    )
  }, [orders, ghnFilter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Vận chuyển" subtitle={`${orders.length} đơn đang theo dõi`} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'fadeInUp 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* Filter bar */}
        <div className="admin-card animate-fade-in" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="admin-select" value={ghnFilter} onChange={e => setGhnFilter(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Tất cả trạng thái GHN</option>
              {GHN_STATUSES.map(s => (
                <option key={s.key} value={s.key}>
                  {s.label} {statusCounts[s.key] ? `(${statusCounts[s.key]})` : ''}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" onClick={fetchOrders}>
              <RefreshCw size={15} /> Làm mới
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>
              Hiển thị {filtered.length} / {orders.length} đơn
            </span>
          </div>
        </div>

        {/* Quick stats chips */}
        {!loading && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {GHN_STATUSES.filter(s => statusCounts[s.key] > 0).map(s => {
              const col = GHN_COLORS[s.key] || { bg: '#f3f4f6', color: '#374151' }
              return (
                <button
                  key={s.key}
                  onClick={() => setGhnFilter(ghnFilter === s.key ? '' : s.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: ghnFilter === s.key ? col.color : col.bg,
                    color: ghnFilter === s.key ? '#fff' : col.color,
                    fontSize: 12, fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label} · {statusCounts[s.key]}
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="admin-card" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 12px' }} className="animate-spin" />
            <div style={{ color: '#6b7280', fontSize: 14 }}>Đang tải đơn vận chuyển...</div>
          </div>
        ) : error ? (
          <div className="admin-card" style={{ padding: 48, textAlign: 'center' }}>
            <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, color: '#1a1d2e', marginBottom: 6 }}>Không tải được dữ liệu</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{error}</div>
            <button className="btn btn-primary" onClick={fetchOrders}><RefreshCw size={14} /> Thử lại</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="admin-card" style={{ padding: 60, textAlign: 'center' }}>
            <Truck size={48} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Không có đơn nào</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc trạng thái.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(order => {
              const col = GHN_COLORS[order.ghn_status] || { bg: '#f3f4f6', color: '#374151' }
              const isUpdating = updatingId === order.id

              return (
                <div key={order.id} className="admin-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{
                    padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Truck size={16} color="#fff" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1d2e' }}>{order.order_code}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(order.created_at)}</div>
                      </div>
                    </div>

                    {/* GHN status badge */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 12px', borderRadius: 999,
                      background: col.bg, color: col.color,
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {order.ghn_label}
                    </span>

                    {/* Amount */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#6366f1', fontSize: 15 }}>{fmt(order.total_final)}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Ship: {fmt(order.shipping_fee)}</div>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Address */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <MapPin size={14} color="#9ca3af" style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{order.address}</span>
                      </div>

                      {/* Items */}
                      {order.items.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <Package size={14} color="#9ca3af" style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: '#6b7280' }}>{order.items.join(' · ')}</span>
                        </div>
                      )}

                      {/* Note */}
                      {order.note && (
                        <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                          📝 {order.note}
                        </div>
                      )}
                    </div>

                    {/* Next status actions */}
                    {order.next_statuses.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                          Cập nhật
                        </div>
                        {order.next_statuses.map(ns => {
                          const btnCol = GHN_COLORS[ns.key] || { bg: '#f3f4f6', color: '#374151' }
                          return (
                            <button
                              key={ns.key}
                              disabled={isUpdating}
                              onClick={() => handleUpdateStatus(order, ns.key, ns.label)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none',
                                background: btnCol.bg, color: btnCol.color,
                                fontSize: 12, fontWeight: 600, cursor: isUpdating ? 'not-allowed' : 'pointer',
                                opacity: isUpdating ? 0.6 : 1,
                                transition: 'all 0.15s',
                              }}
                            >
                              <span>{ns.label}</span>
                              {isUpdating
                                ? <div style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin" />
                                : <ChevronRight size={13} />
                              }
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* No next action */}
                    {order.next_statuses.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af', padding: '6px 10px', background: '#f9fafb', borderRadius: 8 }}>
                        <CheckCircle size={13} />
                        Hoàn tất
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
