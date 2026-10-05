import * as THREE from "three";
import type { BoardSize, ThemeMode } from "../../types/project.ts";
import { getBreadboardColumnRole } from "./breadboard.ts";
import { getBoardModel } from "./factory.ts";

const styles = {
  perfboard: { side: 0x0d6b48, edge: 0x08432f, top: "#0f7c53", bottom: "#0f7c53", hole: "#111918" },
  breadboard: { side: 0xffffff, edge: 0xb9c2cc, top: "#ffffff", bottom: "#ffffff", hole: "#31383d" }
};

const darkPerfboard = { side: 0x2f9d76, edge: 0x1e7a58, top: "#3cb489", bottom: "#3cb489", hole: "#0e1f19" };

function styleFor(board: BoardSize, theme: ThemeMode) {
  return theme === "dark" && (board.kind ?? "perfboard") === "perfboard" ? darkPerfboard : styles[board.kind ?? "perfboard"];
}

export function createBoardObject(board: BoardSize, transparent: boolean, theme: ThemeMode) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(board.width, 0.55, board.height);
  const style = styleFor(board, theme);
  const textures = [createHoleTexture(board, false, theme), createHoleTexture(board, true, theme)];
  textures.forEach((texture) => { texture.colorSpace = THREE.SRGBColorSpace; });
  const material = (options: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({
    roughness: 0.24, metalness: 0.02, transparent, opacity: transparent ? 0.18 : 1, depthWrite: !transparent, ...options
  });
  const side = material({ color: style.side, roughness: 0.28, opacity: transparent ? 0.22 : 1 });
  const mesh = new THREE.Mesh(geometry, [side, side, material({ map: textures[0], color: 0xffffff }), material({ map: textures[1], color: 0xffffff }), side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: style.edge, transparent: true, opacity: 0.42 })));
  group.add(createGridIndexLabels(board, theme));
  return group;
}

function createGridIndexLabels(board: BoardSize, theme: ThemeMode) {
  const group = new THREE.Group();
  const addAxis = (count: number, fixed: number, horizontal: boolean) => {
    const step = count <= 40 ? 1 : count <= 80 ? 2 : 5;
    for (let index = 0; index < count; index += 1) {
      if (index !== 0 && index !== count - 1 && index % step !== 0) continue;
      const moving = index - count / 2 + 0.5;
      const positions: Array<[number, number, number]> = horizontal
        ? [[moving, 0.58, -fixed], [moving, 0.58, fixed]]
        : [[-fixed, 0.58, moving], [fixed, 0.58, moving]];
      positions.forEach(([x, y, z]) => group.add(createGridIndexSprite(String(index + 1), x, y, z, theme === "dark")));
    }
  };
  addAxis(board.width, board.height / 2 + 0.68, true);
  addAxis(board.height, board.width / 2 + 0.68, false);
  return group;
}

function createGridIndexSprite(text: string, x: number, y: number, z: number, dark: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = dark ? "rgba(35,43,52,0.92)" : "rgba(255,255,255,0.88)";
    roundedRect(ctx, 12, 10, 72, 44, 8);
    ctx.fill();
    ctx.strokeStyle = dark ? "rgba(148,162,176,0.35)" : "rgba(8,67,47,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    Object.assign(ctx, { fillStyle: dark ? "#dbe4ee" : "#10201b", font: "700 28px Segoe UI, Arial, sans-serif", textAlign: "center", textBaseline: "middle" });
    ctx.fillText(text, 48, 33);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(0.72, 0.48, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createHoleTexture(board: BoardSize, isBottom: boolean, theme: ThemeMode) {
  const model = getBoardModel(board);
  const style = styleFor(board, theme);
  const cellPx = Math.max(2, Math.min(18, Math.floor(2048 / Math.max(board.width, board.height))));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, board.width * cellPx);
  canvas.height = Math.max(64, board.height * cellPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.fillStyle = isBottom ? style.bottom : style.top;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  const breadboard = board.kind === "breadboard";
  gradient.addColorStop(0, breadboard ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.20)");
  gradient.addColorStop(0.35, breadboard ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.03)");
  gradient.addColorStop(1, breadboard ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.18)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (breadboard && !isBottom) drawBreadboardGuides(ctx, board, cellPx);
  const radius = Math.max(0.75, cellPx * 0.2);
  const ringRadius = Math.max(radius + 0.9, cellPx * 0.39);
  model.getAllHoles().forEach(({ grid: [x, y] }) => {
    const cx = x * cellPx + cellPx / 2;
    const cy = y * cellPx + cellPx / 2;
    if (isBottom && !breadboard && cellPx >= 4) drawCopperRing(ctx, cx, cy, ringRadius, cellPx);
    ctx.beginPath();
    ctx.fillStyle = style.hole;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, { anisotropy: 8, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, needsUpdate: true });
  return texture;
}

function drawCopperRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, cellPx: number) {
  ctx.beginPath();
  ctx.fillStyle = "#e0af4a";
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = Math.max(0.6, cellPx * 0.055);
  ctx.arc(x, y, radius * 0.72, -0.9, 0.8);
  ctx.stroke();
}

function drawBreadboardGuides(ctx: CanvasRenderingContext2D, board: BoardSize, cellPx: number) {
  for (let x = 0; x < board.width; x += 1) {
    const role = getBreadboardColumnRole(board, x);
    const centreX = (x + 0.5) * cellPx;
    if (role.kind === "rail") {
      ctx.lineWidth = Math.max(1, cellPx * 0.1);
      ctx.strokeStyle = role.color === "red" ? "rgba(255,24,67,0.95)" : "rgba(20,105,255,0.95)";
      // Rails are drawn as 5-hole segments with small gaps between groups,
      // like the plastic notches on a real breadboard rail strip.
      for (let start = 0; start < board.height; start += 6) {
        const end = Math.min(board.height, start + 5);
        ctx.beginPath();
        ctx.moveTo(centreX, start * cellPx + cellPx * 0.35);
        ctx.lineTo(centreX, end * cellPx - cellPx * 0.35);
        ctx.stroke();
      }
    }
    if (role.kind === "channel") {
      ctx.fillStyle = "rgba(92,101,109,0.16)";
      ctx.fillRect(centreX - cellPx * 0.42, 0, cellPx * 0.84, board.height * cellPx);
    }
  }
}
