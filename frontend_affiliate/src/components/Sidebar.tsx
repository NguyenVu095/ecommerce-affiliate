import { memo, useMemo } from 'react'
import { BarChart3, CreditCard, Fingerprint, Home, Link2, LogOut, PackageSearch, ReceiptText, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/products', label: 'Kho sản phẩm', icon: PackageSearch },
  { to: '/links', label: 'Link affiliate', icon: Link2 },
  { to: '/commissions', label: 'Hoa hồng', icon: ReceiptText },
  { to: '/conversions', label: 'Chuyển đổi', icon: Fingerprint },
  { to: '/payments', label: 'Thanh toán', icon: CreditCard },
]

function Sidebar() {
  // Selector theo từng trường giảm render lại từ O(mọi auth update) xuống đúng update ảnh hưởng UI sidebar.
  const fullName = useAuthStore((state) => state.user?.full_name)
  const email = useAuthStore((state) => state.user?.email)
  const logout = useAuthStore((state) => state.logout)
  const initial = useMemo(() => fullName?.[0] || email?.[0] || 'A', [fullName, email])

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <BarChart3 size={20} />
        </div>
        <div>
          <strong>AffiliateHub</strong>
          <span>Partner portal</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Affiliate navigation">
        <span className="nav-label">Quản lý</span>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink className="nav-item" key={to} to={to}>
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-highlight">
        <Trophy size={18} />
        <div>
          <strong>Hạng Silver</strong>
          <span>Còn 8 đơn để lên Gold</span>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="avatar">{initial.toUpperCase()}</div>
        <div className="user-copy">
          <strong>{fullName || 'Affiliate'}</strong>
          <span>{email}</span>
        </div>
        <button className="icon-button danger" type="button" onClick={logout} aria-label="Đăng xuất">
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  )
}

export default memo(Sidebar)
