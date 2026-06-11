from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.rate_limit import newsletter_rate_limiter
from app.core.validation import clean_required_text
from app.modules.newsletter.models import NewsletterSubscription
from app.modules.newsletter.schemas import NewsletterSubscribeRequest, NewsletterSubscribeResponse

router = APIRouter()


@router.post(
    "/subscribe",
    response_model=NewsletterSubscribeResponse,
    status_code=201,
    dependencies=[Depends(newsletter_rate_limiter)],
)
def subscribe_newsletter(
    payload: NewsletterSubscribeRequest, db: Session = Depends(get_db)
) -> NewsletterSubscribeResponse:
    """
    API đăng ký nhận tin tức (Newsletter Subscription).

    Luồng xử lý:
    1. Chuẩn hóa email (viết thường, loại bỏ khoảng trắng) và xác thực nguồn đăng ký.
    2. Truy vấn kiểm tra email đã tồn tại trong hệ thống chưa.
    3. Nếu đã tồn tại:
       - Nếu ở trạng thái 'active', thông báo đã đăng ký.
       - Nếu đang ở trạng thái khác (ví dụ: 'inactive' hoặc 'unsubscribed'), chuyển lại thành 'active'.
    4. Nếu chưa tồn tại:
       - Tạo mới bản ghi đăng ký với trạng thái 'active'.
    5. Lưu dữ liệu tối ưu:
       - Sử dụng `db.flush()` để đẩy dữ liệu tạm thời lên DB và lấy ID tự động.
       - Tạo trước đối tượng phản hồi bằng Python nhằm tránh việc truy vấn lại DB (tránh trễ mạng do lazy loading sau commit).
       - Chỉ gọi `db.commit()` duy nhất một lần ở cuối để hoàn tất giao dịch.
    """
    email = payload.email.lower().strip()
    source = clean_required_text(payload.source or "website", max_length=50, field_name="source")

    # TỐI ƯU HÓA TRUY VẤN: Lấy thời gian hiện tại từ Python để gán trực tiếp,
    # giúp tránh việc sử dụng SQL expression func.now() buộc phải refresh/commit mới xem được giá trị.
    now = datetime.now()

    # 1. Truy vấn kiểm tra sự tồn tại của email (1 roundtrip)
    subscription = (
        db.query(NewsletterSubscription)
        .filter(NewsletterSubscription.email == email)
        .first()
    )

    if subscription:
        already_subscribed = subscription.status == "active"
        if not already_subscribed:
            # Tái kích hoạt đăng ký
            subscription.status = "active"
            subscription.source = source
            subscription.unsubscribed_at = None
            subscription.subscribed_at = now
            message = "Bạn đã đăng ký nhận tin thành công."
        else:
            message = "Email này đã có trong danh sách nhận tin."

        # Sử dụng db.flush() để đồng bộ hóa trạng thái tạm thời với DB (không sinh Disk I/O)
        db.flush()

        # TỐI ƯU HÓA HIỆU NĂNG: Khởi tạo đối tượng phản hồi bằng các thuộc tính trong memory
        # trước khi commit. Điều này tránh việc SQLAlchemy tự động expire đối tượng và trigger 1 select query ngầm (lazy load)
        # để truy xuất thông tin sau khi commit, tiết kiệm thêm 1 network roundtrip.
        response = NewsletterSubscribeResponse(
            id=subscription.id,
            email=subscription.email,
            status=subscription.status,
            already_subscribed=already_subscribed,
            message=message,
            subscribed_at=subscription.subscribed_at,
        )
        
        # Chỉ gọi commit 1 lần duy nhất ở cuối luồng xử lý thành công để ghi dữ liệu vật lý
        db.commit()
        return response

    # 2. Tạo mới lượt đăng ký nếu chưa tồn tại
    subscription = NewsletterSubscription(
        email=email,
        source=source,
        status="active",
        subscribed_at=now,
    )
    db.add(subscription)
    
    # Flush để lấy auto-increment ID từ database mà không cần commit ghi đĩa ngay lập tức
    db.flush()

    # Khởi tạo đối tượng phản hồi bằng các thuộc tính trong memory trước khi commit để tránh lazy loading
    response = NewsletterSubscribeResponse(
        id=subscription.id,
        email=subscription.email,
        status=subscription.status,
        already_subscribed=False,
        message="Bạn đã đăng ký nhận tin thành công.",
        subscribed_at=subscription.subscribed_at,
    )

    # Chỉ gọi commit 1 lần duy nhất để hoàn thành transaction ghi xuống đĩa cứng vật lý
    db.commit()

    return response

