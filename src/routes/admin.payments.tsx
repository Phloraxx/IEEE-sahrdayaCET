import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import PaymentsContent from "@/app/admin/payments/PaymentsContent";

interface PaymentData {
  payments: {
    id: string;
    userName: string;
    userEmail: string;
    paymentStatus: string;
    amount: number;
    transactionId: string;
    createdAt: string;
  }[];
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
}

const getPaymentsData = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") || "";
  const pb = createPB(cookieHeader);
  try {
    await requireAuth(pb);
    const regs = await pb.collection("registrations").getFullList({
      filter: "paymentStatus != 'not_required'",
      sort: "-registrationDate",
      fields:
        "id,userName,userEmail,paymentStatus,amount,registrationDate,paymentTicketId",
    });

    const payments = regs.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userName: (r.userName as string) || "Unknown",
      userEmail: (r.userEmail as string) || "",
      paymentStatus: (r.paymentStatus as string) || "pending",
      amount: Number(r.amount) || 0,
      transactionId: (r.paymentTicketId as string) || "",
      createdAt: (r.registrationDate as string) || "",
    }));

    const totalRevenue = payments.reduce(
      (s, p) => s + (p.paymentStatus === "paid" ? p.amount : 0),
      0,
    );
    const paidCount = payments.filter((p) => p.paymentStatus === "paid").length;
    const pendingCount = payments.filter(
      (p) => p.paymentStatus === "pending",
    ).length;

    return {
      payments,
      totalRevenue,
      paidCount,
      pendingCount,
    } satisfies PaymentData;
  } catch {
    return {
      payments: [],
      totalRevenue: 0,
      paidCount: 0,
      pendingCount: 0,
    } satisfies PaymentData;
  }
});

export const Route = createFileRoute("/admin/payments")({
  loader: () => getPaymentsData(),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const data = Route.useLoaderData();
  return <PaymentsContent data={data} />;
}
