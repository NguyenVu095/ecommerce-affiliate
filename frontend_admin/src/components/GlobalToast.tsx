import { memo, useCallback } from 'react'
import { useToastStore, type ToastType } from '../store/toastStore'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const TOAST_CONFIG: Record<ToastType, { bg: string; color: string; icon: React.ReactNode }> = {
  success: { bg: '#10b981', color: '#fff', icon: <CheckCircle size={16} /> },
  error:   { bg: '#ef4444', color: '#fff', icon: <XCircle size={16} /> },
  info:    { bg: '#3b82f6', color: '#fff', icon: <Info size={16} /> },
  warning: { bg: '#f59e0b', color: '#fff', icon: <AlertTriangle size={16} /> },
}

/** Props cho từng ToastCard. */
interface ToastCardProps {
  id: number
  type: ToastType
  msg: string
  onDismiss: (id: number) => void
}

/**
 * Card hiển thị cho từng toast.
 *
 * Tối ưu render: bọc trong `memo()` — toast cũ không bị re-render/reset animation
 * khi một toast mới được thêm vào hoặc toast khác bị xóa khỏi danh sách.
 */
const ToastCard = memo(function ToastCard({ id, type, msg, onDismiss }: ToastCardProps) {
  const cfg = TOAST_CONFIG[type]
  // useCallback đảm bảo handler dismiss không được tạo lại mỗi render của ToastCard
  const handleDismiss = useCallback(() => onDismiss(id), [id, onDismiss])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderRadius: 10,
        fontSize: 14, fontWeight: 500,
        background: cfg.bg, color: cfg.color,
        boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
        animation: 'toastSlideIn 0.22s ease',
        pointerEvents: 'all',
        minWidth: 240, maxWidth: 380,
      }}
    >
      {cfg.icon}
      <span style={{ flex: 1 }}>{msg}</span>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'inherit', opacity: 0.7, padding: '0 0 0 4px',
          display: 'flex', alignItems: 'center',
        }}
        title="Đóng"
      >
        <X size={14} />
      </button>
    </div>
  )
})

/**
 * Container toàn cục hiển thị danh sách toast thông báo.
 *
 * Tối ưu Zustand: dùng selector riêng cho `toasts` và `dismiss`
 * thay vì destructure toàn bộ store — tránh re-render khi các
 * trường state không liên quan thay đổi.
 */
export default function GlobalToast() {
  // Selector riêng lẻ: chỉ subscribe đúng field cần dùng
  const toasts  = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastCard key={t.id} id={t.id} type={t.type} msg={t.msg} onDismiss={dismiss} />
      ))}
    </div>
  )
}
