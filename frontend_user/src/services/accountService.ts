import api from "./api";
import type { UserAddress, User } from "../store/authStore";

export interface AddressPayload {
  receiver_name: string;
  receiver_phone: string;
  province_id: number;
  district_id: number;
  ward_id: string;
  address_detail: string;
  is_default: boolean;
}

export interface ProfilePayload {
  full_name: string;
  phone: string;
}

/**
 * Lấy danh sách địa chỉ nhận hàng của người dùng hiện tại.
 */
export async function getAddressesApi(): Promise<UserAddress[]> {
  const res = await api.get<UserAddress[]>("/api/auth/me/addresses");
  return res.data;
}

/**
 * Cập nhật thông tin cá nhân của người dùng.
 */
export async function updateProfileApi(payload: ProfilePayload): Promise<User> {
  const res = await api.put<User>("/api/auth/me", payload);
  return res.data;
}

/**
 * Tạo địa chỉ giao hàng mới.
 */
export async function createAddressApi(payload: AddressPayload): Promise<UserAddress> {
  const res = await api.post<UserAddress>("/api/auth/me/addresses", payload);
  return res.data;
}

/**
 * Cập nhật địa chỉ giao hàng hiện có.
 */
export async function updateAddressApi(id: number, payload: AddressPayload): Promise<UserAddress> {
  const res = await api.put<UserAddress>(`/api/auth/me/addresses/${id}`, payload);
  return res.data;
}

/**
 * Xóa địa chỉ giao hàng.
 */
export async function deleteAddressApi(id: number): Promise<void> {
  await api.delete(`/api/auth/me/addresses/${id}`);
}
