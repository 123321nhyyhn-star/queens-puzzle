#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""皇后 Queens · 局域网静态文件服务器（只用 Python 标准库，无需装任何依赖）。

用法:
    python serve.py               # 默认从 8080 开始，被占用就自动往后找
    python serve.py 9000          # 指定端口
    python serve.py --no-open     # 启动后不自动打开浏览器

同一 Wi-Fi / 同一局域网下的手机、平板、其他电脑，用打印出来的
「局域网」地址即可打开游戏。
"""

import os
import socket
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8080
PORT_SCAN = 20  # 端口被占用时，往后最多尝试这么多个


class LanHandler(SimpleHTTPRequestHandler):
    """带 MIME 补全、禁用缓存、日志友好的静态文件处理器。"""

    server_version = "QueensLAN/1.0"
    protocol_version = "HTTP/1.1"

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".woff2": "font/woff2",
        ".ico": "image/x-icon",
    }

    def end_headers(self):
        # 局域网调试期间最怕改了文件浏览器还吃缓存
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def send_head(self):
        # 去掉条件请求头，避免返回 304
        for header in ("If-Modified-Since", "If-None-Match"):
            if self.headers.get(header):
                del self.headers[header]
        return super().send_head()

    def log_message(self, fmt, *args):
        line = fmt % args
        sys.stdout.write("  [%s] %-15s %s\n" % (time.strftime("%H:%M:%S"), self.address_string(), line))
        sys.stdout.flush()


def lan_ips():
    """列出本机所有可用于局域网访问的 IPv4 地址。"""
    ips = []

    # 1) 默认路由出口地址（最可能是真正能连上的那个）
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        primary = probe.getsockname()[0]
        if not primary.startswith("127."):
            ips.append(primary)
    except OSError:
        pass
    finally:
        probe.close()

    # 2) 主机名解析出来的其他网卡（有线 / 无线 / 虚拟网卡）
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass

    return ips


def make_server(port):
    handler = partial(LanHandler, directory=ROOT)
    return ThreadingHTTPServer(("0.0.0.0", port), handler)


def main(argv):
    try:
        # 只有在输出被重定向（管道/文件）时才强制 UTF-8；
        # 真实控制台交给 Python 自己处理，中文在 cp936 下也能正常显示。
        if not sys.stdout.isatty():
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    open_browser = True
    port = DEFAULT_PORT
    for arg in argv[1:]:
        if arg in ("-h", "--help"):
            print(__doc__)
            return 0
        if arg in ("--no-open", "-n"):
            open_browser = False
        elif arg.isdigit():
            port = int(arg)
        else:
            print("无法识别的参数: %s（用 --help 看用法）" % arg)
            return 2

    if not os.path.exists(os.path.join(ROOT, "index.html")):
        print("找不到 index.html —— 请把 serve.py 放在 index.html 同一个文件夹里。")
        return 1

    httpd = None
    for candidate in range(port, port + PORT_SCAN):
        try:
            httpd = make_server(candidate)
            port = candidate
            break
        except OSError as exc:
            if candidate == port + PORT_SCAN - 1:
                print("端口 %d~%d 全部不可用：%s" % (port, candidate, exc))
                return 1
    if httpd is None:
        return 1

    httpd.daemon_threads = True
    ips = lan_ips()
    local_url = "http://127.0.0.1:%d/" % port

    bar = "=" * 62
    print(bar)
    print("  ♛  皇后 Queens · 局域网服务已启动")
    print("-" * 62)
    print("  本机访问   : %s" % local_url)
    if ips:
        for ip in ips:
            label = "局域网访问" if ip == ips[0] else "           "
            print("  %s : http://%s:%d/" % (label, ip, port))
    else:
        print("  局域网访问 : 未检测到网卡（检查是否已连接网络）")
    print("-" * 62)
    print("  手机 / 平板连同一个 Wi-Fi，浏览器打开上面「局域网访问」的地址")
    print("  打不开的话：Windows 弹防火墙提示时选「允许访问」")
    print("              （或给专用网络放行本程序）")
    print("  停止服务   : 在这个窗口按 Ctrl+C，或直接关掉窗口")
    print(bar)
    print("")
    sys.stdout.flush()

    if open_browser:
        threading.Thread(
            target=lambda: (time.sleep(0.8), webbrowser.open(local_url)),
            daemon=True,
        ).start()

    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\n已停止服务。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
