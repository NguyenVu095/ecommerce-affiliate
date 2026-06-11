import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Lock, Unlock, Users, ShoppingBag, Shield } from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getAdminUsersApi,
  toggleAdminUserStatusApi,
  getErrorMessage,
  type AdminUserFilter,
  type AdminUserRow,
} from '../../services/api'
import { useDebounce } from '../../hooks/useDebounce'

const AUTH_MAP: Record<string, { label: string; color: string }> = {
  local:  { label: 'Email', color: '#6b7280' },
  google: { label: 'Google', color: '#dc2626' },
}


const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const PAGE_SIZE = 20

export default function UserListPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const debouncedSearch = useDebounce(search, 400)

  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const buildUserFilter = useCallback((): AdminUserFilter => {
    const params: AdminUserFilter = { page, page_size: PAGE_SIZE, role: 0 }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (statusFilter !== '') params.status = Number(statusFilter)
    return params
  }, [page, debouncedSearch, statusFilter])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getAdminUsersApi(buildUserFilter())
      setUsers(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.total_pages)
    } catch {
      setError('Không thể tải danh sách khách hàng. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [buildUserFilter])

  useEffect(() => {
    getAdminUsersApi(buildUserFilter())
      .then((res) => {
        setUsers(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch(() => {
        setError('Không thể tải danh sách khách hàng. Vui lòng thử lại.')
      })
      .finally(() => setLoading(false))
  }, [buildUserFilter])

  const startListReload = () => {
    setLoading(true)
    setError('')
  }

  const handleSearchChange = (value: string) => {
    startListReload()
    setSearch(value)
    setPage(1)
  }

  const handleStatusFilterChange = (value: string) => {
    startListReload()
    setStatusFilter(value)
    setPage(1)
  }

  const handlePageChange = (nextPage: number) => {
    if (nextPage === page) return
    startListReload()
    setPage(nextPage)
  }

  const handleToggleStatus = async (user: AdminUserRow) => {
    setTogglingId(user.id)
    try {
      await toggleAdminUserStatusApi(user.id)
      showToast(`Đã ${user.status === 1 ? 'khóa' : 'mở khóa'} tài khoản "${user.full_name}"`)
      await fetchUsers()
    } catch (e: unknown) {
      showToast(getErrorMessage(e, 'Cập nhật trạng thái thất bại'), 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const userStats = useMemo(() => {
    // Một vòng quét O(N) thay cho bốn lần filter O(4N) trong mỗi render.
    return users.reduce(
      (acc, user) => {
        if (user.status === 1) acc.active += 1
        if (user.status === 0) acc.locked += 1
        if (user.referral_code) acc.affiliate += 1
        if (user.auth_provider === 'google') acc.google += 1
        return acc
      },
      { active: 0, locked: 0, affiliate: 0, google: 0 },
    )
  }, [users])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Khách hàng" subtitle={`${total} tài khoản`} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'fadeInUp 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* Filters */}
        <div className="admin-card animate-fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="admin-input"
                style={{ width: '100%', paddingLeft: 34 }}
                placeholder="Tìm tên, email, SĐT..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            <select className="admin-select" value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)} style={{ minWidth: 140 }}>
              <option value="">Tất cả trạng thái</option>
              <option value="1">Hoạt động</option>
              <option value="0">Đã khóa</option>
            </select>

            <button className="btn btn-ghost" onClick={fetchUsers} title="Làm mới">
              <RefreshCw size={15} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Mini stats */}
        {!loading && total > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Tổng khách hàng', value: total, color: '#6366f1', bg: '#eef2ff', icon: Users },
              { label: 'Đang hoạt động', value: userStats.active, color: '#10b981', bg: '#dcfce7', icon: Unlock },
              { label: 'Đã khóa', value: userStats.locked, color: '#ef4444', bg: '#fee2e2', icon: Lock },
              { label: 'Có affiliate', value: userStats.affiliate, color: '#0891b2', bg: '#cffafe', icon: Shield },
              { label: 'Qua Google', value: userStats.google, color: '#9333ea', bg: '#f3e8ff', icon: ShoppingBag },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className="admin-card" style={{ padding: '12px 18px', flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={color} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Đang tải danh sách...</div>
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Users size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#1a1d2e', marginBottom: 6 }}>Không tải được danh sách</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{error}</div>
              <button className="btn btn-primary" onClick={fetchUsers}><RefreshCw size={14} /> Thử lại</button>
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Users size={48} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Không có tài khoản nào</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Liên hệ</th>
                    <th>Đăng nhập</th>
                    <th>Đơn hàng</th>
                    <th>Affiliate</th>
                    <th>Ngày tạo</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 80, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const auth = AUTH_MAP[user.auth_provider] ?? { label: user.auth_provider, color: '#6b7280' }
                    const disabled = togglingId === user.id

                    return (
                      <tr key={user.id}>
                        {/* Avatar + name */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {user.avatar ? (
                              <img src={user.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                            ) : (
                              <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                              }}>
                                {user.full_name?.[0]?.toUpperCase() || 'U'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 600, color: '#1a1d2e', fontSize: 14 }}>{user.full_name}</div>
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>#{user.id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td>
                          <div style={{ fontSize: 13, color: '#374151' }}>{user.email}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>{user.phone || '—'}</div>
                        </td>

                        {/* Auth */}
                        <td style={{ fontSize: 13, color: auth.color, fontWeight: 500 }}>
                          {auth.label}
                        </td>

                        {/* Orders */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                            <ShoppingBag size={13} color="#9ca3af" />
                            {user.order_count}
                          </div>
                        </td>

                        {/* Affiliate code */}
                        <td>
                          {user.referral_code ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: 4 }}>
                              {user.referral_code}
                            </span>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Created at */}
                        <td style={{ fontSize: 13, color: '#6b7280' }}>{fmtDate(user.created_at)}</td>

                        {/* Status badge */}
                        <td>
                          <span className={user.status === 1 ? 'badge badge-success' : 'badge badge-cancelled'}>
                            {user.status === 1 ? 'Hoạt động' : 'Đã khóa'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <button
                            title={user.status === 1 ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                            disabled={disabled}
                            onClick={() => handleToggleStatus(user)}
                            style={{
                              width: 32, height: 32, borderRadius: 7, border: 'none',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              background: user.status === 1 ? '#fee2e2' : '#dcfce7',
                              color: user.status === 1 ? '#b91c1c' : '#15803d',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: disabled ? 0.6 : 1,
                              transition: 'all 0.15s',
                            }}
                          >
                            {disabled
                              ? <div style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin" />
                              : user.status === 1 ? <Lock size={14} /> : <Unlock size={14} />
                            }
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderTop: '1px solid #f3f4f6',
            }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                Trang {page} / {totalPages} · {total} tài khoản
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" onClick={() => handlePageChange(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '6px 10px' }}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = page <= 3 ? i + 1 : page + i - 2
                  if (pg < 1 || pg > totalPages) return null
                  return (
                    <button
                      key={pg}
                      className="btn"
                      onClick={() => handlePageChange(pg)}
                      style={{
                        padding: '6px 12px',
                        background: pg === page ? '#6366f1' : 'transparent',
                        color: pg === page ? '#fff' : '#374151',
                        border: pg === page ? 'none' : '1px solid #e5e7eb',
                        fontWeight: pg === page ? 600 : 400,
                      }}
                    >
                      {pg}
                    </button>
                  )
                })}
                <button className="btn btn-ghost" onClick={() => handlePageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '6px 10px' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
