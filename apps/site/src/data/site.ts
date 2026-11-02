/**
 * Single place to edit everything the marketing site says about the product.
 *
 * 下载信息不在这里手写：`scripts/generate-download.mjs` 会扫描
 * `public/downloads/` 里最新的 zip，生成 `download.generated.ts`。
 * 发版只需要把新的安装包丢进那个目录。
 */
import { downloadArtifact } from "./download.generated.ts";

export const site = {
  name: "ProtoRoute 3D",
  chineseName: "洞洞板布线",
  github: "https://github.com/Tomjiang678/Perfboard-AutoRoute-3D",
  download: {
    version: downloadArtifact.version,
    releasedAt: downloadArtifact.releasedAt,
    fileName: downloadArtifact.fileName,
    size: downloadArtifact.size,
    available: downloadArtifact.available,
    /** 放在 apps/site/public/downloads/ 下，由构建脚本自动识别 */
    url: downloadArtifact.url
  },
  requirements: [
    "Windows 10 / 11（64 位）",
    "约 300 MB 空间",
    "无需 Python / Node",
    "解压后离线可用"
  ],
  features: [
    { title: "三维摆放", body: "元件吸附孔位，正反面一眼看清" },
    { title: "自动布线", body: "走锡加跳线，走不通会告诉你" },
    { title: "DRC 检查", body: "短路、漏连、占孔，标在板上" },
    { title: "网表直连", body: "KiCad 与嘉立创网表拖进来就用" }
  ],
  steps: [
    { title: "新建工程", body: "选板型，定尺寸" },
    { title: "导入网表", body: "拖进来，生成元件" },
    { title: "布线导出", body: "布线、查 DRC、存工程" }
  ]
};
