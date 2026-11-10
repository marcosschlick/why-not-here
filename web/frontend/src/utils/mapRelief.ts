import type { MapRelief } from "../types";

type Rgb = [number, number, number];

export function createReliefShader(
  elevation: number[][],
  cellSize: number,
  settings: MapRelief,
) {
  const height = elevation.length;
  const width = elevation[0]?.length ?? 0;
  const azimuth = (settings.azimuth * Math.PI) / 180;
  const altitude = (settings.altitude * Math.PI) / 180;
  const lightX = Math.sin(azimuth) * Math.cos(altitude);
  const lightY = Math.cos(azimuth) * Math.cos(altitude);
  const lightZ = Math.sin(altitude);
  const gradientScale = settings.vertical_exaggeration / cellSize;

  return (color: Rgb, row: number, col: number): Rgb => {
    const left = Math.max(0, col - 1);
    const right = Math.min(width - 1, col + 1);
    const top = Math.max(0, row - 1);
    const bottom = Math.min(height - 1, row + 1);
    const gradientX =
      right > left
        ? (((elevation[row]?.[right] ?? 0) - (elevation[row]?.[left] ?? 0)) /
            (right - left)) *
          gradientScale
        : 0;
    const gradientY =
      bottom > top
        ? (((elevation[bottom]?.[col] ?? 0) - (elevation[top]?.[col] ?? 0)) /
            (bottom - top)) *
          gradientScale
        : 0;
    const illumination = Math.min(
      1,
      Math.max(
        0,
        (-gradientX * lightX + gradientY * lightY + lightZ) /
          Math.hypot(gradientX, gradientY, 1),
      ),
    );
    const intensity = Math.min(
      1,
      Math.max(0, 0.5 + settings.strength * (illumination - lightZ)),
    );
    return color.map((channel) => {
      const value = channel / 255;
      return (
        255 * (2 * intensity * value + (1 - 2 * intensity) * value * value)
      );
    }) as Rgb;
  };
}
