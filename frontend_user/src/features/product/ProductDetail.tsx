import { useCallback, useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getProductDetailApi,
  getProductsCardsApi,
  getProductReviewsApi,
  recordAffiliateClickApi,
  type Product,
  type ProductVariant,
  type ProductReview,
  type ProductReviewSummary,
} from "../../services/productService";
import type { ProductGridItem } from "./ProductGrid";
import {
  ShoppingCart,
  Share2,
  Star,
  Heart,
  Truck,
  ShieldCheck,
  RefreshCcw,
  ChevronRight,
  Zap,
  Flame,
  Wind,
  Layers,
  Package,
  CheckCircle,
} from "lucide-react";
import { useCartStore } from "../../store/cartStore";

const REVIEW_PAGE_SIZE = 5;

/**
 * Bản đồ màu sắc tiếng Việt → mã hex.
 * Được đặt như hằng số module-level (ngoài component) để tránh khởi tạo lại object O(K)
 * mỗi lần render. K = 20 màu, Tối ưu: từ O(K × N_renders) xuống O(K × 1).
 */
const COLOR_MAP: Record<string, string> = {
  Trắng: "#ffffff",
  Đen: "#111827",
  Xám: "#94a3b8",
  "Xám nhạt": "#e2e8f0",
  "Xám đậm": "#475569",
  Be: "#f5f5dc",
  Hồng: "#fda4af",
  Xanh: "#3b82f6",
  "Xanh dương": "#2563eb",
  "Xanh navy": "#1e3a8a",
  "Xanh lá": "#22c55e",
  Rêu: "#4d7c0f",
  "Xanh rêu": "#3f6212",
  Nâu: "#78350f",
  "Nâu nhạt": "#d97706",
  Đỏ: "#ef4444",
  "Đỏ đô": "#7f1d1d",
  Vàng: "#eab308",
  Cam: "#f97316",
  Tím: "#a855f7",
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<ProductGridItem[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary>({
    average_rating: 0,
    total_reviews: 0,
    rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  });
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<string>("details");

  const addToCart = useCartStore((state) => state.addToCart);
  // State thông báo thêm giỏ hàng — thay thế alert() native block UI.
  const [cartSuccessMsg, setCartSuccessMsg] = useState<string | null>(null);

  const fetchReviews = useCallback(async (productId: string, nextPage = 0, append = false) => {
    setReviewsLoading(true);
    try {
      const data = await getProductReviewsApi(productId, {
        skip: nextPage * REVIEW_PAGE_SIZE,
        limit: REVIEW_PAGE_SIZE,
      });
      setReviews((current) =>
        append ? [...current, ...(data.reviews || [])] : data.reviews || [],
      );
      setReviewPage(nextPage);
      setReviewsHasMore(Boolean(data.has_more));
      setReviewSummary(
        data.summary || {
          average_rating: 0,
          total_reviews: 0,
          rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        },
      );
    } catch (reviewErr) {
      console.error("Error fetching product reviews", reviewErr);
      if (!append) {
        setReviews([]);
        setReviewsHasMore(false);
        setReviewSummary({
          average_rating: 0,
          total_reviews: 0,
          rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        });
      }
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchProductData = async () => {
      setLoading(true);
      try {
        const prod = await getProductDetailApi(String(id));
        setProduct(prod);
        if (prod.variants && prod.variants.length > 0) {
          const first = prod.variants[0];
          setSelectedSize(first.attributes.size || null);
          setSelectedColor(first.attributes.color || null);
          setSelectedVariant(first);
        }

        await fetchReviews(String(id), 0, false);

        // Fetch related products (cùng danh mục)
        const relatedRes = await getProductsCardsApi({
          category_id: prod.category_id,
          limit: 5,
          include_facets: false,
        });
        setRelatedProducts(
          (relatedRes.data || []).filter((p: ProductGridItem) => p.id !== prod.id).slice(0, 4),
        );
      } catch (err) {
        console.error("Error fetching product", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProductData();
  }, [fetchReviews, id]);

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref");
    if (!referralCode) return;

    const affiliateLinkId = new URLSearchParams(window.location.search).get("campaign");
    localStorage.setItem("affiliate_referral_code", referralCode);
    if (affiliateLinkId) {
      localStorage.setItem("affiliate_link_id", affiliateLinkId);
    }
    const clickKey = `affiliate_click_recorded:${referralCode}:${window.location.pathname}`;
    if (sessionStorage.getItem(clickKey)) return;
    sessionStorage.setItem(clickKey, "1");

    recordAffiliateClickApi({
      referral_code: referralCode,
      affiliate_link_id: affiliateLinkId ? Number(affiliateLinkId) : null,
      landing_url: window.location.href,
    })
      .catch((err: unknown) => console.error("Lỗi ghi affiliate click:", err));
  }, []);

  /**
   * Cache tra cứu màu sắc tiếng Việt → { hex, isExact } bằng useMemo.
   * Thuật toán mới: Quét variants 1 lần duy nhất O(N), tra cứu COLOR_MAP O(K),
   * kết quả lưu vào Map — tra cứu O(1) trong render loop của color swatches.
   * Trước đây: mỗi color item gọi Object.keys(colorMap).find() = O(K),
   *   N màu × O(K) = O(N×K) mỗi lần re-render.
   * Hiện tại: O(N×K) chỉ tính 1 lần khi product thay đổi, sau đó O(1) mỗi color.
   */
  const colorLookupMap = useMemo(() => {
    const map = new Map<string, { hex: string; isExact: boolean }>();
    if (!product) return map;
    for (const v of product.variants) {
      const name = (v.attributes.color || "").trim();
      if (!name || map.has(name)) continue;
      if (COLOR_MAP[name]) {
        map.set(name, { hex: COLOR_MAP[name], isExact: true });
      } else {
        const matchedKey = Object.keys(COLOR_MAP).find((k) =>
          name.toLowerCase().includes(k.toLowerCase()),
        );
        map.set(name, {
          hex: matchedKey ? COLOR_MAP[matchedKey] : "#e2e8f0",
          isExact: false,
        });
      }
    }
    return map;
  }, [product]);

  // Xử lý thay đổi kích cỡ
  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
    if (!product) return;

    const variant = product.variants.find(
      (v) => v.attributes.size === size && v.attributes.color === selectedColor,
    );

    if (variant) {
      setSelectedVariant(variant);
    } else {
      const bySize = product.variants.find((v) => v.attributes.size === size);
      if (bySize) {
        setSelectedColor(bySize.attributes.color || null);
        setSelectedVariant(bySize);
      }
    }
  };

  // Xử lý thay đổi màu sắc
  const handleColorChange = (color: string) => {
    setSelectedColor(color);
    if (!product) return;

    const variant = product.variants.find(
      (v) => v.attributes.size === selectedSize && v.attributes.color === color,
    );

    if (variant) {
      setSelectedVariant(variant);
    } else {
      const byColor = product.variants.find(
        (v) => v.attributes.color === color,
      );
      if (byColor) {
        setSelectedSize(byColor.attributes.size || null);
        setSelectedVariant(byColor);
      }
    }
  };

  if (loading)
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  if (!product)
    return (
      <div className="text-center py-20 text-slate-500 font-medium">
        Sản phẩm không tồn tại
      </div>
    );

  const displayPrice = selectedVariant
    ? (selectedVariant.sale_price ?? selectedVariant.price)
    : product.base_price;
  const originalPrice = selectedVariant?.sale_price
    ? selectedVariant.price
    : product.variants[0]?.sale_price
      ? product.variants[0].price
      : null;
  const discountPercent = originalPrice
    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
    : null;

  const uniqueSizes = Array.from(
    new Set(product.variants.map((v) => v.attributes.size).filter(Boolean)),
  ) as string[];
  const uniqueColors = Array.from(
    new Set(product.variants.map((v) => v.attributes.color).filter(Boolean)),
  ) as string[];

  const renderStars = (rating: number, size = "w-3.5 h-3.5") => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size} ${
            star <= Math.round(rating)
              ? "fill-yellow-400 text-yellow-400"
              : "fill-slate-200 text-slate-200"
          }`}
        />
      ))}
    </div>
  );

  const getRatingCount = (star: number) =>
    reviewSummary.rating_counts[String(star)] ?? reviewSummary.rating_counts[star] ?? 0;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    const attrs = selectedVariant.attributes;
    const variantInfo = [attrs.size, attrs.color].filter(Boolean).join(" / ");

    addToCart({
      product_id: product.id,
      variant_id: selectedVariant.id,
      name: product.name,
      variant_info: variantInfo || undefined,
      price: selectedVariant.sale_price ?? selectedVariant.price,
      image_url: selectedVariant.image_url || product.thumbnail,
      quantity: 1,
    });
    // Thay thế alert() native (block UI) bằng state notification React.
    // Hiển thị thông báo 2 giây rồi tự xóa — UX thân thiện hơn.
    setCartSuccessMsg("Đã thêm vào giỏ hàng!");
    setTimeout(() => setCartSuccessMsg(null), 2000);
  };

  const handleBuyNow = () => {
    if (!product || !selectedVariant) return;
    const attrs = selectedVariant.attributes;
    const variantInfo = [attrs.size, attrs.color].filter(Boolean).join(" / ");

    const buyNowItem = {
      product_id: product.id,
      variant_id: selectedVariant.id,
      name: product.name,
      variant_info: variantInfo || undefined,
      price: selectedVariant.sale_price ?? selectedVariant.price,
      image_url: selectedVariant.image_url || product.thumbnail,
      quantity: 1,
    };

    navigate("/checkout", { state: { buyNowItem } });
  };

  const getVariantStock = (color: string) => {
    const v = product.variants.find(
      (v) => v.attributes.size === selectedSize && v.attributes.color === color,
    );
    return v ? v.stock : 0;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      {/* Toast thông báo thêm giỏ hàng — hiển thị 2s rồi tự biến mất, không block UI */}
      {cartSuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-white shadow-2xl animate-fade-in">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <span className="text-sm font-bold">{cartSuccessMsg}</span>
        </div>
      )}
      {/* 1. Visual & Identity - Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 mb-8 py-4">
        <Link to="/" className="hover:text-primary-600 transition-colors">
          Trang chủ
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          to={`/category/${product.category?.slug}`}
          className="hover:text-primary-600 transition-colors"
        >
          {product.category?.name || "Danh mục"}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-900 font-medium truncate">
          {product.name}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* Left Column: Visuals */}
        <div className="lg:col-span-5 space-y-6">
          <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden bg-slate-50 group cursor-zoom-in shadow-xl shadow-slate-200/50 border border-slate-100/50">
            <img
              src={selectedVariant?.image_url || product.thumbnail}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />

            {/* Minimalist Badges */}
            <div className="absolute top-8 left-8 flex flex-col gap-3">
              {discountPercent && (
                <span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wider shadow-sm">
                  -{discountPercent}%
                </span>
              )}
              <span className="bg-white text-slate-900 text-[10px] font-bold px-3 py-1 rounded-full tracking-wider shadow-sm border border-slate-100">
                NEW
              </span>
            </div>

            <button className="absolute top-8 right-8 w-12 h-12 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 hover:text-red-500 transition-all hover:scale-110 shadow-sm border border-white/50">
              <Heart className="w-5 h-5" />
            </button>
          </div>

          {/* Key Features Bar */}
          <div className="flex justify-between items-center px-4 py-6 border-y border-slate-100">
            <div className="flex flex-col items-center gap-2 group cursor-default">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors duration-500">
                <Wind className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                Chống nhăn
              </span>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="flex flex-col items-center gap-2 group cursor-default">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors duration-500">
                <Layers className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                100% Cotton
              </span>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="flex flex-col items-center gap-2 group cursor-default">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors duration-500">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                Giặt máy
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Content */}
        <div className="lg:col-span-7 space-y-8">
          {/* Header Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {renderStars(reviewSummary.average_rating)}
              <span className="text-xs font-medium text-slate-400">
                {reviewSummary.total_reviews > 0
                  ? `${reviewSummary.total_reviews} đánh giá`
                  : "Chưa có đánh giá"}
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
                SKU: {selectedVariant?.sku || "---"}
              </span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.1] mt-2">
              {product.name}
            </h1>

            <div className="flex items-end justify-between pt-4">
              <div className="flex items-baseline gap-4">
                <span className="text-4xl font-black text-primary-600 tracking-tighter">
                  {displayPrice.toLocaleString("vi-VN")} ₫
                </span>
                {originalPrice && (
                  <span className="text-lg text-slate-400 line-through font-light">
                    {originalPrice.toLocaleString("vi-VN")} ₫
                  </span>
                )}
              </div>
              {selectedVariant && (
                <div className="text-sm font-medium text-slate-500 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
                  Kho:{" "}
                  <span className="font-bold text-slate-900">
                    {selectedVariant.stock}
                  </span>{" "}
                  sản phẩm
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-slate-100 w-full"></div>

          {/* Variants Selection */}
          <div className="space-y-10">
            {/* Color Swatches */}
            {uniqueColors.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex justify-between items-center">
                  Màu sắc
                  <span className="text-slate-400 font-normal normal-case">
                    {selectedColor}
                  </span>
                </h3>
                <div className="flex flex-wrap gap-4">
                  {uniqueColors.map((color) => {
                    const isSelected = selectedColor === color;
                    const stock = getVariantStock(color);

                    // Tra cứu O(1) từ colorLookupMap đã được tính trước bằng useMemo.
                    // Trước đây: mỗi color gọi Object.keys(colorMap).find() = O(K) → tổng O(N × K).
                    // Hiện tại: tra cứu map.get() = O(1) → tổng O(N).
                    const lookup = colorLookupMap.get(color.trim());
                    const bgColorCode = lookup?.hex ?? "#e2e8f0";
                    const isExactMatch = lookup?.isExact ?? false;

                    return (
                      <button
                        key={color}
                        onClick={() => handleColorChange(color)}
                        title={color}
                        className={`relative w-10 h-10 rounded-full transition-all duration-300 ring-offset-4 flex items-center justify-center
                          ${isSelected ? "ring-2 ring-slate-900 scale-110" : "hover:ring-2 hover:ring-slate-300 hover:scale-105"}
                        `}
                      >
                        <span
                          className="absolute inset-0 rounded-full border border-slate-200"
                          style={{ backgroundColor: bgColorCode }}
                        />
                        {/* Hiển thị 2 ký tự đầu nếu không tra cứu được màu chính xác */}
                        {!isExactMatch && (
                          <span className="relative z-10 text-[10px] font-bold text-slate-600 uppercase">
                            {color.trim().substring(0, 2)}
                          </span>
                        )}
                        {stock <= 0 && (
                          <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center overflow-hidden z-20">
                            <div className="w-full h-[1px] bg-slate-400 rotate-45"></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Picker */}
            {uniqueSizes.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                    Kích cỡ
                    <span className="text-slate-400 font-normal ml-3 normal-case">
                      {selectedSize}
                    </span>
                  </h3>
                  <Link
                    to="/huong-dan-chon-size"
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-[0.1em] border-b border-slate-200"
                  >
                    Size Guide
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3">
                  {uniqueSizes.map((size) => {
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => handleSizeChange(size)}
                        className={`min-w-[64px] h-12 flex items-center justify-center rounded-xl border-2 text-sm font-bold transition-all duration-300
                          ${
                            isSelected
                              ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105"
                              : "border-slate-100 bg-white text-slate-900 hover:border-slate-900 hover:shadow-md"
                          }
                        `}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
                {selectedVariant &&
                  selectedVariant.stock < 5 &&
                  selectedVariant.stock > 0 && (
                    <p className="text-[11px] font-medium text-red-500 bg-red-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-2">
                      <Flame className="w-3 h-3" /> Chế độ giới hạn: Chỉ còn{" "}
                      {selectedVariant.stock} sản phẩm
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-4 pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleAddToCart}
                disabled={!selectedVariant || selectedVariant.stock <= 0}
                className="flex-[3] bg-gradient-to-r from-slate-900 to-slate-800 text-white h-16 rounded-full font-bold uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all duration-300 hover:shadow-xl hover:shadow-slate-900/30 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <ShoppingCart className="w-5 h-5" /> Thêm vào giỏ hàng
              </button>

              <button
                onClick={handleBuyNow}
                disabled={!selectedVariant || selectedVariant.stock <= 0}
                className="flex-[2] border-2 border-slate-900 text-slate-900 h-16 rounded-full font-bold uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all duration-300 hover:bg-slate-900 hover:text-white active:scale-95 shadow-sm hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-900"
              >
                Mua ngay
              </button>
            </div>

            <button className="w-full py-5 flex items-center justify-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] hover:text-slate-900 transition-colors border-t border-slate-50 mt-4">
              <Share2 className="w-4 h-4" /> Share with friends & Earn 5%
            </button>
          </div>

          {/* Service Commitments */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-900 uppercase">
                  Giao hàng miễn phí
                </p>
                <p className="text-[10px] text-slate-400">
                  Cho đơn hàng từ 500k
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                <RefreshCcw className="w-5 h-5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-900 uppercase">
                  Đổi trả 7 ngày
                </p>
                <p className="text-[10px] text-slate-400">
                  Thủ tục nhanh chóng
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-900 uppercase">
                  Bảo mật tuyệt đối
                </p>
                <p className="text-[10px] text-slate-400">Thanh toán an toàn</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Details & Gợi ý */}
      <div className="mt-24 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <div className="border-b border-slate-100 flex gap-8 mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
            {["details", "reviews", "care"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative shrink-0
                  ${activeTab === tab ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}
                `}
              >
                {tab === "details"
                  ? "Chi tiết sản phẩm"
                  : tab === "reviews"
                    ? "Đánh giá"
                    : "Bảo quản"}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-primary-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[200px]">
            {activeTab === "details" && (
              <div className="animate-fade-in">
                <p className="text-slate-600 leading-[1.8] text-lg font-medium italic mb-6">
                  "{product.description}"
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                  <div className="space-y-4">
                    <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">
                      Đặc điểm nổi bật
                    </h4>
                    <ul className="space-y-3">
                      {[
                        "Form dáng hiện đại, tôn dáng người mặc",
                        "Vải cotton 100% tự nhiên, thấm hút cực tốt",
                        "Đường kim mũi chỉ tinh tế, bền bỉ",
                        "Dễ dàng phối đồ cho nhiều hoàn cảnh",
                      ].map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 text-sm text-slate-600"
                        >
                          <Zap className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />{" "}
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "reviews" && (
              <div className="animate-fade-in space-y-10">
                {/* Rating Summary */}
                <div className="flex flex-col sm:flex-row items-center gap-8 p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-center sm:min-w-[150px]">
                    <p className="text-6xl font-black text-slate-900 tracking-tighter">
                      {reviewSummary.average_rating.toFixed(1)}
                    </p>
                    <div className="flex justify-center my-3">
                      {renderStars(reviewSummary.average_rating, "w-4 h-4")}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {reviewSummary.total_reviews > 0
                        ? `Dựa trên ${reviewSummary.total_reviews} đánh giá`
                        : "Chưa có đánh giá"}
                    </p>
                  </div>

                  <div className="w-px h-24 bg-slate-200 hidden sm:block"></div>

                  <div className="flex-1 w-full space-y-3">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = getRatingCount(star);
                      const percent = reviewSummary.total_reviews
                        ? Math.round((count / reviewSummary.total_reviews) * 100)
                        : 0;

                      return (
                      <div key={star} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-600 w-3">
                          {star}
                        </span>
                        <Star className="w-3 h-3 fill-slate-400 text-slate-400" />
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full"
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 w-6 text-right">
                          {count}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary-500" /> Viết đánh giá
                    </h4>
                    <p className="mt-2 text-sm text-slate-500">
                      Bạn có thể đánh giá sản phẩm trong mục đơn hàng sau khi đơn đã hoàn thành.
                    </p>
                  </div>
                  <Link
                    to="/account"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    Xem đơn hàng
                  </Link>
                </div>

                {/* Review List */}
                <div className="space-y-6 pt-8 border-t border-slate-100">
                  <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest mb-6">
                    Đánh giá mới nhất
                  </h4>

                  {reviews.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                      <Star className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">
                        Sản phẩm chưa có đánh giá.
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Đánh giá từ khách đã nhận hàng sẽ hiển thị tại đây.
                      </p>
                    </div>
                  ) : (
                    <>
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="space-y-4 p-6 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-center gap-3">
                            {review.user_avatar ? (
                              <img
                                src={review.user_avatar}
                                alt={review.user_name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center font-bold text-white shadow-sm">
                                {review.user_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {review.user_name}
                              </p>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <ShieldCheck className="w-3 h-3 text-green-500" />{" "}
                                Đã mua hàng
                              </p>
                            </div>
                          </div>
                          {renderStars(review.rating)}
                        </div>
                        {review.comment && (
                          <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl">
                            {review.comment}
                          </p>
                        )}
                        {review.images && review.images.length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            {review.images.map((image, index) => (
                              <a
                                key={`${review.id}-${index}`}
                                href={image}
                                target="_blank"
                                rel="noreferrer"
                                className="block h-20 w-20 overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
                              >
                                <img
                                  src={image}
                                  alt={`Ảnh đánh giá ${index + 1}`}
                                  className="h-full w-full object-cover transition-transform hover:scale-105"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {reviewsHasMore && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          disabled={reviewsLoading}
                          onClick={() => fetchReviews(String(id), reviewPage + 1, true)}
                          className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reviewsLoading ? "Đang tải..." : "Xem thêm đánh giá"}
                        </button>
                      </div>
                    )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "care" && (
              <div className="animate-fade-in space-y-4">
                {[
                  "Giặt máy ở nhiệt độ thường (không quá 30 độ C)",
                  "Không sử dụng chất tẩy mạnh",
                  "Phơi trong bóng râm, tránh ánh nắng trực tiếp",
                  "Ủi ở nhiệt độ trung bình",
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100"
                  >
                    <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                    <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Suggestions? (Optional) */}
        <div className="lg:col-span-4 bg-slate-900 rounded-[2rem] p-8 text-white">
          <h3 className="text-xl font-black italic uppercase tracking-tighter mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" /> Hoàn thiện phong cách
          </h3>
          <p className="text-slate-400 text-sm mb-8">
            Dựa trên sản phẩm này, Zentis gợi ý thêm các món đồ để bạn nâng tầm
            phong cách ngay hôm nay.
          </p>
          <div className="space-y-4">
            {/* Simple static upsell for now */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800">
                <img
                  src="https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=200"
                  className="w-full h-full object-cover"
                  alt="upsell"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                  Phối cùng
                </p>
                <p className="text-sm font-bold truncate">Quần Jean Slim Fit</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30 group-hover:translate-x-1 transition-transform" />
            </div>
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800">
                <img
                  src="https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=200"
                  className="w-full h-full object-cover"
                  alt="upsell"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                  Phối cùng
                </p>
                <p className="text-sm font-bold truncate">
                  Kính Phi Công Aviator
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="mt-32">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-4xl font-black italic uppercase tracking-tighter">
                Sản phẩm liên quan
              </h2>
              <p className="text-slate-500 mt-2">
                Có thể bạn cũng sẽ thích những mẫu thiết kế này
              </p>
            </div>
            <Link
              to={`/category/${product.category?.slug}`}
              className="text-sm font-black uppercase tracking-widest border-b-2 border-slate-900 pb-1"
            >
              Xem tất cả
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {relatedProducts.map((p) => {
              const minP =
                p.min_price ??
                ((p.variants || []).length > 0
                  ? Math.min(...(p.variants || []).map((v) => v.sale_price ?? v.price))
                  : p.base_price);
              return (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  className="group space-y-4"
                >
                  <div className="aspect-[3/4] rounded-[2rem] overflow-hidden bg-slate-50 border border-slate-100 relative shadow-sm group-hover:shadow-xl transition-shadow duration-500">
                    <img
                      src={p.thumbnail || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600&auto=format&fit=crop"}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute top-4 left-4">
                      <div className="bg-white/90 backdrop-blur-md text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm tracking-widest text-slate-900">
                        MỚI
                      </div>
                    </div>
                  </div>
                  <div className="px-2">
                    <h4 className="font-bold text-slate-900 truncate uppercase text-sm tracking-tight group-hover:text-primary-600 transition-colors">
                      {p.name}
                    </h4>
                    <p className="text-slate-500 font-medium mt-1 tracking-tight text-sm">
                      {minP.toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
