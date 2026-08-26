import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@/types";
import { USER_ROLES, type UserRole } from "@/lib/constants";
import { getPbClient } from "@/lib/pb-client";
import { logError } from "./logger";
import { STAGING_STATIC_AUTH_KEY } from "@/lib/staging-auth";

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: () => void;
  signOut: () => void;
}

const noop = () => undefined;

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: "loading",
  signIn: noop,
  signOut: noop,
});

function mapUser(record: RecordModel | null): AuthUser | null {
  if (!record?.id) return null;
  const rawRole = typeof record.role === "string" ? record.role : "user";
  const role: UserRole = (USER_ROLES as readonly string[]).includes(rawRole)
    ? (rawRole as UserRole)
    : "user";
  const name =
    (typeof record.name === "string" && record.name.trim()) ||
    (typeof record.display_name === "string" && record.display_name.trim()) ||
    undefined;
  return {
    id: record.id,
    email: typeof record.email === "string" ? record.email : undefined,
    name,
    role,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    const pb = getPbClient();
    const sync = () => {
      const next = mapUser(pb.authStore.record);
      setUser((previous) => {
        if (previous?.id !== next?.id || previous?.role !== next?.role) {
          void queryClient.invalidateQueries({ queryKey: ["workspace-me"] });
        }
        return next;
      });
      setStatus(next && pb.authStore.isValid ? "authenticated" : "unauthenticated");
    };

    const unsubscribe = pb.authStore.onChange(sync, true);

    if (pb.authStore.isValid) {
      const stagingStatic = window.location.hostname === "staging.ieeesahrdaya.com" &&
        window.localStorage.getItem(STAGING_STATIC_AUTH_KEY) === "1";
      if (stagingStatic) sync();
      else void pb.collection("users").authRefresh().catch((error) => {
        logError("auth-refresh", error);
        pb.authStore.clear();
      });
    } else {
      window.localStorage.removeItem(STAGING_STATIC_AUTH_KEY);
      sync();
    }

    return unsubscribe;
  }, [queryClient]);

  const signIn = useCallback(() => {
    // Keep the initial call synchronous with the click event so Safari does not block the OAuth popup.
    const pb = getPbClient();
    void pb.collection("users").authWithOAuth2({ provider: "google" }).catch((error) => {
      logError("auth-signin", error);
    });
  }, []);

  const signOut = useCallback(() => {
    const pb = getPbClient();
    window.localStorage.removeItem(STAGING_STATIC_AUTH_KEY);
    pb.authStore.clear();
    setUser(null);
    setStatus("unauthenticated");
    window.location.assign("/");
  }, []);

  return <AuthContext.Provider value={{ user, status, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
