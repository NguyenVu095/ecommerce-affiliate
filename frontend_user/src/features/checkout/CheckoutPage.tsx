/**
 * CheckoutPage.tsx — Trang quy trình thanh toán đầy đủ.
 *
 * Luồng xử lý: Thông tin giao hàng → Phương thức vận chuyển →
 * Phương thức thanh toán → Xác nhận & đặt hàng → Trang thành công.
 *
 * Tối ưu Giai đoạn 13:
 * - Tách toàn bộ API calls ra service layer (orderService, couponService).
 * - Thay alert() native block UI bằng React State Toast Notification.
 * - Chuẩn hóa catch (err: unknown) — Strict Type Safety.
 * - Định nghĩa interface tại service files, import tường minh.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useCartStore } from "../../store/cartStore";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, type UserAddress } from "../../store/authStore";
import { ghnService, type Province, type District, type Ward } from "../../services/ghnService";
import {
  getPaymentMethods,
  getShippingMethods,
  getUserAddresses,
  createOrder,
  getVnpayUrl,
  type PaymentMethod,
  type ShippingMethod,
} from "../../services/orderService";
import {
  getAvailableCoupons,
  validateCoupon,
  type CouponItem,
} from "../../services/couponService";

// ─── Kiểu dữ liệu nội bộ ──────────────────────────────────────────────────────

interface FormData {
  name: string;
  phone: string;
  email: string;
  addressDetail: string;
  note: string;
}

interface FormErrors {
  phone: string;
  email: string;
}

interface OrderSuccess {
  success: boolean;
  orderCode: string;
  totalAmount: number;
  paymentMethod: string;
}

/** Toast notification state — thay thế alert() native block UI */
interface ToastState {
  message: string;
  type: "success" | "error" | "warning";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { items, getTotalPrice, clearSelectedItems } = useCartStore();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Kiểm tra nếu có dữ liệu "Mua ngay" được gửi từ trang chi tiết sản phẩm
  const buyNowItem = location.state?.buyNowItem || null;
  const isBuyNow = !!buyNowItem;

  // Lọc sản phẩm cần thanh toán
  const checkoutItems = useMemo(() => {
    if (isBuyNow && buyNowItem) {
      return [buyNowItem];
    }
    // Chỉ thanh toán các sản phẩm được chọn trong giỏ hàng
    return items.filter((item) => item.selected !== false);
  }, [isBuyNow, buyNowItem, items]);

  // Shipping Info State
  const [formData, setFormData] = useState<FormData>({
    name: user?.full_name || "",
    phone: user?.phone || "",
    email: user?.email || "",
    addressDetail: "",
    note: "",
  });

  const [errors, setErrors] = useState<FormErrors>({ phone: "", email: "" });

  // Location State
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedProv, setSelectedProv] = useState<number | "">("");
  const [selectedDist, setSelectedDist] = useState<number | "">("");
  const [selectedWard, setSelectedWard] = useState<string | "">("");

  // Shipping & Payment Method State
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [paymentMethod, setPaymentMethod] = useState<string>("cod");

  // Payment/Shipping methods from DB
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);

  // User addresses state
  const [userAddresses, setUserAddresses] = useState<UserAddress[]>([]);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [shippingFee, setShippingFee] = useState(30000);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);

  // Coupon picker state
  const [availableCoupons, setAvailableCoupons] = useState<CouponItem[]>([]);
  const [selectedCouponCode, setSelectedCouponCode] = useState<string | null>(null);
  const [couponApplied, setCouponApplied] = useState<{ code: string; message: string } | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);

  // Success Screen State
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccess | null>(null);

  /**
   * Toast Notification State — thay thế alert() native block UI.
   * Hiển thị thông báo mượt mà có màu sắc phân biệt thành công / lỗi / cảnh báo.
   * Tự động ẩn sau 3 giây.
   */
  const [toast, setToast] = useState<ToastState | null>(null);

  /** Hiển thị toast và tự động ẩn sau 3 giây */
  const showToast = useCallback((message: string, type: ToastState["type"] = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /**
   * Áp dụng địa chỉ đã lưu vào form.
   * Định nghĩa ở đây để tránh lỗi sử dụng trước khi khai báo.
   */
  const applySavedAddress = async (addr: UserAddress) => {
    setFormData((prev) => ({
      ...prev,
      name: addr.receiver_name,
      phone: addr.receiver_phone,
      addressDetail: addr.address_detail,
    }));
    setSelectedProv(addr.province_id);
    try {
      const dists = await ghnService.getDistricts(addr.province_id);
      setDistricts(dists);
      setSelectedDist(addr.district_id);
      const wrds = await ghnService.getWards(addr.district_id);
      setWards(wrds);
      setSelectedWard(addr.ward_id);
    } catch (err: unknown) {
      console.error("Failed to load district/ward for saved address", err);
    }
  };

  // ─── Fetch ban đầu: provinces, payment/shipping methods, user addresses ────

  useEffect(() => {
    ghnService
      .getProvinces()
      .then((data) => setProvinces(data))
      .catch((err) => console.error("Failed to load provinces", err));

    // Lấy phương thức thanh toán từ service (không gọi api trực tiếp trong UI)
    getPaymentMethods()
      .then((methods) => {
        setPaymentMethods(methods);
        if (methods.length > 0) setPaymentMethod(methods[0].code);
      })
      .catch((err) => console.error("Failed to load payment methods", err));

    // Lấy phương thức vận chuyển từ service
    getShippingMethods()
      .then((methods) => setShippingMethods(methods))
      .catch((err) => console.error("Failed to load shipping methods", err));

    if (token) {
      // Lấy sổ địa chỉ người dùng từ service
      getUserAddresses()
        .then((addresses) => {
          setUserAddresses(addresses);
          const defaultAddr = addresses.find((a) => a.is_default);
          if (defaultAddr) {
            applySavedAddress(defaultAddr);
            setSelectedSavedAddress(defaultAddr.id);
          }
        })
        .catch((err) => console.error("Failed to load addresses", err));
    }
  }, [token]);



  // Tải quận/huyện khi tỉnh/thành thay đổi
  useEffect(() => {
    if (selectedProv) {
      ghnService
        .getDistricts(Number(selectedProv))
        .then((data) => setDistricts(data))
        .catch(console.error);
    } else {
      Promise.resolve().then(() => setDistricts([]));
    }
  }, [selectedProv]);

  // Tải phường/xã khi quận/huyện thay đổi
  useEffect(() => {
    if (selectedDist) {
      ghnService
        .getWards(Number(selectedDist))
        .then((data) => setWards(data))
        .catch(console.error);
    } else {
      Promise.resolve().then(() => setWards([]));
    }
  }, [selectedDist]);

  const handleSelectSavedAddress = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedSavedAddress(val === "" ? "" : Number(val));
    if (val !== "") {
      const addr = userAddresses.find((a) => a.id === Number(val));
      if (addr) applySavedAddress(addr);
    }
  };

  // ─── Tính phí vận chuyển: debounced + race-condition safe ─────────────────

  useEffect(() => {
    if (!selectedDist || !selectedWard || checkoutItems.length === 0) {
      Promise.resolve().then(() => {
        setShippingFee(0);
        setIsCalculatingFee(false);
      });
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      setIsCalculatingFee(true);
    });

    const timer = setTimeout(() => {
      ghnService
        .getShippingFee({
          to_district_id: Number(selectedDist),
          to_ward_code: selectedWard as string,
          service_type_id: shippingMethod === "standard" ? 2 : 5,
          items: checkoutItems.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        })
         .then((fee) => { if (!cancelled) setShippingFee(fee); })
         .catch(() => { if (!cancelled) setShippingFee(0); })
         .finally(() => { if (!cancelled) setIsCalculatingFee(false); });
    }, 400); // debounce 400ms — tránh gọi API liên tục khi user đang chọn

    return () => {
      cancelled = true; // huỷ response cũ khi dependency thay đổi
      clearTimeout(timer);
    };
  }, [selectedDist, selectedWard, shippingMethod, checkoutItems]);

  // ─── Validation inline ────────────────────────────────────────────────────

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData({ ...formData, phone: val });
    if (val && !/(84|0[3|5|7|8|9])+([0-9]{8})\b/.test(val)) {
      setErrors((prev) => ({ ...prev, phone: "Số điện thoại không hợp lệ" }));
    } else {
      setErrors((prev) => ({ ...prev, phone: "" }));
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData({ ...formData, email: val });
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setErrors((prev) => ({ ...prev, email: "Email không hợp lệ" }));
    } else {
      setErrors((prev) => ({ ...prev, email: "" }));
    }
  };

  // ─── Tải coupon: debounced ────────────────────────────────────────────────

  /**
   * Memo hóa totalPrice để tránh gọi lại coupon API liên tục khi render lại
   * do các state khác (shippingFee, toast, v.v.) thay đổi.
   */
  const totalPrice = useMemo(() => {
    if (isBuyNow && buyNowItem) {
      return buyNowItem.price * buyNowItem.quantity;
    }
    if (checkoutItems.length === 0) return 0;
    return getTotalPrice();
  }, [isBuyNow, buyNowItem, checkoutItems, getTotalPrice]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      // Lấy coupon qua service (không gọi api.get() inline trong component)
      getAvailableCoupons(totalPrice)
        .then((coupons) => setAvailableCoupons(coupons))
        .catch(console.error);
    }, 600); // debounce 600ms — chờ giỏ hàng ổn định
    return () => clearTimeout(timer);
  }, [token, totalPrice]);

  /** Chọn/bỏ chọn mã giảm giá. Gọi service validate để kiểm tra server-side. */
  const selectCoupon = async (coupon: CouponItem) => {
    if (!coupon.is_eligible) return;

    // Bỏ chọn nếu click lại mã đang chọn
    if (selectedCouponCode === coupon.code) {
      setSelectedCouponCode(null);
      setDiscount(0);
      setCouponApplied(null);
      return;
    }

    try {
      // Kiểm tra tính hợp lệ qua service (không gọi api.post inline)
      const result = await validateCoupon(coupon.code, totalPrice);
      if (result.valid) {
        setSelectedCouponCode(coupon.code);
        setDiscount(result.discount_amount);
        setCouponApplied({ code: coupon.code, message: result.message });
      }
    } catch (err: unknown) {
      console.error("Lỗi khi kiểm tra coupon:", err);
    }
  };

  // Tổng tiền cuối cùng (memo để tránh tính lại không cần thiết)
  const finalTotal = useMemo(
    () => totalPrice - discount + shippingFee,
    [totalPrice, discount, shippingFee]
  );

  // ─── Submit đặt hàng ──────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate dữ liệu đầu vào trước khi gọi API — giữ nguyên tầng bảo vệ nghiệp vụ
    if (errors.phone || errors.email) {
      showToast("Vui lòng kiểm tra lại thông tin liên hệ", "warning");
      return;
    }
    if (!selectedProv || !selectedDist || !selectedWard) {
      showToast("Vui lòng chọn đầy đủ địa chỉ giao hàng", "warning");
      return;
    }

    setLoading(true);

    const pName = provinces.find((p) => p.ProvinceID === selectedProv)?.ProvinceName;
    const dName = districts.find((d) => d.DistrictID === selectedDist)?.DistrictName;
    const wName = wards.find((w) => w.WardCode === selectedWard)?.WardName;
    const fullAddress = `${formData.addressDetail}, ${wName}, ${dName}, ${pName}`;

    try {
      // Tìm ID thực từ DB dựa trên service_type_id (2 = standard, 5 = express)
      const targetServiceTypeId = shippingMethod === "standard" ? 2 : 5;
      const shippingMethodObj =
        shippingMethods.find((s) => s.service_type_id === targetServiceTypeId) || shippingMethods[0];

      const paymentMethodObj = paymentMethods.find((p) => p.code === paymentMethod);

      // Tạo đơn hàng qua service (không gọi api.post() inline)
      const orderData = {
        shipping_method_id: shippingMethodObj?.id || 1,
        payment_method_id: paymentMethodObj?.id || 1,
        coupon_id: null,
        coupon_code: couponApplied?.code || null,
        affiliate_referral_code: localStorage.getItem("affiliate_referral_code"),
        affiliate_link_id: localStorage.getItem("affiliate_link_id")
          ? Number(localStorage.getItem("affiliate_link_id"))
          : null,
        receiver_name: formData.name,
        receiver_phone: formData.phone,
        receiver_email: formData.email,
        shipping_full_address: fullAddress,
        to_district_id: selectedDist ? Number(selectedDist) : null,
        to_ward_code: selectedWard || null,
        shipping_fee: shippingFee,
        discount_amount: discount,
        note: formData.note || null,
        items: checkoutItems.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })),
      };

      const order = await createOrder(orderData);

      // Dọn dẹp dữ liệu affiliate sau khi đặt hàng thành công
      localStorage.removeItem("affiliate_referral_code");
      localStorage.removeItem("affiliate_link_id");
      if (isBuyNow) {
        // Luồng mua ngay: giữ nguyên giỏ hàng chính
      } else {
        // Chỉ xóa các mặt hàng được chọn
        clearSelectedItems();
      }

      if (paymentMethod.toLowerCase() === "vnpay") {
        // Lấy URL VNPAY qua service (không gọi api.get() inline)
        const paymentUrl = await getVnpayUrl(
          order.id,
          order.order_code,
          formData.phone || formData.email
        );
        window.location.href = paymentUrl;
      } else {
        // Với COD và Chuyển khoản ngân hàng → hiển thị trang thành công tại chỗ
        setOrderSuccess({
          success: true,
          orderCode: order.order_code,
          totalAmount: order.total_final,
          paymentMethod,
        });
      }
    } catch (err: unknown) {
      // Thay alert() block UI bằng Toast Notification thân thiện
      showToast("Có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại!", "error");
      console.error("Lỗi tạo đơn hàng:", err);
      setLoading(false);
    }
  };

  // ─── Render trạng thái đặc biệt ──────────────────────────────────────────

  if (checkoutItems.length === 0 && !orderSuccess) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">
          {isBuyNow ? "Sản phẩm mua ngay không hợp lệ" : "Giỏ hàng trống hoặc chưa chọn sản phẩm nào để thanh toán"}
        </h2>
        <button
          onClick={() => navigate("/")}
          className="text-primary-600 font-semibold hover:underline"
        >
          Quay lại cửa hàng
        </button>
      </div>
    );
  }

  // Trang thành công — hiển thị sau khi đặt hàng COD / Chuyển khoản
  if (orderSuccess) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Đặt hàng thành công!</h2>
          <p className="text-slate-600 mb-6">
            Cảm ơn bạn đã mua sắm. Mã đơn hàng của bạn là{" "}
            <strong>{orderSuccess.orderCode}</strong>
          </p>

          {orderSuccess.paymentMethod.toLowerCase() === "bank_transfer" && (
            <div className="mt-8 bg-slate-50 p-6 rounded-2xl inline-block text-left">
              <h3 className="text-lg font-bold mb-4 text-center">Quét mã để thanh toán</h3>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4 flex justify-center">
                <img
                  src={`https://img.vietqr.io/image/970436-0123456789-compact2.jpg?amount=${orderSuccess.totalAmount}&addInfo=${orderSuccess.orderCode}&accountName=NGUYEN VAN A`}
                  alt="VietQR"
                  className="w-64 h-64 object-contain"
                />
              </div>
              <ul className="text-sm space-y-2 text-slate-700">
                <li>Ngân hàng: <strong>Vietcombank</strong></li>
                <li>Số tài khoản: <strong>0123456789</strong></li>
                <li>Chủ tài khoản: <strong>NGUYEN VAN A</strong></li>
                <li>
                  Số tiền:{" "}
                  <strong className="text-primary-600">
                    {orderSuccess.totalAmount.toLocaleString("vi-VN")} ₫
                  </strong>
                </li>
                <li>Nội dung: <strong>{orderSuccess.orderCode}</strong></li>
              </ul>
            </div>
          )}

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={() => navigate("/")}
              className="bg-primary-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-primary-700 transition-colors"
            >
              Tiếp tục mua sắm
            </button>
            <Link
              to="/order-lookup"
              className="rounded-xl border border-slate-200 px-8 py-3 font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Tra cứu đơn hàng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render chính ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">

      {/* Toast Notification — thay thế alert() native block UI.
          Hiển thị góc trên bên phải, tự ẩn sau 3 giây, có màu phân biệt loại. */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[200] max-w-sm px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm flex items-center gap-2 animate-fade-in-down ${
            toast.type === "success"
              ? "bg-green-600"
              : toast.type === "warning"
              ? "bg-amber-500"
              : "bg-red-600"
          }`}
        >
          <span>
            {toast.type === "success" ? "✅" : toast.type === "warning" ? "⚠️" : "❌"}
          </span>
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* LEFT COLUMN: Main Content */}
        <div className="lg:col-span-3 space-y-8">

          {/* STEP 1: Shipping Info */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                1
              </span>
              <h2 className="text-xl font-bold text-slate-900">Thông tin giao hàng</h2>
            </div>

            {userAddresses.length > 0 && (
              <div className="mb-6 p-4 bg-primary-50 rounded-xl border border-primary-100">
                <label className="block text-sm font-medium text-primary-900 mb-2">
                  Chọn từ sổ địa chỉ của bạn
                </label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl border border-primary-200 outline-none bg-white text-primary-900 font-medium"
                  value={selectedSavedAddress}
                  onChange={handleSelectSavedAddress}
                >
                  <option value="">-- Nhập địa chỉ mới --</option>
                  {userAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.receiver_name} - {addr.receiver_phone} - {addr.address_detail}{" "}
                      {addr.is_default ? "(Mặc định)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
                <input
                  required
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="Nhập họ và tên"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <input
                  required
                  type="tel"
                  className={`w-full px-4 py-2.5 rounded-xl border ${errors.phone ? "border-red-500 bg-red-50" : "border-slate-200"} focus:ring-2 focus:ring-primary-500 outline-none transition-all`}
                  placeholder="Ví dụ: 0912345678"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  required
                  type="email"
                  className={`w-full px-4 py-2.5 rounded-xl border ${errors.email ? "border-red-500 bg-red-50" : "border-slate-200"} focus:ring-2 focus:ring-primary-500 outline-none transition-all`}
                  placeholder="Ví dụ: email@domain.com"
                  value={formData.email}
                  onChange={handleEmailChange}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {/* Address Dropdowns */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tỉnh / Thành phố</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                    value={selectedProv}
                    onChange={(e) => {
                      setSelectedProv(Number(e.target.value));
                      setSelectedDist("");
                      setSelectedWard("");
                    }}
                  >
                    <option value="">Chọn Tỉnh/Thành</option>
                    {provinces.map((p) => (
                      <option key={p.ProvinceID} value={p.ProvinceID}>{p.ProvinceName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quận / Huyện</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                    value={selectedDist}
                    onChange={(e) => { setSelectedDist(Number(e.target.value)); setSelectedWard(""); }}
                    disabled={!selectedProv}
                  >
                    <option value="">Chọn Quận/Huyện</option>
                    {districts.map((d) => (
                      <option key={d.DistrictID} value={d.DistrictID}>{d.DistrictName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phường / Xã</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                    value={selectedWard}
                    onChange={(e) => setSelectedWard(e.target.value)}
                    disabled={!selectedDist}
                  >
                    <option value="">Chọn Phường/Xã</option>
                    {wards.map((w) => (
                      <option key={w.WardCode} value={w.WardCode}>{w.WardName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="md:col-span-2 mt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Địa chỉ cụ thể (Số nhà, đường...)
                </label>
                <input
                  required
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="Ví dụ: Số 10, Ngõ 20, Đường ABC"
                  value={formData.addressDetail}
                  onChange={(e) => setFormData({ ...formData, addressDetail: e.target.value })}
                />
              </div>

              <div className="md:col-span-2 mt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ghi chú đơn hàng <span className="text-slate-400 font-normal">(tuỳ chọn)</span>
                </label>
                <textarea
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none transition-all resize-none"
                  placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi giao..."
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            </div>
          </section>

          {/* STEP 2: Shipping Method */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                2
              </span>
              <h2 className="text-xl font-bold text-slate-900">Phương thức vận chuyển</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={`cursor-pointer flex items-center p-4 border rounded-xl transition-all ${shippingMethod === "standard" ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-primary-200"}`}>
                <input
                  type="radio" name="shipping"
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  checked={shippingMethod === "standard"}
                  onChange={() => setShippingMethod("standard")}
                />
                <div className="ml-3 flex-1">
                  <span className="block font-semibold text-slate-900">Giao hàng tiêu chuẩn</span>
                  <span className="block text-sm text-slate-500">Dự kiến 3-5 ngày</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">
                  {shippingMethod === "standard"
                    ? isCalculatingFee ? "Đang tính..." : `${shippingFee.toLocaleString("vi-VN")} ₫`
                    : "Theo GHN"}
                </span>
              </label>

              <label className={`cursor-pointer flex items-center p-4 border rounded-xl transition-all ${shippingMethod === "express" ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-primary-200"}`}>
                <input
                  type="radio" name="shipping"
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  checked={shippingMethod === "express"}
                  onChange={() => setShippingMethod("express")}
                />
                <div className="ml-3 flex-1">
                  <span className="block font-semibold text-slate-900">Giao hàng hỏa tốc</span>
                  <span className="block text-sm text-slate-500">Dự kiến 1-2 ngày</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">
                  {shippingMethod === "express"
                    ? isCalculatingFee ? "Đang tính..." : `${shippingFee.toLocaleString("vi-VN")} ₫`
                    : "Theo GHN"}
                </span>
              </label>
            </div>
          </section>

          {/* STEP 3: Payment Method */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                3
              </span>
              <h2 className="text-xl font-bold text-slate-900">Phương thức thanh toán</h2>
            </div>
            <div className="space-y-3">
              {paymentMethods.length === 0 ? (
                <p className="text-slate-400 text-sm">Đang tải phương thức thanh toán...</p>
              ) : (
                paymentMethods.map((pm) => {
                  // iconMap được định nghĩa trong scope render loop để tránh re-render thừa
                  const iconMap: Record<string, React.ReactNode> = {
                    cod: (
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                    ),
                    bank_transfer: (
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                    ),
                    vnpay: (
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden p-1">
                        <img src="https://vnpay.vn/s1/vnpay/asset/images/logo-vnpay.png" alt="VNPAY" className="object-contain w-full h-full" />
                      </div>
                    ),
                  };
                  return (
                    <label
                      key={pm.code}
                      className={`cursor-pointer flex items-center p-4 border rounded-xl transition-all ${paymentMethod === pm.code ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-primary-200"}`}
                    >
                      <input
                        type="radio" name="payment"
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        checked={paymentMethod === pm.code}
                        onChange={() => setPaymentMethod(pm.code)}
                      />
                      <div className="ml-4 flex items-center gap-3">
                        {iconMap[pm.code.toLowerCase()] ?? (
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-xs">
                            {pm.code.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="block font-semibold text-slate-900">{pm.name}</span>
                          {pm.description && <span className="block text-sm text-slate-500">{pm.description}</span>}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Sticky Order Summary */}
        <div className="lg:col-span-2">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 sticky top-24">
            <h2 className="text-xl font-bold mb-6 text-slate-900">Tóm tắt đơn hàng</h2>

            <div className="space-y-4 mb-6 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin">
              {checkoutItems.map((item) => (
                <div key={item.variant_id} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                      />
                      <span className="absolute -top-2 -right-2 bg-slate-800 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="max-w-[150px]">
                      <span className="font-semibold text-sm line-clamp-2 text-slate-800 leading-tight">
                        {item.name}
                      </span>
                      {item.variant_info && (
                        <span className="text-xs text-slate-500 mt-1 block">{item.variant_info}</span>
                      )}
                    </div>
                  </div>
                  <span className="font-bold text-slate-900 text-sm shrink-0">
                    {(item.price * item.quantity).toLocaleString("vi-VN")} ₫
                  </span>
                </div>
              ))}
            </div>

            {/* Coupon Picker */}
            <div className="border-t border-slate-200 pt-5 mb-6">
              {/* Header — luôn hiện, click để toggle */}
              <button
                type="button"
                onClick={() => token && setCouponOpen((o) => !o)}
                className={`w-full flex items-center justify-between py-1 group ${token ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span>🎫</span>
                  Mã giảm giá
                  {couponApplied && (
                    <span className="text-xs font-mono text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      {couponApplied.code}
                    </span>
                  )}
                </span>
                {!token ? (
                  <span className="text-xs text-slate-400 italic">Đăng nhập để dùng</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-primary-600 font-medium group-hover:text-primary-700">
                    {couponOpen
                      ? "Thu gọn"
                      : availableCoupons.length > 0
                      ? `${availableCoupons.length} mã`
                      : "Xem mã"}
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${couponOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                )}
              </button>

              {/* Collapsible coupon list */}
              {couponOpen && token && (
                <div className="mt-3">
                  {availableCoupons.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Hiện không có mã giảm giá nào</p>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                      {availableCoupons.map((coupon) => {
                        const isSelected = selectedCouponCode === coupon.code;
                        return (
                          <button
                            key={coupon.id}
                            type="button"
                            onClick={() => selectCoupon(coupon)}
                            disabled={!coupon.is_eligible}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                              isSelected
                                ? "border-green-500 bg-green-50"
                                : coupon.is_eligible
                                ? "border-slate-200 hover:border-primary-400 hover:bg-primary-50 cursor-pointer"
                                : "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`font-bold text-sm font-mono tracking-wide ${
                                    isSelected ? "text-green-700" : coupon.is_eligible ? "text-slate-900" : "text-slate-400"
                                  }`}>
                                    {coupon.code}
                                  </span>
                                  {coupon.is_used && (
                                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-medium">Đã dùng</span>
                                  )}
                                  {isSelected && (
                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">✓ Đang dùng</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">{coupon.description}</p>
                                {coupon.ineligible_reason && (
                                  <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                    <span>⚠</span>{coupon.ineligible_reason}
                                  </p>
                                )}
                              </div>
                              {coupon.expired_at && (
                                <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                                  HSD: {new Date(coupon.expired_at).toLocaleDateString("vi-VN")}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {couponApplied && !couponOpen && (
                <p className="text-xs text-green-600 mt-2 font-medium flex items-center gap-1">
                  <span>✅</span> {couponApplied.message}
                </p>
              )}
            </div>

            {/* Price Summary */}
            <div className="space-y-3 border-t border-slate-200 pt-5 mb-5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính</span>
                <span className="font-medium text-slate-900">{totalPrice.toLocaleString("vi-VN")} ₫</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Giảm giá</span>
                  <span>-{discount.toLocaleString("vi-VN")} ₫</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Phí vận chuyển</span>
                <span className="font-medium text-slate-900">
                  {isCalculatingFee ? "Đang tính..." : `${shippingFee.toLocaleString("vi-VN")} ₫`}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 mb-6 flex justify-between items-end">
              <span className="font-bold text-slate-800">Tổng thanh toán</span>
              <div className="text-right">
                <span className="text-2xl font-black text-primary-600 block leading-none">
                  {finalTotal.toLocaleString("vi-VN")} ₫
                </span>
                <span className="text-xs text-slate-400 font-normal mt-1 block">Đã bao gồm VAT (nếu có)</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-primary-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-primary-700 hover:shadow-lg disabled:opacity-70 disabled:hover:shadow-md transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Đang xử lý...
                </>
              ) : (
                "ĐẶT HÀNG NGAY"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
