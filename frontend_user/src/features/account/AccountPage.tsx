import { useState, useEffect, useCallback } from "react";
import { useAuthStore, type UserAddress } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "../../services/api";
import {
  getAddressesApi,
  updateProfileApi,
  createAddressApi,
  updateAddressApi,
  deleteAddressApi,
} from "../../services/accountService";
import { Edit2, Trash2, Plus, ShieldCheck, MapPin, User as UserIcon } from "lucide-react";

import { ghnService, type Province, type District, type Ward } from "../../services/ghnService";
import OrderHistory from "./OrderHistory";

const AddressDisplay = ({ addr, provinces }: { addr: UserAddress, provinces: Province[] }) => {
  const [districtName, setDistrictName] = useState("");
  const [wardName, setWardName] = useState("");
  const provName = provinces.find(p => p.ProvinceID === addr.province_id)?.ProvinceName || "";

  useEffect(() => {
    if (addr.province_id && addr.district_id) {
      ghnService.getDistricts(addr.province_id).then(d => {
        setDistrictName(d.find(x => x.DistrictID === addr.district_id)?.DistrictName || "");
      });
      ghnService.getWards(addr.district_id).then(w => {
        setWardName(w.find(x => x.WardCode === addr.ward_id)?.WardName || "");
      });
    }
  }, [addr.province_id, addr.district_id, addr.ward_id]);

  return <span>{`${addr.address_detail}, ${wardName}, ${districtName}, ${provName}`}</span>;
};

export default function AccountPage() {
  const { user, token, updateUser } = useAuthStore();
  const navigate = useNavigate();

  // Navigation State
  const [activeTab, setActiveTab] = useState<'addresses' | 'orders'>('orders');

  // Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Addresses State
  const [addresses, setAddresses] = useState<UserAddress[]>(
    [...(user?.addresses || [])].sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1))
  );
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);

  // Location State for Modal
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  
  const [selectedProv, setSelectedProv] = useState<number | "">("");
  const [selectedDist, setSelectedDist] = useState<number | "">("");
  const [selectedWard, setSelectedWard] = useState<string | "">("");
  const [addressDetail, setAddressDetail] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const fetchAddresses = useCallback(async () => {
    await Promise.resolve();
    setLoadingAddresses(true);
    try {
      const data = await getAddressesApi();
      const sortedAddresses = [...data].sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1));
      setAddresses(sortedAddresses);
      updateUser({ addresses: sortedAddresses });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAddresses(false);
    }
  }, [updateUser]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    Promise.resolve().then(() => {
      fetchAddresses();
    });
    // Fetch provinces from GHN via proxy
    ghnService.getProvinces()
      .then((data) => setProvinces(data))
      .catch((err) => console.error("Failed to load provinces", err));
  }, [token, navigate, fetchAddresses]);

  useEffect(() => {
    if (selectedProv) {
      ghnService.getDistricts(Number(selectedProv)).then(data => setDistricts(data)).catch(console.error);
    } else {
      Promise.resolve().then(() => setDistricts([]));
    }
  }, [selectedProv]);

  useEffect(() => {
    if (selectedDist) {
      ghnService.getWards(Number(selectedDist)).then(data => setWards(data)).catch(console.error);
    } else {
      Promise.resolve().then(() => setWards([]));
    }
  }, [selectedDist]);

  const handleUpdateProfile = async () => {
    setProfileLoading(true);
    try {
      const data = await updateProfileApi({
        full_name: profileData.full_name,
        phone: profileData.phone,
      });
      updateUser(data);
      setIsEditingProfile(false);
      alert("Cập nhật thông tin thành công!");
    } catch (error) {
      console.error(error);
      alert("Cập nhật thất bại!");
    } finally {
      setProfileLoading(false);
    }
  };



  const openAddressModal = (addr?: UserAddress) => {
    if (addr) {
      setEditingAddress(addr);
      setReceiverName(addr.receiver_name);
      setReceiverPhone(addr.receiver_phone);
      setSelectedProv(addr.province_id);
      setSelectedDist(addr.district_id);
      setSelectedWard(addr.ward_id);
      setAddressDetail(addr.address_detail);
      setIsDefault(addr.is_default);
    } else {
      setEditingAddress(null);
      setReceiverName(user?.full_name || "");
      setReceiverPhone(user?.phone || "");
      setSelectedProv("");
      setSelectedDist("");
      setSelectedWard("");
      setAddressDetail("");
      setIsDefault(addresses.length === 0);
    }
    setIsModalOpen(true);
  };

  const closeAddressModal = () => setIsModalOpen(false);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProv || !selectedDist || !selectedWard) {
      alert("Vui lòng chọn đầy đủ Tỉnh/Thành, Quận/Huyện, Phường/Xã");
      return;
    }

    const payload = {
      receiver_name: receiverName,
      receiver_phone: receiverPhone,
      province_id: Number(selectedProv),
      district_id: Number(selectedDist),
      ward_id: selectedWard,
      address_detail: addressDetail,
      is_default: isDefault,
    };

    try {
      if (editingAddress) {
        await updateAddressApi(editingAddress.id, payload);
      } else {
        await createAddressApi(payload);
      }
      closeAddressModal();
      fetchAddresses();
    } catch (error) {
      console.error(error);
      alert("Lỗi khi lưu địa chỉ");
    }
  };

  const handleDeleteAddress = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa địa chỉ này?")) return;
    try {
      await deleteAddressApi(id);
      fetchAddresses();
    } catch (error: unknown) {
      console.error(error);
      alert(getErrorMessage(error, "Không thể xóa địa chỉ"));
    }
  };

  const handleSetDefault = async (addr: UserAddress) => {
    try {
      await updateAddressApi(addr.id, {
        receiver_name: addr.receiver_name,
        receiver_phone: addr.receiver_phone,
        province_id: addr.province_id,
        district_id: addr.district_id,
        ward_id: addr.ward_id,
        address_detail: addr.address_detail,
        is_default: true,
      });
      fetchAddresses();
    } catch (error) {
      console.error(error);
      alert("Lỗi khi đặt làm mặc định");
    }
  };



  if (!user) return null;

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-80px)] pb-12 pt-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Profile Header Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row items-center sm:justify-between border border-slate-100 gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center font-black text-4xl uppercase border-4 border-white shadow-md">
              {user.email.charAt(0)}
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {user.full_name || "Thành viên"}
              </h1>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-green-600 mt-1 text-sm font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>Tài khoản đã xác thực</span>
              </div>
            </div>
          </div>

          {isEditingProfile && (
            <button
              onClick={handleUpdateProfile}
              disabled={profileLoading}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors shrink-0 shadow-sm"
            >
              {profileLoading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          )}
        </div>

        {/* Main Grid Layout */}
        <div className="mt-6 flex flex-col lg:flex-row gap-6">

          {/* Left Column (Profile & Membership) */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6">
            {/* Personal Info Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[17px] font-bold text-slate-900 flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary-600" /> Thông tin cá nhân
                </h2>
                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="text-primary-600 hover:text-primary-700 p-1"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Họ và tên</p>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={profileData.full_name}
                      onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-primary-500 text-slate-900 font-medium"
                    />
                  ) : (
                    <p className="font-semibold text-slate-900">{user.full_name || "Chưa cập nhật"}</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email</p>
                  <p className="font-semibold text-slate-900">{user.email}</p>
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Số điện thoại</p>
                  {isEditingProfile ? (
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-primary-500 text-slate-900 font-medium"
                    />
                  ) : (
                    <p className="font-semibold text-slate-900">{user.phone || "Chưa cập nhật"}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Membership Tier Card */}
            <div className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl shadow-md p-6 text-white relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-[17px] font-bold mb-1">Thành viên đồng</h3>
                <p className="text-primary-100 text-sm mb-5 leading-relaxed">Bạn đã tích lũy được 1,250 điểm mua sắm.</p>
                <button className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 uppercase tracking-wide">
                  Xem ưu đãi <span className="text-lg leading-none">›</span>
                </button>
              </div>
              {/* Decorative Globe-like circles */}
              <div className="absolute -bottom-10 -right-10 w-40 h-40 border-[6px] border-white/10 rounded-full"></div>
              <div className="absolute -bottom-6 -right-6 w-32 h-32 border-[6px] border-white/10 rounded-full"></div>
            </div>
          </div>

          {/* Right Column (Address Book) */}
          <div className="w-full lg:w-2/3">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 min-h-full">
              <div className="flex border-b border-slate-100 mb-6 gap-6">
                <button
                  onClick={() => setActiveTab('addresses')}
                  className={`pb-3 font-bold text-sm transition-colors border-b-2 ${
                    activeTab === 'addresses'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sổ địa chỉ nhận hàng
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`pb-3 font-bold text-sm transition-colors border-b-2 ${
                    activeTab === 'orders'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Đơn hàng của tôi
                </button>
              </div>

              {activeTab === 'addresses' ? (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-[17px] font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary-600" /> Sổ địa chỉ
                    </h2>
                    <button
                      onClick={() => openAddressModal()}
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100 text-sm font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Thêm mới
                    </button>
                  </div>

                  {loadingAddresses ? (
                    <div className="text-center py-12 text-slate-500">Đang tải sổ địa chỉ...</div>
                  ) : addresses.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-slate-500 font-medium">Bạn chưa lưu địa chỉ nào.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {addresses.map((addr) => (
                        <div
                          key={addr.id}
                          className={`border p-5 rounded-xl flex flex-col sm:flex-row justify-between gap-4 transition-all ${addr.is_default
                              ? "border-primary-400 bg-primary-50/20"
                              : "border-slate-100 hover:border-slate-200"
                            }`}
                        >
                          <div>
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-[15px]">{addr.receiver_name}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-600 font-medium text-sm">{addr.receiver_phone}</span>
                              {addr.is_default && (
                                <span className="bg-primary-600 text-white text-[10px] font-black px-2 py-0.5 rounded ml-1 uppercase tracking-wider">
                                  Mặc định
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-sm leading-relaxed">
                              <AddressDisplay addr={addr} provinces={provinces} />
                            </p>
                            {!addr.is_default && (
                              <button
                                onClick={() => handleSetDefault(addr)}
                                className="text-slate-500 text-xs font-bold hover:text-primary-600 mt-3 transition-colors border-b border-dashed border-slate-300 hover:border-primary-600 pb-0.5"
                              >
                                Đặt làm địa chỉ mặc định
                              </button>
                            )}
                          </div>
                          <div className="flex items-start gap-4">
                            <button
                              onClick={() => openAddressModal(addr)}
                              className="text-slate-400 hover:text-primary-600 transition-colors p-1"
                            >
                              <Edit2 className="w-[18px] h-[18px]" />
                            </button>
                            {!addr.is_default && (
                              <button
                                onClick={() => handleDeleteAddress(addr.id)}
                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 className="w-[18px] h-[18px]" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <OrderHistory />
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Address Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-slate-900">
                {editingAddress ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới"}
              </h3>
              <button onClick={closeAddressModal} className="text-slate-400 hover:text-slate-900 p-2 -mr-2 bg-slate-50 rounded-full">
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveAddress} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Họ và tên</label>
                  <input
                    required
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Số điện thoại
                  </label>
                  <input
                    required
                    type="tel"
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-medium text-slate-900"
                  />
                </div>
              </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Tỉnh / Thành phố
                  </label>
                  <select
                    required
                    value={selectedProv}
                    onChange={(e) => {
                      setSelectedProv(Number(e.target.value));
                      setSelectedDist("");
                      setSelectedWard("");
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none bg-white font-medium text-slate-900"
                  >
                    <option value="">Chọn Tỉnh/Thành</option>
                    {provinces.map((p) => (
                      <option key={p.ProvinceID} value={p.ProvinceID}>
                        {p.ProvinceName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Quận / Huyện
                    </label>
                    <select
                      required
                      value={selectedDist}
                      onChange={(e) => {
                        setSelectedDist(Number(e.target.value));
                        setSelectedWard("");
                      }}
                      disabled={!selectedProv}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none bg-white font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">Chọn Quận/Huyện</option>
                      {districts.map((d) => (
                        <option key={d.DistrictID} value={d.DistrictID}>
                          {d.DistrictName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Phường / Xã
                    </label>
                    <select
                      required
                      value={selectedWard}
                      onChange={(e) => setSelectedWard(e.target.value)}
                      disabled={!selectedDist}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none bg-white font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">Chọn Phường/Xã</option>
                      {wards.map((w) => (
                        <option key={w.WardCode} value={w.WardCode}>
                          {w.WardName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Địa chỉ cụ thể
                </label>
                <input
                  required
                  type="text"
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="Số nhà, tên đường..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-medium text-slate-900"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer mt-2 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-bold text-slate-800">Đặt làm địa chỉ mặc định</span>
              </label>

              <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeAddressModal}
                  className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Trở lại
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm"
                >
                  Hoàn thành
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
