import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginApi, getMeApi, getErrorMessage } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Eye, EyeOff, LogIn, BarChart2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { login } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  interface LocationState { from?: { pathname: string } }
  const from = (location.state as LocationState)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await loginApi(email, password)
      const token = res.data.access_token

      // Gọi /me với token trực tiếp (store chưa có token lúc này)
      const meRes = await getMeApi(token)
      const user = meRes.data

      if (user.role !== 1) {
        setError('Tài khoản này không có quyền truy cập trang quản trị.')
        setLoading(false)
        return
      }

      login(token, user)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2e 50%, #0f1117 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background blobs */}
      <div style={{
        position: 'absolute', top: -100, left: -100, width: 400, height: 400,
        borderRadius: '50%', background: 'rgba(99,102,241,0.08)', filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, right: -80, width: 350, height: 350,
        borderRadius: '50%', background: 'rgba(139,92,246,0.08)', filter: 'blur(60px)',
      }} />

      {/* Left panel */}
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'center',
        padding: '60px', position: 'relative',
      }} className="lg-panel">
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <BarChart2 size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            Quản trị<br />Ecommerce
          </h1>
          <p style={{ color: '#8b92a5', marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
            Nền tảng quản lý đơn hàng, sản phẩm và khách hàng cho admin.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { emoji: '📦', title: 'Quản lý đơn hàng', desc: 'Xử lý và cập nhật trạng thái đơn hàng real-time' },
            { emoji: '📊', title: 'Thống kê doanh thu', desc: 'Dashboard tổng quan với số liệu quan trọng' },
            { emoji: '🎫', title: 'Quản lý coupon', desc: 'Tạo và kiểm soát mã giảm giá' },
          ].map(({ emoji, title, desc }) => (
            <div key={title} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 20 }}>{emoji}</span>
              <div>
                <div style={{ fontWeight: 600, color: '#e5e7eb', fontSize: 14 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Login form */}
      <div style={{
        width: '100%', maxWidth: 440,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '40px 48px',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        margin: '0 auto',
      }}>
        {/* Logo on mobile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart2 size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>AdminPanel</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Ecommerce Management</div>
          </div>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          Đăng nhập
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>
          Chỉ tài khoản Admin mới có thể truy cập.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#9ca3af', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              style={{
                width: '100%', height: 44, padding: '0 14px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#9ca3af', marginBottom: 6 }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', height: 44, padding: '0 42px 0 14px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 44, borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#4f46e5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.15s', opacity: loading ? 0.7 : 1, marginTop: 4,
            }}
          >
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} className="animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Đăng nhập
              </>
            )}
          </button>
        </form>

        <p style={{ marginTop: 32, fontSize: 12, color: '#374151', textAlign: 'center' }}>
          © 2025 Ecommerce Admin Panel. All rights reserved.
        </p>
      </div>
    </div>
  )
}
