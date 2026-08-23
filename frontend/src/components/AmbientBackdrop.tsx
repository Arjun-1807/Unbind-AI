/**
 * The page's spatial field: a perspective lattice, two slow aurora masses in
 * the brand lavender, and a static grain plate.
 *
 * Deliberately zero JavaScript — it is four empty divs and some CSS. The
 * layer is `position: fixed` so scrolling never repaints it, and the aurora
 * keyframes translate a pre-blurred texture rather than recomputing the blur,
 * which is what keeps a full-viewport glow off the main thread.
 *
 * Landing-page only. The rest of the app keeps the plain canvas plus the
 * lighter `.page-glow` from the root layout.
 */
export default function AmbientBackdrop() {
  return (
    <div className="atmos" aria-hidden="true">
      <div className="atmos__grid" />
      <div className="atmos__aurora atmos__aurora--a" />
      <div className="atmos__aurora atmos__aurora--b" />
      <div className="atmos__grain" />
    </div>
  );
}
