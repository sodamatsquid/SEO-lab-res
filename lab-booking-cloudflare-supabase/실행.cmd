@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 필요합니다. 시작안내.txt의 설치 방법을 확인해 주세요.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13 이상이 필요합니다. 시작안내.txt를 확인해 주세요.
  pause
  exit /b 1
)
node server.cjs --open
if errorlevel 1 pause
