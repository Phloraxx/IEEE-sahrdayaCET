import { PolicyPage } from "@/components/legal/PolicyPage";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO } from "@/lib/business-info";

const title = "Refund & Cancellation Policy";
const path = "/refund-and-cancellation-policy";
const description = "Cancellation and refund terms for IEEE Sahrdaya event registrations.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  "This policy applies to event-registration fees paid through ieeesahrdaya.com. Event-specific terms displayed on an event page take precedence where they expressly differ from this general policy.",
];

const sections = [
  {
    heading: "Participant cancellation",
    paragraphs: [
      "Unless an event page states a different cancellation rule, a paid registration may be cancelled by contacting us within 2 calendar days of payment and before the event has started, whichever occurs first.",
      "Requests received after the applicable cancellation window, after the event begins, or for non-attendance/no-show are normally non-refundable because the registration reserves access or capacity for that event.",
    ],
  },
  {
    heading: "Event cancelled or materially changed by the organiser",
    paragraphs: [
      "If IEEE Sahrdaya Student Branch cancels a paid event and does not provide a suitable replacement or rescheduled option, the paid registration fee is eligible for a full refund.",
      "If an event is rescheduled or materially changed, registered attendees will be informed through the event's available contact channels where practicable. Refund eligibility for that change will be stated with the update.",
    ],
  },
  {
    heading: "Duplicate or payment-related issues",
    paragraphs: [
      "Duplicate successful charges, payments that are confirmed by the payment provider but cannot be matched to a valid registration, and other payment discrepancies will be reviewed against the payment and registration records. Where a refund is due, it will be returned to the original payment method where supported.",
    ],
  },
  {
    heading: "Refund timeline",
    paragraphs: [
      "Approved refunds are initiated within 7 working days. After initiation, the bank, card network, UPI app or payment provider may require additional processing time before the credit appears in the payer's account.",
      `To request a cancellation or refund review, contact ${BUSINESS_INFO.email} with the event name, registration email or ticket ID, and payment reference. Never share an OTP, UPI PIN, card PIN or banking password.`,
    ],
  },
];
export default function RefundAndCancellationPolicyPage() {
  return (
    <PolicyPage
      title={title}
      path={path}
      intro={intro}
      sections={sections}
    />
  );
}
