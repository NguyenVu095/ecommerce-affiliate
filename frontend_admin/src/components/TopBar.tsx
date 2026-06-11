import { memo, useMemo } from 'react'
import { Bell } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

/** Props cho TopBar component. */
interface TopBarProps {
  title: string
  subtitle?: string
}

/**
 * Thanh tiêu đề nằm trên cùng của trang admin.
 *
 * Tối ưu Zustand: dùng selector riêng cho `fullName` thay vì subscribe
 * toàn bộ `{ user }` — tránh re-render khi token/email/... thay đổi.
 *
 * Tối ưu render: bọc trong `memo()` — tránh re-render từ parent
 * khi `title` và `subtitle` không thay đổi.
 *
 * Tối ưu tính toán: `useMemo` cho `avatarInitial` và `displayName`
 * — tránh tính lại chuỗi mỗi lần re-render.
 */
export default memo(function TopBar({ title, subtitle }: TopBarProps) {
  // Selector riêng lẻ: chỉ subscribe đúng field cần dùng
  const fullName = useAuthStore((s) => s.user?.full_name ?? '')

  // useMemo: tính avatar initial và display name 1 lần khi fullName thay đổi,
  // không tính lại mỗi lần TopBar re-render vì lý do khác.
  const avatarInitial = useMemo(() => fullName[0]?.toUpperCase() || 'A', [fullName])
  const displayName   = useMemo(() => fullName.split(' ').pop() || 'Admin',  [fullName])

  return (
    <header style={{
      height: 64,
      background: '#fff',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Page title */}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1 }}>{subtitle}</p>}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{
          width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border-color)',
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.15s',
        }}>
          <Bell size={16} />
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
          background: '#fff',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>
            {/* avatarInitial: tính 1 lần bằng useMemo khi fullName thay đổi */}
            {avatarInitial}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            {/* displayName: tính 1 lần bằng useMemo khi fullName thay đổi */}
            {displayName}
          </span>
        </div>
      </div>
    </header>
  )
})
