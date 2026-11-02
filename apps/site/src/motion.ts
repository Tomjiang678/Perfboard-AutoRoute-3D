/**
 * 极轻的动效层：只做 opacity / transform，不碰布局，不引第三方库
 * 所有效果都尊重 prefers-reduced-motion：用户关掉动效时直接落到终态
 */

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 进入视口时淡入上浮；元素用 data-reveal，级联延迟用 CSS 变量 --reveal-delay */
export function initReveal(): () => void {
  const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (items.length === 0) return () => {};

  if (prefersReduced() || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}

/** 页面滚动一点之后，顶栏加一点投影，和内容拉出层次 */
export function initHeaderElevation(): () => void {
  const header = document.querySelector<HTMLElement>(".site-header");
  if (!header) return () => {};

  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  update();
  window.addEventListener("scroll", update, { passive: true });
  return () => window.removeEventListener("scroll", update);
}

/**
 * 主视觉跟随鼠标做很小的 3D 倾斜（最大 ±4°），并让卡片里的图有一点点位移，
 * 产生“空间感”；触屏或减少动效时完全不注册
 */
export function initTilt(element: HTMLElement): () => void {
  if (prefersReduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return () => {};
  }

  const MAX_DEG = 4;
  let frame = 0;
  let pending: { x: number; y: number } | null = null;

  const apply = () => {
    frame = 0;
    if (!pending) return;
    const { x, y } = pending;
    element.style.setProperty("--tilt-x", `${(-y * MAX_DEG).toFixed(2)}deg`);
    element.style.setProperty("--tilt-y", `${(x * MAX_DEG).toFixed(2)}deg`);
    element.style.setProperty("--tilt-shift-x", `${(x * 6).toFixed(2)}px`);
    element.style.setProperty("--tilt-shift-y", `${(y * 6).toFixed(2)}px`);
  };

  const onMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    pending = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1
    };
    if (!frame) frame = window.requestAnimationFrame(apply);
  };

  const reset = () => {
    pending = { x: 0, y: 0 };
    if (!frame) frame = window.requestAnimationFrame(apply);
  };

  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerleave", reset);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerleave", reset);
    element.style.removeProperty("--tilt-x");
    element.style.removeProperty("--tilt-y");
    element.style.removeProperty("--tilt-shift-x");
    element.style.removeProperty("--tilt-shift-y");
  };
}
