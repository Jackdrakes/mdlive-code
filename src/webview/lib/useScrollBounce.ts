import { useEffect, RefObject } from "react";

// Rubber-band coefficient used by UIScrollView/NSScrollView: f(x) = (1 - 1 / (x * c / d + 1)) * d.
const RUBBER_BAND_COEFFICIENT = 0.55;
// Angular frequency of the critically damped spring-back (about a 0.4s response).
const SPRING_OMEGA = (2 * Math.PI) / 0.4;
// Wheel silence that marks the end of a gesture and starts the spring-back.
const RELEASE_DELAY_MS = 90;
// Fraction of the viewport height the band approaches asymptotically; keeps hard flings from stretching too far.
const BAND_FRACTION = 0.25;
// Rate (1/s) at which the drawn offset follows the band target, so notched wheel steps glide instead of stepping.
const FOLLOW_RATE = 28;
const LINE_HEIGHT_PX = 16;
const REST_THRESHOLD_PX = 0.25;
const REST_VELOCITY = 10;
// Consecutive shrinking wheel deltas that identify the trackpad's inertial (coasting) phase.
const MOMENTUM_EVENTS = 4;
const MOMENTUM_GAP_MS = 100;
// Caps the bounce speed handed to the spring when momentum hits the edge (px/s).
const MAX_BOUNCE_VELOCITY = 1800;
// Smallest visible scrollbar thumb while squished: a round knob as wide as the 8px scrollbar.
const MIN_THUMB_PX = 8;
// Thumb pixels removed per pixel of overscroll; above 1 exaggerates the AppKit squish.
const THUMB_SQUISH_FACTOR = 2.5;
// scrollHeight/clientHeight are rounded integers while scrollTop is fractional, so the reachable
// limit can sit a pixel or more short of scrollHeight - clientHeight (notably in VS Code webviews).
const EDGE_TOLERANCE_PX = 3;

function rubberBand(pull: number, dimension: number): number {
  const sign = Math.sign(pull);
  const x = Math.abs(pull);
  return sign * (1 - 1 / ((x * RUBBER_BAND_COEFFICIENT) / dimension + 1)) * dimension;
}

function inverseRubberBand(offset: number, dimension: number): number {
  const sign = Math.sign(offset);
  const f = Math.min(Math.abs(offset), dimension - 1);
  return sign * (dimension / RUBBER_BAND_COEFFICIENT) * (f / (dimension - f));
}

export function useScrollBounce(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    // Raw accumulated overscroll; positive pulls down at the top, negative pulls up at the bottom.
    let pull = 0;
    let offset = 0;
    let target = 0;
    let raf: number | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFrame = 0;
    let springStart = 0;
    let springFrom = 0;
    let springVelocity = 0;
    let lastDelta = 0;
    let lastEventTime = 0;
    let decayCount = 0;
    // True while the trackpad's inertial tail is still arriving after a release; those events are swallowed.
    let coasting = false;
    // Holds the scroll extent while the content is shifted up, see holdScrollExtent().
    let extentAnchor: HTMLDivElement | null = null;
    const originalPosition = viewport.style.position;

    const dimension = () => Math.max(viewport.clientHeight * BAND_FRACTION, 1);

    viewport.setAttribute("data-mdlive-bounce", "");

    const setThumbSquish = (top: number, bottom: number) => {
      viewport.style.setProperty("--mdlive-thumb-squish-top", `${top}px`);
      viewport.style.setProperty("--mdlive-thumb-squish-bottom", `${bottom}px`);
    };

    // Like AppKit, the scroller knob shrinks with the overscroll distance while staying pinned to the
    // edge being pulled, never below a round knob of MIN_THUMB_PX.
    const renderThumb = () => {
      if (offset === 0) {
        setThumbSquish(0, 0);
        return;
      }
      const { clientHeight, scrollHeight } = viewport;
      const thumb = (clientHeight * clientHeight) / Math.max(scrollHeight, 1);
      const squish = Math.min(Math.abs(offset) * THUMB_SQUISH_FACTOR, Math.max(thumb - MIN_THUMB_PX, 0));
      if (offset > 0) setThumbSquish(0, squish);
      else setThumbSquish(squish, 0);
    };

    // Translated content counts toward scrollable overflow, so shifting it up at the bottom would
    // shrink scrollHeight and the browser would clamp scrollTop by the same amount, cancelling the
    // bounce on screen. An invisible 1px anchor at the untransformed end keeps the extent fixed.
    const holdScrollExtent = (hold: boolean) => {
      if (!hold) {
        extentAnchor?.remove();
        extentAnchor = null;
        return;
      }
      if (extentAnchor) return;
      const naturalHeight = viewport.scrollHeight;
      if (getComputedStyle(viewport).position === "static") viewport.style.position = "relative";
      extentAnchor = document.createElement("div");
      extentAnchor.setAttribute("aria-hidden", "true");
      extentAnchor.style.cssText = `position:absolute;left:0;top:${naturalHeight - 1}px;width:1px;height:1px;visibility:hidden;pointer-events:none;`;
      viewport.appendChild(extentAnchor);
    };

    const render = () => {
      holdScrollExtent(offset < 0);
      content.style.transform = offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
      renderThumb();
    };

    const cancelFrame = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };

    const clearReleaseTimer = () => {
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = null;
    };

    const springing = () => springStart !== 0;

    // Critically damped spring: x(t) = (x0 + (v0 + w * x0) * t) * e^(-wt).
    const springTick = (now: number) => {
      const t = Math.max((now - springStart) / 1000, 0);
      const a = springFrom;
      const b = springVelocity + SPRING_OMEGA * springFrom;
      const decay = Math.exp(-SPRING_OMEGA * t);
      offset = (a + b * t) * decay;
      const velocity = (b - SPRING_OMEGA * (a + b * t)) * decay;
      if (Math.abs(offset) < REST_THRESHOLD_PX && Math.abs(velocity) < REST_VELOCITY) {
        offset = 0;
        pull = 0;
        target = 0;
        springStart = 0;
        raf = null;
        render();
        return;
      }
      render();
      raf = requestAnimationFrame(springTick);
    };

    const release = (velocity = 0) => {
      clearReleaseTimer();
      if (offset === 0 && velocity === 0) {
        pull = 0;
        target = 0;
        return;
      }
      cancelFrame();
      springFrom = offset;
      springVelocity = Math.max(-MAX_BOUNCE_VELOCITY, Math.min(MAX_BOUNCE_VELOCITY, velocity));
      springStart = performance.now();
      raf = requestAnimationFrame(springTick);
    };

    const scheduleRelease = () => {
      clearReleaseTimer();
      releaseTimer = setTimeout(() => release(), RELEASE_DELAY_MS);
    };

    // Exponential follow toward the band target: offset += (target - offset) * (1 - e^(-rate * dt)).
    const followTick = (now: number) => {
      // rAF timestamps can precede the performance.now() taken when the pull started; never step backwards.
      const dt = Math.min(Math.max((now - lastFrame) / 1000, 1 / 120), 0.05);
      lastFrame = now;
      offset += (target - offset) * (1 - Math.exp(-FOLLOW_RATE * dt));
      if (Math.abs(target - offset) < REST_THRESHOLD_PX) {
        offset = target;
        raf = null;
        render();
        return;
      }
      render();
      raf = requestAnimationFrame(followTick);
    };

    const setPull = (next: number) => {
      pull = next;
      target = rubberBand(pull, dimension());
      if (raf === null) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(followTick);
      }
    };

    // Inertial events hit the band: bounce now, carrying their speed through the band's slope f'(x) = c / (x * c / d + 1)^2.
    const releaseFromMomentum = (pullVelocity: number) => {
      const slope = RUBBER_BAND_COEFFICIENT / Math.pow((Math.abs(pull) * RUBBER_BAND_COEFFICIENT) / dimension() + 1, 2);
      coasting = true;
      release(pullVelocity * slope);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const delta = e.deltaMode === 1 ? e.deltaY * LINE_HEIGHT_PX : e.deltaY;
      if (delta === 0) return;

      const now = performance.now();
      const gap = now - lastEventTime;
      const sameDirection = Math.sign(delta) === Math.sign(lastDelta);
      const notGrowing = sameDirection && Math.abs(delta) <= Math.abs(lastDelta) && gap < MOMENTUM_GAP_MS;
      // Only strictly shrinking deltas count toward coasting, so a steady finger drag is not mistaken for it.
      if (notGrowing && Math.abs(delta) < Math.abs(lastDelta)) decayCount += 1;
      else if (!notGrowing) decayCount = 0;
      // Real inertial tails jitter, so only a pause or a direction change ends the swallowed tail.
      if (!sameDirection || gap >= MOMENTUM_GAP_MS) coasting = false;
      const pullVelocity = (-delta / Math.min(Math.max(gap, 8), 50)) * 1000;
      lastDelta = delta;
      lastEventTime = now;

      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const maxScroll = Math.max(scrollHeight - clientHeight, 0);
      const overscrollingTop = scrollTop <= EDGE_TOLERANCE_PX && delta < 0;
      const overscrollingBottom = scrollTop >= maxScroll - EDGE_TOLERANCE_PX && delta > 0;
      const stretched = pull !== 0 || offset !== 0;

      if (coasting && (stretched || overscrollingTop || overscrollingBottom)) {
        e.preventDefault();
        return;
      }

      if (stretched) {
        // Every wheel delta goes into the band, so reversing direction unwinds it smoothly.
        e.preventDefault();
        if (springing()) {
          cancelFrame();
          springStart = 0;
          pull = inverseRubberBand(offset, dimension());
        }

        const pullingFurther = Math.sign(-delta) === Math.sign(pull || offset);
        const next = pull - delta;
        // Unwinding past zero hands the remainder back to native scrolling on the next event.
        setPull(Math.sign(next) === Math.sign(pull) ? next : 0);
        if (pullingFurther && decayCount >= MOMENTUM_EVENTS) releaseFromMomentum(pullVelocity);
        else scheduleRelease();
        return;
      }

      if (!overscrollingTop && !overscrollingBottom) return;

      e.preventDefault();
      content.style.transition = "none";
      // Land exactly on the edge first; the browser clamps scrollTop to the true limit.
      viewport.scrollTop = overscrollingTop ? 0 : scrollHeight;
      setPull(-delta);
      if (decayCount >= MOMENTUM_EVENTS) releaseFromMomentum(pullVelocity);
      else scheduleRelease();
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      cancelFrame();
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      content.style.transform = "";
      holdScrollExtent(false);
      viewport.style.position = originalPosition;
      viewport.removeAttribute("data-mdlive-bounce");
      viewport.style.removeProperty("--mdlive-thumb-squish-top");
      viewport.style.removeProperty("--mdlive-thumb-squish-bottom");
    };
  }, [viewportRef, contentRef]);
}
