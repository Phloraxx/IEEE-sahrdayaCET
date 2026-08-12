import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  MapPin,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { getTicket, type PublicTicketData } from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import { formatDateShort } from "@/lib/dates";
import { isPastEvent } from "@/lib/event-lifecycle";
import { logError } from "@/lib/logger";
import { downloadQR as downloadQRFile, generateQRDataUrl } from "@/lib/qr-utils";
import { getTicketStatusInfo } from "@/lib/ticketStatus";

interface PageProps {
  ticketId: string;
}

export default function TicketPage({ ticketId }: PageProps) {
  const [ticketData, setTicketData] = useState<PublicTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getTicket(ticketId)
      .then(async (data) => {
        if (!data.found || !data.ticket) throw new Error("Ticket not found");
        if (!active) return;
        setTicketData(data);
        const qr = await generateQRDataUrl(`${window.location.origin}/ticket/${data.ticket.id || ticketId}`);
        if (active) setQrDataUrl(qr);
      })
      .catch((err: unknown) => {
        logError("ticket-page", err);
        if (active) setError(err instanceof Error ? err.message : "Failed to load ticket");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId]);

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const name = ticketData?.registration?.name || "guest";
    downloadQRFile(qrDataUrl, `ticket-${name.replace(/\s+/g, "-").toLowerCase()}.png`);
  };

  const handleReceipt = async () => {
    if (!ticketData?.registration?.id) return;
    try { await downloadRegistrationReceipt(ticketData.registration.id); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Receipt could not be downloaded"); }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center"><Loader2 className="h-11 w-11 animate-spin text-ieee-blue" /></div>;
  }

  if (error || !ticketData?.found || !ticketData.ticket) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
        <div className="max-w-md rounded-[2rem] border border-rose-200 bg-white p-9 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-5 text-2xl font-black text-slate-950">{error || "Ticket not found"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">This ticket doesn&apos;t exist or is no longer available.</p>
          <Link to="/events" className="mt-6 inline-flex rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white">Browse events</Link>
        </div>
      </div>
    );
  }

  const { ticket, event, registration } = ticketData;
  const isPast = event ? isPastEvent({ status: "published", date: event.date, endDate: event.endDate }) : false;
  const status = registration
    ? getTicketStatusInfo(registration.registrationStatus || registration.paymentStatus, isPast)
    : getTicketStatusInfo(ticket.registrationStatus || ticket.paymentStatus, isPast);
  const iconMap: Record<string, React.ElementType> = { CheckCircle2, Clock, AlertCircle };
  const StatusIcon = iconMap[status.iconName] || AlertCircle;
  const isPaid = ticket.paymentStatus === "paid" || registration?.paymentStatus === "paid";

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-24 sm:px-6">
        <Link to="/events" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to events</Link>

        <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[2.25rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/60">
          <div className="relative min-h-64 bg-slate-950 sm:min-h-80">
            {event?.bannerUrl ? (
              <img src={event.bannerUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,#0ea5e9_0,transparent_42%),linear-gradient(135deg,#00629B,#0f172a_72%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5 sm:p-7">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-md ${status.color}`}><StatusIcon className="h-4 w-4" />{status.text}</div>
              <div className="flex gap-2">
                {isPaid && <span className="rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur-md">PAID</span>}
                {isPast && <span className="rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur-md">PAST EVENT</span>}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-200">IEEE Sahrdaya event pass</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-black leading-tight text-white sm:text-4xl">{event?.title || "Event ticket"}</h1>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1fr_330px]">
            <div className="p-6 sm:p-9 lg:border-r lg:border-slate-100">
              <div className="grid gap-4 sm:grid-cols-2">
                {event?.date && <div className="rounded-2xl bg-slate-50 p-4"><Calendar className="h-5 w-5 text-ieee-blue" /><p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Date</p><p className="mt-1 font-bold">{formatDateShort(event.date)}</p></div>}
                {event?.venue && <div className="rounded-2xl bg-slate-50 p-4"><MapPin className="h-5 w-5 text-ieee-blue" /><p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Venue</p><p className="mt-1 font-bold">{event.venue}</p></div>}
              </div>

              {registration && (
                <section className="mt-7">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Attendee</p>
                  <h2 className="mt-2 text-2xl font-black">{registration.name || "Attendee"}</h2>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div><span className="block text-xs text-slate-400">Email</span><span className="font-semibold text-slate-800">{registration.email || "—"}</span></div>
                    <div><span className="block text-xs text-slate-400">Phone</span><span className="font-semibold text-slate-800">{registration.phone || "—"}</span></div>
                  </div>
                </section>
              )}

              <div className="mt-7 border-t border-dashed border-slate-200 pt-6">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Ticket ID</p>
                <p className="mt-2 break-all font-mono text-sm font-bold text-slate-800">{ticket.id}</p>
                {registration && <p className="mt-3 text-xs text-slate-400">Registered {formatDateShort(registration.registrationDate)}</p>}
              </div>

              {isPaid && registration && (
                <button type="button" onClick={() => void handleReceipt()} className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-800 hover:bg-slate-50"><ReceiptText className="h-4 w-4" />Download payment receipt</button>
              )}
            </div>

            <aside className="flex flex-col items-center justify-center bg-slate-50 p-7 sm:p-9">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                {qrDataUrl ? <img src={qrDataUrl} alt="Event ticket QR code" className="h-52 w-52 sm:h-56 sm:w-56" /> : <div className="flex h-52 w-52 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>}
              </div>
              <p className="mt-4 text-center text-sm font-bold text-slate-800">Show this QR at check-in</p>
              <p className="mt-1 text-center text-xs leading-5 text-slate-500">Keep this ticket available on your phone when you arrive.</p>
              <button type="button" onClick={handleDownloadQR} disabled={!qrDataUrl} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-ieee-blue disabled:opacity-40"><Download className="h-4 w-4" />Save QR</button>
            </aside>
          </div>
        </motion.article>
      </main>
      <Footer />
    </div>
  );
}
