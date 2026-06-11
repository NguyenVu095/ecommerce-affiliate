import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface ProtectedRouteProps {
  children: ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  // Chỉ subscribe các lát state cần thiết: O(1) selector giúp route không render lại khi token/action đổi.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const hasUser = useAuthStore((state) => state.user !== null)
  const location = useLocation()

  if (!isAuthenticated || !hasUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
