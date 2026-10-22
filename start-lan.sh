#!/usr/bin/env bash
# 皇后 Queens · 局域网一键启动（macOS / Linux）
# 双击运行，或在终端里：bash start-lan.sh  [端口] [--no-open]

set -e
cd "$(dirname "$0")"

echo
echo "  ♛  皇后 Queens —— 正在准备局域网服务，请稍等…"
echo

if [ ! -f serve.py ]; then
  echo "  [缺少 serve.py] 请把 serve.py 和本文件放在同一个文件夹里。"
  exit 1
fi
if [ ! -f index.html ]; then
  echo "  [缺少 index.html] 请确认 index.html 与 src/ 目录都在本文件所在目录。"
  exit 1
fi

PY=""
for cand in python3 python py; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)" >/dev/null 2>&1; then
    PY="$cand"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "  [没有找到 Python 3]"
  echo
  echo "  这个小服务只用 Python 标准库，不需要额外依赖，但机器上得有 Python 3。"
  echo "    macOS  : 系统自带 python3；若没有，装 Xcode 命令行工具或从 python.org 下载"
  echo "    Ubuntu : sudo apt install python3"
  echo "    Fedora : sudo dnf install python3"
  echo
  echo "  装好后重新运行本脚本。"
  exit 1
fi

exec "$PY" serve.py "$@"
