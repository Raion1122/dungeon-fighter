@echo off
chcp 65001 >nul
REM ポート 8765 で動いているローカルサーバ(隠しウィンドウ)を停止します。
set "PORT=8765"
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%"') do (
  taskkill /F /PID %%a >nul 2>nul && set "FOUND=1"
)
if defined FOUND (
  echo ローカルサーバ(ポート %PORT%)を停止しました。
) else (
  echo 動作中のサーバは見つかりませんでした(既に停止済み)。
)
timeout /t 2 >nul
