/**
 * Client auth context.
 *
 * Phase 4 removes the last PocketBase dependency from the browser. The old
 * implementation held a PocketBase JWT in `pb.authStore` (localStorage) and
 * validated it with `authRefresh()`. That is gone: the session is an HttpOnly
 * cookie the client cannot read, so this context simply asks the server who the
 * user is.
 *
 * The public surface is unchanged — `user`, `status`, `signIn`, `signOut`,
 * `signInError` — so the 20+ routes that call `useAuth()` keep working.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@/types";
import { USER_ROLES, type UserRole } from "@/lib/constants";
import { logError } from "./logger";

interface AuthContextValue {
	user: AuthUser | null;
	status: "loading" | "authenticated" | "unauthenticated";
	signIn: () => Promise<void>;
	signInError: string | null;
	signOut: () => void;
}

const noop = () => undefined;

const AuthContext = createContext<AuthContextValue>({
	user: null,
	status: "loading",
	signIn: async () => undefined,
	signInError: null,
	signOut: noop,
});

/** The shape `/api/session` returns. */
interface SessionPayload {
	user: {
		id: string;
		email?: string;
		name?: string;
		role?: string;
		avatar?: string;
	} | null;
	capabilities?: string[];
}

function mapUser(payload: SessionPayload["user"]): AuthUser | null {
	if (!payload?.id) return null;
	const rawRole = typeof payload.role === "string" ? payload.role : "user";
	const role: UserRole = (USER_ROLES as readonly string[]).includes(rawRole)
		? (rawRole as UserRole)
		: "user";
	return {
		id: payload.id,
		email: payload.email,
		name: payload.name,
		role,
	};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const queryClient = useQueryClient();
	const [signInError, setSignInError] = useState<string | null>(null);
	const [user, setUser] = useState<AuthUser | null>(null);
	const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

	useEffect(() => {
		let active = true;

		async function load() {
			try {
				const response = await fetch("/api/session", {
					headers: { Accept: "application/json" },
					credentials: "same-origin",
				});
				if (!response.ok) throw new Error(`session ${response.status}`);
				const payload = (await response.json()) as SessionPayload;
				if (!active) return;
				const next = mapUser(payload.user);
				setUser(next);
				setStatus(next ? "authenticated" : "unauthenticated");
			} catch (error) {
				if (!active) return;
				logError("auth-session", error);
				setUser(null);
				setStatus("unauthenticated");
			}
		}

		void load();
		return () => {
			active = false;
		};
	}, []);

	// A role change or a sign-out in another tab should be reflected here.
	useEffect(() => {
		if (user?.id) void queryClient.invalidateQueries({ queryKey: ["workspace-me"] });
	}, [user?.id, user?.role, queryClient]);

	const signIn = useCallback(async () => {
		setSignInError(null);
		// Full navigation: the server owns the OAuth code exchange and the cookie.
		window.location.assign("/auth/google");
	}, []);

	const signOut = useCallback(() => {
		// POST so a cross-site <img> cannot sign the user out.
		const form = document.createElement("form");
		form.method = "POST";
		form.action = "/auth/logout";
		document.body.appendChild(form);
		form.submit();
	}, []);

	return (
		<AuthContext.Provider value={{ user, status, signIn, signInError, signOut }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	return useContext(AuthContext);
}
