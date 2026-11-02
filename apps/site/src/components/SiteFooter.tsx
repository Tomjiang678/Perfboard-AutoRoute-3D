import { site } from "../data/site.ts";
import { Link } from "../router.tsx";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand" ariaLabel={`${site.name} 首页`}>
              <img className="brand-mark" src="/img/logo-128.png" alt="" width={28} height={28} />
              <span>{site.name}</span>
            </Link>
            <p className="footer-blurb">洞洞板与面包板的三维布线工具</p>
          </div>

          <div className="footer-col">
            <h4>产品</h4>
            <ul>
              <li><Link to="/download">下载</Link></li>
              <li><Link to="/workspace">开始布线</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>资源</h4>
            <ul>
              <li>
                <a href={site.github} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
              <li>
                <a href={`${site.github}#readme`} target="_blank" rel="noreferrer">
                  使用说明
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 {site.name}</span>
          <span>MIT License</span>
        </div>
      </div>
    </footer>
  );
}
