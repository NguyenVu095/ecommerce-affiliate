import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import type { ReactNode } from 'react'

/** Props cho ProtectedRoute component. */
interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * Bảo vệ route: chuyển hướng về /login nếu chưa xác thực,
 * hoặc hiển thị trang lỗi nếu tài khoản không có quyền Admin.
 *
 * Tối ưu Zustand: dùng 2 selector riêng lẻ thay vì subscribe toàn bộ store
 * — tránh re-render khi các trường state không liên quan (token, ...) thay đổi.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  // Selector riêng lẻ: chỉ subscribe đúng field cần dùng
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user            = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user.role !== 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Không có quyền truy cập</h2>
        <p style={{ color: '#6b7280' }}>Tài khoản của bạn không có quyền Admin.</p>
        <button
          onClick={() => useAuthStore.getState().logout()}
          style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Đăng xuất
        </button>
      </div>
    )
  }

  return <>{children}</>
}

