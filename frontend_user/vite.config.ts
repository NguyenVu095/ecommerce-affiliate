import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const LOCAL_URL_PATTERN = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i
const PLACEHOLDER_URL_PATTERN = /(?:^|\.)example\.(?:com|org|net)$|(?:^|\.)(?:example|invalid|test)$|replace-me/i

function assertProductionUrl(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} must be configured for a production build.`)
  }
  if (LOCAL_URL_PATTERN.test(value)) {
    throw new Error(`${name} must not point to localhost in a production build.`)
  }
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in a production build.`)
  }
  if (PLACEHOLDER_URL_PATTERN.test(parsed.hostname)) {
    throw new Error(`${name} must not use a placeholder hostname.`)
  }
}

function assertGoogleClientId(value: string | undefined) {
  if (!value || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value)) {
    throw new Error('VITE_GOOGLE_CLIENT_ID must be a valid Google OAuth Web client ID.')
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production') {
    assertProductionUrl('VITE_API_URL', env.VITE_API_URL)
    assertGoogleClientId(env.VITE_GOOGLE_CLIENT_ID)
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
