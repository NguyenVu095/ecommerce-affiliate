import api from './api';

/** Endpoint gốc của module giao hàng backend. */
const API_URL = '/api/shipping';

export interface Province {
  ProvinceID: number;
  ProvinceName: string;
}

export interface District {
  DistrictID: number;
  ProvinceID: number;
  DistrictName: string;
}

export interface Ward {
  WardCode: string;
  DistrictID: number;
  WardName: string;
}

export interface ShippingFeeRequest {
  to_district_id: number;
  to_ward_code: string;
  service_type_id?: number;
  items: { variant_id: number; quantity: number }[];
}

/**
 * Kiểu nội bộ của cache trong bộ nhớ.
 * Mọi giá trị được type rõ ràng bằng union thạy vì any:
 *   - Province[] và District[] được cùng cache key khác nhau
 *   - Tư tường minh giúp TypeScript phát hiện lỗi kiểu khi đọc cache
 */
type CacheValue = Province[] | District[] | Ward[];
const cache: Record<string, CacheValue> = {};

/** Kiểu phản hồi API phí vận chuyển từ backend. */
interface ShippingFeeResponse {
  data?: {
    total?: number;
  };
}

export const ghnService = {
  /**
   * Lấy danh sách tất cả tỉnh/thành phố.
   * Kết quả được cache trong bộ nhớ (đối tượng module-level) để tránh
   * gọi API lặp lại trong cùng phiên làm việc.
   */
  getProvinces: async (): Promise<Province[]> => {
    if (cache['provinces']) return cache['provinces'] as Province[];
    const response = await api.get<{ data: Province[] }>(`${API_URL}/provinces`);
    cache['provinces'] = response.data.data;
    return cache['provinces'] as Province[];
  },

  /**
   * Lấy danh sách quận/huyện theo tỉnh.
   * Kết quả được cache theo key `districts_{provinceId}`.
   *
   * @param provinceId - ID tỉnh cần tra cứu.
   */
  getDistricts: async (provinceId: number): Promise<District[]> => {
    const key = `districts_${provinceId}`;
    if (cache[key]) return cache[key] as District[];
    const response = await api.get<{ data: District[] }>(`${API_URL}/districts?province_id=${provinceId}`);
    cache[key] = response.data.data;
    return cache[key] as District[];
  },

  /**
   * Lấy danh sách phường/xã theo quận/huyện.
   * Kết quả được cache theo key `wards_{districtId}`.
   *
   * @param districtId - ID quận/huyện cần tra cứu.
   */
  getWards: async (districtId: number): Promise<Ward[]> => {
    const key = `wards_${districtId}`;
    if (cache[key]) return cache[key] as Ward[];
    const response = await api.post<{ data: Ward[] }>(`${API_URL}/wards`, { district_id: districtId });
    cache[key] = response.data.data;
    return cache[key] as Ward[];
  },

  /**
   * Tính phí vận chuyển dựa trên địa chỉ và danh sách sản phẩm trong giỏ hàng.
   * Trả về giá trị mặc định 30.000đ nếu API không phản hồi đúng định dạng.
   *
   * @param payload - Thông tin địa chỉ đích và danh sách mặt hàng.
   * @returns Phí ship tính bằng VND.
   */
  getShippingFee: async (payload: ShippingFeeRequest): Promise<number> => {
    // Hằng số phí ship dự phòng khi API không phản hồi được
    const DEFAULT_SHIPPING_FEE = 30000;
    try {
      const response = await api.post<ShippingFeeResponse>(`${API_URL}/fee`, payload);
      return response.data?.data?.total ?? DEFAULT_SHIPPING_FEE;
    } catch (error) {
      console.error("Error fetching shipping fee:", error);
      return DEFAULT_SHIPPING_FEE;
    }
  }
};
