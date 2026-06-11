import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface AdminUser {
  id: number
  full_name: string
  email: string
  role: number
  avatar?: string
}

interface AuthState {
  token: string | null
  user: AdminUser | null
  isAuthenticated: boolean
  login: (token: string, user: AdminUser) => void
  logout: () => void
  setUser: (user: AdminUser) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'admin-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  ),
)
