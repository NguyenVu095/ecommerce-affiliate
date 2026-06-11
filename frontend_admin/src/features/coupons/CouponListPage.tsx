import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Search, Edit2, Trash2, RefreshCw, Tag,
  ChevronLeft, ChevronRight, Eye, EyeOff,
  Percent, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, BarChart2, TrendingUp, Users,
} from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getAdminCouponsApi,
  toggleAdminCouponStatusApi,
  deleteAdminCouponApi,
  getCouponUsageStatsApi,
  getErrorMessage,
  type CouponFilter,
  type AdminCoupon,
  type CouponUsageStats,
} from '../../services/api'
import CouponFormModal from './CouponFormModal'
import { useDebounce } from '../../hooks/useDebounce'

type Coupon = AdminCoupon
type UsageStat = CouponUsageStats

function formatPrice(v: number) {
  return v.toLocaleString('vi-VN') + '₫'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDatetime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const COMPUTED_STATUS_MAP: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  active:    { label: 'Đang hoạt động', bg: '#dcfce7', color: '#15803d', icon: <CheckCircle size={12} /> },
  inactive:  { label: 'Vô hiệu',        bg: '#f3f4f6', color: '#6b7280', icon: <EyeOff size={12} /> },
  expired:   { label: 'Hết hạn',        bg: '#fee2e2', color: '#b91c1c', icon: <XCircle size={12} /> },
  scheduled: { label: 'Chưa đến hạn',  bg: '#dbeafe', color: '#1d4ed8', icon: <Clock size={12} /> },
  out:       { label: 'Hết lượt',       bg: '#fef3c7', color: '#92400e', icon: <AlertCircle size={12} /> },
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  percent: { label: 'Phần trăm', icon: <Percent size={13} />, color: '#8b5cf6' },
  fixed:   { label: 'Cố định',   icon: <DollarSign size={13} />, color: '#0891b2' },
}

const APPLICABLE_LABELS: Record<string, string> = {
  all: 'Tất cả sản phẩm',
}

const PAGE_SIZE = 20

export default function CouponListPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 400)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Coupon | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Usage stats panel
  const [expandedCouponId, setExpandedCouponId] = useState<number | null>(null)
  const [usageCache, setUsageCache] = useState<Record<number, UsageStat>>({})
  const [loadingUsage, setLoadingUsage] = useState<number | null>(null)

  const handleToggleUsage = async (couponId: number) => {
    if (expandedCouponId === couponId) {
      setExpandedCouponId(null)
      return
    }
    setExpandedCouponId(couponId)
    if (usageCache[couponId]) return // already loaded
    setLoadingUsage(couponId)
    try {
      const res = await getCouponUsageStatsApi(couponId)
      setUsageCache(prev => ({ ...prev, [couponId]: res.data }))
    } catch {
      // silent
    } finally {
      setLoadingUsage(null)
    }
  }

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const buildCouponFilter = useCallback((): CouponFilter => {
    const params: CouponFilter = { page, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (statusFilter !== '') params.status = Number(statusFilter)
    if (typeFilter) params.type = typeFilter
    return params
  }, [page, debouncedSearch, statusFilter, typeFilter])

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminCouponsApi(buildCouponFilter())
      setCoupons(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.total_pages)
    } catch {
      showToast('Không thể tải danh sách mã giảm giá', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildCouponFilter, showToast])

  useEffect(() => {
    getAdminCouponsApi(buildCouponFilter())
      .then((res) => {
        setCoupons(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch(() => {
        showToast('Không thể tải danh sách mã giảm giá', 'error')
      })
      .finally(() => setLoading(false))
  }, [buildCouponFilter, showToast])

  const startListReload = () => {
    setLoading(true)
  }

  const handleSearchChange = (value: string) => {
    startListReload()
    setSearch(value)
    setPage(1)
  }

  const handleTypeFilterChange = (value: string) => {
    startListReload()
    setTypeFilter(value)
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


  const handleToggleStatus = async (c: Coupon) => {
    try {
      await toggleAdminCouponStatusApi(c.id)
      showToast(`Đã ${c.status === 1 ? 'vô hiệu' : 'kích hoạt'} mã "${c.code}"`)
      await fetchCoupons()
    } catch {
      showToast('Cập nhật trạng thái thất bại', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteAdminCouponApi(deleteConfirm.id)
      showToast(`Đã xóa mã "${deleteConfirm.code}"`)
      setDeleteConfirm(null)
      await fetchCoupons()
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Xóa mã giảm giá thất bại'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleModalClose = (refresh?: boolean) => {
    setModalOpen(false)
    if (refresh) {
      void fetchCoupons()
      showToast(editingCoupon ? 'Cập nhật mã giảm giá thành công' : 'Tạo mã giảm giá thành công')
    }
    setEditingCoupon(null)
  }

  const couponStats = useMemo(() => {
    // Một vòng quét O(N) thay cho ba lần filter để đếm trạng thái coupon trong render.
    return coupons.reduce(
      (acc, coupon) => {
        if (coupon.computed_status === 'active') acc.active += 1
        if (coupon.computed_status === 'expired') acc.expired += 1
        if (coupon.computed_status === 'out') acc.out += 1
        return acc
      },
      { active: 0, expired: 0, out: 0 },
    )
  }, [coupons])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Mã Giảm Giá" subtitle={`${total} mã coupon`} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'fadeInUp 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !deleting && setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#fee2e2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 16,
            }}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 8 }}>
              Xóa mã giảm giá?
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
              Bạn có chắc muốn xóa mã{' '}
              <strong style={{ fontFamily: 'monospace', color: '#6366f1' }}>
                {deleteConfirm.code}
              </strong>
              ?
            </div>
            {deleteConfirm.used_count > 0 && (
              <div style={{
                background: '#fef3c7', color: '#92400e',
                borderRadius: 8, padding: '8px 12px', fontSize: 13,
                fontWeight: 500, marginBottom: 16,
              }}>
                ⚠️ Mã này đã được sử dụng {deleteConfirm.used_count} lần
              </div>
            )}
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
              Hành động này không thể hoàn tác.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Hủy
              </button>
              <button
                className="btn"
                onClick={handleDelete}
                disabled={deleting}
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {deleting ? 'Đang xóa...' : 'Xóa mã'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupon form modal */}
      {modalOpen && (
        <CouponFormModal coupon={editingCoupon} onClose={handleModalClose} />
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

        {/* Filters bar */}
        <div className="admin-card animate-fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="admin-input"
                style={{ width: '100%', paddingLeft: 34 }}
                placeholder="Tìm mã coupon..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Type filter */}
            <select
              className="admin-select"
              value={typeFilter}
              onChange={e => handleTypeFilterChange(e.target.value)}
              style={{ minWidth: 150 }}
            >
              <option value="">Tất cả loại</option>
              <option value="percent">Phần trăm (%)</option>
              <option value="fixed">Số tiền cố định (₫)</option>
            </select>

            {/* Status filter */}
            <select
              className="admin-select"
              value={statusFilter}
              onChange={e => handleStatusFilterChange(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="1">Kích hoạt</option>
              <option value="0">Vô hiệu</option>
            </select>

            <button className="btn btn-ghost" onClick={fetchCoupons} title="Làm mới">
              <RefreshCw size={15} />
            </button>
            <button
              className="btn btn-primary"
              onClick={() => { setEditingCoupon(null); setModalOpen(true) }}
            >
              <Plus size={16} />
              Thêm mã mới
            </button>
          </div>
        </div>

        {/* Stats mini */}
        {!loading && total > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Tổng mã', value: total, color: '#6366f1', bg: '#eef2ff' },
              { label: 'Đang hoạt động', value: couponStats.active, color: '#10b981', bg: '#dcfce7' },
              { label: 'Hết hạn', value: couponStats.expired, color: '#ef4444', bg: '#fee2e2' },
              { label: 'Hết lượt', value: couponStats.out, color: '#f59e0b', bg: '#fef3c7' },
            ].map(stat => (
              <div
                key={stat.label}
                className="admin-card"
                style={{
                  padding: '12px 20px', flex: '1 1 130px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: stat.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Tag size={16} color={stat.color} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{stat.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{
                display: 'inline-block', width: 28, height: 28,
                border: '3px solid #e5e7eb', borderTopColor: '#6366f1',
                borderRadius: '50%',
              }} className="animate-spin" />
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Đang tải mã giảm giá...</div>
            </div>
          ) : coupons.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, background: '#f3f4f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Tag size={28} color="#d1d5db" />
              </div>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Không có mã giảm giá nào
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
                Thử thay đổi bộ lọc hoặc tạo mã giảm giá mới
              </div>
              <button
                className="btn btn-primary"
                onClick={() => { setEditingCoupon(null); setModalOpen(true) }}
              >
                <Plus size={16} />
                Tạo mã đầu tiên
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mã Coupon</th>
                    <th>Loại</th>
                    <th>Giá trị</th>
                    <th>Điều kiện</th>
                    <th>Số lượng</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 40, textAlign: 'center' }}>Stats</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => {
                    const typeInfo = TYPE_LABELS[c.type]
                    const statusInfo = COMPUTED_STATUS_MAP[c.computed_status] || COMPUTED_STATUS_MAP['inactive']
                    const isExpanded = expandedCouponId === c.id
                    const usage = usageCache[c.id]
                    const isLoadingThis = loadingUsage === c.id

                    return (
                      <React.Fragment key={c.id}>
                        <tr style={{ background: isExpanded ? '#f8faff' : undefined }}>
                        {/* Code */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 9,
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <Tag size={16} color="#fff" />
                            </div>
                            <div>
                              <div style={{
                                fontFamily: 'monospace', fontWeight: 700, fontSize: 14,
                                color: '#1a1d2e', letterSpacing: '0.05em',
                              }}>
                                {c.code}
                              </div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                #{c.id} · {APPLICABLE_LABELS[c.applicable_type]}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 999,
                            background: typeInfo.color + '18',
                            color: typeInfo.color, fontSize: 12, fontWeight: 600,
                          }}>
                            {typeInfo.icon}
                            {typeInfo.label}
                          </span>
                        </td>

                        {/* Value */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#1a1d2e', fontSize: 15 }}>
                            {c.type === 'percent'
                              ? `${c.value}%`
                              : formatPrice(c.value)}
                          </div>
                          {c.max_discount && (
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              Tối đa {formatPrice(c.max_discount)}
                            </div>
                          )}
                        </td>

                        {/* Conditions */}
                        <td>
                          <div style={{ fontSize: 13, color: '#374151' }}>
                            {c.min_order > 0
                              ? <>Tối thiểu <strong>{formatPrice(c.min_order)}</strong></>
                              : <span style={{ color: '#9ca3af' }}>Không giới hạn</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {c.max_uses_per_user} lần/người
                          </div>
                        </td>

                        {/* Quantity */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div>
                              <div style={{
                                fontWeight: 600,
                                color: c.quantity <= 0 ? '#ef4444' : c.quantity < 10 ? '#f59e0b' : '#374151',
                                fontSize: 14,
                              }}>
                                {c.quantity <= 0 ? 'Hết' : `${c.used_count}/${c.quantity}`}
                              </div>
                              {c.quantity > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <div style={{
                                    width: 64, height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${Math.min(100, (c.used_count / c.quantity) * 100)}%`,
                                      background: c.used_count / c.quantity > 0.8 ? '#ef4444' : '#6366f1',
                                      borderRadius: 2,
                                      transition: 'width 0.3s',
                                    }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Dates */}
                        <td>
                          <div style={{ fontSize: 12 }}>
                            {c.start_at ? (
                              <div style={{ color: '#6b7280' }}>
                                <span style={{ color: '#9ca3af' }}>Từ:</span>{' '}
                                {formatDate(c.start_at)}
                              </div>
                            ) : null}
                            {c.expired_at ? (
                              <div style={{ color: c.computed_status === 'expired' ? '#ef4444' : '#6b7280', marginTop: 2 }}>
                                <span style={{ color: '#9ca3af' }}>Đến:</span>{' '}
                                {formatDatetime(c.expired_at)}
                              </div>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: 12 }}>Không hạn</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 999,
                            background: statusInfo.bg, color: statusInfo.color,
                            fontSize: 12, fontWeight: 600,
                          }}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Stats toggle */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleToggleUsage(c.id)}
                            title="Thống kê sử dụng"
                            style={{
                              width: 30, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
                              background: isExpanded ? '#eef2ff' : '#f9fafb',
                              color: isExpanded ? '#6366f1' : '#9ca3af',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}
                          >
                            {isLoadingThis ? <RefreshCw size={13} className="animate-spin" /> : <BarChart2 size={13} />}
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {/* Edit */}
                            <button
                              title="Chỉnh sửa"
                              onClick={() => { setEditingCoupon(c); setModalOpen(true) }}
                              style={{
                                width: 32, height: 32, borderRadius: 7, border: 'none',
                                cursor: 'pointer', background: '#eef2ff', color: '#6366f1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#c7d2fe')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#eef2ff')}
                            >
                              <Edit2 size={14} />
                            </button>

                            {/* Toggle status */}
                            <button
                              title={c.status === 1 ? 'Vô hiệu hóa' : 'Kích hoạt'}
                              onClick={() => handleToggleStatus(c)}
                              style={{
                                width: 32, height: 32, borderRadius: 7, border: 'none',
                                cursor: 'pointer',
                                background: c.status === 1 ? '#fef3c7' : '#dcfce7',
                                color: c.status === 1 ? '#92400e' : '#15803d',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                              }}
                            >
                              {c.status === 1 ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>

                            {/* Delete */}
                            <button
                              title="Xóa mã"
                              onClick={() => setDeleteConfirm(c)}
                              style={{
                                width: 32, height: 32, borderRadius: 7, border: 'none',
                                cursor: 'pointer', background: '#fee2e2', color: '#ef4444',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#fecaca')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fee2e2')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Usage stats expanded panel */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0, background: '#f8faff', borderBottom: '2px solid #e0e7ff' }}>
                            {(isLoadingThis || !usage) ? (
                              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                                Đang tải thống kê...
                              </div>
                            ) : (
                              <div style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                  {[
                                    { label: 'Lượt dùng', value: `${usage.total_used} / ${usage.quantity}`, icon: <Tag size={14} />, color: '#6366f1', bg: '#eef2ff' },
                                    { label: 'Doanh thu tạo ra', value: usage.total_revenue.toLocaleString('vi-VN') + '₫', icon: <TrendingUp size={14} />, color: '#10b981', bg: '#dcfce7' },
                                    { label: 'Tổng giảm giá', value: usage.total_discount.toLocaleString('vi-VN') + '₫', icon: <DollarSign size={14} />, color: '#f59e0b', bg: '#fef3c7' },
                                  ].map(s => (
                                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: s.bg, borderRadius: 10, flex: '1 1 160px' }}>
                                      <span style={{ color: s.color }}>{s.icon}</span>
                                      <div>
                                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{s.label}</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {usage.daily_data.length > 0 && (() => {
                                  const maxCount = Math.max(1, ...usage.daily_data.map(d => d.count))
                                  const recent = usage.daily_data.slice(-30)
                                  return (
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <BarChart2 size={13} color="#6366f1" /> Lượt dùng 30 ngày gần nhất
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 52 }}>
                                        {recent.map(d => (
                                          <div key={d.date} title={`${d.date}: ${d.count}`}
                                            style={{
                                              flex: 1, minWidth: 3, borderRadius: '2px 2px 0 0',
                                              background: d.count > 0 ? 'linear-gradient(180deg,#818cf8,#6366f1)' : '#e5e7eb',
                                              height: `${Math.max(3, (d.count / maxCount) * 52)}px`,
                                              opacity: d.count > 0 ? 1 : 0.35,
                                            }}
                                          />
                                        ))}
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                                        <span>{recent[0]?.date?.slice(5)}</span>
                                        <span>{recent[recent.length - 1]?.date?.slice(5)}</span>
                                      </div>
                                    </div>
                                  )
                                })()}

                                {usage.top_users.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Users size={13} color="#6366f1" /> Top khách hàng sử dụng
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {usage.top_users.map((u, i) => (
                                        <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#eef2ff', color: '#6366f1', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                                          <span style={{ color: '#9ca3af', fontSize: 12 }}>{u.email}</span>
                                          <span style={{ marginLeft: 'auto', background: '#eef2ff', color: '#6366f1', padding: '2px 10px', borderRadius: 999, fontWeight: 600, fontSize: 12 }}>{u.times} lần</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {usage.total_used === 0 && (
                                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>
                                    Mã này chưa được sử dụng lần nào
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
                Trang {page} / {totalPages} · {total} mã coupon
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  style={{ padding: '6px 10px' }}
                >
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
                <button
                  className="btn btn-ghost"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  style={{ padding: '6px 10px' }}
                >
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
