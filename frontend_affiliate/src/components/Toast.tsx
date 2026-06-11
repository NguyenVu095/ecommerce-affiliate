import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { memo, useCallback, useEffect, useRef } from 'react'
import { useToastStore, type ToastItem } from '../store/toastStore'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

function ToastCardComponent({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((state) => state.removeToast)
  const progressRef = useRef<HTMLDivElement>(null)
  const duration = toast.duration ?? 3500
  const Icon = ICONS[toast.type]
  const handleRemove = useCallback(() => removeToast(toast.id), [removeToast, toast.id])

  useEffect(() => {
    const el = progressRef.current
    if (!el) return
    // Animate progress bar từ 100% → 0%
    el.style.transition = `width ${duration}ms linear`
    // Trigger reflow để animation bắt đầu
    el.getBoundingClientRect()
    el.style.width = '0%'
  }, [duration])

  return (
    <div className={`toast-card toast-${toast.type}`} role="alert" aria-live="polite">
      <div className="toast-body">
        <Icon size={17} className="toast-icon" />
        <span className="toast-message">{toast.message}</span>
        <button
          className="toast-close"
          type="button"
          onClick={handleRemove}
          aria-label="Đóng thông báo"
        >
          <X size={14} />
        </button>
      </div>
      <div className="toast-progress-track">
        <div
          ref={progressRef}
          className="toast-progress-bar"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

// Memo giữ các toast cũ không render lại khi mảng thêm/xóa item khác, tránh reset animation tiến trình.
const ToastCard = memo(ToastCardComponent)

function Toast() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-label="Thông báo hệ thống">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

export default memo(Toast)
