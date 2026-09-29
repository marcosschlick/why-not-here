export type GridPoint = [number, number];

export function connectPoints(
  p1: GridPoint,
  p2: GridPoint,
  connectivity: number,
): GridPoint[] {
  let [r, c] = p1;
  const [rEnd, cEnd] = p2;
  const pts: GridPoint[] = [];
  let safety = 0;

  while ((r !== rEnd || c !== cEnd) && safety < 10000) {
    safety++;
    pts.push([r, c]);
    const dr = rEnd > r ? 1 : rEnd < r ? -1 : 0;
    const dc = cEnd > c ? 1 : cEnd < c ? -1 : 0;
    if (connectivity === 4 && dr !== 0 && dc !== 0) {
      r += dr;
    } else {
      r += dr;
      c += dc;
    }
  }
  pts.push([rEnd, cEnd]);
  return pts;
}

export function constrainDirection(
  origin: GridPoint,
  target: GridPoint,
  connectivity: number,
  maxH: number,
  maxW: number,
): GridPoint {
  const [r0, c0] = origin;
  const [r, c] = target;
  const dr = r - r0;
  const dc = c - c0;

  if (dr === 0 && dc === 0) {
    return [r0, c0];
  }

  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  if (connectivity === 4) {
    if (absDc >= absDr) {
      return [r0, Math.max(0, Math.min(maxW - 1, c))];
    }
    return [Math.max(0, Math.min(maxH - 1, r)), c0];
  }

  const TAN_22_5 = 0.41421356;

  if (absDr < absDc * TAN_22_5) {
    return [r0, Math.max(0, Math.min(maxW - 1, c))];
  }

  if (absDc < absDr * TAN_22_5) {
    return [Math.max(0, Math.min(maxH - 1, r)), c0];
  }

  const signR = dr > 0 ? 1 : -1;
  const signC = dc > 0 ? 1 : -1;

  let k = Math.round((absDr + absDc) / 2);
  const maxKR = signR > 0 ? maxH - 1 - r0 : r0;
  const maxKC = signC > 0 ? maxW - 1 - c0 : c0;
  k = Math.max(1, Math.min(k, maxKR, maxKC));

  return [r0 + k * signR, c0 + k * signC];
}
