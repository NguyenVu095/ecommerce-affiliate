import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProductsCardsApi } from "../../services/productService";
import { ChevronRight, Loader2, Search } from "lucide-react";
import ProductGrid, { type ProductGridItem } from "./ProductGrid";

const PAGE_SIZE = 12;

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => searchParams.get("q")?.trim() || "", [searchParams]);
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Bọc trong useCallback với dependency [query] để ổn định tham chiếu hàm qua re-render.
  // Nếu không dùng useCallback, hàm sẽ được tạo lại mỗi render → useEffect kích hoạt liên tục.
  const loadProducts = useCallback(
    async (nextPage = 0, append = false): Promise<void> => {
      // Yield to the microtask queue to avoid synchronous state updates in useEffect
      await Promise.resolve();

      if (!query) {
        setProducts([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await getProductsCardsApi({
          search: query,
          skip: nextPage * PAGE_SIZE,
          limit: PAGE_SIZE,
          include_facets: false,
        });
        setProducts((current) =>
          append ? [...current, ...(data.data || [])] : data.data || [],
        );
        setPage(nextPage);
        if (data.total !== -1) {
          setTotal(data.total || 0);
        }
        setHasMore(Boolean(data.has_more));
      } catch (err: unknown) {
        console.error("Lỗi tìm kiếm sản phẩm:", err);
        if (!append) {
          setProducts([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query],
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProducts(0, false);
    });
  }, [loadProducts]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">
            Trang chủ
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">Tìm kiếm</span>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {query ? `Kết quả cho "${query}"` : "Tìm kiếm sản phẩm"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {query
                  ? loading
                    ? "Đang tìm sản phẩm phù hợp..."
                    : `Tìm thấy ${products.length} sản phẩm`
                  : "Nhập từ khóa vào ô tìm kiếm ở thanh điều hướng để bắt đầu."}
              </p>
            </div>
          </div>
        </div>

        {query && products.length > 0 && !loading && (
          <p className="mb-4 text-sm font-medium text-slate-500">
            Đang hiển thị {products.length} / {total} sản phẩm
          </p>
        )}

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-600" />
          </div>
        ) : (
          <ProductGrid
            products={products}
            emptyTitle={query ? "Không tìm thấy sản phẩm phù hợp" : "Chưa có từ khóa tìm kiếm"}
            emptyDescription={
              query
                ? "Thử tìm bằng tên sản phẩm ngắn hơn, tên danh mục hoặc chất liệu."
                : "Nhập tên sản phẩm, danh mục hoặc phong cách bạn muốn tìm."
            }
          />
        )}
        {!loading && hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => loadProducts(page + 1, true)}
              disabled={loadingMore}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingMore ? "Đang tải thêm..." : "Tải thêm sản phẩm"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
