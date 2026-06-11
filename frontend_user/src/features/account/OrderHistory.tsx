import { useEffect, useState, useMemo, useCallback, type ChangeEvent } from "react";
import { getErrorMessage } from "../../services/api";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  ImagePlus,
  MapPin,
  Package,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import {
  getMyOrders,
  cancelOrder,
  type Order,
  type OrderItem,
  type OrderItemReview,
} from "../../services/orderService";
import {
  createProductReviewApi,
  updateProductReviewApi,
  deleteProductReviewApi,
} from "../../services/productService";

const ORDER_PAGE_SIZE = 10;

type StatusFilter = "all" | Order["status"];

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    label: "Chờ xác nhận",
    dot: "bg-amber-400",
  },
  confirmed: {
    icon: CheckCircle,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    label: "Đã xác nhận",
    dot: "bg-blue-400",
  },
  shipping: {
    icon: Truck,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    badge: "bg-indigo-100 text-indigo-700",
    label: "Đang giao hàng",
    dot: "bg-indigo-400",
  },
  success: {
    icon: CheckCircle,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Hoàn thành",
    dot: "bg-emerald-400",
  },
  cancelled: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-600",
    label: "Đã hủy",
    dot: "bg-red-400",
  },
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "pending", label: "Chờ xác nhận" },
  { key: "confirmed", label: "Đã xác nhận" },
  { key: "shipping", label: "Đang giao" },
  { key: "success", label: "Hoàn thành" },
  { key: "cancelled", label: "Đã hủy" },
];

const CANCELLABLE_STATUSES: Order["status"][] = ["pending", "confirmed"];
const MAX_REVIEW_IMAGES = 4;
const MAX_REVIEW_IMAGE_SIZE = 700 * 1024;

function formatVND(amount: number) {
  return `${Number(amount).toLocaleString("vi-VN")} ₫`;
}

function getAttributeLabel(attrs: Record<string, string> | null) {
  if (!attrs) return "";
  return Object.values(attrs).filter(Boolean).join(" / ");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ReviewStars({
  rating,
  size = "w-4 h-4",
  interactive = false,
  onSelect,
}: {
  rating: number;
  size?: string;
  interactive?: boolean;
  onSelect?: (rating: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onSelect?.(star)}
          disabled={!interactive}
          className={interactive ? "transition-transform hover:scale-110" : "cursor-default"}
        >
          <Star
            className={`${size} ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "fill-slate-200 text-slate-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  onCancelled,
  onReviewSaved,
  onReviewDeleted,
}: {
  order: Order;
  onCancelled: (id: number) => void;
  onReviewSaved: (orderId: number, itemId: number, review: OrderItemReview) => void;
  onReviewDeleted: (orderId: number, itemId: number) => void;
}) {
  const { token } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reviewingItemId, setReviewingItemId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [reviewImageError, setReviewImageError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);

  const cfg = STATUS_CONFIG[order.status];
  const StatusIcon = cfg.icon;
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const previewItems = order.items.slice(0, 2);
  const reviewingItem = order.items.find((item) => item.id === reviewingItemId) || null;

  const closeReviewForm = () => {
    setReviewingItemId(null);
    setReviewRating(5);
    setReviewComment("");
    setReviewImages([]);
    setReviewImageError("");
  };

  const openReviewForm = (item: OrderItem) => {
    setReviewingItemId(item.id);
    setReviewRating(item.review?.rating ?? 5);
    setReviewComment(item.review?.comment ?? "");
    setReviewImages(item.review?.images ?? []);
    setReviewImageError("");
  };

  const handleCancel = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đơn hàng ${order.order_code}?\nHành động này không thể hoàn tác.`)) {
      return;
    }

    setCancelling(true);
    try {
      await cancelOrder(order.id);
      onCancelled(order.id);
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Hủy đơn thất bại. Vui lòng thử lại."));
    } finally {
      setCancelling(false);
    }
  };

  const handleReviewImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const availableSlots = MAX_REVIEW_IMAGES - reviewImages.length;
    if (availableSlots <= 0) {
      setReviewImageError(`Tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá.`);
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const invalidFile = selectedFiles.find(
      (file) => !file.type.startsWith("image/") || file.size > MAX_REVIEW_IMAGE_SIZE,
    );
    if (invalidFile) {
      setReviewImageError("Ảnh phải đúng định dạng và nhỏ hơn 700KB.");
      return;
    }

    try {
      const dataUrls = await Promise.all(selectedFiles.map(readFileAsDataUrl));
      setReviewImages((current) => [...current, ...dataUrls].slice(0, MAX_REVIEW_IMAGES));
      setReviewImageError("");
    } catch {
      setReviewImageError("Không thể đọc ảnh. Vui lòng thử ảnh khác.");
    }
  };

  const removeReviewImage = (index: number) => {
    setReviewImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setReviewImageError("");
  };

  const handleSubmitReview = async (item: OrderItem) => {
    if (!token || !item.product) return;

    setSubmittingReview(true);
    try {
      const payload = item.review
        ? {
            rating: reviewRating,
            comment: reviewComment.trim() || null,
            images: reviewImages,
          }
        : {
            order_item_id: item.id,
            rating: reviewRating,
            comment: reviewComment.trim() || null,
            images: reviewImages,
          };

      const res = item.review
        ? await updateProductReviewApi(item.product.product_id, item.review.id, payload)
        : await createProductReviewApi(item.product.product_id, payload);

      onReviewSaved(order.id, item.id, {
        id: res.id,
        rating: res.rating,
        comment: res.comment,
        images: res.images,
        status: res.status,
      });
      closeReviewForm();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gửi đánh giá thất bại. Vui lòng thử lại."));
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (item: OrderItem) => {
    if (!token || !item.product || !item.review) return;
    if (!window.confirm("Bạn có chắc muốn xóa đánh giá này?")) return;

    setDeletingReviewId(item.review.id);
    try {
      await deleteProductReviewApi(item.product.product_id, item.review.id);
      onReviewDeleted(order.id, item.id);
      if (reviewingItemId === item.id) closeReviewForm();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Xóa đánh giá thất bại. Vui lòng thử lại."));
    } finally {
      setDeletingReviewId(null);
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md ${
        expanded ? cfg.border : "border-slate-100 hover:border-slate-200"
      }`}
    >
      <div className={`flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center ${expanded ? cfg.bg : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${cfg.badge}`}>
            <StatusIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          <span className="text-sm font-bold text-slate-800">{order.order_code}</span>
          <span className="text-xs text-slate-400">{new Date(order.created_at).toLocaleString("vi-VN")}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium text-slate-400">Tổng thanh toán</p>
            <p className="text-base font-black text-slate-900">{formatVND(order.total_final)}</p>
          </div>
          <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${
            order.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            {order.payment_status === "paid" ? "Đã thanh toán" : "Chưa TT"}
          </span>
        </div>
      </div>

      {!expanded && order.items.length > 0 && (
        <div className="flex items-center gap-3 border-t border-slate-50 px-5 py-3">
          <div className="flex -space-x-2">
            {previewItems.map((item) =>
              item.product?.thumbnail ? (
                <img
                  key={item.id}
                  src={item.product.thumbnail}
                  alt={item.product.product_name}
                  className="h-9 w-9 rounded-lg border-2 border-white object-cover shadow-sm"
                />
              ) : (
                <div key={item.id} className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-white bg-slate-100">
                  <ShoppingBag className="h-4 w-4 text-slate-400" />
                </div>
              ),
            )}
          </div>
          <p className="flex-1 truncate text-sm text-slate-600">
            {previewItems.map((item) => item.product?.product_name || `Sản phẩm #${item.variant_id}`).join(", ")}
            {order.items.length > 2 && <span className="text-slate-400"> +{order.items.length - 2} sản phẩm</span>}
          </p>
          <span className="shrink-0 text-xs text-slate-400">{totalItems} sản phẩm</span>
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-5 pb-5">
          <div className="mt-4 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Sản phẩm trong đơn ({totalItems})</p>
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                {item.product?.thumbnail ? (
                  <img
                    src={item.product.thumbnail}
                    alt={item.product.product_name}
                    className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-200">
                    <ShoppingBag className="h-6 w-6 text-slate-400" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {item.product?.product_name || `Sản phẩm #${item.variant_id}`}
                  </p>
                  {item.product?.attributes && <p className="mt-0.5 text-xs text-slate-500">{getAttributeLabel(item.product.attributes)}</p>}
                  {item.sku && <p className="mt-0.5 font-mono text-[10px] text-slate-400">SKU: {item.sku}</p>}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-800">{formatVND(item.price)}</p>
                  <p className="text-xs text-slate-500">× {item.quantity}</p>

                  {order.status === "success" && item.product && (
                    <div className="mt-2 flex justify-end">
                      {item.review ? (
                        <div className="flex flex-col items-end gap-1">
                          <ReviewStars rating={item.review.rating} size="w-3 h-3" />
                          <span className="text-[10px] font-bold text-emerald-600">Đã đánh giá</span>
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              onClick={() => openReviewForm(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-slate-300"
                            >
                              <Pencil className="h-3 w-3" /> Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteReview(item)}
                              disabled={deletingReviewId === item.review.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-3 w-3" /> Xóa
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReviewForm(item)}
                          className="rounded-lg border border-yellow-200 bg-yellow-50 px-2 py-1 text-[10px] font-bold text-yellow-700 hover:bg-yellow-100"
                        >
                          Đánh giá
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Chi tiết thanh toán</p>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tạm tính</span>
              <span className="font-semibold">{formatVND(order.total_base_price)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Phí vận chuyển
              </span>
              <span className="font-semibold">{formatVND(order.shipping_fee)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Giảm giá{order.coupon_code ? ` (${order.coupon_code})` : ""}
                </span>
                <span className="font-semibold">-{formatVND(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-slate-900">
              <span>Tổng cộng</span>
              <span className="text-base">{formatVND(order.total_final)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Địa chỉ giao hàng</p>
              <p className="text-sm font-bold text-slate-800">
                {order.receiver_name}
                {order.receiver_phone && <span className="font-medium text-slate-500"> · {order.receiver_phone}</span>}
              </p>
              <p className="mt-1 flex gap-1 text-xs leading-relaxed text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                {order.shipping_full_address}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400">
                <Truck className="h-3.5 w-3.5" /> Vận chuyển GHN
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Trạng thái:</span>
                  <span className="text-xs font-bold text-indigo-600">{order.ghn_status || "Chờ cập nhật"}</span>
                </div>
                {order.shipping_order_code && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Mã vận đơn:</span>
                    <span className="font-mono text-xs font-bold text-slate-700">{order.shipping_order_code}</span>
                  </div>
                )}
                {order.expected_delivery_time && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Dự kiến giao:</span>
                    <span className="text-xs font-bold text-slate-700">
                      {new Date(order.expected_delivery_time).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <CreditCard className="h-3 w-3" /> Thanh toán:
                  </span>
                  <span className={`text-xs font-bold ${order.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>
                    {order.payment_status === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {order.note && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="mb-1 text-xs font-bold text-amber-700">Ghi chú</p>
              <p className="text-sm text-amber-800">{order.note}</p>
            </div>
          )}
        </div>
      )}

      {reviewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-yellow-700">Đánh giá sản phẩm</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {reviewingItem.product?.product_name || `Sản phẩm #${reviewingItem.variant_id}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewForm}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng đánh giá"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-yellow-100 bg-yellow-50/70 p-4">
                <ReviewStars rating={reviewRating} size="w-8 h-8" interactive onSelect={setReviewRating} />
              </div>

              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Chia sẻ trải nghiệm của bạn về chất liệu, form dáng, giao hàng..."
                className="min-h-[140px] w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
              />

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {reviewImages.map((image, index) => (
                    <div key={`${image.slice(0, 24)}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <img src={image} alt={`Ảnh đánh giá ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReviewImage(index)}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/80 p-1 text-white hover:bg-slate-900"
                        aria-label="Xóa ảnh đánh giá"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {reviewImages.length < MAX_REVIEW_IMAGES && (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-yellow-300 bg-yellow-50 text-[10px] font-bold uppercase tracking-wider text-yellow-700 hover:bg-yellow-100">
                      <ImagePlus className="mb-1 h-5 w-5" />
                      Ảnh
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleReviewImageChange} />
                    </label>
                  )}
                </div>
                {reviewImageError && <p className="text-xs font-medium text-red-500">{reviewImageError}</p>}
                <p className="text-[10px] font-medium text-slate-400">Tối đa {MAX_REVIEW_IMAGES} ảnh, mỗi ảnh dưới 700KB.</p>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeReviewForm}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleSubmitReview(reviewingItem)}
                disabled={submittingReview}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingReview ? "Đang lưu..." : reviewingItem.review ? "Lưu đánh giá" : "Gửi đánh giá"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`flex items-center border-t ${expanded ? "border-slate-100" : "border-slate-50"}`}>
        {CANCELLABLE_STATUSES.includes(order.status) && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="flex shrink-0 items-center gap-1.5 border-r border-slate-100 px-4 py-2.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang hủy...
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5" /> Hủy đơn
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors ${
            expanded ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Thu gọn
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Xem chi tiết đơn hàng
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const fetchOrders = useCallback(async (nextPage = 0, append = false) => {
    // Yield to the microtask queue to avoid synchronous state updates in useEffect
    await Promise.resolve();

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const payload = await getMyOrders({
        skip: nextPage * ORDER_PAGE_SIZE,
        limit: ORDER_PAGE_SIZE,
      });
      const nextOrders = Array.isArray(payload) ? payload : payload.data || [];
      setOrders((current) => (append ? [...current, ...nextOrders] : nextOrders));
      setPage(nextPage);
      setHasMore(Array.isArray(payload) ? nextOrders.length === ORDER_PAGE_SIZE : Boolean(payload.has_more));
    } catch (error) {
      console.error("Lỗi khi tải lịch sử đơn hàng:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchOrders();
    });
  }, [fetchOrders]);

  const filtered = filter === "all" ? orders : orders.filter((order) => order.status === filter);

  // TỐI ƯU HÓA THUẬT TOÁN: Tính toán trước số lượng đơn hàng theo trạng thái trong 1 vòng lặp O(N) duy nhất bằng useMemo.
  // Thay vì quét mảng O(N) lặp đi lặp lại nhiều lần (6 lần cho 6 tabs) trong render loop, ta lưu trữ tần suất vào một map.
  // Nhờ đó, việc truy cập số lượng đếm tại mỗi tab bộ lọc chỉ mất O(1).
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (let i = 0; i < orders.length; i++) {
      const status = orders[i].status;
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const count = statusCounts[tab.key] || 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === tab.key ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                  filter === tab.key ? "bg-white/20 text-white" : "bg-slate-300 text-slate-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => fetchOrders()}
          className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="Làm mới"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <Package className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="text-base font-bold text-slate-500">
            {filter === "all" ? "Bạn chưa có đơn hàng nào." : `Không có đơn hàng "${FILTER_TABS.find((tab) => tab.key === filter)?.label}".`}
          </p>
          <p className="mt-1 text-sm text-slate-400">Hãy bắt đầu mua sắm ngay!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onCancelled={(id) =>
                setOrders((current) => current.map((item) => (item.id === id ? { ...item, status: "cancelled" } : item)))
              }
              onReviewSaved={(orderId, itemId, review) =>
                setOrders((current) =>
                  current.map((item) =>
                    item.id === orderId
                      ? {
                          ...item,
                          items: item.items.map((orderItem) => (orderItem.id === itemId ? { ...orderItem, review } : orderItem)),
                        }
                      : item,
                  ),
                )
              }
              onReviewDeleted={(orderId, itemId) =>
                setOrders((current) =>
                  current.map((item) =>
                    item.id === orderId
                      ? {
                          ...item,
                          items: item.items.map((orderItem) => (orderItem.id === itemId ? { ...orderItem, review: null } : orderItem)),
                        }
                      : item,
                  ),
                )
              }
            />
          ))}
          {filter === "all" && hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchOrders(page + 1, true)}
                className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? "Đang tải..." : "Tải thêm đơn hàng"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
