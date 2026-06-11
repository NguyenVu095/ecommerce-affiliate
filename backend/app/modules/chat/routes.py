"""
Module định nghĩa các API routes cho tính năng Chat hỗ trợ trực tuyến và tư vấn khách hàng.
"""

import hashlib
import hmac
import logging
import os
import re
import secrets

import requests
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func
from app.db.database import get_db
from app.modules.chat.models import ChatSession, ChatMessage
from app.modules.chat.schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate, ChatMessageResponse
from app.modules.product.models import Product
from app.modules.order.models import Order
from app.core.deps import get_current_user_optional
from app.core.rate_limit import (
    chat_handoff_rate_limiter,
    chat_message_rate_limiter,
    chat_read_rate_limiter,
    chat_session_rate_limiter,
)
from app.core.validation import clean_text
from app.modules.user.models import User

router = APIRouter()
logger = logging.getLogger(__name__)


def _hash_chat_access_token(access_token: str) -> str:
    """Hash an opaque guest chat token before persistence."""
    return hashlib.sha256(access_token.encode("utf-8")).hexdigest()


def _get_authorized_session(
    db: Session,
    session_id: int,
    current_user: User | None,
    access_token: str | None,
) -> ChatSession:
    """Load a chat session and verify JWT ownership or the guest session token."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    if session.user_id is not None:
        if not current_user or current_user.id != session.user_id:
            raise HTTPException(status_code=403, detail="You do not have access to this chat session")
        return session

    if not access_token or not session.access_token_hash:
        raise HTTPException(status_code=403, detail="Chat session verification failed")
    supplied_hash = _hash_chat_access_token(access_token)
    if not hmac.compare_digest(supplied_hash, session.access_token_hash):
        raise HTTPException(status_code=403, detail="Chat session verification failed")
    return session

# Tĩnh lũy kiến thức FAQ của cửa hàng để AI trả lời chuẩn xác
STORE_FAQ = """
1. Chính sách đổi trả: Khách hàng được đổi trả sản phẩm trong vòng 7 ngày kể từ ngày nhận hàng thành công, áp dụng cho sản phẩm còn nguyên tem mác, chưa qua sử dụng. Phí ship đổi trả do khách hàng thanh toán trừ trường hợp lỗi sản xuất.
2. Hướng dẫn chọn size:
   - Áo thun/Polo: Size M (50-60kg), L (61-70kg), XL (71-80kg), XXL (>80kg).
   - Quần Jeans/Kaki: Size 29 (50-55kg), Size 30 (56-60kg), Size 31 (61-65kg), Size 32 (66-70kg), Size 33 (71-75kg).
   - Sneaker: Form ôm sát chân, nên chọn tăng 1 size so với giày da công sở thông thường.
3. Chính sách giao hàng: Cửa hàng liên kết với Giao Hàng Nhanh (GHN) và Giao Hàng Tiết Kiệm (GHTK). Giao nội thành TP.HCM và Hà Nội mất 1-2 ngày, các tỉnh khác mất 2-4 ngày. Đồng giá vận chuyển 30,000đ, miễn phí vận chuyển cho đơn hàng từ 500,000đ trở lên.
4. Thông tin liên hệ:
   - Hotline: 1900 1234
   - Email: hotro@shop.com
   - Địa chỉ: 72 Lê Thánh Tôn, Phường Bến Nghé, Quận 1, TP. HCM.
"""


def extract_order_code(text: str) -> str | None:
    """
    Trích xuất mã đơn hàng từ nội dung văn bản tin nhắn của khách hàng.

    Hỗ trợ tìm kiếm mã định dạng test 'TEST_ORDER_...' hoặc mã chuẩn 'ORD...'.
    """
    match = re.search(r'((?:TEST_ORDER|ORDER)_[A-Za-z0-9_]+|ORD[0-9]{3,})', text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def search_products_in_db(db: Session, query_text: str) -> list[Product]:
    """
    Tìm kiếm tối đa 4 sản phẩm trong database khớp với các từ khóa trong tin nhắn.

    Thuật toán tối ưu hóa:
    - Lọc bỏ từ khóa trùng lặp bằng `dict.fromkeys` để tránh tạo câu query OR trùng lặp.
    - Giới hạn tối đa 3 từ khóa tìm kiếm để tăng hiệu năng câu truy vấn.
    """
    clean_query = query_text.lower()
    keywords = ["áo thun", "áo polo", "sơ mi", "bomber", "áo khoác", "jean", "short", "kaki", "sneaker", "mũ", "thắt lưng", "váy", "đầm"]
    match_keywords = [k for k in keywords if k in clean_query]
    
    if not match_keywords:
        match_keywords = [word for word in clean_query.split() if len(word) > 2]
        
    # Loại bỏ từ khóa trùng lặp bảo toàn thứ tự để tránh trùng lặp điều kiện SQL
    match_keywords = list(dict.fromkeys(match_keywords))

    if not match_keywords:
        return []

    conditions = []
    for kw in match_keywords[:3]:
        conditions.append(Product.name.ilike(f"%{kw}%"))
        conditions.append(Product.description.ilike(f"%{kw}%"))
        conditions.append(Product.slug.ilike(f"%{kw}%"))

    if not conditions:
        return []

    products = (
        db.query(Product)
        .filter(Product.status == 1, Product.deleted_at.is_(None))
        .filter(or_(*conditions))
        .limit(4)
        .all()
    )
    return products


@router.post("/session", response_model=ChatSessionResponse)
def create_session(
    payload: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    _: None = Depends(chat_session_rate_limiter),
) -> ChatSession:
    """
    Tạo mới một phiên chat hỗ trợ trực tuyến.

    Liên kết thông tin thành viên nếu khách hàng đã đăng nhập hệ thống.
    """
    access_token = secrets.token_urlsafe(32) if not current_user else None
    session = ChatSession(
        user_id=current_user.id if current_user else None,
        source=payload.source,
        status="open",
        guest_name=clean_text(payload.guest_name, max_length=255, field_name="guest_name"),
        guest_phone=clean_text(payload.guest_phone, max_length=20, field_name="guest_phone"),
        access_token_hash=_hash_chat_access_token(access_token) if access_token else None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    session.access_token = access_token
    return session


@router.get("/session/{session_id}/messages", response_model=list[ChatMessageResponse])
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    access_token: str | None = Header(default=None, alias="X-Chat-Session-Token"),
    _: None = Depends(chat_read_rate_limiter),
) -> list[ChatMessage]:
    """
    Lấy danh sách toàn bộ các tin nhắn của một phiên chat theo thứ tự tăng dần thời gian.
    """
    _get_authorized_session(db, session_id, current_user, access_token)
        
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    return messages


@router.post("/message", response_model=ChatMessageResponse)
def send_message(
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    access_token: str | None = Header(default=None, alias="X-Chat-Session-Token"),
    _: None = Depends(chat_message_rate_limiter),
) -> ChatMessage:
    """
    Gửi tin nhắn từ người dùng, lưu trữ và tự động phản hồi (qua Gemini API hoặc fallback rules).

    Cơ chế tối ưu hóa giao dịch:
    - Loại bỏ việc ghi đĩa vật lý giữa chừng liên tục, sử dụng `db.flush()` để sinh ID tạm thời.
    - Chỉ commit duy nhất 1 lần cuối cùng trước khi trả về kết quả giúp giảm Disk I/O roundtrips.
    """
    query_text = payload.message_content.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Message content is required")

    # 1. Kiểm tra session hợp lệ
    session = _get_authorized_session(db, payload.session_id, current_user, access_token)

    session.last_message_at = func.now()

    # 2. Lưu tin nhắn của User
    user_msg = ChatMessage(
        session_id=payload.session_id,
        sender_type="user",
        message_content=query_text,
        is_handoff_to_admin=False
    )
    db.add(user_msg)
    db.flush()

    # 3. Phân tích ngữ cảnh hội thoại
    # Tra cứu Sản phẩm từ Database nếu user hỏi về sản phẩm
    matched_products = search_products_in_db(db, query_text)
    product_ids = [p.id for p in matched_products] if matched_products else None
    
    # Tra cứu Đơn hàng nếu user hỏi về đơn hàng
    order_info = ""
    order_code = extract_order_code(query_text)
    if order_code and current_user:
        order = db.query(Order).filter(Order.order_code == order_code, Order.user_id == current_user.id).first()
        if order:
            status_map = {
                "pending": "Chờ xác nhận (Pending)",
                "confirmed": "Đã xác nhận (Confirmed)",
                "shipping": "Đang giao hàng (Shipping)",
                "success": "Giao thành công (Success)",
                "cancelled": "Đã hủy (Cancelled)"
            }
            pm_status_map = {
                "unpaid": "Chưa thanh toán (Unpaid)",
                "paid": "Đã thanh toán (Paid)"
            }
            order_info = (
                f"Đơn hàng {order.order_code}:\n"
                f"- Trạng thái: {status_map.get(order.status, order.status)}\n"
                f"- Thanh toán: {pm_status_map.get(order.payment_status, order.payment_status)}\n"
                f"- Tổng thanh toán: {int(order.total_final):,}đ\n"
                f"- Phí ship: {int(order.shipping_fee):,}đ\n"
            )
        else:
            order_info = f"Không tìm thấy thông tin cho mã đơn hàng {order_code}."
    elif order_code:
        order_info = "Vui lòng đăng nhập hoặc dùng trang tra cứu đơn hàng với thông tin liên hệ."

    # Kiểm tra yêu cầu Human Handoff chuyển cho Admin
    handoff_keywords = ["nhân viên", "người thật", "admin", "gặp admin", "tư vấn viên", "hỗ trợ viên", "chuyển khoản"]
    requires_handoff = any(hk in query_text.lower() for hk in handoff_keywords)
    
    if requires_handoff:
        session.status = "transferred"
        
        bot_response = (
            "Dạ, em đã gửi yêu cầu hỗ trợ đến nhân viên quản trị rồi ạ. "
            "Một bạn admin sẽ vào phòng chat này để trực tiếp tư vấn cho mình ngay trong giây lát. "
            "Anh/chị vui lòng chờ chút nhé ạ!"
        )
        
        bot_msg = ChatMessage(
            session_id=payload.session_id,
            sender_type="bot",
            message_content=bot_response,
            intent="handoff",
            is_handoff_to_admin=True
        )
        db.add(bot_msg)
        db.commit()
        db.refresh(bot_msg)
        return bot_msg

    # 4. Tạo phản hồi của AI
    api_key = os.getenv("GEMINI_API_KEY")
    bot_content = ""
    intent = "general"

    if api_key:
        try:
            # Lấy lịch sử hội thoại 6 câu gần nhất để tạo bộ nhớ
            prev_messages = (
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == payload.session_id, ChatMessage.id < user_msg.id)
                .order_by(desc(ChatMessage.id))
                .limit(6)
                .all()
            )
            prev_messages.reverse()
            
            history_prompt = ""
            for m in prev_messages:
                role = "User" if m.sender_type == "user" else "Assistant"
                history_prompt += f"{role}: {m.message_content}\n"
            
            # Xây dựng System Instructions và RAG Context
            context_prompt = f"Thông tin cửa hàng (FAQ):\n{STORE_FAQ}\n"
            if matched_products:
                context_prompt += "\nCác sản phẩm khớp với câu hỏi của khách (đang có trong database):\n"
                for p in matched_products:
                    context_prompt += f"- [ID: {p.id}] {p.name}: Giá cơ bản {int(p.base_price):,}đ. Xem chi tiết sản phẩm tại link: `/product/{p.id}`. Mô tả: {p.description[:100]}...\n"
            
            if order_info:
                context_prompt += f"\nThông tin tra cứu đơn hàng trực tiếp:\n{order_info}\n"

            system_instruction = (
                "Bạn là 'Trợ lý AI Mua Sắm' siêu thông minh, thân thiện của cửa hàng thời trang trực tuyến.\n"
                "Nhiệm vụ của bạn là tư vấn sản phẩm, giải đáp chính sách đổi trả, giao hàng, size số dựa vào dữ liệu context được cung cấp.\n"
                "Quy tắc trả lời:\n"
                "1. Trả lời ngắn gọn, lịch sự, xưng hô là 'Dạ em chào anh/chị' hoặc 'Dạ' và tự xưng là 'em'.\n"
                "2. Sử dụng tiếng Việt chuẩn. Sử dụng định dạng Markdown (in đậm, danh sách) để văn bản trực quan.\n"
                "3. Khi giới thiệu sản phẩm có trong dữ liệu khớp, bắt buộc phải chèn liên kết dạng markdown `/product/<id>` để khách dễ click (ví dụ: '[Áo thun cotton basic](/product/1]').\n"
                "4. Nếu khách hàng muốn nói chuyện với nhân viên thật hoặc hỏi những câu đòi hỏi quyền admin (như hoàn tiền, đổi trả phức tạp, khiếu nại), khuyên họ gõ 'Gặp nhân viên' để được hỗ trợ trực tiếp.\n"
                "5. KHÔNG tự bịa ra thông tin sản phẩm hoặc đơn hàng nếu context không có.\n"
            )

            prompt_content = f"{context_prompt}\nLịch sử chat:\n{history_prompt}\nUser mới: {query_text}\nAssistant:"
            
            # Gọi API Gemini 2.5 Flash
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload_data = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"{system_instruction}\n\n{prompt_content}"}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.5,
                    "maxOutputTokens": 800
                }
            }
            
            res = requests.post(url, headers=headers, json=payload_data, timeout=8)
            if res.status_code == 200:
                res_data = res.json()
                bot_content = res_data['candidates'][0]['content']['parts'][0]['text']
                intent = "ai_gemini"
            else:
                logger.error("Gemini API error: %s - %s", res.status_code, res.text)
                bot_content = ""
        except Exception:
            logger.exception("Failed to call Gemini API")
            bot_content = ""

    # Nếu không có API key hoặc gọi Gemini lỗi, chạy Fallback Local Engine
    if not bot_content:
        intent = "local_rule"
        lower_query = query_text.lower()
        
        # 1. Trả lời về Đơn hàng
        if order_info:
            bot_content = (
                f"Dạ em đã tìm thấy thông tin đơn hàng của mình rồi ạ!\n\n"
                f"{order_info}\n"
                "Anh/chị cần hỗ trợ thêm thông tin gì về đơn hàng này không ạ?"
            )
        # 2. Tư vấn sản phẩm khớp trong DB
        elif matched_products:
            bot_content = "Dạ, em tìm thấy một số sản phẩm phù hợp với yêu cầu của mình tại cửa hàng ạ:\n\n"
            for p in matched_products:
                bot_content += f"- **[{p.name}](/product/{p.id})** - Giá: **{int(p.base_price):,}đ**\n"
            bot_content += "\nAnh/chị bấm trực tiếp vào tên sản phẩm để xem chi tiết ảnh và chọn size nhé ạ! Có sản phẩm nào mình ưng ý chưa ạ?"
        # 3. Hỏi về đổi trả
        elif any(k in lower_query for k in ["đổi trả", "hoàn tiền", "trả hàng", "đổi size"]):
            bot_content = (
                "Dạ về **Chính sách đổi trả**, cửa hàng hỗ trợ đổi trả sản phẩm trong vòng **7 ngày** kể từ ngày nhận hàng thành công.\n\n"
                "- Yêu cầu: Sản phẩm còn nguyên tag mác, chưa giặt ủi và chưa qua sử dụng.\n"
                "- Chi phí: Nếu do sản phẩm lỗi, cửa hàng sẽ chịu 100% phí ship đổi trả. Nếu khách muốn đổi mẫu/size theo nhu cầu, khách thanh toán phí vận chuyển.\n\n"
                "Để tiến hành đổi trả nhanh chóng, anh/chị có thể gõ **'Gặp nhân viên'** để em chuyển máy cho admin làm thủ tục nhé ạ!"
            )
        # 4. Hỏi về giao hàng
        elif any(k in lower_query for k in ["ship", "giao hàng", "vận chuyển", "bao lâu", "phí vận chuyển"]):
            bot_content = (
                "Dạ cửa hàng đồng giá ship toàn quốc là **30,000đ** ạ.\n\n"
                "- Đặc biệt: **Freeship** (Miễn phí ship) hoàn toàn cho mọi đơn hàng từ **500,000đ** trở lên.\n"
                "- Thời gian nhận hàng:\n"
                "  - Nội thành TP.HCM / Hà Nội: **1 - 2 ngày**.\n"
                "  - Các tỉnh thành khác: **2 - 4 ngày**.\n"
                "Cửa hàng sử dụng đơn vị vận chuyển GHN và GHTK uy tín giúp hàng đến tay mình nhanh nhất ạ!"
            )
        # 5. Hỏi về chọn size
        elif any(k in lower_query for k in ["chọn size", "tư vấn size", "bảng size", "nặng", "cao"]):
            bot_content = (
                "Dạ để tư vấn size chính xác nhất, anh/chị cho em xin chiều cao và cân nặng nhé. Ngoài ra anh/chị có thể tham khảo nhanh bảng size chuẩn bên em:\n\n"
                "- **Áo thun / Polo / Áo khoác:**\n"
                "  - Size M: 50kg - 60kg\n"
                "  - Size L: 61kg - 70kg\n"
                "  - Size XL: 71kg - 80kg\n"
                "  - Size XXL: > 80kg\n"
                "- **Quần Jean / Kaki / Shorts:**\n"
                "  - Size 29-30: 50kg - 60kg\n"
                "  - Size 31-32: 61kg - 70kg\n"
                "  - Size 33: 71kg - 75kg\n\n"
                "Anh/chị đang quan tâm size cho mẫu quần hay áo nào thế ạ?"
            )
        # 6. Lời chào & các chủ đề khác
        elif any(k in lower_query for k in ["chào", "hello", "hi", "ơi"]):
            bot_content = (
                "Dạ em chào anh/chị ạ! Em là Trợ lý AI của cửa hàng. 😊\n\n"
                "Em có thể giúp gì cho anh/chị hôm nay ạ? Mình có thể hỏi em các thông tin như:\n"
                "- Tìm kiếm sản phẩm thời trang (ví dụ: *'Tìm áo thun đen'*, *'Có giày sneaker đỏ không?'*)\n"
                "- Tra cứu trạng thái đơn hàng (ví dụ: *'Tra cứu đơn hàng TEST_ORDER_FOR_COMMISSION'*)\n"
                "- Các chính sách giao hàng, đổi trả hoặc bảng size quần áo.\n\n"
                "Chúc anh/chị có trải nghiệm mua sắm vui vẻ!"
            )
        else:
            bot_content = (
                "Dạ xin lỗi anh/chị, em chưa hiểu rõ ý mình lắm ạ. Do em là trợ lý AI nên có thể câu trả lời chưa đầy đủ.\n\n"
                "Anh/chị có thể hỏi rõ hơn về sản phẩm (áo thun, quần jean, sneaker), hoặc gõ mã đơn hàng để em kiểm tra.\n"
                "Nếu cần hỗ trợ từ nhân viên thật, anh/chị gõ **'Gặp nhân viên'** bất cứ lúc nào nhé ạ!"
            )

    metadata_json = None
    if matched_products:
        metadata_json = {
            "products": [
                {
                    "id": p.id,
                    "name": p.name,
                    "base_price": float(p.base_price),
                    "thumbnail": p.thumbnail
                } for p in matched_products
            ]
        }

    # 5. Lưu tin nhắn phản hồi của Bot vào database
    bot_msg = ChatMessage(
        session_id=payload.session_id,
        sender_type="bot",
        message_content=bot_content,
        intent=intent,
        product_ids=product_ids,
        is_handoff_to_admin=False,
        metadata_json=metadata_json
    )
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)

    return bot_msg


@router.post("/session/{session_id}/handoff", response_model=ChatMessageResponse)
def request_handoff(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    access_token: str | None = Header(default=None, alias="X-Chat-Session-Token"),
    _: None = Depends(chat_handoff_rate_limiter),
) -> ChatMessage:
    """
    Yêu cầu chuyển phiên chat hiện tại cho nhân viên (admin) tiếp nhận.

    Cơ chế tối ưu hóa giao dịch:
    - Thay vì gọi db.commit() nhiều lần, cập nhật session status và add bot message
      trực tiếp trong cùng một transaction rồi commit một lần duy nhất.
    """
    session = _get_authorized_session(db, session_id, current_user, access_token)

    session.status = "transferred"

    bot_msg = ChatMessage(
        session_id=session_id,
        sender_type="bot",
        message_content="Dạ, yêu cầu gặp hỗ trợ viên đã được ghi nhận. Admin sẽ tham gia vào cuộc chat này trong ít phút nữa ạ!",
        intent="handoff",
        is_handoff_to_admin=True
    )
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)

    return bot_msg
