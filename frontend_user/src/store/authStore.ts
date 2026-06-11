import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface UserAddress {
  id: number;
  receiver_name: string;
  receiver_phone: string;
  province_id: number;
  district_id: number;
  ward_id: string;
  address_detail: string;
  is_default: boolean;
}

export interface User {
  id: number;
  email: string;
  role: number;
  full_name?: string;
  phone?: string;
  avatar?: string;
  addresses?: UserAddress[];
  wallet_balance?: number;
  referral_code?: string;
  google_id?: string;
  auth_provider?: string;
  referred_by_id?: number;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      updateUser: (updatedData) => set((state) => ({ user: state.user ? { ...state.user, ...updatedData } : null })),
    }),
    {
      name: 'ecommerce-auth-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
