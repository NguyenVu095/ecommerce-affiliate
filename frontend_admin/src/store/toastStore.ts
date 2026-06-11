import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  msg: string
  type: ToastType
}

interface ToastState {
  toasts: ToastItem[]
  show: (msg: string, type?: ToastType, duration?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (msg, type = 'success', duration = 3000) => {
    const id = nextId++
    set(state => ({ toasts: [...state.toasts, { id, msg, type }] }))
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, duration)
  },
  dismiss: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))

/** Shorthand helpers để dùng ngoài component (không cần hook) */
export const toast = {
  success: (msg: string, duration?: number) => useToastStore.getState().show(msg, 'success', duration),
  error: (msg: string, duration?: number) => useToastStore.getState().show(msg, 'error', duration),
  info: (msg: string, duration?: number) => useToastStore.getState().show(msg, 'info', duration),
  warning: (msg: string, duration?: number) => useToastStore.getState().show(msg, 'warning', duration),
}
