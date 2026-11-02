import type { CSSProperties } from "react";
import { site } from "../data/site.ts";
import { Link } from "../router.tsx";

const delay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

export function DownloadPage() {
  const { download } = site;

  return (
    <section className="page">
      <div className="container">
        <div className="page-head" data-reveal>
          <h1>下载</h1>
          <p className="lede">Windows x64，解压即用</p>
        </div>

        <div className="release" data-reveal style={delay(90)}>
          <div>
            <div className="release-title">
              <span>{download.version ? `v${download.version}` : "最新版"}</span>
              <span className="release-tag">Windows x64</span>
            </div>
            <div className="release-meta">
              <div>
                <b>{download.size}</b>
                压缩包
              </div>
              <div>
                <b>{download.fileName}</b>
                文件名
              </div>
              <div>
                <b>{download.releasedAt}</b>
                发布
              </div>
            </div>
          </div>
          <div className="release-actions">
            {download.available ? (
              <a className="btn btn-primary" href={download.url} download>
                下载
              </a>
            ) : (
              <span className="btn btn-primary" aria-disabled="true" style={{ opacity: 0.55, cursor: "not-allowed" }}>
                暂未发布
              </span>
            )}
            <Link to="/workspace" className="btn btn-ghost">
              在线试用
            </Link>
          </div>
        </div>

        <section className="block" data-reveal style={delay(180)}>
          <h2>系统要求</h2>
          <ul className="req-list">
            {site.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="block" data-reveal style={delay(260)}>
          <h2>安装</h2>
          <div className="step-list">
            <div className="step-row">
              <span className="n">01</span>
              <div>
                <h3>解压整个目录</h3>
                <p>程序依赖同目录的 dll 与 resources</p>
              </div>
            </div>
            <div className="step-row">
              <span className="n">02</span>
              <div>
                <h3>双击 ProtoRoute 3D.exe</h3>
                <p>首次运行按系统提示放行即可</p>
              </div>
            </div>
            <div className="step-row">
              <span className="n">03</span>
              <div>
                <h3>导入网表</h3>
                <p>KiCad 或嘉立创导出的 .net 拖进来</p>
              </div>
            </div>
          </div>

          <p className="note">网页版工程存在浏览器里；换设备前请导出工程 JSON</p>
        </section>
      </div>
    </section>
  );
}
