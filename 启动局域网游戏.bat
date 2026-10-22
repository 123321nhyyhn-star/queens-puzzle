@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
cd /d "%~dp0"
title 皇后 Queens · 局域网服务

echo.
echo   ♛  皇后 Queens —— 正在准备局域网服务，请稍等…
echo.

rem ---------- 1. 找一个能用的 Python ----------
set "PY="
call :probe py -3
if not defined PY call :probe python
if not defined PY call :probe python3
if not defined PY call :probe_path "D:\anaconda3\python.exe"
if not defined PY call :probe_path "C:\anaconda3\python.exe"
if not defined PY call :probe_path "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PY call :probe_path "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY call :probe_path "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY call :probe_path "C:\Python313\python.exe"
if not defined PY call :probe_path "C:\Python312\python.exe"
if not defined PY call :probe_path "C:\Python311\python.exe"

if not defined PY goto :no_python
if not exist "%~dp0serve.py" goto :no_serve
if not exist "%~dp0index.html" goto :no_index

rem ---------- 2. 启动服务 ----------
%PY% "%~dp0serve.py" %*
if errorlevel 1 (
  echo.
  echo  [启动失败] 服务异常退出，返回码 %errorlevel%
  echo  可以手动运行这一行看看报什么错：
  echo      %PY% "%~dp0serve.py"
  echo.
  pause
)
exit /b 0

rem ==========================================================
:probe
%* -c "import sys" >nul 2>nul
if errorlevel 1 exit /b 0
set "PY=%*"
exit /b 0

:probe_path
if not exist "%~1" exit /b 0
"%~1" -c "import sys" >nul 2>nul
if errorlevel 1 exit /b 0
set "PY=%~1"
exit /b 0

:no_python
echo  [没有找到 Python]
echo.
echo  这个小服务用的是 Python 自带的标准库，不需要装任何额外依赖，
echo  但机器上得先有一个 Python 解释器。
echo.
echo    1. 打开 https://www.python.org/downloads/ 下载安装 Python 3
echo       安装时记得勾选 "Add python.exe to PATH"
echo    2. 装完再双击本文件
echo.
echo  如果 Python 装在别的地方，可以直接运行：
echo      ^<你的路径^>\python.exe "%~dp0serve.py"
echo.
pause
exit /b 1

:no_serve
echo  [缺少 serve.py]
echo  请把 serve.py 和本文件放在同一个文件夹里。
echo.
pause
exit /b 1

:no_index
echo  [缺少 index.html]
echo  请确认 index.html 与 src 文件夹都在本文件所在目录。
echo.
pause
exit /b 1
