import { site } from "../data/site.ts";
import { Link } from "../router.tsx";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container inner">
        <Link to="/" className="brand" ariaLabel={`${site.name} 首页`}>
          <img className="brand-mark" src="/img/logo-128.png" alt="" width={28} height={28} />
          <span>{site.name}</span>
        </Link>
        <nav className="nav" aria-label="主导航">
          <Link to="/">首页</Link>
          <Link to="/download">下载</Link>
          <Link to="/workspace" className="btn btn-primary btn-sm nav-cta">
            开始布线
          </Link>
        </nav>
      </div>
    </header>
  );
}
