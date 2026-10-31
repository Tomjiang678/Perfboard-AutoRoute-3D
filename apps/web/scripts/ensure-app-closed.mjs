// 打包前先关掉正在运行的旧程序，否则 electron-builder 删不掉 release\win-unpacked 里的文件，
// 打包会失败但窗口一闪而过，很容易以为“已经重新打包了”。
import { execFileSync } from "node:child_process";

const EXE = "ProtoRoute 3D.exe";

function listRunning() {
  try {
    const output = execFileSync(
      "tasklist",
      ["/FI", `IMAGENAME eq ${EXE}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8" }
    );
    return output
      .split(/\r?\n/)
      .filter((line) => line.startsWith('"'))
      .map((line) => line.split('","')[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

const running = listRunning();
if (running.length === 0) {
  console.log(`[prepackage] ${EXE} 没有在运行，继续打包。`);
} else {
  console.log(`[prepackage] 发现 ${running.length} 个 ${EXE} 正在运行，先结束它们……`);
  for (const pid of running) {
    try {
      execFileSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
      console.log(`[prepackage] 已结束进程 ${pid}`);
    } catch {
      console.log(`[prepackage] 无法结束进程 ${pid}（可能权限不足）`);
    }
  }
  // 给文件句柄一点释放时间
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const stillRunning = listRunning();
  if (stillRunning.length > 0) {
    console.error(`[prepackage] 仍有 ${stillRunning.length} 个进程在运行，打包大概率会失败。请手动关闭后重试。`);
    process.exit(1);
  }
}
