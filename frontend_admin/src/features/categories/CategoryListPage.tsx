import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, RefreshCw, Plus, Edit2, Trash2, Eye, EyeOff,
  ChevronLeft, ChevronRight, Tag, CheckCircle, XCircle,
} from 'lucide-react'
import TopBar from '../../components/TopBar'
import {
  getAdminCategoriesApi, createAdminCategoryApi, updateAdminCategoryApi,
  toggleAdminCategoryStatusApi, deleteAdminCategoryApi, type AdminCategoryFilter,
  type AdminCategoryRow,
  type AdminCategoryPayload,
  getErrorMessage,
} from '../../services/api'
import { useDebounce } from '../../hooks/useDebounce'

type Category = AdminCategoryRow

interface CategoryFormState {
  name: string
  slug: string
  parent_id: string
  status: number
}

const EMPTY_FORM: CategoryFormState = { name: '', slug: '', parent_id: '', status: 1 }

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const PAGE_SIZE = 30

export default function CategoryListPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debouncedSearch = useDebounce(search, 400)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  const buildCategoryFilter = useCallback((): AdminCategoryFilter => {
    const params: AdminCategoryFilter = { page, page_size: PAGE_SIZE }
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
    if (statusFilter !== '') params.status = Number(statusFilter)
    return params
  }, [page, debouncedSearch, statusFilter])

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getAdminCategoriesApi(buildCategoryFilter())
      setCategories(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.total_pages)
    } catch {
      setError('Không thể tải danh sách danh mục. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [buildCategoryFilter])

  useEffect(() => {
    getAdminCategoriesApi(buildCategoryFilter())
      .then((res) => {
        setCategories(res.data.data)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch(() => {
        setError('Không thể tải danh sách danh mục. Vui lòng thử lại.')
      })
      .finally(() => setLoading(false))
  }, [buildCategoryFilter])

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


  const openCreate = () => {
    setEditingCategory(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditingCategory(cat)
    setForm({ name: cat.name, slug: cat.slug, parent_id: cat.parent_id ? String(cat.parent_id) : '', status: cat.status })
    setFormError('')
    setModalOpen(true)
  }

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      slug: editingCategory ? f.slug : slugify(name),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Tên danh mục không được để trống'); return }
    if (!form.slug.trim()) { setFormError('Slug không được để trống'); return }
    setSaving(true)
    setFormError('')
    try {
      const payload: AdminCategoryPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        status: form.status,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      }
      if (editingCategory) {
        await updateAdminCategoryApi(editingCategory.id, payload)
        showToast(`Đã cập nhật danh mục "${form.name}"`)
      } else {
        await createAdminCategoryApi(payload)
        showToast(`Đã tạo danh mục "${form.name}"`)
      }
      setModalOpen(false)
      await fetchCategories()
    } catch (e: unknown) {
      setFormError(getErrorMessage(e, 'Lưu thất bại, vui lòng thử lại.'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (cat: Category) => {
    try {
      await toggleAdminCategoryStatusApi(cat.id)
      showToast(`Đã ${cat.status === 1 ? 'ẩn' : 'hiện'} danh mục "${cat.name}"`)
      await fetchCategories()
    } catch {
      showToast('Cập nhật trạng thái thất bại', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteAdminCategoryApi(deleteConfirm.id)
      showToast(`Đã xóa danh mục "${deleteConfirm.name}"`)
      setDeleteConfirm(null)
      await fetchCategories()
    } catch (e: unknown) {
      showToast(getErrorMessage(e, 'Xóa thất bại'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const categoryStats = useMemo(() => {
    // Một vòng quét O(N) tạo cả danh mục gốc và số lượng active, tránh filter lặp lại trong render.
    return categories.reduce(
      (acc, category) => {
        if (!category.parent_id) acc.rootCategories.push(category)
        if (category.status === 1) acc.activeCount += 1
        return acc
      },
      { rootCategories: [] as Category[], activeCount: 0 },
    )
  }, [categories])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar title="Quản lý Danh mục" subtitle={`${total} danh mục`} />

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

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !deleting && setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 8 }}>Xóa danh mục?</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
              Bạn có chắc muốn xóa <strong>"{deleteConfirm.name}"</strong>?
            </div>
            {deleteConfirm.product_count > 0 && (
              <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
                ⚠️ Danh mục này có {deleteConfirm.product_count} sản phẩm
              </div>
            )}
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>Hành động này không thể hoàn tác.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Hủy</button>
              <button className="btn" onClick={handleDelete} disabled={deleting} style={{ background: '#ef4444', color: '#fff' }}>
                {deleting ? 'Đang xóa...' : 'Xóa danh mục'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category form modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !saving && setModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', marginBottom: 20 }}>
              {editingCategory ? 'Chỉnh sửa danh mục' : 'Tạo danh mục mới'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Tên danh mục <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className="admin-input"
                  style={{ width: '100%' }}
                  placeholder="Ví dụ: Áo thun nam"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                />
              </div>

              {/* Slug */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Slug <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className="admin-input"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  placeholder="ao-thun-nam"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>

              {/* Parent */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Danh mục cha
                </label>
                <select
                  className="admin-select"
                  style={{ width: '100%' }}
                  value={form.parent_id}
                  onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                >
                  <option value="">— Không có (danh mục gốc) —</option>
                  {categoryStats.rootCategories
                    .filter(c => c.id !== editingCategory?.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Trạng thái</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[{ value: 1, label: 'Hiển thị' }, { value: 0, label: 'Ẩn' }].map(opt => (
                    <label key={opt.value} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                      borderRadius: 8, cursor: 'pointer', flex: 1,
                      border: `2px solid ${form.status === opt.value ? '#6366f1' : '#e5e7eb'}`,
                      background: form.status === opt.value ? '#eef2ff' : '#fafafa',
                    }}>
                      <input type="radio" name="cat-status" value={opt.value} checked={form.status === opt.value}
                        onChange={() => setForm(f => ({ ...f, status: opt.value }))} style={{ accentColor: '#6366f1' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: form.status === opt.value ? '#6366f1' : '#6b7280' }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>Hủy</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Đang lưu...' : (editingCategory ? 'Cập nhật' : 'Tạo danh mục')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {/* Filters */}
        <div className="admin-card animate-fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input className="admin-input" style={{ width: '100%', paddingLeft: 34 }}
                placeholder="Tìm tên, slug..." value={search} onChange={e => handleSearchChange(e.target.value)} />
            </div>
            <select className="admin-select" value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">Tất cả trạng thái</option>
              <option value="1">Đang hiển thị</option>
              <option value="0">Đã ẩn</option>
            </select>
            <button className="btn btn-ghost" onClick={fetchCategories} title="Làm mới"><RefreshCw size={15} /></button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm danh mục</button>
          </div>
        </div>

        {/* Stats */}
        {!loading && total > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Tổng danh mục', value: total, color: '#6366f1' },
              { label: 'Đang hiển thị', value: categoryStats.activeCount, color: '#10b981' },
              { label: 'Đã ẩn', value: total - categoryStats.activeCount, color: '#6b7280' },
              { label: 'Danh mục gốc', value: categoryStats.rootCategories.length, color: '#0891b2' },
            ].map(s => (
              <div key={s.label} className="admin-card" style={{ padding: '10px 16px', flex: '1 1 130px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: s.color, marginLeft: 'auto' }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="admin-card animate-fade-in" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Đang tải danh mục...</div>
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Tag size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#1a1d2e', marginBottom: 6 }}>Không tải được danh mục</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{error}</div>
              <button className="btn btn-primary" onClick={fetchCategories}><RefreshCw size={14} /> Thử lại</button>
            </div>
          ) : categories.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Tag size={48} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Chưa có danh mục nào</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Hãy tạo danh mục đầu tiên cho cửa hàng.</div>
              <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Tạo danh mục</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Danh mục</th>
                    <th>Slug</th>
                    <th>Danh mục cha</th>
                    <th>Sản phẩm</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {cat.parent_id && <span style={{ width: 16, height: 2, background: '#e5e7eb', display: 'inline-block', flexShrink: 0 }} />}
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.parent_id ? '#f3f4f6' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Tag size={14} color={cat.parent_id ? '#9ca3af' : '#fff'} />
                          </div>
                          <div style={{ fontWeight: 600, color: '#1a1d2e', fontSize: 14 }}>{cat.name}</div>
                        </div>
                      </td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{cat.slug}</span></td>
                      <td>
                        {cat.parent_name
                          ? <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 500 }}>{cat.parent_name}</span>
                          : <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic' }}>Gốc</span>}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: cat.product_count > 0 ? '#1a1d2e' : '#9ca3af', fontSize: 13 }}>
                          {cat.product_count}
                        </span>
                      </td>
                      <td>
                        <span className={cat.status === 1 ? 'badge badge-success' : 'badge badge-cancelled'}>
                          {cat.status === 1 ? 'Hiển thị' : 'Đã ẩn'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button title="Chỉnh sửa" onClick={() => openEdit(cat)}
                            style={{ width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer', background: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#c7d2fe')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#eef2ff')}>
                            <Edit2 size={14} />
                          </button>
                          <button title={cat.status === 1 ? 'Ẩn danh mục' : 'Hiện danh mục'} onClick={() => handleToggleStatus(cat)}
                            style={{ width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer', background: cat.status === 1 ? '#fef3c7' : '#dcfce7', color: cat.status === 1 ? '#92400e' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {cat.status === 1 ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button title="Xóa danh mục" onClick={() => setDeleteConfirm(cat)}
                            style={{ width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fecaca')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#fee2e2')}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Trang {page} / {totalPages} · {total} danh mục</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" onClick={() => handlePageChange(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '6px 10px' }}><ChevronLeft size={16} /></button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = page <= 3 ? i + 1 : page + i - 2
                  if (pg < 1 || pg > totalPages) return null
                  return (
                    <button key={pg} className="btn" onClick={() => handlePageChange(pg)}
                      style={{ padding: '6px 12px', background: pg === page ? '#6366f1' : 'transparent', color: pg === page ? '#fff' : '#374151', border: pg === page ? 'none' : '1px solid #e5e7eb', fontWeight: pg === page ? 600 : 400 }}>
                      {pg}
                    </button>
                  )
                })}
                <button className="btn btn-ghost" onClick={() => handlePageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '6px 10px' }}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
