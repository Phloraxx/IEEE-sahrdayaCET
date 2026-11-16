/**
 * `POST /auth/logout` — revoke the session and clear the cookie.
 *
 * POST only: a GET logout can be triggered by an `<img>` tag on any site, which
 * would let a third party sign users out at will.
 */

import type { ActionFunctionArgs } from "react-router";
import { endSession } from "@/server/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}

	const cookie = await endSession(request);

	return new Response(null, {
		status: 302,
		headers: {
			Location: "/",
			"Set-Cookie": cookie,
			"Cache-Control": "no-store",
		},
	});
}

/** A GET should not sign anyone out. */
export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
