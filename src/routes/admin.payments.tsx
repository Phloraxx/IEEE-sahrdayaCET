import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import PaymentsContent from "@/features/admin/PaymentsContent";

export interface PaymentRow {
  id: string;
  userName: string;
  userEmail: string;
  paymentStatus: string;
  amount: number;
  transactionId: string;
  createdAt: string;
}

export interface PaymentsLoaderData {
  payments: PaymentRow[];
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
}

const EMPTY: PaymentsLoaderData = { payments: [], totalRevenue: 0, paidCount: 0, pendingCount: 0 };

const getPaymentsData = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const regs = await pb.collection("registrations").getFullList({
        filter: "paymentStatus != 'not_required'",
        sort: "-registrationDate",
        fields: "id,userName,userEmail,paymentStatus,amount,registrationDate,paymentTicketId",
      });

      const payments: PaymentRow[] = regs.map((r: Record<string, unknown>) => ({
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
      const pendingCount = payments.filter((p) => p.paymentStatus === "pending").length;

      return { payments, totalRevenue, paidCount, pendingCount } satisfies PaymentsLoaderData;
    },
    EMPTY,
    { context: "admin-payments-list", roles: ["admin", "chair"] },
  ),
);

export const Route = createFileRoute("/admin/payments")({
  loader: () => getPaymentsData(),
  component: AdminPaymentsPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminPaymentsPage() {
  const data = Route.useLoaderData();
  return <PaymentsContent data={data} />;
}
