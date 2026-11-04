import { useLayoutEffect, useState } from "react";

export function useMapCanvasFit(
  container: HTMLElement | null,
  mapHeight: number | undefined,
  mapWidth: number | undefined,
): number {
  const [cellSize, setCellSize] = useState<number>(1);

  useLayoutEffect(() => {
    if (!container || !mapHeight || !mapWidth) return;
    const observedContainer = container;
    const activeMapHeight = mapHeight;
    const activeMapWidth = mapWidth;

    function updateCellSize() {
      const styles = window.getComputedStyle(observedContainer);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const availableWidth =
        observedContainer.clientWidth - horizontalPadding - 2;
      const availableHeight =
        observedContainer.clientHeight - verticalPadding - 2;
      if (availableWidth <= 0 || availableHeight <= 0) return;

      const nextCellSize = Math.min(
        availableWidth / activeMapWidth,
        availableHeight / activeMapHeight,
      );
      setCellSize(nextCellSize);
    }

    updateCellSize();
    const observer = new ResizeObserver(updateCellSize);
    observer.observe(observedContainer);
    return () => observer.disconnect();
  }, [container, mapHeight, mapWidth]);

  return cellSize;
}
