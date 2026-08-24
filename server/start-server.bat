@echo off
REM Sobe o servidor de sinalizacao com os endereços da rede listados.
REM Para expor na internet, use: start-server.bat --tunnel
cd /d "%~dp0.."
if not exist node_modules ( npm install )
node server\host.js %*
pause
