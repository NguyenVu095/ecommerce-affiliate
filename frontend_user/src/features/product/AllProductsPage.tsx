import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getProductsCardsApi } from "../../services/productService";
import { ChevronRight, Filter, Loader2, RefreshCcw } from "lucide-react";
import ProductGrid, { type ProductGridItem } from "./ProductGrid";

const PAGE_SIZE = 12;

type SortOption = "newest" | "price_asc" | "price_desc";

export default function AllProductsPage() {
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestInFlight = useRef(false);
  const requestToken = useRef(0);

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
        console.error("Error fetching products", err);
        setError("Không tải được danh sách sản phẩm. Vui lòng thử lại.");
      } finally {
        if (currentToken === requestToken.current) {
          requestInFlight.current = false;
          setLoadingInitial(false);
          setLoadingMore(false);
        }
      }
    },
    [sortBy],
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
          <span className="font-medium text-slate-900">Tất cả sản phẩm</span>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Tất cả sản phẩm</h1>
              <p className="mt-1 text-sm text-slate-500">
                Đã hiển thị {products.length} sản phẩm
                {hasMore ? ". Kéo xuống để tải thêm." : products.length > 0 ? ". Đã tải hết danh sách." : "."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                <Filter className="ml-2 h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-500">Sắp xếp:</span>
                <select
                  className="cursor-pointer border-none bg-transparent pr-8 text-sm font-medium text-slate-900 outline-none focus:ring-0"
                  value={sortBy}
                  onChange={(event) => handleSortChange(event.target.value as SortOption)}
                >
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá tăng dần</option>
                  <option value="price_desc">Giá giảm dần</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleReload}
                disabled={loadingInitial || loadingMore}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className={`h-4 w-4 ${loadingInitial ? "animate-spin" : ""}`} />
                Làm mới
              </button>
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
                <div className="aspect-[3/4] animate-pulse rounded-xl bg-slate-100" />
                <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <ProductGrid
            products={products}
            emptyTitle="Chưa có sản phẩm"
            emptyDescription="Hệ thống hiện chưa có sản phẩm đang kinh doanh."
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
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Đang tải thêm..." : "Tải thêm sản phẩm"}
              </button>
            ) : (
              <p className="text-sm font-medium text-slate-400">Đã tải hết sản phẩm</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
