/** Injected at build time by vite.config.ts (Vite `define`). */
declare const __BUILD_INFO__: {
	version: string;
	/** Short commit SHA (7 characters), or the CI value as given. */
	sha: string;
	/** Full 40-character commit when CI passed GIT_COMMIT; empty for a local build. */
	revision: string;
	/** Git commit tree CI built from (GIT_TREE); empty for a local build. */
	tree: string;
	builtAt: string;
	display: string;
};
