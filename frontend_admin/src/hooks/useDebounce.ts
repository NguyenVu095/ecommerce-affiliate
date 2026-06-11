import { useState, useEffect } from 'react'

/**
 * Trả về giá trị bị "trì hoãn" sau `delay` ms kể từ lần cuối thay đổi.
 * Dùng để giảm số lần gọi API khi người dùng đang gõ.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
