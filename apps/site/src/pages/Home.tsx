import { useEffect, useRef, type CSSProperties } from "react";
import { site } from "../data/site.ts";
import { initTilt } from "../motion.ts";
import { Link } from "../router.tsx";

/** Staggered reveal delay, consumed by the `[data-reveal]` CSS. */
const delay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

export function HomePage() {
  const artRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!artRef.current) return;
    return initTilt(artRef.current);
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1 data-reveal style={delay(0)}>
              在电脑里
              <br />
              先焊一遍
            </h1>
            <p className="lede" data-reveal style={delay(90)}>
              导入网表，摆好元件，自动布线
            </p>
            <div className="hero-actions" data-reveal style={delay(180)}>
              <Link to="/workspace" className="btn btn-primary">
                开始布线 →
              </Link>
              <Link to="/download" className="btn btn-ghost">
                下载
              </Link>
            </div>
          </div>

          <div className="hero-art-wrap" data-reveal style={delay(120)} ref={artRef}>
            <figure className="hero-art">
              <img
                src="/img/board-iso.png"
                alt="三维视图：洞洞板上已放好三个 DIP 芯片、若干电阻与电解电容"
                decoding="async"
              />
            </figure>
          </div>
        </div>
      </section>

      <div className="container">
        <section className="features" aria-label="功能">
          {site.features.map((feature, index) => (
            <article className="feature" key={feature.title} data-reveal style={delay(index * 70)}>
              <span className="feature-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="gallery" aria-label="界面预览">
          <figure data-reveal>
            <img src="/img/board-traces.png" alt="洞洞板背面视角，可见反面走锡与一根跳线" loading="lazy" />
            <figcaption>洞洞板</figcaption>
          </figure>
          <figure data-reveal style={delay(90)}>
            <img src="/img/board-breadboard.png" alt="面包板上放好元件并用跳线连接" loading="lazy" />
            <figcaption>面包板</figcaption>
          </figure>
        </section>
      </div>

      <section className="band">
        <div className="container">
          <div className="band-head">
            <h2 data-reveal>三步上手</h2>
          </div>
          <div className="steps">
            {site.steps.map((step, index) => (
              <article className="step" key={step.title} data-reveal style={delay(index * 80)}>
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        <div className="strip" data-reveal>
          <span>Windows 10 / 11</span>
          <span>免安装</span>
          <span>本地保存</span>
        </div>

        <section className="cta" data-reveal>
          <h2>先试一遍</h2>
          <div className="cta-actions">
            <Link to="/workspace" className="btn btn-primary">
              开始布线
            </Link>
            <Link to="/download" className="btn btn-ghost">
              下载
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
