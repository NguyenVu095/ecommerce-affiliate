@echo off
title Khoi dong toan bo he thong Ecommerce Affiliate

echo ========================================================
echo   KHOI DONG TOAN BO DU AN (BACKEND + 3 FRONTENDS)
echo ========================================================
echo.

echo 1. Dang khoi dong Backend FastAPI (Cong 8000)...
start "Backend - FastAPI (Port 8000)" cmd /k "cd /d %~dp0backend && ..\venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo 2. Dang khoi dong Frontend User (Cong 5173)...
start "Frontend User (Port 5173)" cmd /k "cd /d %~dp0frontend_user && npm run dev"

echo 3. Dang khoi dong Frontend Admin (Cong 5174)...
start "Frontend Admin (Port 5174)" cmd /k "cd /d %~dp0frontend_admin && npm run dev"

echo 4. Dang khoi dong Frontend Affiliate (Cong 5175)...
start "Frontend Affiliate (Port 5175)" cmd /k "cd /d %~dp0frontend_affiliate && npm run dev"

echo.
echo ========================================================
echo  KHOI DONG THANH CONG! CAC APP DANG DUOC CHAY TREN:
echo  - Backend: http://127.0.0.1:8000
echo  - User App: http://localhost:5173
echo  - Admin App: http://localhost:5174
echo  - Affiliate App: http://localhost:5175
echo  - Shipper App: http://localhost:5174/shipping
echo ========================================================
echo.
pause
