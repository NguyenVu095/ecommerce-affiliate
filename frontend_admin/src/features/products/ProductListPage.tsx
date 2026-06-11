import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, Edit2, Trash2, Eye, EyeOff, RefreshCw, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getAdminProductsApi,
  getAdminProductApi,
  getAdminCategoriesFlatApi,
  toggleAdminProductStatusApi,
  deleteAdminProductApi,
  bulkProductStatusApi,
  bulkProductDeleteApi,
  type ProductFilter,
  type AdminProduct,
  type AdminCategoryFlat,
  type AdminProductVariant,
} from '../../services/api'
import ProductFormModal from './ProductFormModal'
import { useDebounce } from '../../hooks/useDebounce'
import { useToastStore } from '../../store/toastStore'

type Product = AdminProduct
type Category = AdminCategoryFlat
type Variant = AdminProductVariant

const GENDER_LABELS: Record<number, string> = { 0: 'Nam', 1: 'Nữ', 2: 'Unisex' }
const STATUS_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: 'Đang bán', className: 'badge badge-success' },
  0: { label: 'Ẩn', className: 'badge badge-cancelled' },
}

const PAGE_SIZE = 20

function formatPrice(price: number) {
  return price.toLocaleString('vi-VN') + '₫'
}

export default function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [genderFilter, setGenderFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 400)

  // Expand variants
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [variantMap, setVariantMap] = useState<Record<number, Variant[]>>({})
  const [loadingVariants, setLoadingVariants] = useState<number | null>(null)

  const toggleExpand = async (product: Product) => {
    if (expandedId === product.id) { setExpandedId(null); return }
    setExpandedId(product.id)
    if (variantMap[product.id]) return
    setLoadingVariants(product.id)
    try {
      const res = await getAdminProductApi(product.id)
      setVariantMap(m => ({ ...m, [product.id]: res.data.variants || [] }))
    } catch { /* ignore */ }
    finally { setLoadingVariants(null) }
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  // Image hover preview
  const [hoverImage, setHoverImage] = useState<{ url: string; x: number; y: number } | null>(null)

  const { show: showToast } = useToastStore()

  useEffect(() => {
    getAdminCategoriesFlatApi()
      .then((res) => setCategories(res.data))
      .catch(() => {
        // ignore: category filter can stay empty while product list remains usable.
      })
  }, [])

  const buildProductFilter = useCallback((): ProductFilter => {
    const params: ProductFilter = { page, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (categoryFilter) params.category_id = Number(categoryFilter)
    if (statusFilter !== '') params.status = Number(statusFilter)
    if (genderFilter !== '') params.gender = Number(genderFilter)
    return params
  }, [page, debouncedSearch, categoryFilter, statusFilter, genderFilter])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminProductsApi(buildProductFilter())
      setProducts(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.total_pages)
      setSelectedIds(new Set()) // clear selection on refresh
    } catch {
      showToast('Không thể tải danh sách sản phẩm', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildProductFilter, showToast])

  useEffect(() => {
    getAdminProductsApi(buildProductFilter())
      .then((res) => {
        setProducts(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
        setSelectedIds(new Set())
      })
      .catch(() => {
        showToast('Không thể tải danh sách sản phẩm', 'error')
      })
      .finally(() => setLoading(false))
  }, [buildProductFilter, showToast])

  const startListReload = () => {
    setLoading(true)
  }

  const handleSearchChange = (value: string) => {
    startListReload()
    setSearch(value)
    setPage(1)
  }

  const handleCategoryFilterChange = (value: string) => {
    startListReload()
    setCategoryFilter(value)
    setPage(1)
  }

  const handleGenderFilterChange = (value: string) => {
    startListReload()
    setGenderFilter(value)
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

  const handleToggleStatus = async (product: Product) => {
    try {
      await toggleAdminProductStatusApi(product.id)
      showToast(`Đã ${product.status === 1 ? 'ẩn' : 'hiện'} sản phẩm`)
      await fetchProducts()
    } catch {
      showToast('Cập nhật trạng thái thất bại', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteAdminProductApi(deleteConfirm.id)
      showToast('Đã xóa sản phẩm thành công')
      setDeleteConfirm(null)
      await fetchProducts()
    } catch {
      showToast('Xóa sản phẩm thất bại', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleModalClose = (refresh?: boolean) => {
    setModalOpen(false)
    setEditingProduct(null)
    if (refresh) {
      void fetchProducts()
      showToast(editingProduct ? 'Cập nhật sản phẩm thành công' : 'Tạo sản phẩm thành công')
    }
  }

  // Bulk selection helpers
  const allPageIds = useMemo(() => products.map(p => p.id), [products])
  const { allSelected, someSelected } = useMemo(() => {
    // Tính trạng thái checkbox trong một vòng O(N), tránh map/some/every lặp lại trên render path.
    const selection = allPageIds.reduce(
      (acc, id) => {
        const selected = selectedIds.has(id)
        acc.selectedCount += selected ? 1 : 0
        return acc
      },
      { selectedCount: 0 },
    )
    return {
      allSelected: allPageIds.length > 0 && selection.selectedCount === allPageIds.length,
      someSelected: selection.selectedCount > 0 && selection.selectedCount < allPageIds.length,
    }
  }, [allPageIds, selectedIds])

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allPageIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => new Set([...prev, ...allPageIds]))
    }
  }

  const handleBulkStatus = async (status: 0 | 1) => {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      const res = await bulkProductStatusApi(ids, status)
      showToast(res.data.message || 'Cập nhật thành công')
      await fetchProducts()
    } catch {
      showToast('Thao tác hàng loạt thất bại', 'error')
    }
  }

  const handleBulkDelete = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkDeleting(true)
    try {
      const res = await bulkProductDeleteApi(ids)
      showToast(res.data.message || 'Đã xóa sản phẩm')
      setBulkDeleteConfirm(false)
      await fetchProducts()
    } catch {
      showToast('Xóa hàng loạt thất bại', 'error')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Sản phẩm" subtitle={`${total} sản phẩm`} />


      {/* Image hover preview */}
      {hoverImage && (
        <div style={{
          position: 'fixed',
          left: hoverImage.x + 16,
          top: hoverImage.y - 110,
          zIndex: 10000,
          pointerEvents: 'none',
          animation: 'fadeInUp 0.15s ease',
        }}>
          <img
            src={hoverImage.url}
            alt="Preview"
            style={{
              width: 200, height: 200,
              objectFit: 'cover',
              borderRadius: 12,
              border: '2px solid #e5e7eb',
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
              display: 'block',
              background: '#f3f4f6',
            }}
            onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/f3f4f6/94a3b8?text=No+Image' }}
          />
        </div>
      )}

      {/* Bulk Delete Confirm Modal */}
      {bulkDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 8 }}>
              Xóa {selectedIds.size} sản phẩm?
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              Hành động này sẽ xóa <strong>{selectedIds.size}</strong> sản phẩm đã chọn. Không thể hoàn tác.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}>
                Hủy
              </button>
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}
                style={{ background: '#ef4444', color: '#fff' }}>
                {bulkDeleting ? 'Đang xóa...' : `Xóa ${selectedIds.size} sản phẩm`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !deleting && setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 8 }}>
              Xóa sản phẩm?
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              Bạn có chắc muốn xóa <strong>"{deleteConfirm.name}"</strong>? Hành động này không thể hoàn tác.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Hủy
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}
                style={{ background: '#ef4444', color: '#fff' }}>
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {modalOpen && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          onClose={handleModalClose}
        />
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
                placeholder="Tìm tên, slug sản phẩm..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Category filter */}
            <select
              className="admin-select"
              value={categoryFilter}
              onChange={e => handleCategoryFilterChange(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Gender filter */}
            <select className="admin-select" value={genderFilter} onChange={e => handleGenderFilterChange(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">Tất cả giới tính</option>
              <option value="0">Nam</option>
              <option value="1">Nữ</option>
              <option value="2">Unisex</option>
            </select>

            {/* Status filter */}
            <select className="admin-select" value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">Tất cả trạng thái</option>
              <option value="1">Đang bán</option>
              <option value="0">Đã ẩn</option>
            </select>

            {/* Action buttons */}
            <button className="btn btn-ghost" onClick={fetchProducts} title="Làm mới">
              <RefreshCw size={15} />
            </button>
            <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setModalOpen(true) }}>
              <Plus size={16} /> Thêm sản phẩm
            </button>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
              padding: '10px 14px', borderRadius: 8,
              background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
              border: '1px solid #c7d2fe',
            }}>
              <CheckSquare size={16} color="#6366f1" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4338ca' }}>
                Đã chọn {selectedIds.size} sản phẩm
              </span>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px', background: '#dcfce7', color: '#15803d', border: 'none' }}
                  onClick={() => handleBulkStatus(1)}
                >
                  <Eye size={13} /> Hiện tất cả
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px', background: '#fef3c7', color: '#92400e', border: 'none' }}
                  onClick={() => handleBulkStatus(0)}
                >
                  <EyeOff size={13} /> Ẩn tất cả
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  <Trash2 size={13} /> Xóa tất cả
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: '5px 12px' }}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Đang tải sản phẩm...</div>
            </div>
          ) : products.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Package size={48} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Không có sản phẩm nào</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Thử thay đổi bộ lọc hoặc thêm sản phẩm mới</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, textAlign: 'center' }}>
                      <button
                        onClick={handleSelectAll}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      >
                        {allSelected
                          ? <CheckSquare size={16} color="#6366f1" />
                          : someSelected
                            ? <CheckSquare size={16} color="#9ca3af" />
                            : <Square size={16} color="#9ca3af" />}
                      </button>
                    </th>
                    <th style={{ width: 56 }}>Hình</th>
                    <th>Sản phẩm</th>
                    <th>Danh mục</th>
                    <th>Giá gốc</th>
                    <th>Tồn kho</th>
                    <th>Biến thể</th>
                    <th>Giới tính</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <Fragment key={product.id}>
                    <tr style={{ background: selectedIds.has(product.id) ? '#f5f3ff' : undefined }}>
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleSelect(product.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {selectedIds.has(product.id)
                            ? <CheckSquare size={16} color="#6366f1" />
                            : <Square size={16} color="#d1d5db" />}
                        </button>
                      </td>
                      {/* Thumbnail */}
                      <td>
                        {product.thumbnail ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}
                            onMouseEnter={e => setHoverImage({ url: product.thumbnail!, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setHoverImage(h => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
                            onMouseLeave={() => setHoverImage(null)}
                          >
                            <img
                              src={product.thumbnail}
                              alt={product.name}
                              style={{
                                width: 40, height: 40, objectFit: 'cover', borderRadius: 8,
                                border: '1px solid #e5e7eb', cursor: 'zoom-in',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                                display: 'block',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.transform = 'scale(1.1)'
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.transform = 'scale(1)'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40/f3f4f6/94a3b8?text=?' }}
                            />
                          </div>
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: 8,
                            background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Package size={18} color="#94a3b8" />
                          </div>
                        )}
                      </td>

                      {/* Product info */}
                      <td>
                        <div style={{ fontWeight: 600, color: '#1a1d2e', fontSize: 14, marginBottom: 2 }}>
                          {product.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{product.slug}</div>
                      </td>

                      {/* Category */}
                      <td>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                          {product.category_name || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>—</span>}
                        </span>
                      </td>

                      {/* Price */}
                      <td>
                        <span style={{ fontWeight: 600, color: '#1a1d2e' }}>
                          {formatPrice(product.base_price)}
                        </span>
                      </td>

                      {/* Stock */}
                      <td>
                        <span style={{
                          fontWeight: 600,
                          color: product.total_stock === 0 ? '#ef4444' : product.total_stock < 10 ? '#f59e0b' : '#10b981',
                        }}>
                          {product.total_stock}
                        </span>
                      </td>

                      {/* Variant count - clickable to expand */}
                      <td>
                        <button
                          onClick={() => toggleExpand(product)}
                          style={{
                            background: expandedId === product.id ? '#6366f1' : '#eef2ff',
                            color: expandedId === product.id ? '#fff' : '#6366f1',
                            padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                            transition: 'all 0.15s',
                          }}
                        >
                          {expandedId === product.id
                            ? <ChevronUp size={12} />
                            : <ChevronDown size={12} />}
                          {product.variant_count} biến thể
                        </button>
                      </td>

                      {/* Gender */}
                      <td>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                          {GENDER_LABELS[product.gender] ?? '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={STATUS_LABELS[product.status]?.className || 'badge'}>
                          {STATUS_LABELS[product.status]?.label ?? product.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {/* Edit */}
                          <button
                            title="Chỉnh sửa"
                            onClick={() => { setEditingProduct(product); setModalOpen(true) }}
                            style={{
                              width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
                              background: '#eef2ff', color: '#6366f1',
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
                            title={product.status === 1 ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
                            onClick={() => handleToggleStatus(product)}
                            style={{
                              width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
                              background: product.status === 1 ? '#fef3c7' : '#dcfce7',
                              color: product.status === 1 ? '#92400e' : '#15803d',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background 0.15s',
                            }}
                          >
                            {product.status === 1 ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>

                          {/* Delete */}
                          <button
                            title="Xóa sản phẩm"
                            onClick={() => setDeleteConfirm(product)}
                            style={{
                              width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
                              background: '#fee2e2', color: '#ef4444',
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

                    {/* Expanded variant row */}
                    {expandedId === product.id && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: '#f8faff' }}>
                          <div style={{ padding: '12px 20px 16px 56px' }}>
                            {loadingVariants === product.id ? (
                              <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: 13 }}>Đang tải biến thể...</div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Chi tiết biến thể
                                </div>
                                {(variantMap[product.id] || []).length === 0 ? (
                                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Chưa có biến thể nào</div>
                                ) : (
                                  <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                          {['ID', 'SKU', 'Thuộc tính', 'Giá bán', 'Giá KM', 'Tồn kho', 'Ảnh', 'Trạng thái'].map(h => (
                                            <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(variantMap[product.id] || []).map((v: Variant) => (
                                          <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px 12px', color: '#9ca3af' }}>#{v.id}</td>
                                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{v.sku || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                              {v.attributes && Object.keys(v.attributes).length > 0
                                                ? Object.entries(v.attributes).map(([k, val]) => (
                                                    <span key={k} style={{ display: 'inline-block', background: '#e0e7ff', color: '#4338ca', borderRadius: 4, padding: '1px 7px', fontSize: 11, marginRight: 4, marginBottom: 2 }}>
                                                      {k}: {val}
                                                    </span>
                                                  ))
                                                : <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1a1d2e' }}>{formatPrice(v.price)}</td>
                                            <td style={{ padding: '8px 12px', color: '#10b981' }}>{v.sale_price ? formatPrice(v.sale_price) : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: v.stock === 0 ? '#ef4444' : v.stock < 10 ? '#f59e0b' : '#10b981' }}>{v.stock}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                              {v.image_url
                                                ? <img src={v.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, border: '1px solid #e5e7eb' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                                : <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>
                                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: v.status === 1 ? '#dcfce7' : '#fee2e2', color: v.status === 1 ? '#15803d' : '#b91c1c' }}>
                                                {v.status === 1 ? 'Đang bán' : 'Ẩn'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
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
                Trang {page} / {totalPages} · {total} sản phẩm
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

        {/* Stats row */}
        {!loading && products.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Tổng sản phẩm', value: total, color: '#6366f1' },
              { label: 'Đang bán', value: products.filter(p => p.status === 1).length, color: '#10b981' },
              { label: 'Đã ẩn', value: products.filter(p => p.status === 0).length, color: '#6b7280' },
              { label: 'Hết hàng', value: products.filter(p => p.total_stock === 0).length, color: '#ef4444' },
            ].map(stat => (
              <div key={stat.label} className="admin-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 140px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: stat.color }} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>{stat.label}</span>
                <span style={{ fontWeight: 700, color: stat.color, marginLeft: 'auto' }}>{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
