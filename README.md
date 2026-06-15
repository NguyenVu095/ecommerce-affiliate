# Ecommerce Affiliate

Hệ thống thương mại điện tử tích hợp affiliate, quản trị đơn hàng, vận chuyển
GHN, đăng nhập Google và thanh toán VNPay Sandbox.

Dự án được tổ chức theo monorepo, gồm một backend FastAPI và ba ứng dụng
React/Vite riêng cho khách hàng, quản trị viên và đối tác affiliate.

## Demo

| Dịch vụ | URL |
| --- | --- |
| Khách hàng | [ecommerce-affiliate-customer.vercel.app](https://ecommerce-affiliate-customer.vercel.app) |
| Quản trị | [ecommerce-affiliate-admin.vercel.app](https://ecommerce-affiliate-admin.vercel.app) |
| API | [ecommerce-affiliate-api.onrender.com](https://ecommerce-affiliate-api.onrender.com) |
| Tài liệu API | [Swagger UI](https://ecommerce-affiliate-api.onrender.com/docs) |
| Trạng thái API | [Health check](https://ecommerce-affiliate-api.onrender.com/health/ready) |

> Render Free có thể ngủ sau 15 phút không có request. Lần truy cập đầu tiên
> có thể mất khoảng một phút để backend khởi động.

### Tài khoản dùng thử

Các tài khoản công khai dưới đây ở chế độ **chỉ đọc**. Bạn có thể đăng nhập và
xem dữ liệu dashboard nhưng không thể tạo, sửa, xóa hoặc thay đổi trạng thái dữ
liệu.

| Khu vực | Email | Mật khẩu |
| --- | --- | --- |
| Admin | `admin_demo@gmail.com` | `AdminDemo@2026` |
| Affiliate | `affiliate_demo@gmail.com` | `AffiliateDemo@2026` |

## Tính năng

- Danh mục sản phẩm nhiều cấp, tìm kiếm, lọc, sắp xếp và phân trang.
- Biến thể sản phẩm theo kích thước, màu sắc, giá bán, giá khuyến mãi và tồn kho.
- Giỏ hàng, checkout, mã giảm giá và tra cứu đơn hàng.
- Đăng ký, đăng nhập JWT và Google Sign-In.
- Thanh toán VNPay Sandbox, Return URL và IPN callback.
- Tính phí và quản lý thông tin giao hàng GHN.
- Đánh giá sản phẩm sau khi hoàn thành đơn hàng.
- Dashboard admin quản lý sản phẩm, danh mục, đơn hàng, coupon và người dùng.
- Affiliate link, click tracking, conversion, hoa hồng và yêu cầu rút tiền.
- Chat hỗ trợ khách hàng và newsletter.
- Rate limiting phân tán bằng Redis/Valkey.

## Kiến trúc

```text
Customer / Admin / Affiliate (Vercel)
                   |
                   | HTTPS
                   v
            FastAPI (Render)
              /           \
             v             v
   PostgreSQL (Supabase)  Redis/Valkey (Render)
```

| Thành phần | Công nghệ |
| --- | --- |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Frontend | React 19, TypeScript, Vite, Zustand, Axios |
| Cơ sở dữ liệu | PostgreSQL trên Supabase |
| Cache/rate limit | Redis/Valkey |
| Xác thực | JWT, Google Identity Services |
| Thanh toán | VNPay Sandbox |
| Vận chuyển | GHN Development API |
| Triển khai | Render, Vercel, Supabase |

## Cấu trúc thư mục

```text
backend/              FastAPI API, models, migrations và tests
frontend_user/        Ứng dụng khách hàng
frontend_admin/       Ứng dụng admin và shipper
frontend_affiliate/   Ứng dụng đối tác affiliate
deploy/               Dockerfiles và cấu hình Nginx
render.yaml           Render Blueprint cho API và Redis
```

## VNPay Sandbox

Thông tin dưới đây chỉ dùng để kiểm thử trên môi trường VNPay Sandbox. Đây
không phải thẻ ngân hàng thật và không phát sinh giao dịch tiền thật.

| Trường | Giá trị |
| --- | --- |
| Ngân hàng | `NCB` |
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| Mật khẩu OTP | `123456` |

Quy trình kiểm thử:

1. Thêm sản phẩm vào giỏ và mở trang checkout.
2. Chọn phương thức thanh toán VNPay.
3. Nhấn đặt hàng
4. Tại cổng thanh toán Sandbox, chọn phương thức thanh toán "Thẻ nội địa và tài khoản ngân hàng"
5. Chọn ngân hàng `NCB`.
6. Nhập thông tin thẻ ở bảng trên.
7. Nhập OTP `123456`.
8. Sau khi thanh toán, VNPay chuyển về trang tra cứu đơn hàng.
9. Kiểm tra trạng thái thanh toán trong Customer và Admin.

## Chạy local

### Yêu cầu

- Python 3.13
- Node.js và npm
- Redis
- PostgreSQL/Supabase hoặc SQLite cho môi trường phát triển

### 1. Cấu hình backend

```powershell
Copy-Item .env.example .env
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Cập nhật `.env`, sau đó chạy migration:

```powershell
Set-Location backend
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

Không commit `.env`, mật khẩu cơ sở dữ liệu, JWT secret, VNPay hash secret hoặc
token GHN lên Git.

### 2. Chạy frontend

Mở ba terminal:

```powershell
Set-Location frontend_user
npm install
npm run dev
```

```powershell
Set-Location frontend_admin
npm install
npm run dev
```

```powershell
Set-Location frontend_affiliate
npm install
npm run dev
```

Địa chỉ local:

| Ứng dụng | URL |
| --- | --- |
| Khách hàng | `http://localhost:5173` |
| Admin | `http://localhost:5174` |
| Affiliate | `http://localhost:5175` |
| API | `http://localhost:8000` |

Trên Windows có thể chạy `run_all.bat` để khởi động Redis, backend và ba
frontend.

## Kiểm tra

Backend:

```powershell
$env:APP_ENV = "test"
$env:DATABASE_URL = "sqlite:///:memory:"
$env:REQUIRE_REDIS_RATE_LIMIT = "false"
$env:REDIS_URL = ""
.\venv\Scripts\python.exe -m pytest backend\tests -q
```

Frontend:

```powershell
npm run build
```

## Triển khai

- Render Blueprint: [`render.yaml`](render.yaml)

Bản triển khai hiện tại sử dụng:

- Vercel cho ba React SPA.
- Render cho FastAPI và Redis/Valkey.
- Supabase cho PostgreSQL.
- VNPay Sandbox cho thanh toán thử nghiệm.

## Lưu ý

- Đây là bản demo sử dụng dịch vụ free tier và VNPay Sandbox.
- `APP_ENV=development` đang được dùng trên Render để cho phép gateway sandbox.
- Không sử dụng cấu hình này để nhận thanh toán thật.
- Khi chuyển sang production, cần bật validation production, dùng VNPay
  production, kiểm tra IP outbound và thay toàn bộ secret.
