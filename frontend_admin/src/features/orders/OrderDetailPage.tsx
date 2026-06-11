import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getOrderDetailApi, updateOrderStatusApi, getErrorMessage } from '../../services/api'
import TopBar from '../../components/TopBar'
import { ArrowLeft, Package, User, MapPin, CreditCard, Truck, Save, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react'

interface OrderItem {
  id: number
  variant_id: number
  quantity: number
  price: number
  sku: string | null
  product_name: string | null
  variant_name: string | null
}

interface OrderDetail {
  id: number
  order_code: string
  status: string
  payment_status: string
  user_id: number | null
  user_name: string | null
  user_email: string | null
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
  items: OrderItem[]
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Chờ xác nhận', icon: Clock, color: '#92400e', bg: '#fef3c7' },
  { value: 'confirmed', label: 'Đã xác nhận', icon: CheckCircle, color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'shipping', label: 'Đang giao', icon: Truck, color: '#0369a1', bg: '#e0f2fe' },
  { value: 'success', label: 'Thành công', icon: CheckCircle, color: '#15803d', bg: '#dcfce7' },
  { value: 'cancelled', label: 'Đã huỷ', icon: XCircle, color: '#b91c1c', bg: '#fee2e2' },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [newStatus, setNewStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Trạng thái cần xác nhận trước khi thực hiện
  const DANGEROUS_STATUSES = ['cancelled', 'success']

  useEffect(() => {
    if (!id) return
    getOrderDetailApi(Number(id))
      .then(r => {
        setOrder(r.data)
        setNewStatus(r.data.status)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleSaveStatus = () => {
    if (!order || newStatus === order.status) return
    // Trạng thái nguy hiểm → hiện modal confirm
    if (DANGEROUS_STATUSES.includes(newStatus)) {
      setConfirmOpen(true)
      return
    }
    doSaveStatus()
  }

  const doSaveStatus = async () => {
    if (!order) return
    setConfirmOpen(false)
    setSaving(true)
    setSaveMsg('')
    try {
      await updateOrderStatusApi(order.id, newStatus, statusNote)
      setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
      setSaveMsg('✅ Cập nhật trạng thái thành công!')
      setStatusNote('')
    } catch (e: unknown) {
      setSaveMsg('❌ ' + getErrorMessage(e, 'Có lỗi xảy ra'))
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar title="Chi tiết đơn hàng" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 12px' }} className="animate-spin" />
            Đang tải đơn hàng...
          </div>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar title="Chi tiết đơn hàng" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
            <div style={{ fontWeight: 600 }}>Không tìm thấy đơn hàng</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/orders')}>
              Quay lại danh sách
            </button>
          </div>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_OPTIONS.find(s => s.value === order.status)
  const newStatusInfo = STATUS_OPTIONS.find(s => s.value === newStatus)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar title={`Đơn hàng #${order.order_code}`} subtitle={order.created_at ? fmtDate(order.created_at) : ''} />

      {/* Confirm modal for dangerous status changes */}
      {confirmOpen && order && newStatusInfo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, marginBottom: 16,
              background: newStatus === 'cancelled' ? '#fee2e2' : '#dcfce7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={22} color={newStatus === 'cancelled' ? '#ef4444' : '#15803d'} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 8 }}>
              Xác nhận thay đổi trạng thái?
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
              Bạn sắp chuyển đơn hàng <strong>{order.order_code}</strong> sang trạng thái{' '}
              <strong style={{ color: newStatusInfo.color }}>{newStatusInfo.label}</strong>.
              {newStatus === 'cancelled' && (
                <span style={{ display: 'block', marginTop: 8, padding: '8px 12px', background: '#fff7ed', borderRadius: 8, color: '#c2410c', fontSize: 13, fontWeight: 500 }}>
                  ⚠️ Hành động này sẽ hủy hoa hồng affiliate (nếu có) và khó hoàn tác.
                </span>
              )}
              {newStatus === 'success' && (
                <span style={{ display: 'block', marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 500 }}>
                  ✅ Hành động này sẽ xác nhận hoa hồng affiliate (nếu có) và đánh dấu đã thanh toán.
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>Hủy bỏ</button>
              <button
                className="btn"
                onClick={doSaveStatus}
                style={{ background: newStatus === 'cancelled' ? '#ef4444' : '#10b981', color: '#fff' }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Back + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/orders')}>
            <ArrowLeft size={15} /> Quay lại
          </button>
          {statusInfo && (
            <span className={`badge badge-${order.status}`} style={{ fontSize: 13, padding: '4px 14px' }}>
              {statusInfo.label}
            </span>
          )}
          <span className={`badge badge-${order.payment_status}`} style={{ fontSize: 13, padding: '4px 14px' }}>
            {order.payment_status === 'paid' ? '✓ Đã thanh toán' : '⏳ Chưa thanh toán'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Order items */}
            <div className="admin-card animate-fade-in">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={16} color="#6366f1" />
                <h3 style={{ fontWeight: 600, fontSize: 15 }}>Sản phẩm ({order.items.length})</h3>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Đơn giá</th>
                    <th style={{ textAlign: 'center' }}>SL</th>
                    <th style={{ textAlign: 'right' }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.product_name || `Sản phẩm #${item.variant_id}`}</div>
                        {item.variant_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.variant_name}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{item.sku || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>×{item.quantity}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Price summary */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
                {[
                  { label: 'Tạm tính', value: fmt(order.total_base_price) },
                  { label: 'Phí vận chuyển', value: fmt(order.shipping_fee) },
                  ...(order.discount_amount > 0 ? [{ label: `Giảm giá${order.coupon_code ? ` (${order.coupon_code})` : ''}`, value: `-${fmt(order.discount_amount)}`, color: '#10b981' }] : []),
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6, color: color || 'var(--text-secondary)' }}>
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, paddingTop: 10, borderTop: '1px solid var(--border-color)', marginTop: 4 }}>
                  <span>Tổng cộng</span>
                  <span style={{ color: '#6366f1' }}>{fmt(order.total_final)}</span>
                </div>
              </div>
            </div>

            {/* Shipping address */}
            <div className="admin-card animate-fade-in">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} color="#6366f1" />
                <h3 style={{ fontWeight: 600, fontSize: 15 }}>Địa chỉ giao hàng</h3>
              </div>
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <InfoRow label="Người nhận" value={order.receiver_name} />
                <InfoRow label="SĐT" value={order.receiver_phone} />
                <InfoRow label="Email" value={order.receiver_email} />
                {order.shipping_order_code && <InfoRow label="Mã GHN" value={order.shipping_order_code} mono />}
                {order.ghn_status && <InfoRow label="Trạng thái GHN" value={order.ghn_status} />}
              </div>
              <div style={{ padding: '0 20px 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Địa chỉ: </span>
                {order.shipping_full_address}
              </div>
              {order.note && (
                <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#92400e', border: '1px solid #fde68a' }}>
                  📝 Ghi chú: {order.note}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Customer info */}
            <div className="admin-card animate-fade-in">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={16} color="#6366f1" />
                <h3 style={{ fontWeight: 600, fontSize: 15 }}>Khách hàng</h3>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {order.user_id ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700, color: '#fff',
                      }}>
                        {order.user_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{order.user_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{order.user_email}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: #{order.user_id}</div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>🛒 Khách không đăng nhập</div>
                )}
              </div>
            </div>

            {/* Update status */}
            <div className="admin-card animate-fade-in">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={16} color="#6366f1" />
                <h3 style={{ fontWeight: 600, fontSize: 15 }}>Cập nhật trạng thái</h3>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Status radio buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {STATUS_OPTIONS.map(({ value, label, icon: Icon, color, bg }) => (
                    <label
                      key={value}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${newStatus === value ? color : 'transparent'}`,
                        background: newStatus === value ? bg : '#f9fafb',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={value}
                        checked={newStatus === value}
                        onChange={() => setNewStatus(value)}
                        style={{ accentColor: color }}
                      />
                      <Icon size={14} color={color} />
                      <span style={{ fontSize: 13, fontWeight: 500, color }}>{label}</span>
                    </label>
                  ))}
                </div>

                {/* Note */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Ghi chú (tuỳ chọn)
                  </label>
                  <textarea
                    value={statusNote}
                    onChange={e => setStatusNote(e.target.value)}
                    placeholder="Lý do thay đổi trạng thái..."
                    rows={2}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)',
                      borderRadius: 8, fontSize: 13, outline: 'none', resize: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {saveMsg && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 13,
                    background: saveMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
                    color: saveMsg.startsWith('✅') ? '#15803d' : '#b91c1c',
                  }}>
                    {saveMsg}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', opacity: (saving || newStatus === order.status) ? 0.6 : 1 }}
                  disabled={saving || newStatus === order.status}
                  onClick={handleSaveStatus}
                >
                  {saving ? (
                    <>
                      <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} className="animate-spin" />
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      {newStatus === order.status ? 'Chưa thay đổi' : 'Lưu trạng thái'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Payment info */}
            <div className="admin-card animate-fade-in">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={16} color="#6366f1" />
                <h3 style={{ fontWeight: 600, fontSize: 15 }}>Thanh toán</h3>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <span className={`badge badge-${order.payment_status}`} style={{ fontSize: 13, padding: '4px 14px' }}>
                  {order.payment_status === 'paid' ? '✓ Đã thanh toán' : '⏳ Chưa thanh toán'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  )
}
