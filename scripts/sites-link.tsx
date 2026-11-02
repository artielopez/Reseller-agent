import type { AnchorHTMLAttributes } from "react";

// Vinext's current Link adapter throws in the deployed cloud build. Native
// links retain normal history, keyboard, modifier-click and onClick semantics.
// Only the Sites preparation script substitutes this for next/link.
export default function SitesLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
}
