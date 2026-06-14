import { memo, useEffect, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ShoppingBag, BarChart2, Tag, Users, LogOut, Package, Users2, FolderTree, Truck, Menu, WalletCards, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

/** Kiểu dữ liệu cho mỗi mục điều hướng trong sidebar. */
interface NavItem {
  to: string
  icon: React.ElementType
  label: string
}

const NAV: NavItem[] = [
  { to: '/dashboard',  icon: BarChart2,   label: 'Dashboard' },
  { to: '/orders',     icon: ShoppingBag, label: 'Đơn Hàng' },
  { to: '/products',   icon: Package,     label: 'Sản phẩm' },
  { to: '/categories', icon: FolderTree,  label: 'Danh mục' },
  { to: '/coupons',    icon: Tag,         label: 'Mã giảm giá' },
  { to: '/affiliates', icon: Users,       label: 'Affiliate' },
  { to: '/withdrawals', icon: WalletCards, label: 'Rút tiền' },
  { to: '/shipping',   icon: Truck,       label: 'Vận chuyển' },
  { to: '/users',      icon: Users2,      label: 'Khách hàng' },
]

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

/**
 * Sidebar điều hướng admin.
 *
 * Tối ưu Zustand: dùng selector riêng cho `fullName`, `email`, `logout`
 * thay vì subscribe toàn bộ `{ user, logout }` — tránh re-render khi
 * các trường khác (token, isAuthenticated, ...) thay đổi.
 *
 * Tối ưu render: bọc trong `memo()` — tránh re-render từ parent (App)
 * khi `mobileOpen` và `onClose` không thay đổi.
 *
 * Tối ưu tính toán: `useMemo` cho `avatarInitial` — tránh tính lại mỗi render.
 */
export default memo(function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  // Selector riêng lẻ: chỉ subscribe đúng field cần dùng
  const fullName = useAuthStore((s) => s.user?.full_name ?? '')
  const email    = useAuthStore((s) => s.user?.email ?? '')
  const logout   = useAuthStore((s) => s.logout)
  const location = useLocation()

  // useMemo: tính avatar initial 1 lần khi fullName thay đổi,
  // không tính lại mỗi lần Sidebar re-render vì lý do khác.
  const avatarInitial = useMemo(
    () => fullName[0]?.toUpperCase() || 'A',
    [fullName],
  )

  // Đóng sidebar khi route thay đổi (mobile); onClose trong deps để đúng exhaustive-deps
  useEffect(() => {
    onClose()
  }, [location.pathname, onClose])

  const sidebarContent = (
    <aside style={{
      width: 240,
      height: '100%',
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Logo + mobile close button */}
      <div style={{ padding: '20px 16px 20px 20px', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart2 size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>AdminPanel</div>
            <div style={{ fontSize: 11, color: 'var(--sidebar-text)' }}>Ecommerce</div>
          </div>
        </div>
        {/* Mobile close btn */}
        <button
          className="sidebar-mobile-close"
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
            width: 32, height: 32, display: 'none', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--sidebar-text)',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 600, letterSpacing: '0.08em', padding: '0 8px 8px', textTransform: 'uppercase' }}>
          Menu
        </div>

        {NAV.map(({ to, icon: Icon, label }) => {
          const active = location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: 'none',
                color: active ? '#fff' : 'var(--sidebar-text)',
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              {active && (
                <span style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 20, background: '#6366f1', borderRadius: '0 2px 2px 0',
                }} />
              )}
              <Icon size={16} color={active ? '#6366f1' : 'var(--sidebar-text)'} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {/* avatarInitial: được tính bằng useMemo — không tính lại mỗi render */}
            {avatarInitial}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fullName || 'Admin'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--sidebar-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {email}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8, border: 'none',
            background: 'rgba(239,68,68,0.08)', color: '#f87171',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
        >
          <LogOut size={14} />
          Đăng xuất
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: always visible */}
      <div className="sidebar-desktop">
        {sidebarContent}
      </div>

      {/* Mobile: slide-in overlay */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            display: 'none', // controlled by CSS @media
          }}
        />
      )}
      <div
        className={`sidebar-mobile${mobileOpen ? ' open' : ''}`}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 201,
          display: 'none', // controlled by CSS @media
        }}
      >
        {sidebarContent}
      </div>
    </>
  )
})

/** Nút hamburger mở sidebar — xuất ra để App.tsx đặt trong mobile TopBar.
 *  Bọc trong `memo()` vì đây là pure UI không có state riêng. */
export const HamburgerButton = memo(function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="sidebar-hamburger"
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '6px 8px', borderRadius: 8, color: 'var(--text-secondary)',
        display: 'none', // controlled by CSS @media
        alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      title="Mở menu"
    >
      <Menu size={20} />
    </button>
  )
})
