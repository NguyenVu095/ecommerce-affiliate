import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  Fingerprint,
  RefreshCw,
  Search,
  ShoppingBag,
  Square,
  Tag,
  Users,
  XCircle,
} from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  batchCommissionStatusApi,
  getAdminAffiliateCommissionsApi,
  getAdminAffiliateConversionsApi,
  getAdminAffiliateStatsApi,
  getAdminAffiliatesApi,
  updateAdminAffiliateCommissionStatusApi,
  type AdminAffiliateCommissionFilter,
  type AdminAffiliateConversionFilter,
  type AdminAffiliateFilter,
  type AdminAffiliateRow,
  type AdminAffiliateStats,
  type AdminCommissionRow,
  type AdminConversionRow,
  type AdminConversionSummary,
  type AttributionType,
  type BatchCommissionStatus,
  type CommissionStatus,
} from '../../services/api'
import { useDebounce } from '../../hooks/useDebounce'

type ActiveTab = 'affiliates' | 'commissions' | 'conversions'

type AffiliateStats = AdminAffiliateStats
type AffiliateRow = AdminAffiliateRow
type CommissionRow = AdminCommissionRow
type ConversionSummary = AdminConversionSummary
type ConversionRow = AdminConversionRow

const PAGE_SIZE = 15

const emptyStats: AffiliateStats = {
  total_affiliates: 0,
  total_links: 0,
  active_links: 0,
  total_clicks: 0,
  total_orders: 0,
  conversion_rate: 0,
  revenue_attributed: 0,
  total_commission: 0,
  pending_commission: 0,
  approved_commission: 0,
  paid_commission: 0,
  cancelled_commission: 0,
  payable_commission: 0,
}

const emptyConversionSummary: ConversionSummary = {
  total_conversions: 0,
  valid_conversions: 0,
  total_clicks: 0,
  conversion_rate: 0,
  unique_buyers: 0,
  total_order_value: 0,
  total_commission: 0,
  by_attribution: { cookie: 0, code: 0, manual: 0 },
}

const commissionStatusMap: Record<CommissionStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Chờ duyệt', bg: '#fef3c7', color: '#92400e' },
  approved: { label: 'Đã duyệt', bg: '#dcfce7', color: '#15803d' },
  paid: { label: 'Đã thanh toán', bg: '#dbeafe', color: '#1d4ed8' },
  cancelled: { label: 'Đã hủy', bg: '#fee2e2', color: '#b91c1c' },
}

const attributionMap: Record<AttributionType, { label: string; bg: string; color: string }> = {
  code: { label: 'Mã giới thiệu', bg: '#dbeafe', color: '#1d4ed8' },
  cookie: { label: 'Cookie', bg: '#dcfce7', color: '#15803d' },
  manual: { label: 'Gán thủ công', bg: '#ffedd5', color: '#9a3412' },
}

const orderStatusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  success: 'Thành công',
  cancelled: 'Đã hủy',
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const percent = (value: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}%`

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Chưa có'

export default function AffiliateManagementPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('affiliates')
  const [stats, setStats] = useState<AffiliateStats>(emptyStats)
  const [loadingStats, setLoadingStats] = useState(true)

  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([])
  const [affiliateTotal, setAffiliateTotal] = useState(0)
  const [affiliateTotalPages, setAffiliateTotalPages] = useState(1)
  const [affiliatePage, setAffiliatePage] = useState(1)
  const [affiliateStatus, setAffiliateStatus] = useState('')

  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [commissionTotal, setCommissionTotal] = useState(0)
  const [commissionTotalPages, setCommissionTotalPages] = useState(1)
  const [commissionPage, setCommissionPage] = useState(1)
  const [commissionStatus, setCommissionStatus] = useState('')

  const [conversions, setConversions] = useState<ConversionRow[]>([])
  const [conversionSummary, setConversionSummary] = useState<ConversionSummary>(emptyConversionSummary)
  const [conversionTotal, setConversionTotal] = useState(0)
  const [conversionTotalPages, setConversionTotalPages] = useState(1)
  const [conversionPage, setConversionPage] = useState(1)
  const [conversionStatus, setConversionStatus] = useState('')
  const [conversionAttribution, setConversionAttribution] = useState('')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Batch selection for commissions
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<number>>(new Set())
  const [batchProcessing, setBatchProcessing] = useState(false)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const buildAffiliateFilter = useCallback((): AdminAffiliateFilter => {
    const params: AdminAffiliateFilter = { page: affiliatePage, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (affiliateStatus !== '') params.status = Number(affiliateStatus)
    return params
  }, [affiliatePage, affiliateStatus, debouncedSearch])

  const buildCommissionFilter = useCallback((): AdminAffiliateCommissionFilter => {
    const params: AdminAffiliateCommissionFilter = { page: commissionPage, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (commissionStatus) params.status = commissionStatus
    return params
  }, [commissionPage, commissionStatus, debouncedSearch])

  const buildConversionFilter = useCallback((): AdminAffiliateConversionFilter => {
    const params: AdminAffiliateConversionFilter = { page: conversionPage, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (conversionStatus) params.status = conversionStatus
    if (conversionAttribution) params.attribution_type = conversionAttribution
    return params
  }, [conversionAttribution, conversionPage, conversionStatus, debouncedSearch])

  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await getAdminAffiliateStatsApi()
      setStats(res.data)
    } catch {
      showToast('Không thể tải thống kê affiliate', 'error')
    } finally {
      setLoadingStats(false)
    }
  }, [showToast])

  const fetchAffiliates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminAffiliatesApi(buildAffiliateFilter())
      const payload = res.data
      setAffiliates(payload.data)
      setAffiliateTotal(payload.total)
      setAffiliateTotalPages(payload.total_pages)
    } catch {
      showToast('Không thể tải danh sách affiliate', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildAffiliateFilter, showToast])

  const fetchCommissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminAffiliateCommissionsApi(buildCommissionFilter())
      const payload = res.data
      setCommissions(payload.data)
      setCommissionTotal(payload.total)
      setCommissionTotalPages(payload.total_pages)
      setSelectedCommissionIds(new Set()) // clear selection
    } catch {
      showToast('Không thể tải sổ hoa hồng', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildCommissionFilter, showToast])

  const fetchConversions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminAffiliateConversionsApi(buildConversionFilter())
      const payload = res.data
      setConversions(payload.data)
      setConversionSummary(payload.summary)
      setConversionTotal(payload.total)
      setConversionTotalPages(payload.total_pages)
    } catch {
      showToast('Không thể tải sổ chuyển đổi', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildConversionFilter, showToast])

  useEffect(() => {
    getAdminAffiliateStatsApi()
      .then((res) => setStats(res.data))
      .catch(() => showToast('Không thể tải thống kê affiliate', 'error'))
      .finally(() => setLoadingStats(false))
  }, [showToast])

  useEffect(() => {
    if (activeTab === 'affiliates') {
      getAdminAffiliatesApi(buildAffiliateFilter())
        .then((res) => {
          const payload = res.data
          setAffiliates(payload.data)
          setAffiliateTotal(payload.total)
          setAffiliateTotalPages(payload.total_pages)
        })
        .catch(() => showToast('Không thể tải danh sách affiliate', 'error'))
        .finally(() => setLoading(false))
      return
    }

    if (activeTab === 'commissions') {
      getAdminAffiliateCommissionsApi(buildCommissionFilter())
        .then((res) => {
          const payload = res.data
          setCommissions(payload.data)
          setCommissionTotal(payload.total)
          setCommissionTotalPages(payload.total_pages)
          setSelectedCommissionIds(new Set())
        })
        .catch(() => showToast('Không thể tải sổ hoa hồng', 'error'))
        .finally(() => setLoading(false))
      return
    }

    getAdminAffiliateConversionsApi(buildConversionFilter())
      .then((res) => {
        const payload = res.data
        setConversions(payload.data)
        setConversionSummary(payload.summary)
        setConversionTotal(payload.total)
        setConversionTotalPages(payload.total_pages)
      })
      .catch(() => showToast('Không thể tải sổ chuyển đổi', 'error'))
      .finally(() => setLoading(false))
  }, [activeTab, buildAffiliateFilter, buildCommissionFilter, buildConversionFilter, showToast])

  const startTableReload = () => {
    setLoading(true)
  }

  const statsCards = useMemo(() => ([
    { label: 'Affiliate', value: number(stats.total_affiliates), sub: `${number(stats.active_links)} link đang chạy`, icon: Users, color: '#6366f1', bg: '#eef2ff' },
    { label: 'Click ghi nhận', value: number(stats.total_clicks), sub: `${percent(stats.conversion_rate)} chuyển đổi`, icon: Eye, color: '#0891b2', bg: '#cffafe' },
    { label: 'Đơn affiliate', value: number(stats.total_orders), sub: currency(stats.revenue_attributed), icon: ShoppingBag, color: '#10b981', bg: '#dcfce7' },
    { label: 'Chờ thanh toán', value: currency(stats.payable_commission), sub: `${currency(stats.pending_commission)} chờ duyệt`, icon: DollarSign, color: '#f59e0b', bg: '#fef3c7' },
  ]), [stats])

  const handleSearchChange = (value: string) => {
    startTableReload()
    setSearch(value)
    if (activeTab === 'affiliates') setAffiliatePage(1)
    else if (activeTab === 'commissions') setCommissionPage(1)
    else setConversionPage(1)
  }

  const handleRefresh = () => {
    setLoadingStats(true)
    startTableReload()
    fetchStats()
    if (activeTab === 'affiliates') fetchAffiliates()
    else if (activeTab === 'commissions') fetchCommissions()
    else fetchConversions()
  }

  const handleCommissionStatus = async (commission: CommissionRow, nextStatus: BatchCommissionStatus) => {
    setUpdatingId(commission.id)
    try {
      await updateAdminAffiliateCommissionStatusApi(commission.id, nextStatus)
      showToast(`Đã cập nhật hoa hồng ${commission.order_code}`)
      await fetchStats()
      await fetchCommissions()
    } catch {
      showToast('Cập nhật trạng thái hoa hồng thất bại', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleToggleCommission = (id: number) => {
    setSelectedCommissionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allCommissionIds = useMemo(
    () => commissions.filter(c => c.status !== 'paid').map(c => c.id),
    [commissions],
  )
  const { allCommissionsSelected, someCommissionsSelected } = useMemo(() => {
    // Một vòng quét O(N) tính trạng thái chọn hàng loạt thay cho some/every lặp lại.
    const selectedCount = allCommissionIds.reduce(
      (count, id) => count + (selectedCommissionIds.has(id) ? 1 : 0),
      0,
    )
    return {
      allCommissionsSelected: allCommissionIds.length > 0 && selectedCount === allCommissionIds.length,
      someCommissionsSelected: selectedCount > 0 && selectedCount < allCommissionIds.length,
    }
  }, [allCommissionIds, selectedCommissionIds])

  const handleSelectAllCommissions = () => {
    if (allCommissionsSelected) {
      setSelectedCommissionIds(prev => {
        const next = new Set(prev)
        allCommissionIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedCommissionIds(prev => new Set([...prev, ...allCommissionIds]))
    }
  }

  const handleBatchCommission = async (status: BatchCommissionStatus) => {
    const ids = [...selectedCommissionIds]
    if (!ids.length) return
    setBatchProcessing(true)
    try {
      const res = await batchCommissionStatusApi(ids, status)
      showToast(res.data.message || 'Cập nhật thành công')
      await fetchStats()
      await fetchCommissions()
    } catch {
      showToast('Xử lý hàng loạt thất bại', 'error')
    } finally {
      setBatchProcessing(false)
    }
  }

  const renderPagination = (
    page: number,
    totalPages: number,
    total: number,
    label: string,
    setPage: (value: number) => void,
  ) => {
    if (totalPages <= 1) return null
    const start = Math.max(1, Math.min(totalPages - 4, page - 2))

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderTop: '1px solid #f3f4f6',
      }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          Trang {page} / {totalPages} · {number(total)} {label}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              startTableReload()
              setPage(Math.max(1, page - 1))
            }}
            disabled={page === 1}
            style={{ padding: '6px 10px' }}
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i).map(pg => (
            <button
              key={pg}
              className="btn"
              onClick={() => {
                if (pg === page) return
                startTableReload()
                setPage(pg)
              }}
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
          ))}
          <button
            className="btn btn-ghost"
            onClick={() => {
              startTableReload()
              setPage(Math.min(totalPages, page + 1))
            }}
            disabled={page === totalPages}
            style={{ padding: '6px 10px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Affiliate" subtitle={`${number(stats.total_affiliates)} đối tác affiliate`} />

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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}>
          {statsCards.map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="admin-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</div>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={color} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', marginBottom: 4 }}>
                {loadingStats ? '...' : value}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{loadingStats ? 'Đang tải' : sub}</div>
            </div>
          ))}
        </div>

        <div className="admin-card animate-fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', padding: 3, background: '#f3f4f6', borderRadius: 9, border: '1px solid #e5e7eb' }}>
              {[
                { value: 'affiliates' as ActiveTab, label: 'Affiliate' },
                { value: 'commissions' as ActiveTab, label: 'Hoa hồng' },
                { value: 'conversions' as ActiveTab, label: 'Chuyển đổi' },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => {
                    if (tab.value === activeTab) return
                    startTableReload()
                    setActiveTab(tab.value)
                    setSearch('')
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 7,
                    padding: '7px 13px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: activeTab === tab.value ? '#fff' : 'transparent',
                    color: activeTab === tab.value ? '#6366f1' : '#6b7280',
                    boxShadow: activeTab === tab.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="admin-input"
                style={{ width: '100%', paddingLeft: 34 }}
                placeholder={activeTab === 'affiliates' ? 'Tìm tên, email, SĐT, mã giới thiệu...' : 'Tìm mã đơn, affiliate, campaign...'}
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            {activeTab === 'affiliates' ? (
              <select
                className="admin-select"
                value={affiliateStatus}
                onChange={e => {
                  startTableReload()
                  setAffiliateStatus(e.target.value)
                  setAffiliatePage(1)
                }}
                style={{ minWidth: 150 }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="1">Đang hoạt động</option>
                <option value="0">Đã khóa</option>
              </select>
            ) : activeTab === 'commissions' ? (
              <select
                className="admin-select"
                value={commissionStatus}
                onChange={e => {
                  startTableReload()
                  setCommissionStatus(e.target.value)
                  setCommissionPage(1)
                }}
                style={{ minWidth: 150 }}
              >
                <option value="">Tất cả hoa hồng</option>
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="paid">Đã thanh toán</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            ) : (
              <>
                <select
                  className="admin-select"
                  value={conversionAttribution}
                  onChange={e => {
                    startTableReload()
                    setConversionAttribution(e.target.value)
                    setConversionPage(1)
                  }}
                  style={{ minWidth: 160 }}
                >
                  <option value="">Tất cả attribution</option>
                  <option value="code">Mã giới thiệu</option>
                  <option value="cookie">Cookie</option>
                  <option value="manual">Gán thủ công</option>
                </select>
                <select
                  className="admin-select"
                  value={conversionStatus}
                  onChange={e => {
                    startTableReload()
                    setConversionStatus(e.target.value)
                    setConversionPage(1)
                  }}
                  style={{ minWidth: 150 }}
                >
                  <option value="">Tất cả hoa hồng</option>
                  <option value="pending">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="paid">Đã thanh toán</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </>
            )}

            <button className="btn btn-ghost" onClick={handleRefresh} title="Làm mới">
              <RefreshCw size={15} />
              Làm mới
            </button>
          </div>

          {/* Batch action bar for commissions */}
          {activeTab === 'commissions' && selectedCommissionIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
              padding: '10px 14px', borderRadius: 8,
              background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
              border: '1px solid #fbbf24',
            }}>
              <CheckSquare size={16} color="#92400e" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>
                Đã chọn {selectedCommissionIds.size} hoa hồng
              </span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px', background: '#dcfce7', color: '#15803d', border: 'none' }}
                  onClick={() => handleBatchCommission('approved')}
                  disabled={batchProcessing}
                >
                  <CheckCircle size={13} /> Duyệt tất cả
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                  onClick={() => handleBatchCommission('cancelled')}
                  disabled={batchProcessing}
                >
                  <XCircle size={13} /> Hủy tất cả
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px' }}
                  onClick={() => setSelectedCommissionIds(new Set())}
                  disabled={batchProcessing}
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
                {activeTab === 'affiliates'
                  ? 'Đang tải danh sách affiliate...'
                  : activeTab === 'commissions'
                    ? 'Đang tải sổ hoa hồng...'
                    : 'Đang tải sổ chuyển đổi...'}
              </div>
            </div>
          ) : activeTab === 'affiliates' ? (
            affiliates.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Users size={46} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Chưa có affiliate phù hợp</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Affiliate</th>
                        <th>Mã giới thiệu</th>
                        <th>Link</th>
                        <th>Click</th>
                        <th>Đơn</th>
                        <th>Chuyển đổi</th>
                        <th>Hoa hồng</th>
                        <th>Chờ duyệt</th>
                        <th>Hoạt động cuối</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliates.map(affiliate => (
                        <tr key={affiliate.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 700, flexShrink: 0,
                              }}>
                                {affiliate.full_name?.[0]?.toUpperCase() || 'A'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#1a1d2e' }}>{affiliate.full_name}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>{affiliate.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 13 }}>
                              {affiliate.referral_code}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#1a1d2e' }}>{number(affiliate.link_count)}</div>
                            <div style={{ fontSize: 11, color: '#10b981' }}>{number(affiliate.active_link_count)} active</div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{number(affiliate.click_count)}</td>
                          <td style={{ fontWeight: 600 }}>{number(affiliate.order_count)}</td>
                          <td>
                            <span style={{ color: affiliate.conversion_rate > 0 ? '#10b981' : '#9ca3af', fontWeight: 600 }}>
                              {percent(affiliate.conversion_rate)}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#1a1d2e' }}>{currency(affiliate.total_commission)}</div>
                            <div style={{ fontSize: 11, color: '#3b82f6' }}>Đã trả {currency(affiliate.paid_commission)}</div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: '#92400e', fontWeight: 600 }}>
                            {currency(affiliate.pending_commission)}
                          </td>
                          <td style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {dateTime(affiliate.last_activity_at)}
                          </td>
                          <td>
                            <span className={affiliate.status === 1 ? 'badge badge-success' : 'badge badge-cancelled'}>
                              {affiliate.status === 1 ? 'Hoạt động' : 'Đã khóa'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(affiliatePage, affiliateTotalPages, affiliateTotal, 'affiliate', setAffiliatePage)}
              </>
            )
          ) : activeTab === 'commissions' ? (
            commissions.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Tag size={46} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Chưa có hoa hồng phù hợp</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36, textAlign: 'center' }}>
                        <button
                          onClick={handleSelectAllCommissions}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {allCommissionsSelected
                            ? <CheckSquare size={16} color="#6366f1" />
                            : someCommissionsSelected
                              ? <CheckSquare size={16} color="#9ca3af" />
                              : <Square size={16} color="#9ca3af" />}
                        </button>
                      </th>
                      <th>Đơn hàng</th>
                      <th>Affiliate</th>
                      <th>Campaign</th>
                      <th>Giá trị đơn</th>
                      <th>Tỷ lệ</th>
                      <th>Hoa hồng</th>
                      <th>Trạng thái</th>
                      <th>Thời gian</th>
                      <th style={{ width: 128, textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map(commission => {
                      const statusInfo = commissionStatusMap[commission.status]
                      const disabled = updatingId === commission.id
                      return (
                        <tr key={commission.id} style={{ background: selectedCommissionIds.has(commission.id) ? '#fefce8' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              disabled={commission.status === 'paid'}
                              onClick={() => handleToggleCommission(commission.id)}
                              style={{
                                background: 'none', border: 'none',
                                cursor: commission.status === 'paid' ? 'not-allowed' : 'pointer',
                                opacity: commission.status === 'paid' ? 0.4 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {selectedCommissionIds.has(commission.id)
                                ? <CheckSquare size={16} color="#f59e0b" />
                                : <Square size={16} color="#d1d5db" />}
                            </button>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 13 }}>
                              {commission.order_code}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              {orderStatusLabels[commission.order_status] || commission.order_status}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#1a1d2e' }}>{commission.user_name}</div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>{commission.user_email}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{commission.referral_code}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500, color: '#374151' }}>{commission.campaign_name || 'Không gắn campaign'}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>{commission.channel || 'direct'}</div>
                          </td>
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{currency(commission.order_total)}</td>
                          <td style={{ fontWeight: 600 }}>{percent(commission.commission_rate)}</td>
                          <td style={{ fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>{currency(commission.amount)}</td>
                          <td>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '4px 10px', borderRadius: 999,
                              background: statusInfo.bg, color: statusInfo.color,
                              fontSize: 12, fontWeight: 600,
                            }}>
                              {commission.status === 'pending' && <Clock size={12} />}
                              {commission.status === 'approved' && <CheckCircle size={12} />}
                              {commission.status === 'paid' && <DollarSign size={12} />}
                              {commission.status === 'cancelled' && <XCircle size={12} />}
                              {statusInfo.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                            <div>Tạo: {dateTime(commission.created_at)}</div>
                            <div>Duyệt: {dateTime(commission.approved_at)}</div>
                            <div>Trả: {dateTime(commission.paid_at)}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              {commission.status !== 'approved' && commission.status !== 'paid' && (
                                <button
                                  title="Duyệt hoa hồng"
                                  disabled={disabled}
                                  onClick={() => handleCommissionStatus(commission, 'approved')}
                                  style={{
                                    width: 32, height: 32, borderRadius: 7, border: 'none',
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    background: '#dcfce7', color: '#15803d',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: disabled ? 0.6 : 1,
                                  }}
                                >
                                  <CheckCircle size={14} />
                                </button>
                              )}
                              {commission.status !== 'cancelled' && commission.status !== 'paid' && (
                                <button
                                  title="Hủy hoa hồng"
                                  disabled={disabled}
                                  onClick={() => handleCommissionStatus(commission, 'cancelled')}
                                  style={{
                                    width: 32, height: 32, borderRadius: 7, border: 'none',
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    background: '#fee2e2', color: '#b91c1c',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: disabled ? 0.6 : 1,
                                  }}
                                >
                                  <XCircle size={14} />
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
              {renderPagination(commissionPage, commissionTotalPages, commissionTotal, 'hoa hồng', setCommissionPage)}
            </>
            )
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Chuyển đổi hợp lệ', value: number(conversionSummary.valid_conversions) },
                  { label: 'Tỷ lệ chuyển đổi', value: percent(conversionSummary.conversion_rate) },
                  { label: 'Người mua đăng nhập', value: number(conversionSummary.unique_buyers) },
                  { label: 'Hoa hồng attribution', value: currency(conversionSummary.total_commission) },
                ].map(item => (
                  <div key={item.label} style={{ padding: 12, borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ marginTop: 5, fontSize: 18, color: '#1a1d2e', fontWeight: 750 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {conversions.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <Fingerprint size={46} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Chưa có chuyển đổi phù hợp</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Đơn hàng</th>
                          <th>Attribution</th>
                          <th>Affiliate</th>
                          <th>Người mua</th>
                          <th>Campaign</th>
                          <th>Giá trị đơn</th>
                          <th>Hoa hồng</th>
                          <th>Trạng thái</th>
                          <th>Thời gian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversions.map(conversion => {
                          const attrInfo = attributionMap[conversion.attribution_type]
                          const statusInfo = commissionStatusMap[conversion.commission_status]
                          return (
                            <tr key={conversion.id}>
                              <td>
                                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 13 }}>
                                  {conversion.order_code}
                                </div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                  {orderStatusLabels[conversion.order_status] || conversion.order_status}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '4px 10px', borderRadius: 999,
                                  background: attrInfo.bg, color: attrInfo.color,
                                  fontSize: 12, fontWeight: 700,
                                }}>
                                  <Fingerprint size={12} />
                                  {attrInfo.label}
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: '#1a1d2e' }}>{conversion.referrer_name}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>{conversion.referrer_email}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{conversion.referral_code}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: '#374151' }}>{conversion.buyer_name || 'Khách vãng lai'}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>{conversion.buyer_email || 'Không có tài khoản'}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 500, color: '#374151' }}>{conversion.campaign_name || 'Không gắn campaign'}</div>
                                <div style={{ fontSize: 12, color: '#9ca3af' }}>{conversion.channel || 'direct'}</div>
                              </td>
                              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{currency(conversion.order_total)}</td>
                              <td style={{ fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>{currency(conversion.commission_amount)}</td>
                              <td>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '4px 10px', borderRadius: 999,
                                  background: statusInfo.bg, color: statusInfo.color,
                                  fontSize: 12, fontWeight: 600,
                                }}>
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {dateTime(conversion.created_at)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(conversionPage, conversionTotalPages, conversionTotal, 'chuyển đổi', setConversionPage)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
