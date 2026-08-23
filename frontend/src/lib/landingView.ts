/**
 * The landing route swaps between two views inside a single page component:
 * the default client view, and the lawyer sign-up view.
 *
 * The header renders a section nav (How it works / Features / Pricing / FAQ)
 * whose anchors only exist in the client view. It is a sibling of the landing
 * page rather than a child, so it cannot read that state directly — and
 * without it the nav keeps four links that silently scroll nowhere once the
 * reader switches to the lawyer view.
 *
 * A window event is the smallest honest coupling here: no context provider
 * threaded through the tree for one boolean, and no reaching into the DOM to
 * guess. The landing page announces its view; anything that cares listens.
 */
export const LANDING_VIEW_EVENT = "unbind:landing-view";

export type LandingView = "clients" | "lawyers";
