import { Suspense, lazy, memo } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Toast from './components/Toast'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const AffiliateLinksPage = lazy(() => import('./features/links/AffiliateLinksPage'))
const ProductWarehousePage = lazy(() => import('./features/products/ProductWarehousePage'))
const CommissionsPage = lazy(() => import('./features/commissions/CommissionsPage'))
const ConversionsPage = lazy(() => import('./features/conversions/ConversionsPage'))
const PaymentsPage = lazy(() => import('./features/payments/PaymentsPage'))

const PROTECTED_ROUTES = [
  { path: '/dashboard', Page: DashboardPage },
  { path: '/products', Page: ProductWarehousePage },
  { path: '/links', Page: AffiliateLinksPage },
  { path: '/commissions', Page: CommissionsPage },
  { path: '/conversions', Page: ConversionsPage },
  { path: '/payments', Page: PaymentsPage },
] as const

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Đang tải...
    </div>
  )
}

interface AffiliateLayoutProps {
  children: ReactNode
}

const AffiliateLayout = memo(function AffiliateLayout({ children }: AffiliateLayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  )
})

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {PROTECTED_ROUTES.map(({ path, Page }) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <AffiliateLayout>
                    <Page />
                  </AffiliateLayout>
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Toast />
    </BrowserRouter>
  )
}
