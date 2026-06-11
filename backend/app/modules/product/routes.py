"""
Module quản lý sản phẩm: danh sách, chi tiết, tạo mới, đánh giá sản phẩm.
"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.cache import category_descendants_cache, home_products_cache, product_cards_cache
from app.core.deps import get_current_admin, get_current_user
from app.core.validation import clean_required_text, clean_text, normalize_image_url_or_data, normalize_url
from app.db.database import get_db
from app.modules.category.models import Category
from app.modules.order.models import Order, OrderItem
from app.modules.product.models import Product
from app.modules.product.review_models import ProductReview
from app.modules.product.schemas import (
    ProductCardListResponse,
    ProductCardResponse,
    ProductCreate,
    ProductResponse,
    ProductReviewCreate,
    ProductReviewResponse,
    ProductReviewUpdate,
    ProductReviewsResponse,
)
from app.modules.product.variant_models import ProductVariant
from app.modules.user.models import User

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Hàm tiện ích nội bộ ───────────────────────────────────────────────────────

def get_category_descendant_ids(db: Session, slug: str | None) -> list[int]:
    """Trả về danh sách ID của danh mục chỉ định và tất cả hậu duệ của nó.

    Thuật toán O(N): tải toàn bộ categories bằng 1 query, nhóm theo parent_id
    vào dict, sau đó BFS/DFS iterative để tìm tất cả descendant IDs — tránh N+1.
    Kết quả được cache theo slug để các request tiếp theo không cần tính lại.
    """
    if not slug:
        return []

    cached_descendants = category_descendants_cache.get(slug)
    if cached_descendants is not None:
        return cached_descendants

    rows = (
        db.query(Category.id, Category.parent_id, Category.slug)
        .filter(Category.status == 1)
        .all()
    )
    target_id = next((cat_id for cat_id, _, cat_slug in rows if cat_slug == slug), None)
    if target_id is None:
        raise HTTPException(status_code=404, detail="Category not found")

    # Nhóm children theo parent_id trong O(N) để tra cứu O(1) khi duyệt cây
    children_by_parent: dict[int | None, list[int]] = {}
    for cat_id, parent_id, _ in rows:
        children_by_parent.setdefault(parent_id, []).append(cat_id)

    # BFS iterative để thu thập tất cả descendant IDs (tránh stack overflow đệ quy)
    result: list[int] = []
    stack = [target_id]
    while stack:
        cat_id = stack.pop()
        result.append(cat_id)
        stack.extend(children_by_parent.get(cat_id, []))

    category_descendants_cache.set(result, slug)
    return result


def optimize_image_url(url: str | None, width: int = 400) -> str | None:
    """Tối ưu hóa URL ảnh Unsplash bằng cách giới hạn chiều rộng tải về.

    Giảm băng thông: thay tham số w= hiện có hoặc thêm mới nếu chưa có.
    Chỉ áp dụng cho ảnh từ images.unsplash.com.
    """
    if url and "images.unsplash.com" in url:
        if "w=" in url:
            return re.sub(r"w=\d+", f"w={width}", url)
        else:
            return f"{url}&w={width}"
    return url


def serialize_product_card(product: Product) -> ProductCardResponse:
    """Chuyển Product ORM object thành ProductCardResponse gọn nhẹ cho danh sách.

    Tính toán min_price, has_sale, best_discount, total_stock từ danh sách
    variants đã được eager load sẵn — không phát sinh thêm query.
    """
    active_variants = [v for v in product.variants if v.status == 1]
    prices = [
        float(v.sale_price or v.price)
        for v in active_variants
        if v.sale_price is not None or v.price is not None
    ]
    sale_variants = [
        v for v in active_variants
        if v.sale_price is not None and v.sale_price < v.price and v.price > 0
    ]
    best_discount = 0
    if sale_variants:
        best_discount = max(
            round(((float(v.price) - float(v.sale_price)) / float(v.price)) * 100)
            for v in sale_variants
        )

    return ProductCardResponse(
        id=product.id,
        name=product.name,
        base_price=float(product.base_price),
        thumbnail=optimize_image_url(product.thumbnail, width=400),
        min_price=min(prices) if prices else float(product.base_price),
        has_sale=bool(sale_variants),
        total_stock=sum(int(v.stock or 0) for v in active_variants),
        best_discount=best_discount,
    )


def normalize_review_images(images: list[str] | None) -> list[str]:
    """Chuẩn hóa và giới hạn tối đa 4 ảnh trong đánh giá sản phẩm."""
    if not images:
        return []

    clean_images = []
    for image in images:
        if not isinstance(image, str):
            raise HTTPException(status_code=400, detail="Review image must be a string")
        if not image.strip():
            continue
        clean_images.append(normalize_image_url_or_data(image, field_name="review_image"))
        if len(clean_images) > 4:
            raise HTTPException(status_code=400, detail="A review can include up to 4 images")

    return clean_images


def validate_review_rating(rating: int) -> None:
    """Kiểm tra rating hợp lệ trong khoảng [1, 5]."""
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")


def serialize_review(review: ProductReview, user: User) -> dict:
    """Chuyển ProductReview ORM object thành dict phản hồi kèm thông tin người dùng."""
    return {
        "id": review.id,
        "product_id": review.product_id,
        "order_item_id": review.order_item_id,
        "rating": review.rating,
        "comment": review.comment,
        "images": review.images,
        "status": review.status,
        "user_name": user.full_name or user.email,
        "user_avatar": user.avatar,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ProductResponse])
def get_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    category_id: int | None = None,
    search: str | None = None,
    has_sale: bool | None = None,
    sort: str = "newest",
    db: Session = Depends(get_db),
) -> list[Product]:
    """Trả về danh sách sản phẩm đầy đủ (dùng cho trang Admin/Affiliate).

    Hỗ trợ lọc theo category, tìm kiếm full-text, lọc đang giảm giá,
    và sắp xếp theo nhiều tiêu chí. joinedload tải sẵn variants + category
    trong 2 queries bổ sung — tránh N+1 khi serialize.
    """
    query = db.query(Product).options(
        joinedload(Product.variants),
        joinedload(Product.category),
    ).filter(Product.status == 1, Product.deleted_at.is_(None))

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if search and search.strip():
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(keyword),
                Product.slug.ilike(keyword),
                Product.description.ilike(keyword),
            )
        )

    if has_sale is True:
        query = query.filter(
            Product.variants.any(
                and_(
                    ProductVariant.status == 1,
                    ProductVariant.sale_price.isnot(None),
                    ProductVariant.sale_price < ProductVariant.price,
                )
            )
        )

    if sort == "discount_desc":
        discount_subquery = (
            db.query(
                ProductVariant.product_id.label("product_id"),
                func.max(
                    (ProductVariant.price - ProductVariant.sale_price) / ProductVariant.price
                ).label("discount_rate"),
            )
            .filter(
                ProductVariant.status == 1,
                ProductVariant.sale_price.isnot(None),
                ProductVariant.sale_price < ProductVariant.price,
                ProductVariant.price > 0,
            )
            .group_by(ProductVariant.product_id)
            .subquery()
        )
        query = (
            query.join(discount_subquery, discount_subquery.c.product_id == Product.id)
            .order_by(discount_subquery.c.discount_rate.desc(), Product.id.desc())
        )
    elif sort == "price_asc":
        query = query.order_by(Product.base_price.asc(), Product.id.desc())
    elif sort == "price_desc":
        query = query.order_by(Product.base_price.desc(), Product.id.desc())
    else:
        query = query.order_by(Product.created_at.desc(), Product.id.desc())

    return query.offset(skip).limit(limit).all()


@router.get("/cards", response_model=ProductCardListResponse)
def get_product_cards(
    skip: int = Query(0, ge=0),
    limit: int = Query(12, ge=1, le=60),
    category_id: int | None = None,
    category_slug: str | None = None,
    search: str | None = None,
    has_sale: bool | None = None,
    price_min: float | None = Query(None, ge=0),
    price_max: float | None = Query(None, ge=0),
    sizes: str | None = None,
    colors: str | None = None,
    min_discount: int | None = Query(None, ge=0, le=100),
    sort: str = "newest",
    include_facets: bool = Query(False),
    db: Session = Depends(get_db),
) -> ProductCardListResponse:
    """Trả về danh sách sản phẩm dạng card gọn nhẹ cho trang danh sách người dùng.

    Tích hợp cache theo cache_key tổng hợp từ tất cả tham số lọc.
    Hỗ trợ lọc nâng cao: giá, kích thước, màu sắc, discount tối thiểu, facets.
    Dùng kỹ thuật limit+1 để kiểm tra has_more mà không cần COUNT query thêm.
    """
    cache_key = (
        f"skip={skip}&limit={limit}&cat_id={category_id}&cat_slug={category_slug or ''}"
        f"&search={search or ''}&has_sale={has_sale}&p_min={price_min}&p_max={price_max}"
        f"&sizes={sizes or ''}&colors={colors or ''}&min_disc={min_discount}"
        f"&sort={sort}&facets={include_facets}"
    )
    cached_data = product_cards_cache.get(cache_key)
    if cached_data is not None:
        return ProductCardListResponse(**cached_data)

    category_ids = get_category_descendant_ids(db, category_slug)
    effective_price = func.coalesce(ProductVariant.sale_price, ProductVariant.price)

    query = db.query(Product).options(joinedload(Product.variants)).filter(
        Product.status == 1,
        Product.deleted_at.is_(None),
    )

    if category_ids:
        query = query.filter(Product.category_id.in_(category_ids))
    elif category_id:
        query = query.filter(Product.category_id == category_id)

    if search and search.strip():
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(keyword),
                Product.slug.ilike(keyword),
                Product.description.ilike(keyword),
            )
        )

    active_variant_conditions = [ProductVariant.status == 1]
    if price_min is not None:
        active_variant_conditions.append(effective_price >= price_min)
    if price_max is not None:
        active_variant_conditions.append(effective_price <= price_max)
    clean_sizes = [size.strip() for size in (sizes or "").split(",") if size.strip()]
    clean_colors = [color.strip() for color in (colors or "").split(",") if color.strip()]
    if clean_sizes:
        active_variant_conditions.append(ProductVariant.attributes["size"].as_string().in_(clean_sizes))
    if clean_colors:
        active_variant_conditions.append(ProductVariant.attributes["color"].as_string().in_(clean_colors))

    if len(active_variant_conditions) > 1:
        query = query.filter(Product.variants.any(and_(*active_variant_conditions)))

    if has_sale is True:
        query = query.filter(
            Product.variants.any(
                and_(
                    ProductVariant.status == 1,
                    ProductVariant.sale_price.isnot(None),
                    ProductVariant.sale_price < ProductVariant.price,
                )
            )
        )

    if min_discount is not None and min_discount > 0:
        min_discount_rate = min_discount / 100
        query = query.filter(
            Product.variants.any(
                and_(
                    ProductVariant.status == 1,
                    ProductVariant.sale_price.isnot(None),
                    ProductVariant.sale_price < ProductVariant.price,
                    ProductVariant.price > 0,
                    ((ProductVariant.price - ProductVariant.sale_price) / ProductVariant.price) >= min_discount_rate,
                )
            )
        )

    # Facets: thu thập sizes/colors có sẵn trong phạm vi filter hiện tại
    available_sizes: list[str] = []
    available_colors: list[str] = []
    if include_facets:
        facets_query = (
            db.query(
                ProductVariant.attributes["size"].as_string(),
                ProductVariant.attributes["color"].as_string(),
            )
            .join(Product, Product.id == ProductVariant.product_id)
            .filter(
                Product.status == 1,
                Product.deleted_at.is_(None),
                ProductVariant.status == 1,
            )
        )
        if category_ids:
            facets_query = facets_query.filter(Product.category_id.in_(category_ids))
        elif category_id:
            facets_query = facets_query.filter(Product.category_id == category_id)
        if search and search.strip():
            keyword = f"%{search.strip()}%"
            facets_query = facets_query.filter(
                or_(
                    Product.name.ilike(keyword),
                    Product.slug.ilike(keyword),
                    Product.description.ilike(keyword),
                )
            )
        if has_sale is True:
            facets_query = facets_query.filter(
                ProductVariant.sale_price.isnot(None),
                ProductVariant.sale_price < ProductVariant.price,
            )
        if price_min is not None:
            facets_query = facets_query.filter(effective_price >= price_min)
        if price_max is not None:
            facets_query = facets_query.filter(effective_price <= price_max)

        facet_rows = facets_query.distinct().limit(200).all()
        available_sizes = sorted({size for size, _ in facet_rows if size})
        available_colors = sorted({color for _, color in facet_rows if color})

    # Chỉ COUNT khi cần facets (để hiển thị tổng số kết quả)
    total = query.count() if include_facets else -1

    if sort == "discount_desc":
        discount_subquery = (
            db.query(
                ProductVariant.product_id.label("product_id"),
                func.max(
                    (ProductVariant.price - ProductVariant.sale_price) / ProductVariant.price
                ).label("discount_rate"),
            )
            .filter(
                ProductVariant.status == 1,
                ProductVariant.sale_price.isnot(None),
                ProductVariant.sale_price < ProductVariant.price,
                ProductVariant.price > 0,
            )
            .group_by(ProductVariant.product_id)
            .subquery()
        )
        query = query.join(
            discount_subquery, discount_subquery.c.product_id == Product.id
        ).order_by(discount_subquery.c.discount_rate.desc(), Product.id.desc())
    elif sort == "price_asc":
        query = query.order_by(Product.base_price.asc(), Product.id.desc())
    elif sort == "price_desc":
        query = query.order_by(Product.base_price.desc(), Product.id.desc())
    else:
        query = query.order_by(Product.created_at.desc(), Product.id.desc())

    # Kỹ thuật limit+1 để phát hiện has_more mà không cần thêm COUNT query
    products = query.offset(skip).limit(limit + 1).all()
    has_more = len(products) > limit
    if has_more:
        products = products[:limit]

    response_data = ProductCardListResponse(
        total=total,
        skip=skip,
        limit=limit,
        has_more=has_more,
        available_sizes=available_sizes,
        available_colors=available_colors,
        data=[serialize_product_card(product) for product in products],
    )
    product_cards_cache.set(response_data.model_dump(), cache_key)
    return response_data


@router.get("/home", response_model=list[ProductCardResponse])
def get_home_products(db: Session = Depends(get_db)) -> list[ProductCardResponse]:
    """Trả về danh sách 8 sản phẩm mới nhất dạng gọn nhẹ cho trang chủ.

    Kết quả được cache trong bộ nhớ (home_products_cache). joinedload tải
    sẵn variants để serialize_product_card không kích hoạt Lazy Load.
    """
    cached_data = home_products_cache.get()
    if cached_data is not None:
        return cached_data

    products = (
        db.query(Product)
        .options(joinedload(Product.variants))
        .filter(Product.status == 1, Product.deleted_at.is_(None))
        .order_by(Product.created_at.desc(), Product.id.desc())
        .limit(8)
        .all()
    )
    result = [serialize_product_card(product) for product in products]
    home_products_cache.set(result)
    return result


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    """Trả về chi tiết sản phẩm theo ID, kèm variants và category (eager load)."""
    product = (
        db.query(Product)
        .options(
            joinedload(Product.variants),
            joinedload(Product.category),
        )
        .filter(Product.id == product_id, Product.status == 1, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/reviews", response_model=ProductReviewsResponse)
def get_product_reviews(
    product_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    """Trả về danh sách đánh giá đã duyệt của sản phẩm, kèm thống kê tổng hợp.

    Dùng 2 queries riêng biệt:
    - 1 query GROUP BY để tính summary (rating_counts, average) — tránh tải thừa.
    - 1 query JOIN User để lấy danh sách reviews phân trang kèm thông tin người dùng.
    """
    product = (
        db.query(Product.id)
        .filter(Product.id == product_id, Product.status == 1, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    # Tính summary bằng 1 query GROUP BY — tránh tải toàn bộ review vào memory
    summary_rows = (
        db.query(ProductReview.rating, func.count(ProductReview.id))
        .filter(ProductReview.product_id == product_id, ProductReview.status == "approved")
        .group_by(ProductReview.rating)
        .all()
    )
    rating_counts: dict[int, int] = {i: 0 for i in range(1, 6)}
    rating_total = 0
    total_reviews = 0
    for rating, count in summary_rows:
        rating_value = int(rating)
        count_value = int(count or 0)
        if rating_value in rating_counts:
            rating_counts[rating_value] = count_value
        rating_total += rating_value * count_value
        total_reviews += count_value

    # Lấy danh sách reviews phân trang + JOIN User trong 1 query
    rows = (
        db.query(ProductReview, User)
        .join(User, User.id == ProductReview.user_id)
        .filter(ProductReview.product_id == product_id, ProductReview.status == "approved")
        .order_by(ProductReview.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    reviews = [serialize_review(review, user) for review, user in rows]
    average_rating = round(rating_total / total_reviews, 1) if total_reviews else 0.0

    return {
        "summary": {
            "average_rating": average_rating,
            "total_reviews": total_reviews,
            "rating_counts": rating_counts,
        },
        "skip": skip,
        "limit": limit,
        "has_more": skip + len(reviews) < total_reviews,
        "reviews": reviews,
    }


@router.post("/{product_id}/reviews", response_model=ProductReviewResponse, status_code=201)
def create_product_review(
    product_id: int,
    payload: ProductReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Tạo đánh giá sản phẩm — chỉ cho phép sau khi đã mua hàng thành công.

    Tối ưu DB Transaction: thay `db.commit()` + `db.refresh()` bằng `db.flush()`
    + `serialize_review()` in-memory + 1 `db.commit()` duy nhất
    — giảm Supabase network roundtrips từ 2 xuống 1.
    """
    validate_review_rating(payload.rating)
    review_images = normalize_review_images(payload.images)

    product = (
        db.query(Product.id)
        .filter(Product.id == product_id, Product.status == 1, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    # Xác minh người dùng đã mua sản phẩm này trong đơn hàng thành công
    purchased_item = (
        db.query(OrderItem, Order, ProductVariant)
        .join(Order, Order.id == OrderItem.order_id)
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .filter(
            OrderItem.id == payload.order_item_id,
            Order.user_id == current_user.id,
            ProductVariant.product_id == product_id,
        )
        .first()
    )
    if purchased_item is None:
        raise HTTPException(status_code=400, detail="Bạn chỉ có thể đánh giá sản phẩm đã mua")

    _, order, _ = purchased_item
    if order.status != "success":
        raise HTTPException(status_code=400, detail="Chỉ có thể đánh giá sau khi đơn hàng đã nhận thành công")

    existing_review = (
        db.query(ProductReview)
        .filter(ProductReview.order_item_id == payload.order_item_id)
        .first()
    )
    if existing_review:
        raise HTTPException(status_code=400, detail="Sản phẩm này đã được đánh giá cho đơn hàng này")

    review = ProductReview(
        user_id=current_user.id,
        product_id=product_id,
        order_item_id=payload.order_item_id,
        rating=payload.rating,
        comment=clean_text(payload.comment, max_length=2000, field_name="comment"),
        images=review_images,
        status="approved",
    )
    db.add(review)
    # flush() đồng bộ trạng thái session để lấy ID tự sinh mà không commit vật lý.
    # Build response in-memory từ object đã flush — tránh db.refresh() thêm 1 roundtrip.
    db.flush()
    response = serialize_review(review, current_user)
    db.commit()
    return response


@router.put("/{product_id}/reviews/{review_id}", response_model=ProductReviewResponse)
def update_product_review(
    product_id: int,
    review_id: int,
    payload: ProductReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Cập nhật đánh giá sản phẩm của người dùng hiện tại.

    Tối ưu DB Transaction: loại bỏ `db.refresh()` dư thừa — review là object
    đã được SQLAlchemy session theo dõi, sau db.commit() các field vẫn phản ánh
    đúng giá trị mới → không cần thêm 1 roundtrip SELECT.
    """
    validate_review_rating(payload.rating)
    review_images = normalize_review_images(payload.images)

    review = (
        db.query(ProductReview)
        .filter(
            ProductReview.id == review_id,
            ProductReview.product_id == product_id,
            ProductReview.user_id == current_user.id,
        )
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    review.rating = payload.rating
    review.comment = clean_text(payload.comment, max_length=2000, field_name="comment")
    review.images = review_images
    review.status = "approved"
    db.commit()
    # review vẫn được session track và phản ánh đúng giá trị mới — không cần db.refresh().
    return serialize_review(review, current_user)


@router.delete("/{product_id}/reviews/{review_id}")
def delete_product_review(
    product_id: int,
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Xóa đánh giá sản phẩm của người dùng hiện tại."""
    review = (
        db.query(ProductReview)
        .filter(
            ProductReview.id == review_id,
            ProductReview.product_id == product_id,
            ProductReview.user_id == current_user.id,
        )
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    db.delete(review)
    db.commit()
    return {"message": "Review deleted", "review_id": review_id}


@router.post("/", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Product:
    """Tạo sản phẩm mới kèm danh sách variants (chỉ Admin).

    Tối ưu DB Transaction nghiêm trọng: loại bỏ double db.commit() (dòng 600 & 610)
    và 2x db.refresh() (dòng 601 & 613) trong code cũ.
    Chiến lược mới: 1 db.flush() sau khi add Product để lấy ID, add tất cả variants,
    rồi 1 db.commit() + 1 db.refresh() duy nhất ở cuối
    — giảm Supabase roundtrips từ 4 xuống 2 (1 flush + 1 commit + 1 refresh để load variants).
    """
    variants_data = product.variants
    product_dict = product.model_dump(exclude={"variants"})
    product_dict["name"] = clean_required_text(product_dict["name"], max_length=255, field_name="name")
    product_dict["description"] = clean_text(
        product_dict.get("description"), max_length=5000, field_name="description"
    )
    product_dict["thumbnail"] = normalize_url(
        product_dict.get("thumbnail"), max_length=2048, field_name="thumbnail"
    )

    db_product = Product(**product_dict)
    db.add(db_product)
    # flush() lấy db_product.id tự sinh để gán cho variants — không commit vật lý.
    db.flush()

    # Add tất cả variants trong 1 batch — không flush/commit từng cái
    for v in variants_data:
        variant_data = v.model_dump()
        variant_data["image_url"] = normalize_url(
            variant_data.get("image_url"), max_length=2048, field_name="image_url"
        )
        db.add(ProductVariant(**variant_data, product_id=db_product.id))

    # 1 commit duy nhất cho toàn bộ transaction (Product + tất cả Variants)
    db.commit()
    # 1 db.refresh() để load variants relationship sau commit (cần thiết để return đúng)
    db.refresh(db_product)

    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    logger.info(
        "Admin tạo sản phẩm mới: product_id=%s, name=%s, variants=%d",
        db_product.id, db_product.name, len(variants_data),
    )
    return db_product
