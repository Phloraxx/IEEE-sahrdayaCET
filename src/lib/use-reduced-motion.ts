/**
 * `prefers-reduced-motion` as a boolean, without framer-motion.
 *
 * The star fields on the home and society pages imported
 * `useReducedMotion` from `framer-motion` and used nothing else from the
 * library — which pulled ~40 KB gzipped of animation runtime into those pages
 * for one media query. This is the same hook in fifteen lines.
 *
 * Hydration: the first render always reports `false`, and the real value
 * arrives in the effect. Reading `matchMedia` during render would make the
 * server render (`false`) disagree with the client render (`true`) for
 * reduced-motion visitors, which React reports as a hydration mismatch. The
 * cost is one frame of motion for those visitors, which is what framer-motion's
 * own hook does too.
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return;
		}

		const query = window.matchMedia(QUERY);
		const sync = () => setReduced(query.matches);

		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	return reduced;
}
