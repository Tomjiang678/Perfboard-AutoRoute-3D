/**
 * 极简访问计数：只发一个 1×1 的 GET，请求落进 nginx 的独立日志，
 * 由服务器上的 `deploy/stats.py` 汇总成 `/admin` 页面
 *
 * 刻意保持最小：不收集设备指纹、不做跨站追踪、不写 Cookie，
 * 并且尊重浏览器的 Do Not Track开发环境不发，避免污染线上数据
 */
const ENDPOINT = "/api/hit";

function trackingAllowed() {
  if (import.meta.env.DEV) return false;
  if (typeof navigator === "undefined") return false;
  const dnt =
    (navigator as Navigator & { doNotTrack?: string | null }).doNotTrack ??
    (window as Window & { doNotTrack?: string | null }).doNotTrack;
  return dnt !== "1" && dnt !== "yes";
}

/** event: "view"（页面浏览）或 "open"（打开工作区）等自定义事件 */
export function trackHit(path: string, event = "view") {
  if (!trackingAllowed()) return;
  const query = new URLSearchParams({ p: path, e: event });
  const image = new Image(1, 1);
  image.onload = image.onerror = () => {
    image.onload = null;
    image.onerror = null;
  };
  image.src = `${ENDPOINT}?${query.toString()}`;
}
