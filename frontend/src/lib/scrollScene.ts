/**
 * One scroll driver for the whole page.
 *
 * Every scroll-linked effect on the landing page registers here instead of
 * attaching its own listener. That is not tidiness for its own sake — it is
 * the difference between a smooth page and a stuttering one.
 *
 * A component that reads its own `getBoundingClientRect()` and then writes a
 * style in the same callback is fine on its own. Ten of them interleave
 * read → write → read → write, and every write invalidates layout so the next
 * read has to force a synchronous recalculation. That is layout thrashing, and
 * it scales with the number of animated blocks.
 *
 * This driver batches strictly: one rAF per frame, all rectangles measured
 * first, all custom properties written afterwards. Adding the eleventh
 * animated block then costs one more rect read, not one more layout flush.
 *
 * Each subscriber receives its progress through two phases:
 *
 *   enter — 0 as the block's top crosses 90% of the viewport height,
 *           reaching 1 once it has risen to 30%. This is the reading zone.
 *   exit  — 0 while the block is still comfortably on screen, reaching 1 as
 *           it clears the top. Blocks animate out as well as in, which is
 *           what makes a long page read as one continuous move rather than a
 *           list of things that pop in once and then sit there.
 */

export interface SceneProgress {
  /** 0 → 1 as the block rises into the reading zone. */
  enter: number;
  /** 0 → 1 as the block leaves past the top of the viewport. */
  exit: number;
}

type Subscriber = (progress: SceneProgress, el: HTMLElement) => void;

const subscribers = new Map<HTMLElement, Subscriber>();
let frame = 0;
let listening = false;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function measure(el: HTMLElement, viewportHeight: number): SceneProgress {
  const rect = el.getBoundingClientRect();
  const enterFrom = viewportHeight * 0.9;
  const enterTo = viewportHeight * 0.3;
  const exitFrom = viewportHeight * 0.12;
  const exitSpan = exitFrom + rect.height * 0.45;

  return {
    enter: clamp01((enterFrom - rect.top) / (enterFrom - enterTo)),
    exit: exitSpan <= 0 ? 0 : clamp01((exitFrom - rect.top) / exitSpan),
  };
}

function tick() {
  frame = 0;
  const viewportHeight = window.innerHeight;

  // Read phase — every rectangle, before a single style is touched.
  const readings: Array<[HTMLElement, Subscriber, SceneProgress]> = [];
  subscribers.forEach((apply, el) => {
    readings.push([el, apply, measure(el, viewportHeight)]);
  });

  // Write phase — no reads from here on, so nothing forces a reflow.
  for (const [el, apply, progress] of readings) apply(progress, el);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

/**
 * Register an element. Returns an unsubscribe function.
 *
 * Callers are expected to write CSS custom properties in `apply` and let CSS
 * derive the actual visual result, so a frame costs a handful of property
 * writes rather than a React render.
 */
export function observeScene(el: HTMLElement, apply: Subscriber): () => void {
  subscribers.set(el, apply);

  if (!listening) {
    listening = true;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  }
  schedule();

  return () => {
    subscribers.delete(el);
    if (subscribers.size === 0 && listening) {
      listening = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }
  };
}

/** Publishes `enter`/`exit` straight onto the element as custom properties. */
export const writeSceneVars: Subscriber = ({ enter, exit }, el) => {
  el.style.setProperty("--enter", enter.toFixed(4));
  el.style.setProperty("--exit", exit.toFixed(4));
};
