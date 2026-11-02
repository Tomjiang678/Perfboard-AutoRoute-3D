import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export type Route = "/" | "/download" | "/workspace";

const ROUTES: Route[] = ["/", "/download", "/workspace"];
const listeners = new Set<() => void>();

function readRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return (ROUTES.find((route) => route === path) ?? "/") as Route;
}

window.addEventListener("popstate", () => {
  listeners.forEach((listener) => listener());
});

export function navigate(to: Route) {
  if (readRoute() === to) {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    return;
  }
  window.history.pushState({}, "", to);
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  listeners.forEach((listener) => listener());
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return route;
}

interface LinkProps {
  to: Route;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  ariaLabel?: string;
}

/**
 * Plain anchors with an intercepted click: real hrefs keep middle-click,
 * "open in new tab" and crawlers working, while normal clicks stay client-side.
 */
export function Link({ to, className, children, onNavigate, ariaLabel }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onNavigate?.();
    navigate(to);
  }

  return (
    <a href={to} className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </a>
  );
}
