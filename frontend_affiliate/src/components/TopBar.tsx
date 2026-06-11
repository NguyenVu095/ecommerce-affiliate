import { memo, useMemo } from 'react'
import { Bell, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

interface TopBarProps {
  title: string
  subtitle?: string
}

function TopBar({ title, subtitle }: TopBarProps) {
  const fullName = useAuthStore((state) => state.user?.full_name)
  // Tính tên hiển thị một lần theo fullName thay vì split chuỗi trong mỗi render của header.
  const displayName = useMemo(
    () => fullName?.trim().split(' ').filter(Boolean).pop() || 'Affiliate',
    [fullName],
  )

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar-actions">
        <label className="search-box">
          <Search size={16} />
          <input placeholder="Tìm sản phẩm, link, đơn hàng" />
        </label>
        <button className="icon-button" type="button" aria-label="Thông báo">
          <Bell size={17} />
        </button>
        <div className="topbar-user">
          <span>{displayName}</span>
        </div>
      </div>
    </header>
  )
}

export default memo(TopBar)
