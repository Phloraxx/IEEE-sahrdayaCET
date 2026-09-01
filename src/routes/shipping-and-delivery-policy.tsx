import { PolicyPage } from "@/components/legal/PolicyPage";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO } from "@/lib/business-info";

const title = "Shipping & Delivery Policy";
const path = "/shipping-and-delivery-policy";
const description = "Shipping and electronic delivery policy for IEEE Sahrdaya event registrations and tickets.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  "IEEE Sahrdaya Student Branch currently provides event-registration and participation services through this website. We do not currently sell or ship physical merchandise through the website.",
];

const sections = [
  {
    heading: "Electronic delivery",
    paragraphs: [
      "For free events, registration confirmation and any available attendee ticket are provided after the registration is successfully confirmed.",
      "For paid events, confirmation and ticket access are provided after the payment is successfully verified against the registration. Payment-provider or network delays can delay this confirmation.",
    ],
  },
  {
    heading: "Event service delivery",
    paragraphs: [
      "The service purchased is participation in the event listed on the website. The event page states the scheduled date, time, venue or online format, and any event-specific instructions available at the time of registration.",
      "If an organiser changes the schedule, venue or delivery format, the updated event information will be reflected on the website and communicated through the contact channels available for that event where practicable.",
    ],
  },
  {
    heading: "Delivery issues",
    paragraphs: [
      `If your payment is successful but your registration or ticket is not available, contact ${BUSINESS_INFO.email} with the event name and payment reference. Do not share card PINs, UPI PINs, OTPs or banking passwords.`,
      "No courier or postal shipping charges apply to event registrations purchased through this website.",
    ],
  },
];

export default function ShippingAndDeliveryPolicyPage() {
  return <PolicyPage title={title} path={path} intro={intro} sections={sections} />;
}
