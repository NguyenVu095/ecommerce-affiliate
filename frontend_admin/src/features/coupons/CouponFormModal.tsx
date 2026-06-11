import type { CSSProperties, FormEvent } from 'react'
import { useState } from 'react'
import { X, Tag, Percent, DollarSign, Calendar, Users, ShoppingCart, Hash } from 'lucide-react'
import {
  createAdminCouponApi,
  updateAdminCouponApi,
  getErrorMessage,
  type AdminCouponPayload,
} from '../../services/api'

interface Coupon {
  id: number
  code: string
  type: 'percent' | 'fixed'
  value: number
  min_order: number
  max_discount: number | null
  quantity: number
  max_uses_per_user: number
  applicable_type: 'all'
  start_at: string | null
  expired_at: string | null
  status: number
  used_count?: number
}

interface Props {
  coupon: Coupon | null
  onClose: (refresh?: boolean) => void
}

interface CouponFormState {
  code: string
  type: 'percent' | 'fixed'
  value: string
  min_order: string
  max_discount: string
  quantity: string
  max_uses_per_user: string
  applicable_type: 'all'
  start_at: string
  expired_at: string
  status: number
}

function toLocalDatetime(isoStr: string | null): string {
  if (!isoStr) return ''
  // Backend returns ISO without timezone, treat as UTC
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'))
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function toUtcIso(localStr: string): string | null {
  if (!localStr) return null
  return new Date(localStr).toISOString()
}

function buildCouponForm(coupon: Coupon | null): CouponFormState {
  if (!coupon) {
    return {
      code: '',
      type: 'percent',
      value: '',
      min_order: '0',
      max_discount: '',
      quantity: '100',
      max_uses_per_user: '1',
      applicable_type: 'all',
      start_at: '',
      expired_at: '',
      status: 1,
    }
  }

  return {
    code: coupon.code,
    type: coupon.type,
    value: String(coupon.value),
    min_order: String(coupon.min_order),
    max_discount: coupon.max_discount !== null ? String(coupon.max_discount) : '',
    quantity: String(coupon.quantity),
    max_uses_per_user: String(coupon.max_uses_per_user),
    applicable_type: coupon.applicable_type,
    start_at: toLocalDatetime(coupon.start_at),
    expired_at: toLocalDatetime(coupon.expired_at),
    status: coupon.status,
  }
}

const FIELD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export default function CouponFormModal({ coupon, onClose }: Props) {
  const isEdit = !!coupon

  const [form, setForm] = useState<CouponFormState>(() => buildCouponForm(coupon))

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverErr, setServerErr] = useState('')

  const set = <K extends keyof CouponFormState>(field: K, val: CouponFormState[K]) =>
    setForm(f => ({ ...f, [field]: val }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.code.trim()) errs.code = 'Mã coupon không được trống'
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0)
      errs.value = 'Giá trị phải > 0'
    if (form.type === 'percent' && Number(form.value) > 100)
      errs.value = 'Phần trăm tối đa là 100%'
    if (isNaN(Number(form.quantity)) || Number(form.quantity) < 0)
      errs.quantity = 'Số lượng không hợp lệ'
    if (isNaN(Number(form.max_uses_per_user)) || Number(form.max_uses_per_user) < 1)
      errs.max_uses_per_user = 'Số lần dùng mỗi người phải từ 1 trở lên'
    if (form.expired_at && form.start_at && form.expired_at <= form.start_at)
      errs.expired_at = 'Ngày hết hạn phải sau ngày bắt đầu'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setServerErr('')
    try {
      const payload: AdminCouponPayload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        min_order: Number(form.min_order) || 0,
        max_discount: form.max_discount ? Number(form.max_discount) : null,
        quantity: Number(form.quantity),
        max_uses_per_user: Number(form.max_uses_per_user) || 1,
        applicable_type: 'all',
        start_at: toUtcIso(form.start_at),
        expired_at: toUtcIso(form.expired_at),
        status: form.status,
      }
      if (isEdit && coupon) {
        await updateAdminCouponApi(coupon.id, payload)
      } else {
        await createAdminCouponApi(payload)
      }
      onClose(true)
    } catch (err: unknown) {
      setServerErr(getErrorMessage(err, 'Lưu mã giảm giá thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: CSSProperties = {
    height: 38,
    padding: '0 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#1a1d2e',
    background: '#fff',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
    fontFamily: 'Inter, sans-serif',
  }

  const errStyle = (field: string): CSSProperties => ({
    ...inputStyle,
    borderColor: errors[field] ? '#ef4444' : '#e5e7eb',
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18,
          width: '100%', maxWidth: 600, maxHeight: '90vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
          animation: 'fadeInUp 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #f3f4f6',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Tag size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>
                {isEdit ? 'Chỉnh sửa mã giảm giá' : 'Tạo mã giảm giá mới'}
              </div>
              {isEdit && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                  #{coupon.id} · Đã dùng: {coupon.used_count ?? 0} lần
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => !saving && onClose()}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {serverErr && (
            <div style={{
              background: '#fee2e2', color: '#b91c1c', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, marginBottom: 20, fontWeight: 500,
            }}>
              {serverErr}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Code */}
            <div style={{ ...FIELD, gridColumn: '1 / -1' }}>
              <label style={LABEL}>
                <Hash size={11} style={{ display: 'inline', marginRight: 4 }} />
                Mã coupon *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{
                    ...errStyle('code'),
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    fontSize: 15, letterSpacing: '0.08em', fontWeight: 600,
                  }}
                  value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  placeholder="VD: SUMMER2024"
                  maxLength={50}
                />
              </div>
              {errors.code && <span style={{ fontSize: 12, color: '#ef4444' }}>{errors.code}</span>}
            </div>

            {/* Type */}
            <div style={FIELD}>
              <label style={LABEL}>Loại giảm giá *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['percent', 'fixed'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('type', t)}
                    style={{
                      flex: 1, height: 38, borderRadius: 8, border: '2px solid',
                      borderColor: form.type === t ? '#6366f1' : '#e5e7eb',
                      background: form.type === t ? '#eef2ff' : '#fff',
                      color: form.type === t ? '#6366f1' : '#6b7280',
                      fontWeight: form.type === t ? 600 : 400,
                      fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    {t === 'percent' ? <Percent size={14} /> : <DollarSign size={14} />}
                    {t === 'percent' ? 'Phần trăm' : 'Số tiền cố định'}
                  </button>
                ))}
              </div>
            </div>

            {/* Value */}
            <div style={FIELD}>
              <label style={LABEL}>
                {form.type === 'percent' ? 'Giá trị (%) *' : 'Số tiền giảm (₫) *'}
              </label>
              <input
                type="number"
                style={errStyle('value')}
                value={form.value}
                onChange={e => set('value', e.target.value)}
                placeholder={form.type === 'percent' ? '10' : '50000'}
                min={0}
                max={form.type === 'percent' ? 100 : undefined}
                step="any"
              />
              {errors.value && <span style={{ fontSize: 12, color: '#ef4444' }}>{errors.value}</span>}
            </div>

            {/* Min order */}
            <div style={FIELD}>
              <label style={LABEL}>
                <ShoppingCart size={11} style={{ display: 'inline', marginRight: 4 }} />
                Đơn hàng tối thiểu (₫)
              </label>
              <input
                type="number"
                style={inputStyle}
                value={form.min_order}
                onChange={e => set('min_order', e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>

            {/* Max discount (only for percent) */}
            {form.type === 'percent' && (
              <div style={FIELD}>
                <label style={LABEL}>Giảm tối đa (₫)</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.max_discount}
                  onChange={e => set('max_discount', e.target.value)}
                  placeholder="Không giới hạn"
                  min={0}
                />
              </div>
            )}

            {/* Quantity */}
            <div style={FIELD}>
              <label style={LABEL}>Số lượng mã *</label>
              <input
                type="number"
                style={errStyle('quantity')}
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                placeholder="100"
                min={0}
              />
              {errors.quantity && <span style={{ fontSize: 12, color: '#ef4444' }}>{errors.quantity}</span>}
            </div>

            {/* Max uses per user */}
            <div style={FIELD}>
              <label style={LABEL}>
                <Users size={11} style={{ display: 'inline', marginRight: 4 }} />
                Số lần dùng / người
              </label>
              <input
                type="number"
                style={errStyle('max_uses_per_user')}
                value={form.max_uses_per_user}
                onChange={e => set('max_uses_per_user', e.target.value)}
                placeholder="1"
                min={1}
              />
              {errors.max_uses_per_user && <span style={{ fontSize: 12, color: '#ef4444' }}>{errors.max_uses_per_user}</span>}
            </div>

            {/* Applicable type */}
            <div style={{ ...FIELD, gridColumn: '1 / -1' }}>
              <label style={LABEL}>Áp dụng cho</label>
              <div style={{
                height: 38, borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#f9fafb', color: '#374151', fontSize: 13,
                display: 'flex', alignItems: 'center', padding: '0 12px',
              }}>
                Tất cả sản phẩm
              </div>
            </div>

            {/* Start at */}
            <div style={FIELD}>
              <label style={LABEL}>
                <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                Ngày bắt đầu
              </label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.start_at}
                onChange={e => set('start_at', e.target.value)}
              />
            </div>

            {/* Expired at */}
            <div style={FIELD}>
              <label style={LABEL}>
                <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                Ngày hết hạn
              </label>
              <input
                type="datetime-local"
                style={{ ...inputStyle, borderColor: errors.expired_at ? '#ef4444' : '#e5e7eb' }}
                value={form.expired_at}
                onChange={e => set('expired_at', e.target.value)}
              />
              {errors.expired_at && <span style={{ fontSize: 12, color: '#ef4444' }}>{errors.expired_at}</span>}
            </div>

            {/* Status */}
            <div style={{ ...FIELD, gridColumn: '1 / -1' }}>
              <label style={LABEL}>Trạng thái</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ val: 1, label: 'Kích hoạt', color: '#10b981' }, { val: 0, label: 'Vô hiệu', color: '#6b7280' }].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => set('status', opt.val)}
                    style={{
                      flex: 1, height: 38, borderRadius: 8, border: '2px solid',
                      borderColor: form.status === opt.val ? opt.color : '#e5e7eb',
                      background: form.status === opt.val ? `${opt.color}18` : '#fff',
                      color: form.status === opt.val ? opt.color : '#6b7280',
                      fontWeight: form.status === opt.val ? 600 : 400,
                      fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f3f4f6',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: '#fafafa',
        }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => !saving && onClose()}
            disabled={saving}
          >
            Hủy
          </button>
          <button
            type="submit"
            form=""
            className="btn btn-primary"
            disabled={saving}
            onClick={handleSubmit}
            style={{ minWidth: 120 }}
          >
            {saving ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Đang lưu...
              </span>
            ) : isEdit ? 'Cập nhật' : 'Tạo mã'}
          </button>
        </div>
      </div>
    </div>
  )
}
