import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const LOCAL_URL_PATTERN = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i

function assertProductionUrl(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} must be configured for a production build.`)
  }
  if (LOCAL_URL_PATTERN.test(value)) {
    throw new Error(`${name} must not point to localhost in a production build.`)
  }
  if (new URL(value).protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in a production build.`)
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production') {
    assertProductionUrl('VITE_API_URL', env.VITE_API_URL)
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5174,
    },
  }
})
