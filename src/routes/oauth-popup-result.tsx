import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export function meta() {
  return [
    { title: "Sign-in · IEEE Sahrdaya" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function OAuthPopupResult() {
  const [result, setResult] = useState<"success" | "failure" | "unknown">("unknown");

  useEffect(() => {
    const hash = window.location.hash;
    const next = hash.includes("oauth2-redirect-success")
      ? "success"
      : hash.includes("oauth2-redirect-failure")
        ? "failure"
        : "unknown";
    setResult(next);

    if (next === "success") {
      const timer = window.setTimeout(() => window.close(), 120);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const success = result === "success";
  const failure = result === "failure";

  return (
    <main
      data-oauth-popup-result
      className="grid min-h-dvh place-items-center bg-[#f4f2ed] px-6 text-[#111315]"
    >
      <section className="w-full max-w-md border-y border-black/15 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
          {success ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          ) : failure ? (
            <CircleAlert className="h-6 w-6 text-rose-600" />
          ) : (
            <X className="h-6 w-6 text-black/45" />
          )}
        </div>
        <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">
          Google sign-in
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
          {success
            ? "Sign-in complete."
            : failure
              ? "Sign-in did not complete."
              : "OAuth callback page."}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/50">
          {success
            ? "This window should close automatically. You can close it and return to IEEE Sahrdaya if it stays open."
            : failure
              ? "Close this window and try Google sign-in again from IEEE Sahrdaya."
              : "This page is used only to finish authentication. No PocketBase administration interface is exposed here."}
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-11 items-center border-y border-[#00629B] px-1 py-3 text-sm font-bold text-[#00629B]"
        >
          Return to IEEE Sahrdaya
        </Link>
      </section>
    </main>
  );
}
