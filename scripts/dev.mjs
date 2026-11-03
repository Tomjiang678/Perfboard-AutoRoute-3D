/**
 * 一条命令同时启动应用和官网的开发服务器。
 *
 *   npm run dev
 *
 * 应用：http://127.0.0.1:5173/
 * 官网：http://127.0.0.1:5174/ （/workspace 会内嵌上面的应用）
 *
 * 端口被占用时可以用环境变量换：
 *   $env:DEV_WEB_PORT=5283; $env:DEV_SITE_PORT=5284; npm run dev
 *
 * 不引入额外依赖（不用 concurrently），Ctrl+C 会一起关掉。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const webPort = process.env.DEV_WEB_PORT ?? "5173";
const sitePort = process.env.DEV_SITE_PORT ?? "5174";

const targets = [
  { name: "应用", port: webPort, url: `http://127.0.0.1:${webPort}/`, dir: join(root, "apps", "web") },
  { name: "官网", port: sitePort, url: `http://127.0.0.1:${sitePort}/`, dir: join(root, "apps", "site") }
];

for (const target of targets) {
  if (!existsSync(join(target.dir, "node_modules"))) {
    console.error(`[dev] ${target.dir} 还没装依赖，先在该目录执行 npm install`);
    process.exit(1);
  }
}

const children = [];
let shuttingDown = false;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 200);
}

console.log(`[dev] 应用 ${targets[0].url}   官网 ${targets[1].url}`);

for (const target of targets) {
  const child = spawn(`npm run dev -- --port ${target.port} --strictPort`, {
    cwd: target.dir,
    stdio: "inherit",
    shell: true,
    // 官网的 /workspace 内嵌应用，dev 下要指向同一个端口
    env: { ...process.env, VITE_APP_URL: targets[0].url }
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) console.error(`[dev] ${target.name}的 dev 服务器退出了（code ${code}），正在关闭另一个`);
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
// 正常退出时也顺手收掉子进程，避免留下占端口的 vite
process.on("exit", () => children.forEach(killTree));
