import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface AffiliateUser {
  id: number
  full_name?: string
  email: string
  role: number
  avatar?: string
  referral_code?: string
}

interface AuthState {
  token: string | null
  user: AffiliateUser | null
  isAuthenticated: boolean
  login: (token: string, user: AffiliateUser) => void
  logout: () => void
  setUser: (user: AffiliateUser) => void
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
      name: 'affiliate-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
