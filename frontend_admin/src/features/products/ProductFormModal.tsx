import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Package } from 'lucide-react'
import {
  getAdminProductApi,
  createAdminProductApi,
  updateAdminProductApi,
  getErrorMessage,
  type AdminProductPayload,
} from '../../services/api'

interface Category { id: number; name: string; slug: string; parent_id: number | null; status: number }

interface VariantForm {
  id?: number
  sku: string
  price: string
  sale_price: string
  stock: string
  image_url: string
  weight: string
  length: string
  width: string
  height: string
  attributes: Record<string, string>
  _isNew?: boolean
}

interface ProductSummary {
  id: number
  name: string
  slug: string
  category_id: number | null
  description: string | null
  base_price: number
  commission_rate: number
  thumbnail: string | null
  gender: number
  status: number
}

interface Props {
  product: ProductSummary | null
  categories: Category[]
  onClose: (refresh?: boolean) => void
}

function slugify(text: string) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

const emptyVariant = (): VariantForm => ({
  sku: '', price: '', sale_price: '', stock: '0',
  image_url: '', weight: '0', length: '0', width: '0', height: '0',
  attributes: { 'Màu sắc': '', 'Kích thước': '' },
  _isNew: true,
})

export default function ProductFormModal({ product, categories, onClose }: Props) {
  const isEdit = !!product

  // Form state
  const [name, setName] = useState(product?.name || '')
  const [slug, setSlug] = useState(product?.slug || '')
  const [categoryId, setCategoryId] = useState(product?.category_id?.toString() || '')
  const [description, setDescription] = useState(product?.description || '')
  const [basePrice, setBasePrice] = useState(product?.base_price?.toString() || '')
  const [commissionRate, setCommissionRate] = useState(product?.commission_rate?.toString() || '10')
  const [thumbnail, setThumbnail] = useState(product?.thumbnail || '')
  const [gender, setGender] = useState(product?.gender?.toString() ?? '2')
  const [status, setStatus] = useState(product?.status?.toString() ?? '1')

  const [variants, setVariants] = useState<VariantForm[]>([])
  const [deleteVariantIds, setDeleteVariantIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'info' | 'variants'>('info')

  // Load full product detail on edit
  useEffect(() => {
    if (!isEdit || !product) return
    getAdminProductApi(product.id)
      .then(res => {
        const data = res.data
        setName(data.name)
        setSlug(data.slug)
        setCategoryId(data.category_id?.toString() || '')
        setDescription(data.description || '')
        setBasePrice(data.base_price.toString())
        setCommissionRate(data.commission_rate.toString())
        setThumbnail(data.thumbnail || '')
        setGender(data.gender.toString())
        setStatus(data.status.toString())
        setVariants(
          (data.variants || []).map(v => ({
            id: v.id,
            sku: v.sku || '',
            price: String(v.price),
            sale_price: v.sale_price ? String(v.sale_price) : '',
            stock: String(v.stock ?? 0),
            image_url: v.image_url || '',
            weight: String(v.weight ?? 0),
            length: String(v.length ?? 0),
            width: String(v.width ?? 0),
            height: String(v.height ?? 0),
            attributes: v.attributes || {},
          }))
        )
      })
      .catch(() => setError('Không thể tải chi tiết sản phẩm'))
      .finally(() => setLoadingDetail(false))
  }, [isEdit, product])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!isEdit) setSlug(slugify(val))
  }

  const addVariant = () => setVariants(v => [...v, emptyVariant()])

  const removeVariant = (idx: number) => {
    const v = variants[idx]
    if (v.id) setDeleteVariantIds(d => [...d, v.id!])
    setVariants(variants.filter((_, i) => i !== idx))
  }

  const updateVariant = (idx: number, field: keyof VariantForm, val: string) => {
    setVariants(v => v.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  const updateVariantAttr = (idx: number, key: string, val: string) => {
    setVariants(v => v.map((item, i) => i === idx ? {
      ...item, attributes: { ...item.attributes, [key]: val }
    } : item))
  }

  const addAttrKey = (idx: number) => {
    setVariants(v => v.map((item, i) => i === idx ? {
      ...item, attributes: { ...item.attributes, '': '' }
    } : item))
  }

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) return setError('Tên sản phẩm không được để trống')
    if (!slug.trim()) return setError('Slug không được để trống')
    if (!basePrice || isNaN(Number(basePrice))) return setError('Giá gốc không hợp lệ')
    if (isNaN(Number(commissionRate)) || Number(commissionRate) < 0 || Number(commissionRate) > 100) {
      return setError('Tỷ lệ hoa hồng phải từ 0 đến 100%')
    }

    setLoading(true)
    try {
      const variantPayload = variants.map(v => ({
        id: v.id,
        sku: v.sku || undefined,
        price: Number(v.price) || 0,
        sale_price: v.sale_price ? Number(v.sale_price) : null,
        stock: Number(v.stock) || 0,
        image_url: v.image_url || null,
        weight: Number(v.weight) || 0,
        length: Number(v.length) || 0,
        width: Number(v.width) || 0,
        height: Number(v.height) || 0,
        attributes: Object.fromEntries(
          Object.entries(v.attributes).filter(([k]) => k.trim())
        ),
      }))

      const payload: AdminProductPayload = {
        name,
        slug,
        category_id: categoryId ? Number(categoryId) : null,
        description: description || null,
        base_price: Number(basePrice),
        commission_rate: Number(commissionRate),
        thumbnail: thumbnail || null,
        gender: Number(gender),
        status: Number(status),
        variants: variantPayload,
      }

      if (isEdit && product) {
        await updateAdminProductApi(product.id, {
          ...payload,
          delete_variant_ids: deleteVariantIds,
        })
      } else {
        await createAdminProductApi(payload)
      }
      onClose(true)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Đã có lỗi xảy ra'))
    } finally {
      setLoading(false)
    }
  }

  const tabStyle = (tab: 'info' | 'variants') => ({
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? '#6366f1' : '#6b7280',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={() => !loading && onClose()}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
        animation: 'fadeInUp 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Package size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1d2e' }}>
                {isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
              </div>
              {isEdit && <div style={{ fontSize: 12, color: '#9ca3af' }}>ID: {product.id}</div>}
            </div>
          </div>
          <button onClick={() => !loading && onClose()} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#f3f4f6', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #f3f4f6', padding: '0 24px', display: 'flex', flexShrink: 0 }}>
          <button style={tabStyle('info')} onClick={() => setActiveTab('info')}>Thông tin chung</button>
          <button style={tabStyle('variants')} onClick={() => setActiveTab('variants')}>
            Biến thể {variants.length > 0 && `(${variants.length})`}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loadingDetail ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%' }} className="animate-spin" />
              <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>Đang tải...</div>
            </div>
          ) : activeTab === 'info' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name & Slug */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Tên sản phẩm *">
                  <input className="admin-input" style={{ width: '100%' }} value={name}
                    onChange={e => handleNameChange(e.target.value)} placeholder="VD: Áo Thun Basic" />
                </Field>
                <Field label="Slug *">
                  <input className="admin-input" style={{ width: '100%' }} value={slug}
                    onChange={e => setSlug(e.target.value)} placeholder="ao-thun-basic" />
                </Field>
              </div>

              {/* Category, Gender, Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Field label="Danh mục">
                  <select className="admin-select" style={{ width: '100%' }} value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}>
                    <option value="">-- Không có --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Giới tính">
                  <select className="admin-select" style={{ width: '100%' }} value={gender}
                    onChange={e => setGender(e.target.value)}>
                    <option value="0">Nam</option>
                    <option value="1">Nữ</option>
                    <option value="2">Unisex</option>
                  </select>
                </Field>
                <Field label="Trạng thái">
                  <select className="admin-select" style={{ width: '100%' }} value={status}
                    onChange={e => setStatus(e.target.value)}>
                    <option value="1">Đang bán</option>
                    <option value="0">Ẩn</option>
                  </select>
                </Field>
              </div>

              {/* Price, commission & thumbnail */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Field label="Giá gốc (₫) *">
                  <input className="admin-input" style={{ width: '100%' }} type="number" min={0}
                    value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="150000" />
                </Field>
                <Field label="Hoa hồng affiliate (%)">
                  <input className="admin-input" style={{ width: '100%' }} type="number" min={0} max={100} step={0.01}
                    value={commissionRate} onChange={e => setCommissionRate(e.target.value)} placeholder="10" />
                </Field>
                <Field label="URL ảnh thumbnail">
                  <input className="admin-input" style={{ width: '100%' }} value={thumbnail}
                    onChange={e => setThumbnail(e.target.value)} placeholder="https://..." />
                </Field>
              </div>

              {/* Thumbnail preview */}
              {thumbnail && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={thumbnail} alt="preview" style={{
                    width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                    border: '1px solid #e5e7eb',
                  }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>Xem trước ảnh bìa</span>
                </div>
              )}

              {/* Description */}
              <Field label="Mô tả">
                <textarea className="admin-input" style={{
                  width: '100%', height: 100, resize: 'vertical', paddingTop: 10, lineHeight: 1.6,
                }} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Mô tả sản phẩm..." />
              </Field>
            </div>
          ) : (
            /* Variants tab */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: '#6b7280' }}>
                  {variants.length === 0 ? 'Chưa có biến thể nào' : `${variants.length} biến thể`}
                </div>
                <button className="btn btn-primary" onClick={addVariant} style={{ padding: '7px 14px' }}>
                  <Plus size={14} /> Thêm biến thể
                </button>
              </div>

              {variants.length === 0 ? (
                <div style={{
                  border: '2px dashed #e5e7eb', borderRadius: 12, padding: 40,
                  textAlign: 'center', color: '#9ca3af',
                }}>
                  <Package size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div style={{ fontSize: 14 }}>Thêm biến thể để quản lý tồn kho, giá và thuộc tính</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {variants.map((v, idx) => (
                    <div key={idx} style={{
                      border: '1px solid #e5e7eb', borderRadius: 12, padding: 16,
                      background: '#fafafa',
                    }}>
                      {/* Variant header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>
                          Biến thể #{idx + 1} {v.id ? `(ID: ${v.id})` : '(Mới)'}
                        </span>
                        <button onClick={() => removeVariant(idx)} style={{
                          background: '#fee2e2', color: '#ef4444', border: 'none',
                          borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 12,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <Trash2 size={12} /> Xóa
                        </button>
                      </div>

                      {/* Attributes */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Thuộc tính
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {Object.entries(v.attributes).map(([key, val]) => (
                            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                className="admin-input"
                                style={{ width: 130, fontSize: 13 }}
                                placeholder="Thuộc tính"
                                defaultValue={key}
                                onBlur={e => {
                                  const newAttrs = { ...v.attributes }
                                  delete newAttrs[key]
                                  newAttrs[e.target.value] = val
                                  setVariants(prev => prev.map((item, i) => i === idx ? { ...item, attributes: newAttrs } : item))
                                }}
                              />
                              <span style={{ color: '#d1d5db' }}>:</span>
                              <input
                                className="admin-input"
                                style={{ flex: 1, fontSize: 13 }}
                                placeholder="Giá trị"
                                value={val}
                                onChange={e => updateVariantAttr(idx, key, e.target.value)}
                              />
                            </div>
                          ))}
                          <button
                            onClick={() => addAttrKey(idx)}
                            style={{
                              background: 'none', border: '1px dashed #d1d5db', borderRadius: 6,
                              padding: '5px 10px', fontSize: 12, color: '#9ca3af', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                            }}
                          >
                            <Plus size={12} /> Thêm thuộc tính
                          </button>
                        </div>
                      </div>

                      {/* Price, stock, SKU */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                        <SmallField label="Giá bán (₫) *">
                          <input className="admin-input" style={{ width: '100%', fontSize: 13 }} type="number" min={0}
                            value={v.price} onChange={e => updateVariant(idx, 'price', e.target.value)} placeholder="0" />
                        </SmallField>
                        <SmallField label="Giá KM (₫)">
                          <input className="admin-input" style={{ width: '100%', fontSize: 13 }} type="number" min={0}
                            value={v.sale_price} onChange={e => updateVariant(idx, 'sale_price', e.target.value)} placeholder="0" />
                        </SmallField>
                        <SmallField label="Tồn kho">
                          <input className="admin-input" style={{ width: '100%', fontSize: 13 }} type="number" min={0}
                            value={v.stock} onChange={e => updateVariant(idx, 'stock', e.target.value)} />
                        </SmallField>
                        <SmallField label="SKU">
                          <input className="admin-input" style={{ width: '100%', fontSize: 13 }}
                            value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} placeholder="SKU-001" />
                        </SmallField>
                      </div>

                      {/* Image URL */}
                      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <SmallField label="URL ảnh biến thể" style={{ flex: 1 }}>
                          <input className="admin-input" style={{ width: '100%', fontSize: 13 }}
                            value={v.image_url} onChange={e => updateVariant(idx, 'image_url', e.target.value)} placeholder="https://..." />
                        </SmallField>
                        {v.image_url && (
                          <img src={v.image_url} alt="var" style={{
                            width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0,
                          }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                      </div>

                      {/* Dimensions */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Kích thước & Cân nặng (cm / gram)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                          {(['weight', 'length', 'width', 'height'] as const).map(dim => (
                            <SmallField key={dim} label={dim === 'weight' ? 'KL (g)' : dim === 'length' ? 'Dài' : dim === 'width' ? 'Rộng' : 'Cao'}>
                              <input className="admin-input" style={{ width: '100%', fontSize: 13 }} type="number" min={0}
                                value={v[dim]} onChange={e => updateVariant(idx, dim, e.target.value)} />
                            </SmallField>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => !loading && onClose()} disabled={loading}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

function SmallField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}
