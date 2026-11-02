import { useEffect } from "react";
import { trackHit } from "./analytics.ts";
import { SiteFooter } from "./components/SiteFooter.tsx";
import { SiteHeader } from "./components/SiteHeader.tsx";
import { initHeaderElevation, initReveal } from "./motion.ts";
import { initWorkspacePrefetch } from "./prefetch.ts";
import { DownloadPage } from "./pages/Download.tsx";
import { HomePage } from "./pages/Home.tsx";
import { WorkspacePage } from "./pages/Workspace.tsx";
import { useRoute } from "./router.tsx";

export function App() {
  const route = useRoute();

  // One hit per route change; the server aggregates unique visitors per day.
  useEffect(() => {
    trackHit(route);
  }, [route]);

  // Reveal animations and the header shadow have to be re-attached after every
  // route change, because the pages are plain remounts (no transition layer).
  useEffect(() => {
    const cleanups = [initReveal(), initHeaderElevation(), initWorkspacePrefetch()];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [route]);

  // The workspace is the app itself: full viewport, no site chrome.
  if (route === "/workspace") {
    return <WorkspacePage />;
  }

  return (
    <>
      <SiteHeader />
      <main>{route === "/download" ? <DownloadPage /> : <HomePage />}</main>
      <SiteFooter />
    </>
  );
}
