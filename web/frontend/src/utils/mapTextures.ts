import type { MapAppearance, TerrainMotif, TerrainTexture } from "../types";

export function textureVariant(
  texture: TerrainTexture,
  row: number,
  col: number,
) {
  const variants = texture.variants;
  return variants[(row + col * 2) % variants.length];
}

export function drawTextureMotif(
  ctx: CanvasRenderingContext2D,
  texture: TerrainMotif,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  for (const stroke of texture.strokes ?? []) {
    stroke.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(x + px * size, y + py * size);
      else ctx.lineTo(x + px * size, y + py * size);
    });
  }
  ctx.stroke();
  for (const [px, py, radius] of texture.dots ?? []) {
    ctx.beginPath();
    ctx.arc(x + px * size, y + py * size, radius * size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createOverviewPatterns(
  appearance: MapAppearance,
  cellPixels: number,
): Map<string, CanvasPattern> {
  const patterns = new Map<string, CanvasPattern>();
  const overview = appearance.texture_overview;
  if (cellPixels >= appearance.texture_min_cell_pixels) return patterns;
  const cellsPerTile =
    2 ** Math.ceil(Math.log2(overview.target_pixels / cellPixels));
  const tilePixels = cellsPerTile * cellPixels;
  for (const [name, texture] of Object.entries(appearance.terrain_textures)) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 128;
    const ctx = tile.getContext("2d");
    if (!ctx) continue;
    ctx.strokeStyle = ctx.fillStyle = appearance.texture_color;
    ctx.lineWidth = 64 * overview.line_width;
    ctx.lineCap = ctx.lineJoin = "round";
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        drawTextureMotif(
          ctx,
          textureVariant(texture, row, col),
          col * 64,
          row * 64,
          64,
        );
      }
    }
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) continue;
    pattern.setTransform(new DOMMatrix().scale((tilePixels * 2) / 128));
    patterns.set(name, pattern);
  }
  return patterns;
}
