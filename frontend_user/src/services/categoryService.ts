import api from './api';

/** Kiểu dữ liệu của một danh mục sản phẩm (hỗ trợ lồng cây nhiều cấp). */
export interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  status: number;
  children: Category[];
}

/**
 * Lấy danh sách tất cả danh mục từ API (có cấu trúc cây lồng nhau).
 * Dùng trong Navbar để hiển thị menu điều hướng.
 *
 * @returns Mảng danh mục gốc, mỗi danh mục có trường `children` lồng nhau.
 */
export async function fetchCategories(): Promise<Category[]> {
  const response = await api.get<Category[]>('/api/categories/');
  return response.data;
}
