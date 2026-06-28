import { useEffect, useRef, RefObject } from "react";

const MAX_OVERSCROLL = 50;

export function useScrollBounce(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>
) {
  const offset = useRef(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const stop = () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      offset.current = 0;
      content!.style.transform = "";
    };

    const tick = () => {
      offset.current *= 0.82;
      if (Math.abs(offset.current) < 0.5) {
        content!.style.transform = "";
        offset.current = 0;
        raf.current = null;
        return;
      }
      content!.style.transform = `translateY(${offset.current}px)`;
      raf.current = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - 2 && e.deltaY > 0;

      if (!atTop && !atBottom) {
        stop();
        return;
      }

      e.preventDefault();
      content!.style.transition = "none";
      offset.current -= e.deltaY * 0.3;
      offset.current = Math.max(-MAX_OVERSCROLL, Math.min(MAX_OVERSCROLL, offset.current));
      content!.style.transform = `translateY(${offset.current}px)`;

      if (raf.current === null) raf.current = requestAnimationFrame(tick);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      stop();
    };
  }, [viewportRef, contentRef]);
}
