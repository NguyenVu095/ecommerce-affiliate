import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { ArrowRight, Truck, RefreshCcw, ShieldCheck, HeadphonesIcon } from "lucide-react";
import NewsletterForm from "../../components/NewsletterForm";

interface ProductVariant {
  id: number;
  sku: string;
  attributes: { size?: string; color?: string };
  price: number;
  sale_price: number | null;
  stock: number;
  image_url: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}

interface Product {
  id: number;
  name: string;
  base_price: number;
  thumbnail: string | null;
  gender: number;
  status: number;
  variants?: ProductVariant[];
  min_price?: number;
  has_sale?: boolean;
  total_stock?: number;
}

const HERO_SLIDES = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=2070&auto=format&fit=crop",
    tag: "Mới Ra Mắt",
    titleLines: ["Summer Collection", "2026"],
    description: "Khám phá bộ sưu tập mùa hè với thiết kế tối giản, chất liệu thân thiện và phong cách vượt thời gian. Giảm giá lên đến 50% cho người mới.",
    link: "#new-arrivals"
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=2071&auto=format&fit=crop",
    tag: "Ưu Đãi Đặc Biệt",
    titleLines: ["Winter Sale", "Lên đến 70%"],
    description: "Đánh bay cái lạnh mùa đông với hàng ngàn ưu đãi hấp dẫn. Mua ngay những chiếc áo khoác ấm áp nhất với giá cực hời.",
    link: "#new-arrivals"
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070&auto=format&fit=crop",
    tag: "Phong Cách Đường Phố",
    titleLines: ["Streetwear", "Vibes"],
    description: "Thể hiện cá tính mạnh mẽ với những set đồ bụi bặm, phá cách dành riêng cho giới trẻ năng động. Mix & Match không giới hạn.",
    link: "/category/ao-khoac"
  },
  {
    id: 4,
    image: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=2070&auto=format&fit=crop",
    tag: "Phụ Kiện",
    titleLines: ["Hoàn Thiện", "Phong Cách"],
    description: "Đừng quên điểm xuyết cho trang phục bằng những phụ kiện tinh tế giúp bạn tỏa sáng và nổi bật ở mọi góc nhìn.",
    link: "/category/phu-kien"
  }
];

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    api
      .get("/api/products/home")
      .then((res) => setProducts(res.data || []))
      .catch((err: unknown) => console.error("Lỗi tải sản phẩm trang chủ:", err))
      .finally(() => setLoading(false));
  }, []);

  // Auto slider effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 3500); // Đổi slide mỗi 3.5 giây để thấy rõ hiệu ứng nhảy
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-20 pb-12 w-full">
      {/* 1. Hero Section (Slider) */}
      <div >
        <section className="relative h-[75vh] min-h-[500px] w-full max-w-[1400px] mx-auto bg-slate-900 overflow-hidden rounded-3xl mt-2 shadow-2xl">
          {HERO_SLIDES.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
            >
              <img
                src={slide.image}
                alt="Banner"
                className={`absolute inset-0 w-full h-full object-cover transition-transform duration-[10000ms] ${index === currentSlide ? 'scale-110' : 'scale-100'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent"></div>
              <div className="absolute inset-0 flex items-center justify-center text-center px-4 z-20">
                <div className="max-w-3xl transform transition-all duration-1000 translate-y-0">
                  <h2 className="text-primary-400 font-bold tracking-widest uppercase mb-4">{slide.tag}</h2>
                  <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight drop-shadow-lg">
                    {slide.titleLines.map((line) => (
                      <span key={line} className="block">{line}</span>
                    ))}
                  </h1>
                  <p className="text-lg md:text-xl text-slate-200 mb-10 max-w-2xl mx-auto drop-shadow">
                    {slide.description}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href={slide.link} className="bg-white text-slate-900 px-8 py-4 rounded-full font-bold hover:bg-slate-100 transition-colors inline-flex items-center justify-center gap-2 shadow-xl hover:scale-105 transform duration-300">
                      Mua ngay <ArrowRight className="w-5 h-5" />
                    </a>
                    <Link to="/lookbook" className="bg-transparent border-2 border-white/80 text-white px-8 py-4 rounded-full font-bold hover:bg-white/10 transition-colors inline-flex items-center justify-center shadow-xl hover:scale-105 transform duration-300 backdrop-blur-sm">
                      Xem Lookbook
                    </Link>
                  </div>
                </div>
              </div>
            </div>

          ))}


        </section>
        {/* Slider Navigation Dots */}
        <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3 z-30">
          {HERO_SLIDES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${index === currentSlide ? 'bg-primary-500 w-8' : 'bg-slate-800 hover:bg-white'}`}
              aria-label={`Go to slide ${index + 1}`}
            ></button>
          ))}
        </div>
      </div>
      {/* 2. Danh mục nổi bật (Featured Categories) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Danh Mục Nổi Bật</h2>
            <p className="text-slate-500 mt-2">Định hình phong cách của riêng bạn.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Áo Thun */}
          <Link to="/category/ao-thun" className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 block">
            <img src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop" alt="Áo thun" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
            <div className="absolute bottom-6 left-6 right-6">
              <h3 className="text-white text-2xl font-bold mb-1">Áo Thun</h3>
              <p className="text-white/80 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">Khám phá <ArrowRight className="w-4 h-4" /></p>
            </div>
          </Link>

          {/* Quần Jean */}
          <Link to="/category/quan-jean" className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 block">
            <img src="https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=800&auto=format&fit=crop" alt="Quần Jean" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
            <div className="absolute bottom-6 left-6 right-6">
              <h3 className="text-white text-2xl font-bold mb-1">Quần Jean</h3>
              <p className="text-white/80 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">Khám phá <ArrowRight className="w-4 h-4" /></p>
            </div>
          </Link>

          {/* Phụ Kiện */}
          <Link to="/category/phu-kien" className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 block">
            <img src="https://images.unsplash.com/photo-1509319117193-57bab727e09d?q=80&w=800&auto=format&fit=crop" alt="Phụ kiện" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
            <div className="absolute bottom-6 left-6 right-6">
              <h3 className="text-white text-2xl font-bold mb-1">Phụ Kiện</h3>
              <p className="text-white/80 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">Khám phá <ArrowRight className="w-4 h-4" /></p>
            </div>
          </Link>

          {/* Giày */}
          <Link to="/category/giay" className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 block">
            <img src="https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format&fit=crop" alt="Giày" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
            <div className="absolute bottom-6 left-6 right-6">
              <h3 className="text-white text-2xl font-bold mb-1">Giày / Sneakers</h3>
              <p className="text-white/80 font-medium text-sm flex items-center gap-1 group-hover:gap-2 transition-all">Khám phá <ArrowRight className="w-4 h-4" /></p>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. Sản phẩm mới / Bán chạy (API Dữ liệu thật) */}
      <section id="new-arrivals" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-left mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Sản Phẩm Mới (New Arrivals)</h2>
          <p className="text-slate-500 mt-2">Những items vừa được cập nhật tuần này. Nhanh tay sở hữu trước khi hết hàng.</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Đang tải sản phẩm...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
            {products.slice(0, 8).map((product) => {
              const variants = product.variants || [];
              const totalStock = product.total_stock ?? variants.reduce((sum, v) => sum + v.stock, 0);
              const minPrice = product.min_price ?? (variants.length > 0
                ? Math.min(...variants.map(v => v.sale_price ?? v.price))
                : product.base_price);
              const hasSale = product.has_sale ?? variants.some(v => v.sale_price !== null);
              return (
                <Link key={product.id} to={`/product/${product.id}`} className="group flex flex-col">
                  <div className="aspect-[3/4] overflow-hidden bg-slate-100 relative rounded-xl mb-4">
                    <img
                      src={product.thumbnail || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600&auto=format&fit=crop"}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    {/* Badge */}
                    {hasSale ? (
                      <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        SALE
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 bg-white text-slate-900 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        NEW
                      </div>
                    )}
                    {/* Stock Out */}
                    {totalStock <= 0 && (
                      <div className="absolute top-3 right-3 bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        Hết hàng
                      </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors"></div>
                  </div>

                  <div className="flex flex-col flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors">{product.name}</h3>
                    <div className="mt-auto pt-2 flex items-center gap-2">
                      <span className="text-primary-600 font-bold text-lg">{minPrice.toLocaleString("vi-VN")} ₫</span>
                      {hasSale && (
                        <span className="text-slate-400 text-sm line-through">{product.base_price.toLocaleString("vi-VN")} ₫</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <div className="text-center mt-12">
          <Link
            to="/products"
            className="inline-flex border border-slate-900 text-slate-900 px-8 py-3 rounded-full font-semibold hover:bg-slate-900 hover:text-white transition-colors"
          >
            Xem Tất Cả Sản Phẩm
          </Link>
        </div>
      </section>

      {/* 4. Khối nội dung chiến dịch (Campaign/Lookbook) */}
      <section className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 my-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 leading-tight">
                Mix & Match <br /> Cho Ngày Cuối Tuần.
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-md">
                Đừng đau đầu vì không biết mặc gì. Bộ sưu tập phối sẵn của ZENTIS giúp bạn tự tin dạo phố chỉ với 2 phút chọn đồ.
                Mua nguyên Set để tiết kiệm hơn.
              </p>
              <Link to="/lookbook" className="bg-slate-900 text-white px-8 py-4 rounded-full font-bold hover:bg-primary-600 transition-colors inline-flex items-center gap-2">
                Xem Bộ Sưu Tập <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <div className="order-1 lg:order-2 grid grid-cols-2 gap-4">
              <img src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600&auto=format&fit=crop" alt="Look 1" className="w-full aspect-[3/4] object-cover rounded-2xl translate-y-8 shadow-xl" />
              <img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=600&auto=format&fit=crop" alt="Look 2" className="w-full aspect-[3/4] object-cover rounded-2xl shadow-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Cam kết dịch vụ (Trust Signals) */}
      <section className="border-y border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-900">
                <Truck className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 mb-2">Giao Hàng Nhanh</h4>
              <p className="text-sm text-slate-500">Miễn phí ship đơn từ 500k toàn quốc.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-900">
                <RefreshCcw className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 mb-2">Đổi Trả Dễ Dàng</h4>
              <p className="text-sm text-slate-500">7 ngày đổi trả miễn phí tận nhà.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-900">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 mb-2">Thanh Toán An Toàn</h4>
              <p className="text-sm text-slate-500">Bảo mật 100% qua cổng VNPAY.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-900">
                <HeadphonesIcon className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 mb-2">Hỗ Trợ 24/7</h4>
              <p className="text-sm text-slate-500">Luôn ở đây mỗi khi bạn cần.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Đăng ký nhận tin (Newsletter) */}
      <section className="max-w-3xl mx-auto px-4 w-full text-center py-12">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Nhận Ưu Đãi Đặc Quyền</h2>
        <p className="text-slate-500 mb-8">Nhận ngay mã giảm giá 10% cho đơn hàng đầu tiên khi đăng ký nhận tin tức từ ZENTIS.</p>
        <NewsletterForm source="home-newsletter" />
      </section>

    </div>
  );
}
