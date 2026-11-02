import { useEffect, useState } from "react";
import { trackHit } from "../analytics.ts";
import { Link } from "../router.tsx";

type AppStatus = "loading" | "ready" | "missing";

/**
 * The real app runs as a separate build (see `scripts/sync-app.mjs`): embedded
 * instead of imported, so the landing page never downloads three.js and the
 * app's global stylesheet cannot leak into the site.
 */
const APP_URL = import.meta.env.DEV
  ? import.meta.env.VITE_APP_URL ?? "http://127.0.0.1:5173/"
  : "/app/";
const SAME_ORIGIN = APP_URL.startsWith("/");

export function WorkspacePage() {
  const [status, setStatus] = useState<AppStatus>(SAME_ORIGIN ? "loading" : "ready");
  const [slow, setSlow] = useState(false);

  // 工作区里是一块实时渲染的 WebGL，页面的颗粒层和固定背景会抢合成资源，
  // 用 html[data-page] 把它们关掉
  useEffect(() => {
    document.documentElement.dataset.page = "workspace";
    return () => {
      delete document.documentElement.dataset.page;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  // A blank iframe is indistinguishable from "the bundle is not deployed", so
  // probe the same-origin path and say what is actually wrong. In development
  // the app lives on another port and cannot be probed (CORS), so the iframe's
  // own error page is the signal there.
  useEffect(() => {
    if (!SAME_ORIGIN) return;
    let cancelled = false;
    fetch(APP_URL, { method: "GET" })
      .then((response) => {
        if (!cancelled && !response.ok) setStatus("missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="workspace">
      {status !== "missing" && (
        <iframe
          src={APP_URL}
          title="ProtoRoute 3D 工作区"
          allow="clipboard-read; clipboard-write; fullscreen"
          onLoad={() => {
            setStatus("ready");
            trackHit("/workspace", "open");
          }}
        />
      )}

      {status !== "missing" && (
        <div className={`workspace-loading${status === "ready" ? " is-hidden" : ""}`} aria-hidden={status === "ready"}>
          <img className="workspace-loading-mark" src="/img/logo-128.png" alt="" width={44} height={44} />
          <strong>正在准备工作区</strong>
          <span>
            {slow && !SAME_ORIGIN
              ? "如果一直停在这里，确认 apps/web 的 dev 服务器已在 5173 运行"
              : "第一次打开需要几秒，之后会快很多"}
          </span>
          <div className="workspace-bar">
            <i />
          </div>
        </div>
      )}

      {status === "missing" && (
        <div className="workspace-missing">
          <strong>工作区没有部署到这里</strong>
          <p>线上缺少 `/app/` 的构建产物</p>
          <ul>
            <li>
              先在 <code>apps/web</code> 执行 <code>npm run build</code>，再到 <code>apps/site</code> 执行{" "}
              <code>npm run build</code>；产物里的 <code>dist/app</code> 就是工作区
            </li>
            <li>
              本地开发不需要构建：在 <code>apps/web</code> 执行 <code>npm run dev</code>
              （5173）后刷新本页，它会直接连过去
            </li>
          </ul>
        </div>
      )}

      <Link to="/" className="workspace-back">
        ← 返回官网
      </Link>
    </div>
  );
}
