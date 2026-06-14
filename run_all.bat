@echo off
title Khoi dong toan bo he thong Ecommerce Affiliate

echo ========================================================
echo   KHOI DONG TOAN BO DU AN (BACKEND + 3 FRONTENDS)
echo ========================================================
echo.

echo 1. Dang khoi dong Redis (Cong 6379)...
powershell -NoProfile -Command "if ((Test-NetConnection 127.0.0.1 -Port 6379 -WarningAction SilentlyContinue).TcpTestSucceeded) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    where redis-server >nul 2>nul
    if errorlevel 1 (
        echo LOI: Khong tim thay redis-server trong PATH. Hay khoi dong lai terminal sau khi cai Redis.
        pause
        exit /b 1
    )
    if not exist "%LOCALAPPDATA%\ecommerce-affiliate\redis" mkdir "%LOCALAPPDATA%\ecommerce-affiliate\redis"
    > "%LOCALAPPDATA%\ecommerce-affiliate\redis\redis.conf" (
        echo bind 127.0.0.1
        echo port 6379
        echo appendonly yes
        echo dir "%LOCALAPPDATA%\ecommerce-affiliate\redis"
    )
    start "Redis (Port 6379)" redis-server "%LOCALAPPDATA%\ecommerce-affiliate\redis\redis.conf"
    timeout /t 2 /nobreak >nul
) else (
    echo Redis dang chay tren cong 6379.
)

echo 2. Dang khoi dong Backend FastAPI (Cong 8000)...
start "Backend - FastAPI (Port 8000)" cmd /k "cd /d %~dp0backend && ..\venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo 3. Dang khoi dong Frontend User (Cong 5173)...
start "Frontend User (Port 5173)" cmd /k "cd /d %~dp0frontend_user && npm run dev -- --port 5173 --strictPort"

echo 4. Dang khoi dong Frontend Admin (Cong 5174)...
start "Frontend Admin (Port 5174)" cmd /k "cd /d %~dp0frontend_admin && npm run dev -- --port 5174 --strictPort"

echo 5. Dang khoi dong Frontend Affiliate (Cong 5175)...
start "Frontend Affiliate (Port 5175)" cmd /k "cd /d %~dp0frontend_affiliate && npm run dev -- --port 5175 --strictPort"

echo.
echo ========================================================
echo  KHOI DONG THANH CONG! CAC APP DANG DUOC CHAY TREN:
echo  - Redis: redis://127.0.0.1:6379/0
echo  - Backend: http://127.0.0.1:8000
echo  - User App: http://localhost:5173
echo  - Admin App: http://localhost:5174
echo  - Affiliate App: http://localhost:5175
echo  - Shipper App: http://localhost:5174/shipping
echo ========================================================
echo.
pause
