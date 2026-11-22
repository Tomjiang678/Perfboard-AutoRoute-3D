import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real-app visual smoke test. It launches the packaged Electron app, opens the
 * user-package editor, selects Pin 1, checks the 1-based coordinate display,
 * the activity fields, takes screenshots, and drags the viewport to show axes.
 *
 * Run from apps/web:
 *   node tests/visualFeatureSmoke.mjs
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, "../release/win-unpacked/ProtoRoute 3D.exe");
const outDir = path.resolve(here, "visual-output");
const port = 9271;

fs.mkdirSync(outDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // app is still starting
    }
    await wait(250);
  }
  throw new Error("Electron app did not expose a debugging page");
}

const child = spawn(appPath, [`--remote-debugging-port=${port}`], { stdio: "ignore" });
let ws;
try {
  ws = new WebSocket(await connect());
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return result.result?.result?.value;
  };
  const screenshot = async (name) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.result.data, "base64"));
  };
  const clickText = (text) => evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);

  await wait(1500);
  await screenshot("main.png");

  if (!(await clickText("封装库"))) {
    throw new Error("封装库 button is missing");
  }
  await wait(300);
  if (!(await clickText("用户"))) throw new Error("用户 tab is missing");
  await wait(300);

  const opened = await evaluate(`(() => {
    const item = document.querySelector(".library-item");
    if (!item) return false;
    const rect = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: rect.x + 20, clientY: rect.y + 20
    }));
    return true;
  })()`);
  if (!opened) throw new Error("no user package in the library");
  await wait(200);
  if (!(await clickText("修改"))) throw new Error("修改 menu item is missing");
  await wait(400);

  const packageJson = await evaluate(`localStorage.getItem("protoroute-user-packages")`);
  const firstPackage = JSON.parse(packageJson ?? "[]")[0];
  if (!firstPackage) throw new Error("no stored user package");
  const firstPin = firstPackage.shapes.find((shape) => shape.kind === "pin");
  if (!firstPin) throw new Error("stored package has no pin");

  const pinRows = await evaluate(`document.querySelectorAll(".user-package-pin-row").length`);
  if (pinRows < 1) throw new Error("pin list did not render");
  await evaluate(`document.querySelector(".user-package-pin-row").click()`);
  await wait(300);

  const bodyText = await evaluate("document.body.innerText");
  const expectedHole = `${firstPin.hole[0] + 1}, ${firstPin.hole[1] + 1}`;
  if (!bodyText.includes(expectedHole)) {
    throw new Error(`pin coordinate mismatch: expected ${expectedHole}`);
  }
  if (!bodyText.includes("活动范围") || !bodyText.includes("活动方向")) {
    throw new Error("pin activity fields are missing");
  }
  if (await evaluate(`document.querySelectorAll(".user-package-pin-row.active").length`) !== 1) {
    throw new Error("clicked pin is not marked active");
  }
  await screenshot("package-pin-highlight.png");

  const rect = await evaluate(`(() => {
    const canvas = document.querySelector(".user-package-canvas");
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5, button: "left", clickCount: 1
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: rect.x + rect.width * 0.6, y: rect.y + rect.height * 0.45, button: "left"
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: rect.x + rect.width * 0.6, y: rect.y + rect.height * 0.45, button: "left", clickCount: 1
  });
  await wait(300);
  await screenshot("package-axis.png");

  console.log(JSON.stringify({
    ok: true,
    pinRows,
    expectedHole,
    screenshots: ["main.png", "package-pin-highlight.png", "package-axis.png"]
  }, null, 2));
} finally {
  ws?.close();
  child.kill();
}
