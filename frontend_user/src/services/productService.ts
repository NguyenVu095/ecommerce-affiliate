import api from "./api";
import type { ProductGridItem } from "../features/product/ProductGrid";

export interface ProductVariant {
  id: number;
  sku: string;
  attributes: { size?: string; color?: string };
  price: number;
  sale_price: number | null;
  stock: number;
  image_url: string;
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  base_price: number;
  thumbnail: string;
  gender: number;
  status: number;
  category_id: number;
  category?: {
    id: number;
    name: string;
    slug: string;
  };
  variants: ProductVariant[];
}

export interface RelatedProduct {
  id: number;
  name: string;
  base_price: number;
  thumbnail: string | null;
  min_price?: number;
  variants?: ProductVariant[];
}

export interface ProductReview {
  id: number;
  product_id: number;
  order_item_id: number;
  rating: number;
  comment: string | null;
  images: string[] | null;
  status: string;
  user_name: string;
  user_avatar: string | null;
}

export interface ProductReviewSummary {
  average_rating: number;
  total_reviews: number;
  rating_counts: Record<string, number>;
}

export interface ProductReviewsResponse {
  reviews: ProductReview[];
  has_more: boolean;
  summary: ProductReviewSummary;
}

export interface ProductCardsResponse {
  data: ProductGridItem[];
  total: number;
  has_more: boolean;
  available_sizes?: string[];
  available_colors?: string[];
}

export interface ReviewPayload {
  order_item_id?: number;
  rating: number;
  comment: string | null;
  images: string[];
}

export interface AffiliateClickPayload {
  referral_code: string;
  affiliate_link_id: number | null;
  landing_url: string;
}

/**
 * Lấy danh sách thẻ sản phẩm (phục vụ bộ lọc, phân trang, tìm kiếm).
 */
export async function getProductsCardsApi(params: Record<string, unknown>): Promise<ProductCardsResponse> {
  const res = await api.get<ProductCardsResponse>("/api/products/cards", { params });
  return res.data;
}

/**
 * Lấy thông tin chi tiết của một sản phẩm.
 */
export async function getProductDetailApi(id: number | string): Promise<Product> {
  const res = await api.get<Product>(`/api/products/${id}`);
  return res.data;
}

/**
 * Lấy danh sách đánh giá của sản phẩm kèm tóm tắt số sao.
 */
export async function getProductReviewsApi(
  productId: number | string,
  params: { skip: number; limit: number }
): Promise<ProductReviewsResponse> {
  const res = await api.get<ProductReviewsResponse>(`/api/products/${productId}/reviews`, { params });
  return res.data;
}

/**
 * Viết đánh giá sản phẩm mới.
 */
export async function createProductReviewApi(productId: number, payload: ReviewPayload): Promise<ProductReview> {
  const res = await api.post<ProductReview>(`/api/products/${productId}/reviews`, payload);
  return res.data;
}

/**
 * Cập nhật đánh giá sản phẩm đã viết.
 */
export async function updateProductReviewApi(productId: number, reviewId: number, payload: ReviewPayload): Promise<ProductReview> {
  const res = await api.put<ProductReview>(`/api/products/${productId}/reviews/${reviewId}`, payload);
  return res.data;
}

/**
 * Xóa đánh giá sản phẩm.
 */
export async function deleteProductReviewApi(productId: number, reviewId: number): Promise<void> {
  await api.delete(`/api/products/${productId}/reviews/${reviewId}`);
}

/**
 * Ghi nhận lượt nhấp tiếp thị liên kết (affiliate click).
 */
export async function recordAffiliateClickApi(payload: AffiliateClickPayload): Promise<void> {
  await api.post("/api/affiliate/clicks", payload);
}
