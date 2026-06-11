import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
  Link2,
  PauseCircle,
  PlayCircle,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import TopBar from '../../components/TopBar'
import {
  deleteAffiliateLinkApi,
  getAffiliateLinksApi,
  getErrorMessage,
  updateAffiliateLinkApi,
  type AffiliateLink,
  type AffiliateLinkSummary,
} from '../../services/api'
import { toast } from '../../store/toastStore'
import LinkAnalyticsModal from './LinkAnalyticsModal'

// Helpers
const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const statusLabels: Record<string, string> = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
}

const PAGE_SIZE = 10

export default function AffiliateLinksPage() {
  const [links, setLinks] = useState<AffiliateLink[]>([])
  const [summary, setSummary] = useState<AffiliateLinkSummary>({
    total_links: 0,
    active_links: 0,
    total_clicks: 0,
    total_orders: 0,
    total_commission: 0,
  })
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [analyticsLink, setAnalyticsLink] = useState<{ id: number; campaignName: string } | null>(null)

  useEffect(() => {
    getAffiliateLinksApi({
      search: submittedSearch || undefined,
      status: status || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setLinks(res.data.data)
        setSummary(res.data.summary)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được danh sách link affiliate.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [status, submittedSearch, page])

  const resetPage = () => setPage(1)

  const copyLink = async (link: AffiliateLink) => {
    try {
      await navigator.clipboard.writeText(link.tracking_url)
      setCopiedId(link.id)
      toast.success(`Đã copy link "${link.campaign_name}"`)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error('Không copy được link. Vui lòng copy thủ công.')
    }
  }

  const toggleStatus = async (link: AffiliateLink) => {
    setUpdatingId(link.id)
    try {
      const nextStatus = link.status === 'active' ? 'paused' : 'active'
      const res = await updateAffiliateLinkApi(link.id, { status: nextStatus })
      setLinks((items) => items.map((item) => (item.id === link.id ? res.data : item)))
      toast.success(
        nextStatus === 'active'
          ? `Đã kích hoạt link "${link.campaign_name}"`
          : `Đã tạm dừng link "${link.campaign_name}"`,
      )
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không cập nhật được trạng thái link.'))
    } finally {
      setUpdatingId(null)
    }
  }

  const deleteLink = async (linkId: number) => {
    const link = links.find((l) => l.id === linkId)
    setUpdatingId(linkId)
    try {
      await deleteAffiliateLinkApi(linkId)
      setLinks((items) => items.filter((item) => item.id !== linkId))
      setTotal((t) => t - 1)
      setSummary((s) => ({ ...s, total_links: s.total_links - 1 }))
      setDeleteConfirmId(null)
      toast.success(`Đã xóa link "${link?.campaign_name ?? ''}"`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không xóa được link affiliate.'))
    } finally {
      setUpdatingId(null)
    }
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const nextSearch = search.trim()
    if (nextSearch === submittedSearch) return
    setLoading(true)
    setError('')
    setSubmittedSearch(nextSearch)
    resetPage()
  }

  const changeStatus = (nextStatus: string) => {
    if (nextStatus === status) return
    setLoading(true)
    setError('')
    setStatus(nextStatus)
    resetPage()
  }

  const changePage = (nextPage: number) => {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) return
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  const computeCvr = (link: AffiliateLink) =>
    link.clicks > 0 ? Math.round((link.orders / link.clicks) * 1000) / 10 : 0

  return (
    <>
      <TopBar title="Link affiliate" subtitle="Quản lý campaign, link theo kênh và hiệu quả chuyển đổi" />
      <div className="page-content">
        {/* Summary */}
        <section className="link-summary-grid">
          <article>
            <Link2 size={18} />
            <span>Tổng link</span>
            <strong>{number(summary.total_links)}</strong>
          </article>
          <article>
            <PlayCircle size={18} />
            <span>Đang chạy</span>
            <strong>{number(summary.active_links)}</strong>
          </article>
          <article>
            <ExternalLink size={18} />
            <span>Click ghi nhận</span>
            <strong>{number(summary.total_clicks)}</strong>
          </article>
          <article>
            <Check size={18} />
            <span>Hoa hồng</span>
            <strong>{currency(summary.total_commission)}</strong>
          </article>
        </section>

        <section className="filter-panel">
          <form className="warehouse-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo campaign hoặc sản phẩm"
            />
            <button className="primary-button compact" type="submit">
              Tìm
            </button>
          </form>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <select value={status} onChange={(event) => changeStatus(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang chạy</option>
              <option value="paused">Tạm dừng</option>
            </select>
          </label>
        </section>

        {loading && <div className="state-panel">Đang tải link affiliate...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && (
          <>
            <section className="affiliate-link-list">
              {links.length === 0 && (
                <div className="state-panel">Chưa có link affiliate. Vào Kho sản phẩm để tạo link mới.</div>
              )}
              {links.map((link) => {
                const cvr = computeCvr(link)
                return (
                  <article className="affiliate-link-row" key={link.id}>
                    <div className="link-product-image">
                      {link.product_thumbnail ? (
                        <img src={link.product_thumbnail} alt={link.product_name} />
                      ) : (
                        <Link2 size={24} />
                      )}
                    </div>
                    <div className="link-product-copy">
                      <span>{link.channel}</span>
                      <strong>{link.campaign_name}</strong>
                      <small>{link.product_name}</small>
                      <div className="link-url">{link.tracking_url}</div>
                    </div>
                    <div className="link-product-stats">
                      <div>
                        <span>Click</span>
                        <strong>{number(link.clicks)}</strong>
                      </div>
                      <div>
                        <span>Đơn</span>
                        <strong>{number(link.orders)}</strong>
                      </div>
                      <div>
                        <span>CVR</span>
                        <strong>{cvr}%</strong>
                      </div>
                      <div>
                        <span>Hoa hồng</span>
                        <strong>{currency(link.commission)}</strong>
                      </div>
                      <div>
                        <span>Trạng thái</span>
                        <strong>{statusLabels[link.status]}</strong>
                      </div>
                    </div>
                    <div className="link-row-actions">
                      <button className="primary-button compact" type="button" onClick={() => copyLink(link)}>
                        {copiedId === link.id ? <Check size={16} /> : <Copy size={16} />}
                        {copiedId === link.id ? 'Đã copy' : 'Copy'}
                      </button>
                      <a
                        className="secondary-light-button"
                        href={link.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Mở ${link.campaign_name}`}
                      >
                        <ExternalLink size={16} />
                      </a>
                      <button
                        className="secondary-light-button"
                        type="button"
                        onClick={() => setAnalyticsLink({ id: link.id, campaignName: link.campaign_name })}
                        aria-label="Xem analytics"
                        title="Thống kê chi tiết"
                      >
                        <BarChart2 size={16} />
                      </button>
                      <button
                        className="secondary-light-button"
                        type="button"
                        disabled={updatingId === link.id}
                        onClick={() => toggleStatus(link)}
                        aria-label={link.status === 'active' ? 'Tạm dừng link' : 'Kích hoạt link'}
                      >
                        {link.status === 'active' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                      </button>
                      {deleteConfirmId === link.id ? (
                        <>
                          <button
                            className="primary-button compact"
                            type="button"
                            disabled={updatingId === link.id}
                            onClick={() => deleteLink(link.id)}
                            style={{ background: 'var(--danger)' }}
                          >
                            Xác nhận xóa
                          </button>
                          <button
                            className="secondary-light-button"
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Hủy
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary-light-button danger-text"
                          type="button"
                          disabled={updatingId === link.id}
                          onClick={() => setDeleteConfirmId(link.id)}
                          aria-label="Xóa link"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>

            {totalPages > 1 && (
              <div className="pagination-row">
                <button
                  className="secondary-light-button"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => changePage(page - 1)}
                >
                  Trước
                </button>
                <span>
                  Trang {page} / {totalPages} &nbsp;·&nbsp; {number(total)} link
                </span>
                <button
                  className="secondary-light-button"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => changePage(page + 1)}
                >
                  Sau
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {analyticsLink && (
        <LinkAnalyticsModal
          linkId={analyticsLink.id}
          campaignName={analyticsLink.campaignName}
          onClose={() => setAnalyticsLink(null)}
        />
      )}
    </>
  )
}
