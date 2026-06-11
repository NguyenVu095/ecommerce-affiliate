import { Copy, Filter, Link2, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import TopBar from '../../components/TopBar'
import {
  createAffiliateLinkApi,
  getAffiliateProductsApi,
  getErrorMessage,
  type AffiliateProduct,
} from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/toastStore'

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const sortOptions = [
  { value: 'commission_desc', label: 'Hoa hồng cao' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
]

const channelOptions = [
  { value: 'facebook', label: 'Facebook post' },
  { value: 'tiktok', label: 'TikTok video' },
  { value: 'zalo', label: 'Zalo group' },
  { value: 'website', label: 'Website / blog' },
  { value: 'direct', label: 'Khác' },
]

const customerAppUrl = (import.meta.env.VITE_CUSTOMER_APP_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')

export default function ProductWarehousePage() {
  const [products, setProducts] = useState<AffiliateProduct[]>([])
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [sort, setSort] = useState('commission_desc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [creatingId, setCreatingId] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<AffiliateProduct | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [channel, setChannel] = useState('facebook')
  const { user } = useAuthStore()

  useEffect(() => {
    getAffiliateProductsApi({
      page,
      page_size: 12,
      search: submittedSearch || undefined,
      sort,
    })
      .then((res) => {
        setProducts(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Không tải được kho sản phẩm.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [page, sort, submittedSearch])

  const summary = useMemo(() => {
    return products.reduce(
      (acc, product) => ({
        estimated: acc.estimated + product.estimated_commission,
        stock: acc.stock + product.stock,
        orders: acc.orders + product.month_orders,
      }),
      { estimated: 0, stock: 0, orders: 0 },
    )
  }, [products])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const nextSearch = search.trim()
    if (nextSearch === submittedSearch && page === 1) return
    setLoading(true)
    setError('')
    setPage(1)
    setSubmittedSearch(nextSearch)
  }

  const changeSort = (nextSort: string) => {
    if (nextSort === sort && page === 1) return
    setLoading(true)
    setError('')
    setPage(1)
    setSort(nextSort)
  }

  const changePage = (nextPage: number) => {
    if (nextPage === page) return
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  const buildAffiliateLink = (productId: number) => {
    const code = user?.referral_code || (user?.id ? `AFF${user.id}` : 'AFF')
    return `${customerAppUrl}/product/${productId}?ref=${code}`
  }

  const openCreateLink = (product: AffiliateProduct) => {
    setSelectedProduct(product)
    setCampaignName(product.name)
    setChannel('facebook')
  }

  const closeCreateLink = () => {
    if (creatingId !== null) return
    setSelectedProduct(null)
  }

  const createAndCopyLink = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedProduct) return
    const product = selectedProduct
    setCreatingId(product.id)
    try {
      const res = await createAffiliateLinkApi({
        product_id: product.id,
        campaign_name: campaignName.trim() || product.name,
        channel,
      })
      await navigator.clipboard.writeText(res.data.tracking_url)
      setCopiedId(product.id)
      setSelectedProduct(null)
      toast.success(`Tạo link thành công và đã copy vào clipboard: ${campaignName || product.name}`)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không tạo được link affiliate.'))
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <>
      <TopBar title="Kho sản phẩm" subtitle="Chọn sản phẩm phù hợp để tạo link và quảng bá" />
      <div className="page-content">
        <section className="warehouse-toolbar">
          <div>
            <span className="eyebrow dark">Affiliate products</span>
            <h2>Sản phẩm đang mở tiếp thị</h2>
            <p>{number(total)} sản phẩm khả dụng. Hoa hồng hiển thị là ước tính theo giá bán hiện tại.</p>
          </div>
          <div className="warehouse-summary">
            <div>
              <span>Hoa hồng ước tính</span>
              <strong>{currency(summary.estimated)}</strong>
            </div>
            <div>
              <span>Tồn kho trang này</span>
              <strong>{number(summary.stock)}</strong>
            </div>
            <div>
              <span>Đơn tháng này</span>
              <strong>{number(summary.orders)}</strong>
            </div>
          </div>
        </section>

        <section className="filter-panel">
          <form className="warehouse-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên sản phẩm"
            />
            <button className="primary-button compact" type="submit">
              <Filter size={16} />
              Lọc
            </button>
          </form>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <select
              value={sort}
              onChange={(event) => changeSort(event.target.value)}
            >
              {sortOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {loading && <div className="state-panel">Đang tải kho sản phẩm...</div>}
        {error && !loading && <div className="state-panel error">{error}</div>}

        {!loading && !error && (
          <>
            {products.length === 0 ? (
              <div className="state-panel">Không tìm thấy sản phẩm phù hợp.</div>
            ) : (
              <section className="product-grid">
                {products.map((product) => (
                  <article className="affiliate-product-card" key={product.id}>
                    <div className="product-image">
                      {product.thumbnail ? (
                        <a href={buildAffiliateLink(product.id)} target="_blank" rel="noreferrer" aria-label={`Mở chi tiết ${product.name}`}>
                          <img src={product.thumbnail} alt={product.name} />
                        </a>
                      ) : (
                        <PackageSearch size={34} />
                      )}
                    </div>
                    <div className="product-card-body">
                      <div className="product-card-title">
                        <span>{product.category_name || 'Chưa phân loại'}</span>
                        <strong>{product.name}</strong>
                      </div>
                      <div className="product-price-row">
                        <div>
                          <span>Giá bán</span>
                          <strong>{currency(product.sale_price || product.base_price)}</strong>
                        </div>
                        <div>
                          <span>Hoa hồng</span>
                          <strong>{currency(product.estimated_commission)}</strong>
                        </div>
                      </div>
                      <div className="product-meta-row">
                        <span>{product.commission_rate}% / đơn</span>
                        <span>{number(product.stock)} tồn kho</span>
                        <span>{number(product.month_orders)} đơn tháng này</span>
                      </div>
                      <div className="product-card-actions">
                        <button className="primary-button full" type="button" disabled={creatingId === product.id} onClick={() => openCreateLink(product)}>
                          <Copy size={16} />
                          {creatingId === product.id ? 'Đang tạo' : copiedId === product.id ? 'Đã copy' : 'Tạo link'}
                        </button>
                        <a className="secondary-light-button" href={buildAffiliateLink(product.id)} target="_blank" rel="noreferrer">
                          <Link2 size={16} />
                          Chi tiết
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <div className="pagination-row">
              <button className="secondary-light-button" type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Trước
              </button>
              <span>Trang {page} / {totalPages}</span>
              <button className="secondary-light-button" type="button" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>
                Sau
              </button>
            </div>
          </>
        )}
      </div>

      {selectedProduct && (
        <div className="modal-backdrop" role="presentation">
          <form className="create-link-modal" onSubmit={createAndCopyLink}>
            <div className="modal-header">
              <div>
                <h3>Tạo link affiliate</h3>
                <p>{selectedProduct.name}</p>
              </div>
              <button className="icon-button" type="button" onClick={closeCreateLink} aria-label="Đóng">
                <X size={17} />
              </button>
            </div>

            <label className="form-control">
              <span>Môi trường đặt link</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                {channelOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span>Ghi chú campaign</span>
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="VD: Video review 13/5, group sale cuối tuần"
              />
            </label>

            <div className="modal-actions">
              <button className="secondary-light-button" type="button" onClick={closeCreateLink}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={creatingId === selectedProduct.id}>
                <Copy size={16} />
                {creatingId === selectedProduct.id ? 'Đang tạo' : 'Tạo và copy link'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
