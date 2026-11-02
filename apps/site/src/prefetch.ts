/**
 * 点击「开始布线」之后才去加载 /app/，1 MB 的 three.js 解析 + WebGL 初始化
 * 会让这一下明显发顿所以在鼠标移到按钮上时就先开一个 1px 的隐藏 iframe
 * 把资源拉进缓存；真正点击时基本只剩解析时间
 *
 * 只在支持 hover 的设备上做，20 秒后回收，避免一直占着一个 WebGL 上下文
 */
let started = false;

function canPrefetch() {
  // 开发时应用在另一个端口、且不是这个路径，预热只会 404
  if (import.meta.env.DEV) return false;
  return (
    typeof document !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export function initWorkspacePrefetch(): () => void {
  if (!canPrefetch()) return () => {};

  let timer = 0;

  const maybePrefetch = (event: Event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.('a[href="/workspace"]')) return;
    if (started) return;
    started = true;

    // 悬停 150ms 再预热：扫过按钮不该触发
    timer = window.setTimeout(() => {
      const frame = document.createElement("iframe");
      frame.src = "/app/index.html";
      frame.title = "";
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
      Object.assign(frame.style, {
        position: "fixed",
        left: "-9999px",
        top: "0",
        width: "1px",
        height: "1px",
        opacity: "0",
        border: "0",
        pointerEvents: "none"
      });
      document.body.appendChild(frame);
      window.setTimeout(() => frame.remove(), 20000);
    }, 150);
  };

  document.addEventListener("pointerover", maybePrefetch, { passive: true });
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("pointerover", maybePrefetch);
  };
}
