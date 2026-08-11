import { useParams } from "react-router";

import PaymentPage from "@/features/payment/PaymentPage";

export default function RoutePayment() {
  const { registrationId = "" } = useParams();
  return <PaymentPage registrationId={registrationId} />;
}
