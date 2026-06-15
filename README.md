# Ecommerce Affiliate

He thong thuong mai dien tu tich hop affiliate, quan tri don hang, van chuyen
GHN, dang nhap Google va thanh toan VNPay Sandbox.

Du an duoc to chuc theo monorepo, gom mot FastAPI backend va ba ung dung
React/Vite rieng cho khach hang, quan tri vien va doi tac affiliate.

## Demo

| Dich vu | URL |
| --- | --- |
| Customer | [ecommerce-affiliate-customer.vercel.app](https://ecommerce-affiliate-customer.vercel.app) |
| Admin | [ecommerce-affiliate-admin.vercel.app](https://ecommerce-affiliate-admin.vercel.app) |
| API | [ecommerce-affiliate-api.onrender.com](https://ecommerce-affiliate-api.onrender.com) |
| API documentation | [Swagger UI](https://ecommerce-affiliate-api.onrender.com/docs) |
| API readiness | [Health check](https://ecommerce-affiliate-api.onrender.com/health/ready) |

> Render Free co the ngu sau 15 phut khong co request. Lan truy cap dau tien
> co the mat khoang mot phut de backend khoi dong.

## Tinh nang

- Danh muc san pham nhieu cap, tim kiem, loc, sap xep va phan trang.
- Bien the san pham theo size, mau sac, gia ban, gia khuyen mai va ton kho.
- Gio hang, checkout, ma giam gia va tra cuu don hang.
- Dang ky, dang nhap JWT va Google Sign-In.
- Thanh toan VNPay Sandbox, Return URL va IPN callback.
- Tinh phi va quan ly thong tin giao hang GHN.
- Danh gia san pham sau khi hoan thanh don hang.
- Dashboard admin quan ly san pham, danh muc, don hang, coupon va nguoi dung.
- Affiliate link, click tracking, conversion, hoa hong va yeu cau rut tien.
- Chat ho tro khach hang va newsletter.
- Rate limiting phan tan bang Redis/Valkey.

## Kien truc

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

| Thanh phan | Cong nghe |
| --- | --- |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Frontend | React 19, TypeScript, Vite, Zustand, Axios |
| Database | PostgreSQL tren Supabase |
| Cache/rate limit | Redis/Valkey |
| Authentication | JWT, Google Identity Services |
| Payment | VNPay Sandbox |
| Shipping | GHN Development API |
| Deployment | Render, Vercel, Supabase |

## Cau truc thu muc

```text
backend/              FastAPI API, models, migrations va tests
frontend_user/        Ung dung khach hang
frontend_admin/       Ung dung admin va shipper
frontend_affiliate/   Ung dung doi tac affiliate
deploy/               Dockerfiles va Nginx configuration
render.yaml           Render Blueprint cho API va Redis
```

## VNPay Sandbox

Thong tin duoi day chi dung de kiem thu tren moi truong VNPay Sandbox. Khong
phai the ngan hang that va khong phat sinh giao dich tien that.

| Truong | Gia tri |
| --- | --- |
| Ngan hang | `NCB` |
| So the | `9704198526191432198` |
| Ten chu the | `NGUYEN VAN A` |
| Ngay phat hanh | `07/15` |
| Mat khau OTP | `123456` |

Quy trinh kiem thu:

1. Them san pham vao gio va mo trang checkout.
2. Chon phuong thuc thanh toan VNPay.
3. Tai cong thanh toan Sandbox, chon ngan hang `NCB`.
4. Nhap thong tin the o bang tren.
5. Nhap OTP `123456`.
6. Sau khi thanh toan, VNPay chuyen ve trang tra cuu don hang.
7. Kiem tra trang thai thanh toan trong Customer va Admin.

## Chay local

### Yeu cau

- Python 3.13
- Node.js va npm
- Redis
- PostgreSQL/Supabase hoac SQLite cho phat trien

### 1. Cau hinh backend

```powershell
Copy-Item .env.example .env
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Cap nhat `.env`, sau do chay migration:

```powershell
Set-Location backend
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

Khong commit `.env`, database password, JWT secret, VNPay hash secret hoac
token GHN len Git.

### 2. Chay frontend

Mo ba terminal:

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

Dia chi local:

| Ung dung | URL |
| --- | --- |
| Customer | `http://localhost:5173` |
| Admin | `http://localhost:5174` |
| Affiliate | `http://localhost:5175` |
| API | `http://localhost:8000` |

Tren Windows co the chay `run_all.bat` de khoi dong Redis, backend va ba
frontend.

## Kiem tra

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

## Deploy

- Render Blueprint: [`render.yaml`](render.yaml)

Ban deploy hien tai dung:

- Vercel cho ba React SPA.
- Render cho FastAPI va Redis/Valkey.
- Supabase cho PostgreSQL.
- VNPay Sandbox cho thanh toan thu nghiem.

## Luu y

- Day la ban demo su dung dich vu free tier va VNPay Sandbox.
- `APP_ENV=development` dang duoc dung tren Render de cho phep gateway sandbox.
- Khong su dung cau hinh nay de nhan thanh toan that.
- Khi chuyen sang production, can bat validation production, dung VNPay
  production, kiem tra IP outbound va thay toan bo secret.
