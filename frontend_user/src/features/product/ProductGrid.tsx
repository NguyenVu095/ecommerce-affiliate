import { Link } from "react-router-dom";
import { PackageSearch } from "lucide-react";

export interface ProductGridVariant {
  id: number;
  price: number;
  sale_price: number | null;
  stock: number;
}

export interface ProductGridItem {
  id: number;
  name: string;
  base_price: number;
  thumbnail: string | null;
  variants?: ProductGridVariant[];
  min_price?: number;
  has_sale?: boolean;
  total_stock?: number;
  best_discount?: number;
}

interface ProductGridProps {
  products: ProductGridItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}

const fallbackImage =
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600&auto=format&fit=crop";

export default function ProductGrid({
  products,
  emptyTitle = "Không tìm thấy sản phẩm",
  emptyDescription = "Thử đổi từ khóa hoặc quay lại danh mục để xem thêm sản phẩm.",
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
        <PackageSearch className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <h3 className="text-lg font-bold text-slate-900">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          {emptyDescription}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const variants = product.variants || [];
        const totalStock = product.total_stock ?? variants.reduce((sum, variant) => sum + variant.stock, 0);
        const saleVariants = variants.filter(
          (variant) => variant.sale_price !== null && variant.sale_price < variant.price,
        );
        const minPrice =
          product.min_price ??
          (variants.length > 0
            ? Math.min(...variants.map((variant) => variant.sale_price ?? variant.price))
            : product.base_price);
        const hasSale = product.has_sale ?? saleVariants.length > 0;
        const bestDiscount =
          product.best_discount ??
          (hasSale
            ? Math.max(
                ...saleVariants.map((variant) =>
                  Math.round(((variant.price - Number(variant.sale_price)) / variant.price) * 100),
                ),
              )
            : 0);

        return (
          <Link
            key={product.id}
            to={`/product/${product.id}`}
            className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-3 transition-all duration-300 hover:border-slate-200 hover:shadow-xl"
          >
            <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-xl bg-slate-100">
              <img
                src={product.thumbnail || fallbackImage}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              {hasSale ? (
                <div className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white shadow-sm">
                  -{bestDiscount}%
                </div>
              ) : (
                <div className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-900 shadow-sm">
                  NEW
                </div>
              )}
              {totalStock <= 0 && (
                <div className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white shadow-sm backdrop-blur-sm">
                  HẾT HÀNG
                </div>
              )}
              <div className="absolute inset-0 bg-black/5 transition-colors group-hover:bg-black/0" />
            </div>

            <div className="flex flex-1 flex-col px-1">
              <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors group-hover:text-primary-600">
                {product.name}
              </h3>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                <span className="font-bold text-primary-600">
                  {minPrice.toLocaleString("vi-VN")} ₫
                </span>
                {hasSale && (
                  <span className="text-xs text-slate-400 line-through">
                    {product.base_price.toLocaleString("vi-VN")} ₫
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
