import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCategories } from "../../services/categoryService";
import { getProductsCardsApi } from "../../services/productService";
import { ChevronRight, Filter, Loader2, RefreshCcw } from "lucide-react";
import ProductGrid, { type ProductGridItem } from "./ProductGrid";

const PAGE_SIZE = 12;

type SortOption = "newest" | "price_asc" | "price_desc";

interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  children: Category[];
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000000]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err: unknown) => console.error("Lỗi tải danh mục:", err));
  }, []);

  const currentCategoryName = useMemo(() => {
    const findName = (nodes: Category[]): string | null => {
      for (const node of nodes) {
        if (node.slug === slug) return node.name;
        const found = findName(node.children || []);
        if (found) return found;
      }
      return null;
    };
    return slug ? findName(categories) || slug : "Tất cả sản phẩm";
  }, [categories, slug]);

  const activeCategoryIds = useMemo(() => {
    const collect = (node: Category): number[] => [
      node.id,
      ...(node.children || []).flatMap(collect),
    ];
    const findNode = (nodes: Category[]): Category | null => {
      for (const node of nodes) {
        if (node.slug === slug) return node;
        const found = findNode(node.children || []);
        if (found) return found;
      }
      return null;
    };
    const node = slug ? findNode(categories) : null;
    return node ? collect(node) : [];
  }, [categories, slug]);

  const loadProducts = useCallback(
    async (nextPage = 0, append = false) => {
      // Yield to the microtask queue to avoid synchronous state updates in useEffect
      await Promise.resolve();

      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingInitial(true);
      }
      setError("");

      try {
        const data = await getProductsCardsApi({
          category_slug: slug,
          price_min: priceRange[0],
          price_max: priceRange[1],
          sizes: selectedSizes.join(","),
          colors: selectedColors.join(","),
          sort: sortBy,
          skip: nextPage * PAGE_SIZE,
          limit: PAGE_SIZE,
          include_facets: nextPage === 0,
        });
        setProducts((current) => (append ? [...current, ...(data.data || [])] : data.data || []));
        if (nextPage === 0) {
          setAvailableSizes(data.available_sizes || []);
          setAvailableColors(data.available_colors || []);
        }
        if (data.total !== -1) {
          setTotal(data.total || 0);
        }
        setHasMore(Boolean(data.has_more));
        setPage(nextPage);
      } catch (err: unknown) {
        console.error("Lỗi tải sản phẩm danh mục:", err);
        if (!append) setProducts([]);
        setError("Không tải được sản phẩm. Vui lòng thử lại.");
      } finally {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [priceRange, selectedColors, selectedSizes, slug, sortBy],
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProducts(0, false);
    });
  }, [loadProducts]);

  const toggleSize = (size: string) => {
    setSelectedSizes((current) =>
      current.includes(size) ? current.filter((item) => item !== size) : [...current, size],
    );
  };

  const toggleColor = (color: string) => {
    setSelectedColors((current) =>
      current.includes(color) ? current.filter((item) => item !== color) : [...current, color],
    );
  };

  const resetFilters = () => {
    setPriceRange([0, 5000000]);
    setSelectedSizes([]);
    setSelectedColors([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">Trang chủ</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">{currentCategoryName}</span>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <div className="sticky top-28 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4 text-lg font-bold text-slate-900">
                <Filter className="h-5 w-5" />
                Bộ lọc
              </div>

              <div className="mb-8">
                <h3 className="mb-4 font-semibold text-slate-900">Danh mục</h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category.id}>
                      <Link
                        to={`/category/${category.slug}`}
                        className={`block py-1 text-sm transition-colors ${
                          slug === category.slug || activeCategoryIds.includes(category.id)
                            ? "font-medium text-primary-600"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {category.name}
                      </Link>
                      {(slug === category.slug || activeCategoryIds.includes(category.id)) && category.children?.length > 0 && (
                        <div className="ml-4 mt-2 space-y-2 border-l border-slate-200 pl-4">
                          {category.children.map((child) => (
                            <Link
                              key={child.id}
                              to={`/category/${child.slug}`}
                              className={`block py-1 text-sm transition-colors ${
                                slug === child.slug || activeCategoryIds.includes(child.id)
                                  ? "font-medium text-primary-600"
                                  : "text-slate-500 hover:text-slate-900"
                              }`}
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <h3 className="mb-4 font-semibold text-slate-900">Mức giá</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={priceRange[0]}
                    onChange={(event) => setPriceRange([Number(event.target.value), priceRange[1]])}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm focus:ring-1 focus:ring-primary-500"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    value={priceRange[1]}
                    onChange={(event) => setPriceRange([priceRange[0], Number(event.target.value)])}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              {availableSizes.length > 0 && (
                <div className="mb-8">
                  <h3 className="mb-4 font-semibold text-slate-900">Kích cỡ</h3>
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleSize(size)}
                        className={`min-w-10 rounded-lg border px-2 py-1.5 text-sm font-medium transition-all ${
                          selectedSizes.includes(size)
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableColors.length > 0 && (
                <div className="mb-8">
                  <h3 className="mb-4 font-semibold text-slate-900">Màu sắc</h3>
                  <div className="flex flex-wrap gap-2">
                    {availableColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => toggleColor(color)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          selectedColors.includes(color)
                            ? "border-primary-200 bg-primary-50 text-primary-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
              >
                <RefreshCcw className="h-4 w-4" />
                Xóa bộ lọc
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{currentCategoryName}</h1>
                <p className="mt-1 text-sm text-slate-500">Tìm thấy {total} sản phẩm</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                <span className="pl-3 text-sm text-slate-500">Sắp xếp:</span>
                <select
                  className="cursor-pointer border-none bg-transparent pr-8 text-sm font-medium text-slate-900 focus:ring-0"
                  value={sortBy}
                  onChange={(event) => {
                    const nextSort = event.target.value as SortOption;
                    setSortBy(nextSort);
                    setProducts([]);
                    setPage(0);
                  }}
                >
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá tăng dần</option>
                  <option value="price_desc">Giá giảm dần</option>
                </select>
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
                emptyTitle="Không tìm thấy sản phẩm"
                emptyDescription="Thử thay đổi bộ lọc hoặc chọn danh mục khác để xem thêm sản phẩm."
              />
            )}

            {!loadingInitial && products.length > 0 && (
              <div className="mt-8 flex justify-center">
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => loadProducts(page + 1, true)}
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
          </main>
        </div>
      </div>
    </div>
  );
}
