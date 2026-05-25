import type { PlacedComponent } from "../../types/project";

export interface PlacementRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoPlacementResult {
  components: PlacedComponent[];
  placedCount: number;
  warnings: string[];
}

interface FootprintBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function autoPlaceComponents(
  components: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number
): AutoPlacementResult {
  const normalizedRegion = insetRegion(normalizeRegion(region, boardWidth, boardHeight), 1);
  const lockedComponents = components.filter((component) => component.mounted);
  const movableComponents = components.filter((component) => !component.mounted);
  const occupied = new Set<string>();
  lockedComponents.forEach((component) => {
    getComponentOccupiedHoles(component).forEach(([x, y]) => occupied.add(key(x, y)));
  });

  const regionArea = normalizedRegion.width * normalizedRegion.height;
  const requiredArea = movableComponents.reduce((sum, component) => {
    const box = getFootprintBox(component);
    return sum + Math.max(1, (box.width + 2) * (box.height + 2));
  }, 0);
  const warnings: string[] = [];

  if (requiredArea > regionArea) {
    warnings.push(`区域容量不足：估算需要 ${requiredArea} 个格点，当前区域 ${regionArea} 个格点`);
    return {
      components,
      placedCount: 0,
      warnings
    };
  }

  if (normalizedRegion.width <= 0 || normalizedRegion.height <= 0) {
    return {
      components,
      placedCount: 0,
      warnings: ["区域太小：内缩一圈后没有可用空间"]
    };
  }

  const sortedMovable = [...movableComponents].sort((a, b) => {
    const boxA = getFootprintBox(a);
    const boxB = getFootprintBox(b);
    return boxB.width * boxB.height - boxA.width * boxA.height;
  });

  const placedPositions = new Map<string, [number, number]>();

  const placedAnchors: Array<[number, number]> = lockedComponents.map((component) => component.position);

  for (const component of sortedMovable) {
    const placement = findPlacement(component, normalizedRegion, boardWidth, boardHeight, occupied, placedAnchors);
    if (!placement) {
      warnings.push(`${component.name} 无法放入指定区域`);
      continue;
    }

    placedPositions.set(component.id, placement);
    placedAnchors.push(placement);
    getComponentOccupiedHoles({ ...component, position: placement }).forEach(([x, y]) => occupied.add(key(x, y)));
  }

  return {
    components: components.map((component) => {
      const position = placedPositions.get(component.id);
      return position ? { ...component, position, mounted: true } : component;
    }),
    placedCount: placedPositions.size,
    warnings
  };
}

function findPlacement(
  component: PlacedComponent,
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>,
  placedAnchors: Array<[number, number]>
): [number, number] | undefined {
  const box = getFootprintBox(component);
  const candidates = createSpreadCandidates(region, box)
    .filter((position) => canPlaceAt(component, position, region, boardWidth, boardHeight, occupied))
    .sort((a, b) => scorePlacement(b, placedAnchors, region) - scorePlacement(a, placedAnchors, region));

  return candidates[0];
}

function canPlaceAt(
  component: PlacedComponent,
  position: [number, number],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>
) {
  const holes = getComponentOccupiedHoles({ ...component, position });
  return holes.every(([x, y]) => {
    return (
      x >= 0 &&
      y >= 0 &&
      x < boardWidth &&
      y < boardHeight &&
      x >= region.x &&
      y >= region.y &&
      x < region.x + region.width &&
      y < region.y + region.height &&
      !occupied.has(key(x, y))
    );
  });
}

function getComponentOccupiedHoles(component: PlacedComponent): Array<[number, number]> {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  return component.pinOffsets.map((offset) => {
    const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    return [component.position[0] + rx, component.position[1] + ry];
  });
}

function getFootprintBox(component: PlacedComponent): FootprintBox {
  const holes = getComponentOccupiedHoles({ ...component, position: [0, 0] });
  const xs = holes.map(([x]) => x);
  const ys = holes.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function normalizeRegion(region: PlacementRegion, boardWidth: number, boardHeight: number): PlacementRegion {
  const x = clamp(Math.round(region.x), 0, boardWidth - 1);
  const y = clamp(Math.round(region.y), 0, boardHeight - 1);
  const width = clamp(Math.round(region.width), 1, boardWidth - x);
  const height = clamp(Math.round(region.height), 1, boardHeight - y);
  return { x, y, width, height };
}

function insetRegion(region: PlacementRegion, inset: number): PlacementRegion {
  return {
    x: region.x + inset,
    y: region.y + inset,
    width: region.width - inset * 2,
    height: region.height - inset * 2
  };
}

function createSpreadCandidates(region: PlacementRegion, box: FootprintBox): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  const minAnchorX = region.x - box.minX;
  const maxAnchorX = region.x + region.width - 1 - box.maxX;
  const minAnchorY = region.y - box.minY;
  const maxAnchorY = region.y + region.height - 1 - box.maxY;

  if (minAnchorX > maxAnchorX || minAnchorY > maxAnchorY) {
    return candidates;
  }

  const goldenRatio = 0.61803398875;
  const count = Math.max(64, Math.min(1200, region.width * region.height));
  for (let index = 0; index < count; index += 1) {
    const u = (index * goldenRatio) % 1;
    const v = (index * 0.754877666) % 1;
    candidates.push([
      Math.round(minAnchorX + u * (maxAnchorX - minAnchorX)),
      Math.round(minAnchorY + v * (maxAnchorY - minAnchorY))
    ]);
  }

  const gridStep = Math.max(1, Math.floor(Math.sqrt((region.width * region.height) / 120)));
  for (let y = minAnchorY; y <= maxAnchorY; y += gridStep) {
    for (let x = minAnchorX; x <= maxAnchorX; x += gridStep) {
      candidates.push([x, y]);
    }
  }

  return dedupePositions(candidates);
}

function scorePlacement(position: [number, number], placedAnchors: Array<[number, number]>, region: PlacementRegion) {
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  const borderDistance = Math.min(
    position[0] - region.x,
    region.x + region.width - 1 - position[0],
    position[1] - region.y,
    region.y + region.height - 1 - position[1]
  );

  if (placedAnchors.length === 0) {
    return borderDistance + Math.hypot(position[0] - centerX, position[1] - centerY) * 0.1;
  }

  const nearestDistance = Math.min(
    ...placedAnchors.map((anchor) => Math.hypot(position[0] - anchor[0], position[1] - anchor[1]))
  );
  const averageDistance =
    placedAnchors.reduce((sum, anchor) => sum + Math.hypot(position[0] - anchor[0], position[1] - anchor[1]), 0) /
    placedAnchors.length;

  return nearestDistance * 10 + averageDistance + borderDistance * 0.4;
}

function dedupePositions(positions: Array<[number, number]>) {
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  for (const position of positions) {
    const id = key(position[0], position[1]);
    if (!seen.has(id)) {
      result.push(position);
      seen.add(id);
    }
  }
  return result;
}

function rotateOffset([x, y]: [number, number], rotation: number): [number, number] {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) {
    return [y, -x];
  }
  if (quarterTurns === 2) {
    return [-x, -y];
  }
  if (quarterTurns === 3) {
    return [-y, x];
  }
  return [x, y];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function key(x: number, y: number) {
  return `${x},${y}`;
}
