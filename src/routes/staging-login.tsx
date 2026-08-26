import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { getPbClient } from "@/lib/pb-client";
import { STAGING_STATIC_AUTH_KEY } from "@/lib/staging-auth";

export const meta = () => [
  { title: "Staging Access | IEEE Sahrdaya" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader() {
  if (process.env.DEPLOY_ENV !== "staging") throw new Response("Not found", { status: 404 });
  return null;
}

export default function StagingLogin() {
  const [message, setMessage] = useState("Preparing your staging workspace…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/staging-login");
    if (!code) {
      setFailed(true);
      setMessage("This staging access link is missing or has already been used.");
      return;
    }

    const pb = getPbClient();
    void pb.send("/api/staging/test-login", { method: "POST", body: { code } })
      .then((data) => {
        window.localStorage.setItem(STAGING_STATIC_AUTH_KEY, "1");
        pb.authStore.save(String(data.token || ""), data.record || null);
        window.location.replace("/admin");
      })
      .catch(() => {
        setFailed(true);
        setMessage("This staging access link is invalid or expired. Request a fresh one.");
      });
  }, []);

  return <main className="grid min-h-dvh place-items-center bg-[#0b0d10] px-6 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><ShieldCheck className="h-5 w-5" /></div>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">IEEE Sahrdaya · Staging</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Temporary admin access</h1>
      <div className="mt-6 flex items-center gap-3 text-sm text-white/65">
        {!failed && <Loader2 className="h-4 w-4 animate-spin" />}
        <p>{message}</p>
      </div>
      <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-5 text-white/35">Testing only. This route and its one-time access code are disabled outside staging.</p>
    </section>
  </main>;
}
