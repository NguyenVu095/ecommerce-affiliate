import type { FormEvent } from 'react'
import { useState } from 'react'
import { Eye, EyeOff, LineChart, Link2, LogIn, ShieldCheck, WalletCards } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getMeApi, loginApi, getErrorMessage } from '../../services/api'
import { useAuthStore } from '../../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await loginApi(email, password)
      const token = res.data.access_token
      const meRes = await getMeApi(token)

      login(token, meRes.data)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-info">
        <div className="login-brand">
          <div className="brand-mark large">
            <LineChart size={28} />
          </div>
          <div>
            <strong>AffiliateHub</strong>
            <span>Cổng làm việc cho đối tác tiếp thị liên kết</span>
          </div>
        </div>
        <h1>Theo dõi hoa hồng, link và hiệu quả bán hàng trong một màn hình.</h1>
        <div className="login-benefits">
          <div>
            <Link2 size={20} />
            <span>Tạo và quản lý link theo từng kênh quảng bá.</span>
          </div>
          <div>
            <WalletCards size={20} />
            <span>Kiểm soát số dư, hoa hồng chờ duyệt và lịch sử rút tiền.</span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <span>Dữ liệu đơn hàng được ghi nhận theo tài khoản đăng nhập.</span>
          </div>
        </div>
      </section>

      <section className="login-card" aria-label="Đăng nhập affiliate">
        <div className="mobile-brand">
          <div className="brand-mark">
            <LineChart size={20} />
          </div>
          <strong>AffiliateHub</strong>
        </div>
        <h2>Đăng nhập</h2>
        <p>Truy cập dashboard dành cho đối tác tiếp thị liên kết.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="affiliate@example.com"
              required
            />
          </label>
          <label>
            Mật khẩu
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Ẩn hiện mật khẩu">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button" type="submit" disabled={loading}>
            <LogIn size={17} />
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  )
}
