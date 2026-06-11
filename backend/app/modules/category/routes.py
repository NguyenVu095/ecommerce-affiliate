import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.cache import category_cache, category_descendants_cache, product_cards_cache
from app.core.deps import get_current_admin
from app.core.validation import clean_required_text, normalize_public_code
from app.db.database import get_db
from app.modules.category.models import Category
from app.modules.category.schemas import CategoryCreate, CategoryResponse
from app.modules.user.models import User

router = APIRouter()
logger = logging.getLogger(__name__)


def build_category_tree(categories: list[Category]) -> list[dict]:
    """Dựng cây danh mục từ danh sách phẳng bằng thuật toán nhóm theo parent_id.

    Thuật toán O(N): nhóm tất cả categories vào dict theo parent_id trong 1 vòng
    quét, sau đó đệ quy dựng cây từ gốc (parent_id=None) bằng tra cứu O(1) trên
    dict — tránh hoàn toàn lỗi N+1 query khi xây dựng tree bằng Lazy Load.
    """
    # Nhóm toàn bộ categories theo parent_id trong 1 vòng quét O(N)
    by_parent: dict[int | None, list[Category]] = {}
    for cat in categories:
        by_parent.setdefault(cat.parent_id, []).append(cat)

    def get_children(parent_id: int | None) -> list[dict]:
        """Đệ quy lấy danh sách con của một node, tra cứu O(1) trên dict."""
        nodes = by_parent.get(parent_id, [])
        result = []
        for node in nodes:
            result.append({
                "id": node.id,
                "name": node.name,
                "slug": node.slug,
                "parent_id": node.parent_id,
                "status": node.status,
                "children": get_children(node.id),
            })
        return result

    return get_children(None)


@router.get("/", response_model=list[CategoryResponse])
def get_categories(db: Session = Depends(get_db)) -> list[dict]:
    """Trả về danh sách categories dạng cây (1 query duy nhất, dựng cây bằng Python, tích hợp cache).

    Chiến lược tối ưu:
    - 1 query SELECT duy nhất lấy toàn bộ categories đang active (status=1).
    - Dựng cây bằng `build_category_tree` theo thuật toán O(N) trong bộ nhớ Python.
    - Kết quả được cache trong bộ nhớ (category_cache), các request tiếp theo
      trả về ngay lập tức mà không cần truy vấn DB.
    """
    cached_data = category_cache.get()
    if cached_data is not None:
        return cached_data

    categories = (
        db.query(Category)
        .filter(Category.status == 1)
        .order_by(Category.id)
        .all()
    )
    tree = build_category_tree(categories)
    category_cache.set(tree)
    return tree


@router.get("/{slug}", response_model=CategoryResponse)
def get_category_by_slug(slug: str, db: Session = Depends(get_db)) -> dict:
    """Tìm kiếm node category theo slug trong cây đã được cache.

    Tái sử dụng `get_categories` (đã tích hợp cache) để không phát sinh thêm
    DB query. Tìm kiếm DFS đệ quy O(N) trên cây đang nằm trong bộ nhớ.
    """
    tree = get_categories(db)

    def find_node(nodes: list[dict], target_slug: str) -> dict | None:
        """Tìm kiếm DFS đệ quy qua cây category theo slug."""
        for node in nodes:
            if node["slug"] == target_slug:
                return node
            found = find_node(node.get("children", []), target_slug)
            if found:
                return found
        return None

    node = find_node(tree, slug)
    if not node:
        raise HTTPException(status_code=404, detail="Category not found")
    return node


@router.post("/", response_model=CategoryResponse)
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> CategoryResponse:
    """Tạo danh mục mới và vô hiệu hóa toàn bộ cache liên quan.

    Tối ưu DB Transaction: thay `db.commit()` + `db.refresh()` bằng `db.flush()`
    + `CategoryResponse.model_validate()` in-memory + 1 `db.commit()` duy nhất
    — giảm Supabase network roundtrips từ 2 xuống 1.

    Sau khi tạo thành công, invalidate toàn bộ 3 cache liên quan (category_cache,
    category_descendants_cache, product_cards_cache) để đảm bảo dữ liệu nhất quán.
    """
    data = category.model_dump()
    data["name"] = clean_required_text(data["name"], max_length=100, field_name="name")
    data["slug"] = normalize_public_code(data["slug"], max_length=100, field_name="slug")
    db_category = Category(**data)
    db.add(db_category)
    # flush() đồng bộ trạng thái session với DB tạm thời để lấy autoincrement ID
    # mà không gây commit vật lý (Disk I/O). Đảm bảo tính ACID cho toàn transaction.
    db.flush()
    # Build response in-memory từ object đã có id sau flush — tránh db.refresh() thừa.
    response = CategoryResponse.model_validate(db_category)
    db.commit()
    # Vô hiệu hóa toàn bộ cache sau khi cây danh mục thay đổi
    category_cache.invalidate()
    category_descendants_cache.invalidate()
    product_cards_cache.invalidate()
    logger.info("Admin tạo danh mục mới: category_id=%s, slug=%s", db_category.id, db_category.slug)
    return response
