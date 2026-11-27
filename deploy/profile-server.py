#!/usr/bin/env python3
"""接收网页版的 Multisim 引脚定义提交。

POST /api/profile  →  原样校验 JSON 后追加一行到 JSONL，返回 204。
只监听 127.0.0.1，由 nginx 反代；不做鉴权/限流（按需求：保持简单）。
"""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 64 * 1024


class Handler(BaseHTTPRequestHandler):
    output_path = ""

    def do_POST(self):  # noqa: N802 (http.server API)
        if self.path.split("?")[0] != "/api/profile":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0

        if length <= 0 or length > MAX_BODY:
            self.send_response(413)
            self.end_headers()
            return

        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except Exception:
            self.send_response(400)
            self.end_headers()
            return

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
        with open(self.output_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")

        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):  # 静默：不写访问日志
        pass


def main():
    parser = argparse.ArgumentParser(description="ProtoRoute 引脚定义接收端")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--file", default="/srv/protoroute/profiles/submissions.jsonl")
    args = parser.parse_args()

    Handler.output_path = args.file
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[profile-server] listening on 127.0.0.1:{args.port} -> {args.file}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
