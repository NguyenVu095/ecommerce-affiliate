# Deploy demo mien phi: Render, Supabase va Vercel

Tai lieu nay dung cho ban demo voi VNPay Sandbox. Backend duoc chay voi
`APP_ENV=development` de cho phep gateway sandbox. Khong dung cau hinh nay cho
thanh toan that.

## Kien truc

| Thanh phan | Dich vu |
| --- | --- |
| PostgreSQL | Supabase Free |
| FastAPI | Render Web Service Free |
| Redis rate limit | Render Key Value Free |
| Customer frontend | Vercel |
| Admin frontend | Vercel |
| Affiliate frontend | Vercel |

## 1. Dung Supabase database hien co

Du an da ket noi Supabase Shared Pooler va schema dang o migration moi nhat.
Khong tao Supabase project moi va khong seed lai database.

Sao chep nguyen gia tri `DATABASE_URL` dang dung trong `.env` vao Render. Khong
commit `.env` hoac dua connection string vao `render.yaml`.

Database hien tai dung transaction pooler, port `6543`, co dang:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
```

Blueprint se tu dong chay `alembic upgrade head` luc API khoi dong. Lenh nay
chi ap dung migration con thieu, khong xoa du lieu hien co.

Khong dung direct connection `db.*.supabase.co` cho Render Free neu endpoint
do chi ho tro IPv6.

## 2. Tao ba Vercel project

Import cung repository ba lan va dat Root Directory:

| Project | Root Directory |
| --- | --- |
| Customer | `frontend_user` |
| Admin | `frontend_admin` |
| Affiliate | `frontend_affiliate` |

Framework Preset la Vite. Build command va output mac dinh:

```text
npm run build
dist
```

Lan deploy frontend dau tien co the tam thoi that bai cho den khi co URL API.
Sau khi Render tao API, khai bao:

### Customer

```env
VITE_API_URL=https://ecommerce-affiliate-api.onrender.com
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

### Admin

```env
VITE_API_URL=https://ecommerce-affiliate-api.onrender.com
```

### Affiliate

```env
VITE_API_URL=https://ecommerce-affiliate-api.onrender.com
VITE_CUSTOMER_APP_URL=https://YOUR_CUSTOMER_PROJECT.vercel.app
```

Redeploy ca ba project sau khi them bien moi truong.

## 3. Tao Render Blueprint

1. Push `render.yaml` len repository.
2. Trong Render, chon `New` -> `Blueprint`.
3. Ket noi repository va chon file `render.yaml`.
4. Dien cac bien duoc Render yeu cau.

Gia tri URL can dien:

```env
ALLOWED_HOSTS=ecommerce-affiliate-api.onrender.com
ALLOWED_ORIGINS=https://CUSTOMER.vercel.app,https://ADMIN.vercel.app,https://AFFILIATE.vercel.app
CUSTOMER_APP_URL=https://CUSTOMER.vercel.app
VNPAY_RETURN_URL=https://ecommerce-affiliate-api.onrender.com/api/orders/vnpay-return
VNPAY_IPN_URL=https://ecommerce-affiliate-api.onrender.com/api/orders/vnpay-ipn
```

Gia tri secret:

```env
DATABASE_URL=GIA_TRI_DATABASE_URL_HIEN_TAI_TRONG_FILE_ENV
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
VNPAY_TMN_CODE=YOUR_SANDBOX_TMN_CODE
VNPAY_HASH_SECRET=YOUR_SANDBOX_HASH_SECRET
```

Nhap cac bien `GHN_*` tu tai khoan GHN development. Neu chua test giao hang,
co the nhap gia tri development hien tai va cap nhat lai sau.

Neu Render them hau to vao ten service do trung ten, dung hostname thuc te ma
Render cap thay cho `ecommerce-affiliate-api.onrender.com` o tat ca cau hinh.

## 4. Cap nhat lai CORS sau khi Vercel co URL

Trong Render API, mo `Environment` va bao dam:

```env
ALLOWED_HOSTS=HOSTNAME_API_KHONG_CO_HTTPS
ALLOWED_ORIGINS=https://CUSTOMER.vercel.app,https://ADMIN.vercel.app,https://AFFILIATE.vercel.app
CUSTOMER_APP_URL=https://CUSTOMER.vercel.app
```

Chon `Save and deploy`.

## 5. Google OAuth

Trong Google Cloud Console, them customer URL vao Authorized JavaScript
origins:

```text
https://CUSTOMER.vercel.app
```

Backend `GOOGLE_CLIENT_ID` va frontend `VITE_GOOGLE_CLIENT_ID` phai giong nhau.

## 6. Kiem tra

Mo cac URL:

```text
https://API.onrender.com/health/live
https://API.onrender.com/health/ready
https://API.onrender.com/docs
```

Sau do kiem tra:

1. Dang ky va dang nhap.
2. Danh sach va chi tiet san pham.
3. Phi van chuyen GHN.
4. Tao don hang.
5. Thanh toan VNPay Sandbox va quay ve customer frontend.
6. Xac nhan IPN da cap nhat trang thai thanh toan.
7. Dang nhap admin va affiliate.

## Gioi han ban demo

- Render Free ngu sau 15 phut khong co request; request dau co the cho khoang
  mot phut.
- Supabase Free co the pause project it hoat dong.
- Render Key Value Free mat rate-limit counters khi restart, nhung khong mat
  du lieu don hang vi don hang nam trong Supabase.
- `APP_ENV=development` mo `/docs` va bo qua validation production.
- Khong chuyen `VNPAY_URL` sang production khi van dung ha tang demo nay.
