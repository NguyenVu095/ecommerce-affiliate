import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, User, Search, LogOut, ChevronDown, Flame, Menu, X as CloseIcon } from "lucide-react";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import { fetchCategories, type Category } from "../services/categoryService";

const CartDrawer = lazy(() => import("../features/cart/CartDrawer"));

export default function Navbar() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedMobileCats, setExpandedMobileCats] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const items = useCartStore((state) => state.items);

  /**
   * Memoize tổng số sản phẩm trong giỏ hàng.
   * Lắng nghe trực tiếp sự thay đổi của mảng items để tự động cập nhật Badge.
   */
  const totalItems = useMemo(() => items.reduce((total, item) => total + item.quantity, 0), [items]);

  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Tải danh mục lần đầu tiên khi Navbar mount.
   * Sử dụng fetchCategories() từ categoryService thay vì gọi api inline
   * để đúng tiêu chuẩn dự án: tách biệt lối gọi API ra khỏi UI component.
   */
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err: unknown) => console.error("Error fetching categories", err));
  }, []);

  /** Đóng mobile menu khi chuyển route. */
  useEffect(() => {
    Promise.resolve().then(() => setIsMobileMenuOpen(false));
  }, [location.pathname]);

  /** Đồng bộ search term với tham số URL khi ở trang tìm kiếm. */
  useEffect(() => {
    if (location.pathname === "/search") {
      const q = new URLSearchParams(location.search).get("q") || "";
      Promise.resolve().then(() => setSearchTerm(q));
    }
  }, [location.pathname, location.search]);

  /**
   * Đăng xuất và chuyển hướng về trang chủ.
   * Bao trong useCallback để tránh tạo lại hàm mội render.
   */
  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

  /**
   * Xử lý submit form tìm kiếm: chuyển hướng tới /search với query params.
   * Bao trong useCallback để tránh tạo lại hàm mội render.
   */
  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchTerm.trim();
    if (!keyword) return;
    navigate(`/search?q=${encodeURIComponent(keyword)}`);
    setIsMobileMenuOpen(false);
  }, [searchTerm, navigate]);

  /**
   * Bật/tắt mổ rộng danh mục con trong mobile menu.
   * Bao trong useCallback để tránh tạo lại hàm mội render.
   */
  const toggleMobileCat = useCallback((id: number) => {
    setExpandedMobileCats((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  return (
    <>
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            
            {/* Left: Mobile Menu Button + Logo */}
            <div className="flex items-center gap-4">
              <button 
                className="md:hidden p-2 text-slate-600 hover:text-slate-900"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="flex-shrink-0 flex items-center">
                <Link to="/" className="flex items-center gap-2 text-slate-900 group">
                  <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-xl group-hover:bg-primary-600 transition-colors">
                    <span className="font-black text-xl">Z</span>
                  </div>
                  <span className="font-bold text-2xl tracking-tight hidden sm:block">ZENTIS</span>
                </Link>
              </div>
            </div>

            {/* Center: Desktop Nav */}
            <nav className="hidden md:flex space-x-8 items-center h-full">
              {categories.map((rootCat) => (
                <div key={rootCat.id} className="relative group h-full flex items-center">
                  <Link 
                    to={`/category/${rootCat.slug}`} 
                    className="text-slate-600 font-medium hover:text-slate-900 flex items-center gap-1 transition-colors"
                  >
                    {rootCat.name}
                    {rootCat.children.length > 0 && (
                      <ChevronDown className="w-4 h-4 text-slate-400 group-hover:rotate-180 transition-transform duration-300" />
                    )}
                  </Link>
                  
                  {rootCat.children.length > 0 && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 bg-white border border-slate-100 shadow-xl rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 overflow-hidden translate-y-2 group-hover:translate-y-0 z-50"
                      style={{ minWidth: rootCat.children.some(c => c.children.length > 0) ? '320px' : '180px' }}
                    >
                      <div className="p-3 flex gap-6">
                        {rootCat.children.map((level1) => (
                          <div key={level1.id} className="min-w-[140px]">
                            <Link 
                              to={`/category/${level1.slug}`}
                              className="block px-3 py-2 text-slate-900 font-bold text-sm uppercase tracking-wide hover:text-primary-600 transition-colors"
                            >
                              {level1.name}
                            </Link>
                            {level1.children.length > 0 && (
                              <div className="flex flex-col">
                                {level1.children.map((level2) => (
                                  <Link 
                                    key={level2.id}
                                    to={`/category/${level2.slug}`}
                                    className="px-3 py-1.5 text-slate-500 hover:text-primary-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                                  >
                                    {level2.name}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Link to="/lookbook" className="text-slate-900 font-bold hover:text-primary-600 transition-colors uppercase tracking-wide text-sm">Lookbook</Link>
              <Link to="/sale" className="text-red-600 font-bold hover:text-red-700 transition-colors flex items-center gap-1">
                <Flame className="w-4 h-4" /> SALE
              </Link>
            </nav>

            {/* Right: Search + Icons */}
            <div className="flex items-center gap-2 sm:gap-5">
              <form onSubmit={handleSearchSubmit} className="relative hidden lg:block">
                <input 
                  type="text" 
                  placeholder="Tìm quần Jean..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-slate-200 bg-slate-50 hover:bg-white rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 w-64 transition-all" 
                />
                <button
                  type="submit"
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-700"
                  aria-label="Tìm kiếm"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>
              
              {isAuthenticated ? (
                <div className="relative group h-16 flex items-center">
                  <div className="flex items-center gap-2 cursor-pointer p-2">
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold uppercase text-sm">
                      {user?.email[0]}
                    </div>
                  </div>
                  <div className="absolute top-full right-0 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                    <div className="p-2 flex flex-col">
                      <div className="px-4 py-2 border-b border-slate-100 mb-2">
                        <p className="font-semibold text-slate-900 truncate text-xs">{user?.full_name || user?.email}</p>
                      </div>
                      <Link to="/account" className="px-4 py-2 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">Tài khoản</Link>
                      <button onClick={handleLogout} className="px-4 py-2 hover:bg-red-50 text-red-600 rounded-xl text-sm font-medium text-left flex items-center gap-2">
                        <LogOut className="w-4 h-4" /> Đăng xuất
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <Link to="/login" className="p-2 text-slate-600 hover:text-slate-900">
                  <User className="w-6 h-6" />
                </Link>
              )}

              <button 
                onClick={() => setIsCartOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-900 relative"
              >
                <ShoppingBag className="w-6 h-6" />
                {/*
                  * Dùng biến memoíze totalItems (tính 1 lần qua useMemo) thay vì
                  * gọi getTotalItems() 2 lần (1 lần kiểm tra điều kiện, 1 lần hiển thị)
                  * trong cùng render — tránh tính toán trùng lặp.
                  */}
                {totalItems > 0 && (
                  <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-full max-w-xs bg-white shadow-2xl flex flex-col animate-slide-in-left">
            <div className="p-4 border-b flex justify-between items-center">
              <span className="font-bold text-xl">Menu</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2"><CloseIcon className="w-6 h-6" /></button>
            </div>

            <form onSubmit={handleSearchSubmit} className="border-b border-slate-100 p-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm sản phẩm..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="submit"
                  className="absolute left-3 top-3.5 text-slate-400"
                  aria-label="Tìm kiếm"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>
            
            <div className="flex-1 overflow-y-auto py-4">
              <nav className="flex flex-col">
                {categories.map(cat => (
                  <div key={cat.id} className="border-b border-slate-50">
                    <div className="flex justify-between items-center px-6 py-4">
                      <Link to={`/category/${cat.slug}`} className="font-semibold text-slate-900">{cat.name}</Link>
                      {cat.children.length > 0 && (
                        <button onClick={() => toggleMobileCat(cat.id)} className="p-1">
                          <ChevronDown className={`w-5 h-5 transition-transform ${expandedMobileCats.includes(cat.id) ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    {expandedMobileCats.includes(cat.id) && cat.children.length > 0 && (
                      <div className="bg-slate-50 px-8 py-2">
                        {cat.children.map(sub => (
                          <div key={sub.id} className="py-3">
                            <Link to={`/category/${sub.slug}`} className="font-medium text-slate-700 text-sm">{sub.name}</Link>
                            <div className="mt-2 flex flex-col gap-2 pl-4">
                              {sub.children.map(leaf => (
                                <Link key={leaf.id} to={`/category/${leaf.slug}`} className="text-slate-500 text-xs">{leaf.name}</Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <Link to="/lookbook" className="px-6 py-4 font-semibold border-b border-slate-50">Lookbook</Link>
                <Link to="/sale" className="px-6 py-4 font-semibold text-red-600 border-b border-slate-50 flex items-center gap-2">
                  <Flame className="w-5 h-5" /> SALE
                </Link>
              </nav>
            </div>
            
            <div className="p-6 bg-slate-50 mt-auto">
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">{user?.email[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{user?.email}</p>
                    <button onClick={handleLogout} className="text-red-600 text-xs font-medium">Đăng xuất</button>
                  </div>
                </div>
              ) : (
                <Link to="/login" className="w-full block bg-slate-900 text-white text-center py-3 rounded-xl font-bold">Đăng nhập</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {isCartOpen && (
        <Suspense fallback={null}>
          <CartDrawer isOpen onClose={() => setIsCartOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
