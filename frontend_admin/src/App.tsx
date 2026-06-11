import { Suspense, lazy, useState, useCallback, memo } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar, { HamburgerButton } from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import GlobalToast from './components/GlobalToast'

const LoginPage               = lazy(() => import('./features/auth/LoginPage'))
const DashboardPage           = lazy(() => import('./features/dashboard/DashboardPage'))
const OrderListPage           = lazy(() => import('./features/orders/OrderListPage'))
const OrderDetailPage         = lazy(() => import('./features/orders/OrderDetailPage'))
const ProductListPage         = lazy(() => import('./features/products/ProductListPage'))
const CouponListPage          = lazy(() => import('./features/coupons/CouponListPage'))
const AffiliateManagementPage = lazy(() => import('./features/affiliates/AffiliateManagementPage'))
const UserListPage            = lazy(() => import('./features/users/UserListPage'))
const CategoryListPage        = lazy(() => import('./features/categories/CategoryListPage'))
const ShipperPage             = lazy(() => import('./features/shipper/ShipperPage'))

/** Danh sách route protected — chỉnh sửa tại một nơi duy nhất khi thêm route mới.
 *  Mỗi entry được bọc tự động bởi <ProtectedRoute> và <AdminLayout>.
 *  Tối ưu: giảm JSX lặp lại từ 8 khối thành 1 vòng lặp .map() — DRY principle.
 */
const PROTECTED_ROUTES = [
  { path: '/dashboard',  element: <DashboardPage /> },
  { path: '/orders',     element: <OrderListPage /> },
  { path: '/orders/:id', element: <OrderDetailPage /> },
  { path: '/products',   element: <ProductListPage /> },
  { path: '/coupons',    element: <CouponListPage /> },
  { path: '/affiliates', element: <AffiliateManagementPage /> },
  { path: '/shipping',   element: <ShipperPage /> },
  { path: '/users',      element: <UserListPage /> },
  { path: '/categories', element: <CategoryListPage /> },
] as const

/** Fallback hiển thị khi route lazy đang tải.
 *  Dùng class CSS `.route-fallback` từ `index.css` thay vì inline style.
 *  `role="status"` + `aria-live="polite"` để screen-reader thông báo trạng thái tải.
 */
function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Đang tải...
    </div>
  )
}

/** Layout admin: sidebar + vùng nội dung chính.
 *  Bọc trong `memo()` để tránh re-render từ parent khi router thay đổi route
 *  nhưng AdminLayout không nhận props mới.
 */
const AdminLayout = memo(function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // useCallback đảm bảo handler không bị tạo lại khi re-render,
  // tránh Sidebar và HamburgerButton nhận prop mới và bị re-render thừa.
  const handleClose   = useCallback(() => setMobileOpen(false), [])
  const handleOpen    = useCallback(() => setMobileOpen(true),  [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar mobileOpen={mobileOpen} onClose={handleClose} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Mobile header bar with hamburger */}
        <div className="mobile-topbar" style={{
          display: 'none', // shown via CSS media query
          alignItems: 'center',
          padding: '10px 16px',
          background: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--sidebar-border)',
          gap: 12,
        }}>
          <HamburgerButton onClick={handleOpen} />
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>AdminPanel</div>
        </div>
        {children}
      </div>
    </div>
  )
})

function App() {
  return (
    <BrowserRouter>
      <GlobalToast />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected admin routes — tự động bọc ProtectedRoute + AdminLayout
              Thuật toán mới: render từ mảng PROTECTED_ROUTES tĩnh bằng 1 vòng .map()
              thay vì 8 khối JSX lặp lại riêng biệt — DRY, dễ bảo trì hơn. */}
          {PROTECTED_ROUTES.map(({ path, element }) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <AdminLayout>{element}</AdminLayout>
                </ProtectedRoute>
              }
            />
          ))}

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App

