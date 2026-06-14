import { useState, useEffect } from "react";
import { getErrorMessage } from "../../services/api";
import { getVnpayUrl, lookupOrder, type Order as LookupOrder } from "../../services/orderService";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, CreditCard, MapPin, Package, Search, Truck } from "lucide-react";


const STATUS_LABELS: Record<LookupOrder["status"], string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  success: "Hoàn thành",
  cancelled: "Đã hủy",
};

const STATUS_CLASS: Record<LookupOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  shipping: "bg-indigo-100 text-indigo-700",
  success: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

function formatVND(amount: number) {
  return Number(amount).toLocaleString("vi-VN") + " ₫";
}

function getAttributeLabel(attrs: Record<string, string> | null) {
  if (!attrs) return "";
  return Object.values(attrs).filter(Boolean).join(" / ");
}

export default function OrderLookupPage() {
  const [searchParams] = useSearchParams();
  const paramOrderCode = searchParams.get("order_code") || "";
  const paramContact = searchParams.get("contact") || "";
  const paymentResult = searchParams.get("payment_result");

  const [orderCode, setOrderCode] = useState(paramOrderCode);
  const [contact, setContact] = useState(paramContact);
  const [order, setOrder] = useState<LookupOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    setError("");
    setOrder(null);

    const currentOrderCode = orderCode.trim();
    const currentContact = contact.trim();

    if (!currentOrderCode || !currentContact) {
      setError("Vui lòng nhập mã đơn hàng và số điện thoại/email.");
      return;
    }

    setLoading(true);
    try {
      const data = await lookupOrder(currentOrderCode, currentContact);
      setOrder(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Không tìm thấy đơn hàng phù hợp."));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!order) return;
    setRetryingPayment(true);
    setError("");
    try {
      window.location.href = await getVnpayUrl(order.id, order.order_code, contact.trim());
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Không thể tạo lại giao dịch VNPay."));
      setRetryingPayment(false);
    }
  };

  // Tự động tìm kiếm nếu có tham số truyền vào từ URL (ví dụ chuyển hướng sau khi thanh toán VNPay)
  useEffect(() => {
    if (paramOrderCode && paramContact) {
      const autoLookup = async () => {
        setLoading(true);
        setError("");
        try {
          const data = await lookupOrder(paramOrderCode, paramContact);
          setOrder(data);
        } catch (err: unknown) {
          setError(getErrorMessage(err, "Không tìm thấy đơn hàng phù hợp."));
        } finally {
          setLoading(false);
        }
      };

      autoLookup();
    }
  }, [paramOrderCode, paramContact]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">
            Trang chủ
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">Tra cứu đơn hàng</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Tra cứu đơn hàng</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Dùng cho khách mua không đăng nhập hoặc cần kiểm tra nhanh trạng thái đơn.
                </p>
              </div>
            </div>

            {paymentResult && (
              <div className={`mb-4 rounded-xl p-3 text-sm font-medium ${
                paymentResult === "accepted" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
              }`}>
                {paymentResult === "accepted"
                  ? "VNPay đã tiếp nhận giao dịch. Trạng thái thanh toán sẽ được xác nhận qua IPN; vui lòng tra cứu lại đơn hàng."
                  : "Giao dịch VNPay chưa thành công. Đơn hàng vẫn có thể được thanh toán lại."}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Mã đơn hàng
                </label>
                <input
                  required
                  value={orderCode}
                  onChange={(event) => setOrderCode(event.target.value)}
                  placeholder="Ví dụ: ORDER_ABC12345"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Số điện thoại hoặc email nhận hàng
                </label>
                <input
                  required
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="Số điện thoại hoặc email"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              {order?.payment_method_code === "VNPAY"
                && order.payment_status === "unpaid"
                && ["pending", "confirmed"].includes(order.status) && (
                <button
                  type="button"
                  disabled={retryingPayment}
                  onClick={handleRetryPayment}
                  className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-md transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {retryingPayment ? "Đang mở VNPay..." : "Thanh toán lại bằng VNPay"}
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary-600 py-3 font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? "Đang tra cứu..." : "Tra cứu"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            {!order ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                <Package className="mb-4 h-12 w-12 text-slate-300" />
                <h2 className="font-bold text-slate-900">Thông tin đơn hàng sẽ hiển thị tại đây</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Nhập đúng mã đơn và thông tin liên hệ đã dùng khi đặt hàng.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                    <h2 className="mt-3 text-xl font-black text-slate-900">{order.order_code}</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(order.created_at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-medium text-slate-400">Tổng thanh toán</p>
                    <p className="text-2xl font-black text-primary-600">
                      {formatVND(order.total_final)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      {item.product?.thumbnail ? (
                        <img
                          src={item.product.thumbnail}
                          alt={item.product.product_name}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-200">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {item.product?.product_name || `Sản phẩm #${item.variant_id}`}
                        </p>
                        {item.product?.attributes && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {getAttributeLabel(item.product.attributes)}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">Số lượng: {item.quantity}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-900">
                        {formatVND(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-bold text-slate-900">
                        {order.receiver_name}
                        {order.receiver_phone && <span className="font-medium text-slate-500"> · {order.receiver_phone}</span>}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{order.shipping_full_address}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      Vận chuyển: {order.ghn_status || "Chờ cập nhật"}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" />
                      Thanh toán: {order.payment_status === "paid" ? "Đã thanh toán" : order.payment_status === "refunded" ? "Đã hoàn tiền" : "Chưa thanh toán"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-100 p-4 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Tạm tính</span>
                    <span className="font-semibold text-slate-900">{formatVND(order.total_base_price)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Phí vận chuyển</span>
                    <span className="font-semibold text-slate-900">{formatVND(order.shipping_fee)}</span>
                  </div>
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Giảm giá{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
                      <span className="font-semibold">-{formatVND(order.discount_amount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
