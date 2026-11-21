# deploy —— 访问人数统计（只用 nginx + cron）

目标：**在 `/admin` 页面看到访问人数**，不引入 Umami/GA 这类第三方，也不跑常驻服务。

```
浏览器 ──1×1 GET──> /api/hit?p=/download&e=view
                        │  nginx 只写日志、返回 204
                        ▼
              /var/log/nginx/protoroute-hit.log
                        │  cron 每 5 分钟
                        ▼
              /srv/protoroute/site/admin/stats.json
                        │
                        ▼
                  /admin/  （basic auth）
```

## 目录

| 文件 | 用途 |
|---|---|
| `nginx.conf.example` | `/api/hit`、`/admin`、`/app/`、`/downloads/` 的参考配置 |
| `stats.py` | 解析日志 → 生成 `stats.json`（**只用标准库**，python3 即可） |
| `admin/index.html` | 后台页面，读同目录的 `stats.json` |

## 部署步骤

### 1. 站点文件

```bash
sudo mkdir -p /srv/protoroute/site
sudo rsync -a --delete apps/site/dist/ /srv/protoroute/site/
sudo mkdir -p /srv/protoroute/site/admin
sudo cp deploy/admin/index.html /srv/protoroute/site/admin/
sudo cp deploy/stats.py /srv/protoroute/stats.py
```

### 2. nginx

把 `deploy/nginx.conf.example` 里的四段合进你的配置：

- `limit_req_zone` 和 `log_format` 放 `http { }`；
- `location = /api/hit`、`/admin/`、`/app/`、`/downloads/`、`/` 放 `server { }`。

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3. 后台密码

```bash
sudo apt install -y apache2-utils      # 提供 htpasswd
sudo htpasswd -c /etc/nginx/.htpasswd admin
```

### 4. 先手动跑一次

```bash
python3 /srv/protoroute/stats.py \
  --log '/var/log/nginx/protoroute-hit.log*' \
  --out /srv/protoroute/site/admin/stats.json
```

看到 `[stats] 今日 N 人 …` 就对了；打开 `https://你的域名/admin/` 就是那个页面。

### 5. 定时任务

```cron
*/5 * * * * /usr/bin/python3 /srv/protoroute/stats.py \
  --log '/var/log/nginx/protoroute-hit.log*' \
  --out /srv/protoroute/site/admin/stats.json \
  >> /var/log/protoroute-stats.log 2>&1
```

不想用 cron 就用 systemd timer，内容一样。

### 6. 日志轮转

```conf
# /etc/logrotate.d/protoroute-hit
/var/log/nginx/protoroute-hit.log {
    weekly
    rotate 26
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

`stats.py` 的 `--log` 支持通配符，会把 `protoroute-hit.log.1.gz` 这些一起读了，
所以轮转不会丢历史；`--days 180` 控制统计窗口。

## 口径与隐私

- **一个人** = 同一天内 `ip + User-Agent` 相同；只保存这两个值的 SHA-256 前 16 位，**不落原始 IP**。
- **访客**只统计发了 `/api/hit` 的浏览器，UA 里带 bot/crawl/headless 的会被丢掉。
- 不发 Cookie、不做跨站追踪；前端检测到 `Do Not Track` 时直接不上报。
- 数据保留由 `--days` 控制，超过窗口的日志行直接忽略。

## 页面上的三个数字

| 位置 | 含义 |
|---|---|
| 今日访客 / 昨日 | 当天去重后的人数 |
| 近 7 天 | 最近 7 天**跨天去重**的人数（不是 7 天之和） |
| 累计 | 统计窗口内的去重人数 |

另外明细表里有「打开工作区」，那是 iframe 真正加载完成时才发的事件，
比"看了首页"更能说明有人在用。

## 自测

```bash
python3 deploy/stats.py --log deploy/sample.log --out /tmp/stats.json
```

## 引脚配置回流（`/api/pin-profile`）

App 保存一个 Multisim 型号的引脚配置时，会静默 POST 一条 JSON（不含网表、位号、工程名、IP）。这里只负责落盘，人工审核后再合并进内置库。

```
app ──POST /api/pin-profile──► nginx ──► 127.0.0.1:8099 ──► /var/lib/protoroute/pin-profiles/*.jsonl
                                                                     │
                                          node tools/merge-pin-profiles.mjs --in <dir>
                                                                     ▼
                                        apps/web/src/features/import/multisim/multisimProfiles.json
```

## 1. 启动接收服务

```bash
sudo mkdir -p /srv/protoroute /var/lib/protoroute/pin-profiles
sudo cp deploy/pin-profile-server.mjs /srv/protoroute/
sudo cp deploy/pin-profile.service.example /etc/systemd/system/protoroute-pin-profile.service
sudo systemctl daemon-reload
sudo systemctl enable --now protoroute-pin-profile
curl -i http://127.0.0.1:8099/health   # 204
```

只需要 Node 18+，没有依赖；默认只监听 `127.0.0.1:8099`。

## 2. nginx

把 `deploy/pin-profile.nginx.conf` 里的 `location` 合进站点配置；`limit_req_zone` 放 `http {}`：

```conf
limit_req_zone $binary_remote_addr zone=pinprofile:1m rate=10r/m;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 3. 构建时指向端点

```bash
VITE_PROFILE_ENDPOINT=https://你的域名/api/pin-profile npm run build
```

没配置时，提交只留在本机 outbox（最多 50 条），联网后补发。

## 4. 审核与合并

```bash
# 从服务器拉回 submissions/
node tools/merge-pin-profiles.mjs --in submissions/ --report pin-profile-report.md
```

- 完全相同的提交只累加确认次数；
- 同一型号映射不一致 → 两边都保留，写进报告，**不自动合并**；
- 默认至少 2 份独立提交才进内置库，确认无误的数字可以 `--min-confirmations 1`；
- 输出直接覆盖 `apps/web/src/features/import/multisim/multisimProfiles.json`，下次发版生效。

提交内容只有：型号、封装、脚数、`physical/logical/unit/connection/net` 表。服务器不记录 IP，也不接收自由文本。

## 隐私

- nginx 的 `protoroute-pin-profile.log` 只记访问行，不写 body；
- 服务端只落 payload，不落 RemoteAddr；
- 合并工具只处理型号身份，不接触任何工程数据。

