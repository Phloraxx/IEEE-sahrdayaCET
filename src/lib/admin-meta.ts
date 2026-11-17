/**
 * Page metadata for the admin shell.
 *
 * Admin routes set no `title`, so every tab and history entry read the bare URL
 * and a screen reader got no page identity after navigation. This mirrors the
 * public convention (`X | IEEE Sahrdaya Student Branch`) but keeps `noindex`
 * on every admin page — these are staff surfaces, not content.
 */
export function adminMeta(title: string) {
	return [
		{ title: `${title} | Admin · IEEE Sahrdaya` },
		{ name: "robots", content: "noindex, nofollow" },
	];
}
