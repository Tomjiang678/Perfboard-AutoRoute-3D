# apps/site — 官网与在线版入口

三个页面，无额外运行时依赖（路由是 50 行手写的，没有 react-router）：

| 路径 | 页面 |
|---|---|
| `/` | 首页 |
| `/download` | 下载 |
| `/workspace` | 开始工程：全屏 iframe 内嵌应用构建产物 |

## 开发

需要两个终端：

```powershell
# 1) 应用（工作区要用，其他页面不需要）
cd apps/web
npm.cmd install
npm.cmd run dev      # http://127.0.0.1:5173  （strictPort，端口被占会直接报错）

# 2) 官网
cd apps/site
npm.cmd install
npm.cmd run dev      # http://localhost:5174
```

开发时 `Workspace` 的 iframe 直接指向 `http://127.0.0.1:5173/`。

为什么不代理 `/app`：应用 dev 版的 HTML 引用绝对路径（`/src/main.tsx`、
`/@vite/client`），代理到本站会全部 404，所以只能直连它的 dev server。

应用不在 5173 时用环境变量覆盖：

```powershell
$env:VITE_APP_URL="http://127.0.0.1:5180/"
npm.cmd run dev
```

注意：开发时 iframe 跨端口，应用数据存在 5173 这个源的 localStorage；线上同源，无此差异。

## 构建

```powershell
cd apps/web
npm.cmd run build        # → apps/web/dist

cd apps/site
npm.cmd run build        # → apps/site/dist，并把 web/dist 复制成 dist/app
```

`scripts/sync-app.mjs` 负责最后那步复制；没找到 `apps/web/dist` 时只警告，不会让构建失败。

## 部署（nginx）

```nginx
server {
    listen 80;
    server_name example.com;
    root /srv/protoroute/site;      # apps/site/dist 的内容

    # 应用是单页，子路径下没有自己的路由
    location /app/ {
        try_files $uri $uri/ /app/index.html;
    }

    # 官网是前端路由（/、/download、/workspace）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- 站点是前端路由，**必须**有 `try_files … /index.html`，否则直接刷新 `/download` 会 404。
- 部署到子路径时，把 `vite.config.ts` 的 `base` 改成对应前缀，并同步改 `Workspace.tsx` 里的 `/app/`。

## 内容与素材

- 文案在 `src/data/site.ts`。
- **下载信息不用手改**：`scripts/generate-download.mjs` 会扫描 `public/downloads/`，
  取最新的 `.zip`，自动生成 `src/data/download.generated.ts`（文件名、大小、版本、日期）。
  `predev` / `prebuild` 会自动跑它；dev 运行时往目录里丢包也会热刷新。
- 截图与图标在 `public/img/`（`logo-128.png` 由 `apps/web/assets/image1.png` 缩小而来）。

### 发版流程

1. 把新的安装包（zip）放进 `apps/site/public/downloads/`；
2. `npm run build`；
3. 把 `dist/` 同步到服务器：`sudo rsync -a --delete apps/site/dist/ /srv/protoroute/site/`。

文件名里带版本号（如 `ProtoRoute_v2_0_0.zip`）即可自动识别版本；文件名一变，
`/downloads/` 的一年缓存也会自动绕过。

## 以后加论坛

`src/router.tsx` 的 `ROUTES` 加一条，`src/App.tsx` 加一个分支，页面放 `src/pages/`。
后端建议放仓库根目录的 `backend/`（现有 Python 脚手架）。
