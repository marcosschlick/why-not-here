import { useLayoutEffect, useState, type RefObject } from "react";

export function useMapViewport(
  root: RefObject<HTMLDivElement | null>,
  width: number,
  height: number,
) {
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    width: Math.min(width, 1024),
    height: Math.min(height, 768),
  });
  useLayoutEffect(() => {
    const element = root.current;
    const wrapper = element?.closest<HTMLElement>(".canvas-wrapper");
    if (!element || !wrapper) return;
    let frame = 0;
    function update() {
      if (!element || !wrapper) return;
      const bounds = element.getBoundingClientRect();
      const container = wrapper.getBoundingClientRect();
      const x = Math.max(0, Math.min(width - 1, container.left - bounds.left));
      const y = Math.max(0, Math.min(height - 1, container.top - bounds.top));
      const next = {
        x,
        y,
        width: Math.max(1, Math.min(width - x, wrapper.clientWidth)),
        height: Math.max(1, Math.min(height - y, wrapper.clientHeight)),
      };
      setViewport((previous) =>
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next,
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    update();
    wrapper.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(wrapper);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      wrapper.removeEventListener("scroll", schedule);
    };
  }, [root, width, height]);
  return viewport;
}
