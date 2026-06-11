import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getProductsCardsApi } from "../../services/productService";
import { ChevronRight, Flame, Loader2, RefreshCcw, SlidersHorizontal } from "lucide-react";
import ProductGrid, { type ProductGridItem } from "./ProductGrid";

const PAGE_SIZE = 12;

type SortOption = "discount_desc" | "newest" | "price_asc" | "price_desc";

function getBestDiscount(product: ProductGridItem) {
  if (product.best_discount !== undefined) return product.best_discount;
  const discounts = (product.variants || [])
    .filter((variant) => variant.sale_price !== null && variant.sale_price < variant.price)
    .map((variant) => Math.round(((variant.price - Number(variant.sale_price)) / variant.price) * 100));

  return discounts.length > 0 ? Math.max(...discounts) : 0;
}

export default function SalePage() {
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("discount_desc");
  const [minDiscount, setMinDiscount] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestInFlight = useRef(false);
  const requestToken = useRef(0);

  const visibleProducts = useMemo(
    () => products.filter((product) => getBestDiscount(product) >= minDiscount),
    [minDiscount, products],
  );

  const loadProducts = useCallback(
    async (nextPage: number, replace = false) => {
      if (requestInFlight.current && !replace) return;

      const currentToken = ++requestToken.current;
      requestInFlight.current = true;

      // Yield to the microtask queue to avoid synchronous state updates in useEffect
      await Promise.resolve();

      setError("");
      if (replace) {
        setLoadingInitial(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const data = await getProductsCardsApi({
          has_sale: true,
          min_discount: minDiscount,
          skip: nextPage * PAGE_SIZE,
          limit: PAGE_SIZE,
          sort: sortBy,
          include_facets: false,
        });
        const nextProducts = (data.data || []) as ProductGridItem[];
        if (currentToken !== requestToken.current) return;

        setProducts((prev) => {
          if (replace) return nextProducts;
          const existingIds = new Set(prev.map((product) => product.id));
          const uniqueProducts = nextProducts.filter((product) => !existingIds.has(product.id));
          return [...prev, ...uniqueProducts];
        });
        setPage(nextPage);
        setHasMore(Boolean(data.has_more));
      } catch (err) {
        if (currentToken !== requestToken.current) return;
        console.error("Error fetching sale products", err);
        setError("Không tải được danh sách sản phẩm sale. Vui lòng thử lại.");
      } finally {
        if (currentToken === requestToken.current) {
          requestInFlight.current = false;
          setLoadingInitial(false);
          setLoadingMore(false);
        }
      }
    },
    [minDiscount, sortBy],
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProducts(0, true);
    });
  }, [loadProducts]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loadingInitial || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadProducts(page + 1);
        }
      },
      { rootMargin: "420px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadProducts, loadingInitial, loadingMore, page]);

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    setProducts([]);
    setPage(0);
    setHasMore(true);
  };

  const handleMinDiscountChange = (newMin: number) => {
    setMinDiscount(newMin);
    setProducts([]);
    setPage(0);
    setHasMore(true);
  };

  const handleReload = () => {
    setProducts([]);
    setPage(0);
    setHasMore(true);
    loadProducts(0, true);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">
            Trang chủ
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">Sale</span>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 sm:p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white">
                <Flame className="h-5 w-5" />
              </div>
              <h1 className="text-3xl font-black text-slate-900">Sản phẩm đang giảm giá</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Danh sách này chỉ hiển thị sản phẩm có biến thể đang sale thật, tức giá khuyến mãi thấp hơn giá gốc.
              </p>
              <p className="mt-4 text-sm font-semibold text-red-600">
                Đã hiển thị {visibleProducts.length} sản phẩm sale
                {hasMore ? ". Kéo xuống để tải thêm." : products.length > 0 ? ". Đã tải hết danh sách." : "."}
              </p>
            </div>

            <div className="border-t border-red-50 bg-red-50/60 p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-red-700">
                <SlidersHorizontal className="h-4 w-4" />
                Bộ lọc sale
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Sắp xếp
                  </label>
                  <select
                    value={sortBy}
                    onChange={(event) => handleSortChange(event.target.value as SortOption)}
                    className="w-full rounded-xl border border-red-100 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-red-200"
                  >
                    <option value="discount_desc">Giảm nhiều nhất</option>
                    <option value="newest">Mới nhất</option>
                    <option value="price_asc">Giá tăng dần</option>
                    <option value="price_desc">Giá giảm dần</option>
                  </select>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-bold text-slate-700">
                      Mức giảm tối thiểu
                    </label>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-red-600">
                      {minDiscount}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={70}
                    step={5}
                    value={minDiscount}
                    onChange={(event) => handleMinDiscountChange(Number(event.target.value))}
                    className="w-full accent-red-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleReload}
                  disabled={loadingInitial || loadingMore}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className={`h-4 w-4 ${loadingInitial ? "animate-spin" : ""}`} />
                  Làm mới danh sách
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        {loadingInitial ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: PAGE_SIZE }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="aspect-[3/4] animate-pulse rounded-xl bg-red-50" />
                <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <ProductGrid
            products={visibleProducts}
            emptyTitle="Chưa có sản phẩm sale phù hợp"
            emptyDescription="Không có sản phẩm đang giảm giá theo mức lọc hiện tại. Hãy giảm mức phần trăm hoặc quay lại sau."
          />
        )}

        <div ref={sentinelRef} className="h-8" />

        {!loadingInitial && products.length > 0 && (
          <div className="mt-8 flex justify-center">
            {hasMore ? (
              <button
                type="button"
                onClick={() => loadProducts(page + 1)}
                disabled={loadingMore}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Đang tải thêm..." : "Tải thêm sản phẩm sale"}
              </button>
            ) : (
              <p className="text-sm font-medium text-slate-400">Đã tải hết sản phẩm sale</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
