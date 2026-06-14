import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Clock, RefreshCw, Search, WalletCards, XCircle } from 'lucide-react'

import TopBar from '../../components/TopBar'
import {
  getAdminAffiliateWithdrawalsApi,
  getErrorMessage,
  updateAdminAffiliateWithdrawalStatusApi,
  type AdminWithdrawalRow,
  type WithdrawalStatus,
} from '../../services/api'

const PAGE_SIZE = 20

const statusLabels: Record<WithdrawalStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  paid: 'Đã thanh toán',
}

const statusColors: Record<WithdrawalStatus, { background: string; color: string }> = {
  pending: { background: '#fef3c7', color: '#92400e' },
  approved: { background: '#dcfce7', color: '#15803d' },
  rejected: { background: '#fee2e2', color: '#b91c1c' },
  paid: { background: '#dbeafe', color: '#1d4ed8' },
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)

const dateTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'

export default function WithdrawalManagementPage() {
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getAdminAffiliateWithdrawalsApi({
        page,
        page_size: PAGE_SIZE,
        status: status || undefined,
        search: search.trim() || undefined,
      })
      setRows(response.data.data)
      setTotal(response.data.total)
      setTotalPages(response.data.total_pages)
    } catch (error) {
      setMessage({ text: getErrorMessage(error, 'Không thể tải yêu cầu rút tiền'), error: true })
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => {
    let cancelled = false
    getAdminAffiliateWithdrawalsApi({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
      search: search.trim() || undefined,
    })
      .then((response) => {
        if (cancelled) return
        setRows(response.data.data)
        setTotal(response.data.total)
        setTotalPages(response.data.total_pages)
      })
      .catch((error) => {
        if (cancelled) return
        setMessage({ text: getErrorMessage(error, 'Không thể tải yêu cầu rút tiền'), error: true })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [page, search, status])

  const updateStatus = async (row: AdminWithdrawalRow, nextStatus: Exclude<WithdrawalStatus, 'pending'>) => {
    const adminNote = nextStatus === 'rejected'
      ? window.prompt('Lý do từ chối yêu cầu rút tiền:', row.admin_note || '') ?? undefined
      : undefined
    if (nextStatus === 'rejected' && adminNote === undefined) return

    setUpdatingId(row.id)
    try {
      await updateAdminAffiliateWithdrawalStatusApi(row.id, nextStatus, adminNote)
      setMessage({ text: `Đã cập nhật yêu cầu #${row.id}`, error: false })
      await load()
    } catch (error) {
      setMessage({ text: getErrorMessage(error, 'Cập nhật yêu cầu thất bại'), error: true })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Yêu cầu rút tiền" subtitle={`${total} yêu cầu`} />
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {message && (
          <div style={{
            padding: '10px 14px', marginBottom: 14, borderRadius: 8,
            background: message.error ? '#fee2e2' : '#dcfce7',
            color: message.error ? '#b91c1c' : '#15803d',
          }}>
            {message.text}
          </div>
        )}

        <div className="admin-card" style={{ padding: 16, marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: '#9ca3af' }} />
            <input
              className="admin-input"
              style={{ width: '100%', paddingLeft: 34 }}
              placeholder="Tìm affiliate, email, chủ tài khoản hoặc số tài khoản"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
          </div>
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="paid">Đã thanh toán</option>
          </select>
          <button className="btn btn-ghost" onClick={() => void load()}><RefreshCw size={15} /> Làm mới</button>
        </div>

        <div className="admin-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Đang tải yêu cầu rút tiền...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
              <WalletCards size={42} style={{ margin: '0 auto 10px', color: '#d1d5db' }} />
              Không có yêu cầu phù hợp.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Affiliate</th>
                    <th>Số tiền</th>
                    <th>Tài khoản nhận</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const disabled = updatingId === row.id
                    const statusStyle = statusColors[row.status]
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.user_name}</strong>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{row.user_email}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{row.referral_code}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>{currency(row.amount)}</td>
                        <td>
                          <strong>{row.bank_name}</strong>
                          <div>{row.bank_account}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{row.bank_owner}</div>
                        </td>
                        <td>
                          <span style={{ ...statusStyle, padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                            {statusLabels[row.status]}
                          </span>
                          {row.admin_note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 5 }}>{row.admin_note}</div>}
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          <div>Tạo: {dateTime(row.created_at)}</div>
                          <div>Xử lý: {dateTime(row.processed_at)}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {row.status === 'pending' && (
                              <button className="btn btn-ghost" disabled={disabled} onClick={() => void updateStatus(row, 'approved')}>
                                <CheckCircle size={14} /> Duyệt
                              </button>
                            )}
                            {row.status === 'approved' && (
                              <button className="btn btn-ghost" disabled={disabled} onClick={() => void updateStatus(row, 'paid')}>
                                <Clock size={14} /> Đã trả
                              </button>
                            )}
                            {(row.status === 'pending' || row.status === 'approved') && (
                              <button className="btn btn-ghost" disabled={disabled} onClick={() => void updateStatus(row, 'rejected')}>
                                <XCircle size={14} /> Từ chối
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6' }}>
              <span>Trang {page} / {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Trước</button>
                <button className="btn btn-ghost" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
