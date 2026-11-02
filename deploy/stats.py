#!/usr/bin/env python3
"""把 nginx 的 /api/hit 日志汇总成 stats.json，供 /admin 页面读取。

前端每次路由变化会发一个 GET /api/hit?p=/download&e=view，
nginx 只写日志、返回 204；本脚本按天统计独立访客（ip + UA 的哈希）、
浏览量、事件次数，输出连续日期的序列给后台画图。

用法：
    python3 stats.py --log /var/log/nginx/protoroute-hit.log \
                     --out /srv/protoroute/site/admin/stats.json

只用标准库，服务器上只要有 python3 就能跑，不需要装任何包。
"""
from __future__ import annotations

import argparse
import glob
import gzip
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

# nginx 的 combined 格式：
#   ip - - [10/Oct/2026:12:34:56 +0800] "GET /api/hit?p=/&e=view HTTP/1.1" 204 0 "-" "UA"
HIT_LINE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] '
    r'"(?P<method>\S+) (?P<target>\S+)[^"]*" (?P<status>\d{3})'
    r'(?: \S+)? "(?P<referer>[^"]*)" "(?P<ua>[^"]*)"'
)

# 1×1 的计数请求只有真浏览器会发，但爬虫也可能执行 JS，按 UA 再筛一遍。
BOT_UA = re.compile(
    r"bot|crawl|spider|slurp|headless|phantom|curl|wget|python-requests|httpclient|go-http",
    re.IGNORECASE,
)

TIME_FORMAT = "%d/%b/%Y:%H:%M:%S %z"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="nginx 访问日志 → stats.json")
    parser.add_argument(
        "--log",
        required=True,
        help="nginx 为 /api/hit 写的日志；可以给通配符（如 protoroute-hit.log*）把轮转文件也算进去，.gz 会自动解压",
    )
    parser.add_argument("--out", required=True, help="输出的 stats.json 路径")
    parser.add_argument("--days", type=int, default=180, help="只统计最近多少天（默认 180）")
    return parser.parse_args()


def visitor_id(ip: str, ua: str) -> str:
    """同一天里 ip + UA 相同即为同一个访客；不保存原始 IP。"""
    return hashlib.sha256(f"{ip}\x00{ua}".encode()).hexdigest()[:16]


def open_log(path: str):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace")


def iter_hits(path: str):
    with open_log(path) as handle:
        for line in handle:
            match = HIT_LINE.match(line)
            if not match:
                continue
            try:
                stamp = datetime.strptime(match.group("time"), TIME_FORMAT)
            except ValueError:
                continue
            yield stamp, match


def collect(log_pattern: str, days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    buckets: dict[str, dict] = {}
    every_visitor: set[str] = set()

    paths = sorted(glob.glob(log_pattern)) or [log_pattern]
    for path in paths:
        for stamp, match in iter_hits(path):
            if stamp < cutoff:
                continue
            user_agent = match.group("ua")
            if BOT_UA.search(user_agent):
                continue

            target = match.group("target")
            query = parse_qs(urlsplit(target).query)
            event = (query.get("e") or ["view"])[0][:24] or "view"
            page = (query.get("p") or ["/"])[0][:48] or "/"
            day = stamp.astimezone().strftime("%Y-%m-%d")
            visitor = visitor_id(match.group("ip"), user_agent)

            bucket = buckets.setdefault(
                day, {"visitors": set(), "views": 0, "events": Counter(), "pages": Counter()}
            )
            bucket["visitors"].add(visitor)
            bucket["views"] += 1
            bucket["events"][event] += 1
            bucket["pages"][page] += 1
            every_visitor.add(visitor)

    return buckets, every_visitor


def build_series(buckets: dict[str, dict], days: int) -> list[dict]:
    today = date.today()
    if buckets:
        first = min(date.fromisoformat(day) for day in buckets)
    else:
        first = today

    series: list[dict] = []
    cursor = max(first, today - timedelta(days=days - 1))
    while cursor <= today:
        key = cursor.isoformat()
        bucket = buckets.get(key)
        series.append(
            {
                "date": key,
                "visitors": len(bucket["visitors"]) if bucket else 0,
                "views": bucket["views"] if bucket else 0,
                "events": dict(bucket["events"]) if bucket else {},
                "pages": dict(bucket["pages"].most_common(6)) if bucket else {},
            }
        )
        cursor += timedelta(days=1)
    return series


def summarize(buckets: dict[str, dict], series: list[dict], every_visitor: set[str]) -> dict:
    def day_visitors(offset: int) -> int:
        index = len(series) - 1 - offset
        return series[index]["visitors"] if index >= 0 else 0

    last7 = set()
    for entry in series[-7:]:
        last7 |= buckets.get(entry["date"], {}).get("visitors", set())

    return {
        "today": day_visitors(0),
        "yesterday": day_visitors(1),
        "last7": len(last7),
        "allTime": len(every_visitor),
        "views": sum(entry["views"] for entry in series),
        "since": series[0]["date"] if series else date.today().isoformat(),
    }


def write_json(path: str, payload: dict) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=directory, prefix=".stats-", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


def main() -> int:
    args = parse_args()
    if not glob.glob(args.log) and not os.path.exists(args.log):
        print(f"[stats] 日志不存在：{args.log}（先让 nginx 记几条再跑）", file=sys.stderr)
        return 1

    buckets, every_visitor = collect(args.log, args.days)
    series = build_series(buckets, args.days)
    payload = {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "summary": summarize(buckets, series, every_visitor),
        "days": series,
    }
    write_json(args.out, payload)

    summary = payload["summary"]
    print(
        f"[stats] 今日 {summary['today']} 人 / 昨日 {summary['yesterday']} 人 "
        f"/ 近 7 天 {summary['last7']} 人 / 累计 {summary['allTime']} 人 → {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
