import {
  AlertCircle,
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  XCircle,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import TopBar from '../../components/TopBar'
import {
  createWithdrawalApi,
  getErrorMessage,
  getWithdrawalsApi,
  type WithdrawalCreatePayload,
  type WithdrawalListResponse,
} from '../../services/api'
import { toast } from '../../store/toastStore'

const emptyData: WithdrawalListResponse = {
  balance: { available: 0, pending: 0, paid_total: 0 },
  pending_withdrawal: 0,
  net_available: 0,
  total: 0,
  data: [],
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—'

const statusLabels: Record<string, string> = {
  pending: 'Đang xử lý',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
  paid: 'Đã thanh toán',
}

const statusClass: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'cancelled',
  paid: 'paid',
}

export default function PaymentsPage() {
  const [data, setData] = useState<WithdrawalListResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankOwner, setBankOwner] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refreshWithdrawals = () => {
    setLoading(true)
    setError('')
    getWithdrawalsApi()
      .then((res) => setData(res.data))
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được dữ liệu rút tiền.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getWithdrawalsApi()
      .then((res) => setData(res.data))
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được dữ liệu rút tiền.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [])

  const openForm = () => {
    setShowForm(true)
    setAmount(String(Math.floor(data.net_available)))
    setBankName('')
    setBankAccount('')
    setBankOwner('')
    setNote('')
  }

  const closeForm = () => {
    if (submitting) return
    setShowForm(false)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const numAmount = parseInt(amount.replace(/\D/g, ''), 10) || 0
    if (numAmount < 50000) {
      toast.warning('Số tiền rút tối thiểu là 50.000 ₫.')
      return
    }
    if (numAmount > data.net_available) {
      toast.warning(`Số dư khả dụng không đủ. Tối đa ${currency(data.net_available)}.`)
      return
    }
    if (!bankName.trim()) { toast.warning('Vui lòng nhập tên ngân hàng.'); return }
    if (!bankAccount.trim()) { toast.warning('Vui lòng nhập số tài khoản.'); return }
    if (!bankOwner.trim()) { toast.warning('Vui lòng nhập tên chủ tài khoản.'); return }

    setSubmitting(true)
    const payload: WithdrawalCreatePayload = {
      amount: numAmount,
      bank_name: bankName.trim(),
      bank_account: bankAccount.trim(),
      bank_owner: bankOwner.trim(),
      note: note.trim() || undefined,
    }
    try {
      await createWithdrawalApi(payload)
      toast.success('Yêu cầu rút tiền đã được gửi thành công! Admin sẽ xử lý trong 1-3 ngày làm việc.')
      setShowForm(false)
      refreshWithdrawals()
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Không gửi được yêu cầu rút tiền. Vui lòng thử lại.')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const formatAmountInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    return digits ? new Intl.NumberFormat('vi-VN').format(parseInt(digits, 10)) : ''
  }

  return (
    <>
      <TopBar title="Thanh toán" subtitle="Quản lý yêu cầu rút tiền hoa hồng về tài khoản ngân hàng" />
      <div className="page-content">

        {/* Balance Hero */}
        <section className="commission-hero" style={{ marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Số dư hoa hồng</span>
            <h2>{currency(data.net_available)}</h2>
            <p>Số dư khả dụng sau khi trừ các yêu cầu rút đang chờ xử lý.</p>
          </div>
          <div className="commission-hero-metrics">
            <div>
              <span>Hoa hồng đã duyệt</span>
              <strong>{currency(data.balance.available)}</strong>
            </div>
            <div>
              <span>Đang chờ duyệt rút</span>
              <strong>{currency(data.pending_withdrawal)}</strong>
            </div>
            <div>
              <span>Đã thanh toán</span>
              <strong>{currency(data.balance.paid_total)}</strong>
            </div>
            <div>
              <span>Hoa hồng chờ duyệt</span>
              <strong>{currency(data.balance.pending)}</strong>
            </div>
          </div>
        </section>

        {/* Action button */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button
            className="primary-button"
            type="button"
            disabled={data.net_available < 50000}
            onClick={openForm}
          >
            <ArrowDownToLine size={17} />
            Yêu cầu rút tiền
          </button>
          {data.net_available < 50000 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <AlertCircle size={15} />
              Số dư tối thiểu để rút là 50.000 ₫
            </span>
          )}
        </div>


        {loading && <div className="state-panel">Đang tải dữ liệu thanh toán...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && (
          <section className="commission-list">
            <div className="panel-header" style={{ marginBottom: 0 }}>
              <div>
                <h3>Lịch sử rút tiền</h3>
                <p>{data.total} yêu cầu</p>
              </div>
              <CreditCard size={20} style={{ color: 'var(--muted)' }} />
            </div>

            {data.data.length === 0 && (
              <div className="state-panel" style={{ marginTop: 12 }}>
                Chưa có yêu cầu rút tiền nào. Hoa hồng đã duyệt sẽ được chuyển khoản sau khi bạn tạo yêu cầu.
              </div>
            )}

            {data.data.map((item) => (
              <article className="commission-row" key={item.id} style={{ marginTop: 12 }}>
                <div className="commission-main">
                  <span className={`commission-status ${statusClass[item.status]}`}>
                    {item.status === 'pending' && <Clock3 size={12} />}
                    {item.status === 'approved' && <CheckCircle2 size={12} />}
                    {item.status === 'paid' && <Banknote size={12} />}
                    {item.status === 'rejected' && <XCircle size={12} />}
                    &nbsp;{statusLabels[item.status]}
                  </span>
                  <strong>{currency(item.amount)}</strong>
                  <small>
                    {item.bank_owner} · {item.bank_name} · {item.bank_account}
                  </small>
                </div>
                <div className="commission-stats">
                  <div>
                    <span>Ngân hàng</span>
                    <strong>{item.bank_name}</strong>
                  </div>
                  <div>
                    <span>Số tài khoản</span>
                    <strong>{item.bank_account}</strong>
                  </div>
                  <div>
                    <span>Chủ tài khoản</span>
                    <strong>{item.bank_owner}</strong>
                  </div>
                </div>
                <div className="commission-timeline">
                  <span>Tạo: {dateTime(item.created_at)}</span>
                  <span>Xử lý: {dateTime(item.processed_at)}</span>
                  {item.note && <span>Ghi chú: {item.note}</span>}
                  {item.admin_note && (
                    <span style={{ color: item.status === 'rejected' ? 'var(--danger)' : 'var(--green)' }}>
                      Admin: {item.admin_note}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {/* Modal tạo yêu cầu rút tiền */}
      {showForm && (
        <div className="modal-backdrop" role="presentation" onClick={closeForm}>
          <form
            className="create-link-modal"
            style={{ maxWidth: 480 }}
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Yêu cầu rút tiền</h3>
                <p>Số dư khả dụng: {currency(data.net_available)}</p>
              </div>
            </div>


            <label className="form-control">
              <span>Số tiền muốn rút (₫)</span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                placeholder="VD: 500.000"
                required
              />
            </label>

            <label className="form-control">
              <span>Ngân hàng</span>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="VD: Vietcombank, MB Bank, Techcombank..."
                required
              />
            </label>

            <label className="form-control">
              <span>Số tài khoản</span>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="VD: 1234567890"
                required
              />
            </label>

            <label className="form-control">
              <span>Tên chủ tài khoản</span>
              <input
                type="text"
                value={bankOwner}
                onChange={(e) => setBankOwner(e.target.value)}
                placeholder="Tên in hoa đúng như trên thẻ ngân hàng"
                required
              />
            </label>

            <label className="form-control">
              <span>Ghi chú (tùy chọn)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Rút tiền tháng 5"
              />
            </label>

            <div className="modal-actions">
              <button className="secondary-light-button" type="button" onClick={closeForm}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={submitting}>
                <ArrowDownToLine size={16} />
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
