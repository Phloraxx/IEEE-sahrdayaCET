import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { BadgeCheck, GraduationCap, Loader2, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { getCommunityProfile, saveCommunityProfile } from "@/lib/data/workspace.client";

export const meta = () => [
  { title: "Community Profile | IEEE Sahrdaya" },
  { name: "robots", content: "noindex, nofollow" },
];

interface ProfileForm {
  accountType: string;
  srNumber: string;
  department: string;
  semester: string;
  graduationYear: string;
  ieeeMemberId: string;
  ieeeMember: boolean;
}
const EMPTY: ProfileForm = { accountType: "student", srNumber: "", department: "", semester: "", graduationYear: "", ieeeMemberId: "", ieeeMember: false };

export default function CommunityProfilePage() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [saved, setSaved] = useState(false);
  const profile = useQuery({ queryKey: ["community-profile", user?.id], queryFn: getCommunityProfile, enabled: status === "authenticated" && Boolean(user?.id) });
  useEffect(() => {
    const current = profile.data?.profile;
    if (!current) return;
    setForm({
      accountType: String(current.accountType || "student"),
      srNumber: String(current.srNumber || ""),
      department: String(current.department || ""),
      semester: String(current.semester || ""),
      graduationYear: String(current.graduationYear || ""),
      ieeeMemberId: String(current.ieeeMemberId || ""),
      ieeeMember: Boolean(current.ieeeMember),
    });
  }, [profile.data]);
  const mutation = useMutation({
    mutationFn: () => saveCommunityProfile({ ...form } as Record<string, unknown>),
    onSuccess: () => { setSaved(true); queryClient.invalidateQueries({ queryKey: ["community-profile"] }); window.setTimeout(() => setSaved(false), 2500); },
  });

  if (status === "loading") return null;
  if (!user) return <Navigate to="/" replace />;
  const verified = Boolean(profile.data?.profile?.institutionalVerified);

  return <div className="min-h-screen bg-[#f4f2ed] text-[#111315]">
    <Navbar />
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 border-b border-black/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-black/45">IEEE Sahrdaya community</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Your profile</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">One reusable college identity for event registration and community participation. Verification is separate from self-reported information.</p></div>
        <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${verified ? "border-emerald-700/20 bg-emerald-700/8 text-emerald-800" : "border-black/10 bg-white/60 text-black/50"}`}>{verified ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{verified ? "Institution verified" : "Self-reported"}</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="border-black/10 bg-white/75 shadow-none"><CardContent className="p-6 sm:p-8">
          <div className="grid gap-5">
            <div className="grid gap-1.5"><Label>Community type</Label><Select value={form.accountType} onValueChange={(accountType) => setForm({ ...form, accountType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">Student</SelectItem><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="alumni">Alumni</SelectItem><SelectItem value="external">External participant</SelectItem></SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="profile-sr">SR number</Label><Input id="profile-sr" value={form.srNumber} onChange={(e) => setForm({ ...form, srNumber: e.target.value })} placeholder="College SR number" /></div><div className="grid gap-1.5"><Label htmlFor="profile-dept">Department</Label><Input id="profile-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. CSE" /></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="profile-sem">Semester</Label><Input id="profile-sem" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="e.g. S7" /></div><div className="grid gap-1.5"><Label htmlFor="profile-grad">Passout year</Label><Input id="profile-grad" value={form.graduationYear} onChange={(e) => setForm({ ...form, graduationYear: e.target.value })} inputMode="numeric" placeholder="2027" /></div></div>
            <div className="rounded-xl border border-black/10 bg-black/[0.025] p-4"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.ieeeMember} onChange={(e) => setForm({ ...form, ieeeMember: e.target.checked })} className="h-4 w-4" />I am an IEEE member</label>{form.ieeeMember && <div className="mt-4 grid gap-1.5"><Label htmlFor="profile-ieee">IEEE membership ID</Label><Input id="profile-ieee" value={form.ieeeMemberId} onChange={(e) => setForm({ ...form, ieeeMemberId: e.target.value })} /></div>}</div>
            {mutation.isError && <p className="rounded-lg border border-red-700/20 bg-red-700/5 px-3 py-2 text-sm text-red-700">{mutation.error instanceof Error ? mutation.error.message : "Could not save profile"}</p>}
            <div className="flex items-center justify-end gap-3 border-t border-black/10 pt-5"><span className="text-xs text-black/45">{saved ? "Saved" : "Only you and authorized organizers can access these details."}</span><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save profile</Button></div>
          </div>
        </CardContent></Card>

        <aside className="space-y-4"><div className="rounded-2xl bg-[#111315] p-6 text-white"><GraduationCap className="h-5 w-5 text-white/55" /><h2 className="mt-5 text-lg font-semibold">Why keep this?</h2><p className="mt-2 text-sm leading-6 text-white/55">Events can reuse verified college identity instead of repeatedly asking for the same SR number, department and year.</p></div><div className="rounded-2xl border border-black/10 bg-white/60 p-5 text-xs leading-5 text-black/50"><strong className="block text-black/75">Verification is protected.</strong>Your profile form cannot set the institutional verification flag, verifier or verification timestamp. Those require an authorized verification workflow.</div></aside>
      </div>
    </main>
    <Footer />
  </div>;
}
