import { PolicyPage } from "@/components/legal/PolicyPage";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO, EVENT_SERVICE_DESCRIPTION } from "@/lib/business-info";

const title = "Terms & Conditions";
const path = "/terms-and-conditions";
const description = "Terms governing use of the IEEE Sahrdaya website and event-registration services.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  `${BUSINESS_INFO.name} operates ieeesahrdaya.com as the online platform for its student-branch activities at Sahrdaya College of Engineering & Technology. By using the website or registering for an event, you agree to these terms and the policies linked from the website footer.`,
  EVENT_SERVICE_DESCRIPTION,
];

const sections = [
  {
    heading: "Event information and registration",
    items: [
      "You must provide accurate registration and contact information. Event eligibility requirements, capacity limits and registration deadlines shown on the event page form part of that event's registration terms.",
      "A registration is confirmed only when the website records it as confirmed. For paid events, confirmation may depend on successful payment verification.",
      "Event tickets or registration references are intended for the registered attendee unless the event page expressly permits transfer.",
    ],
  },
  {
    heading: "Pricing and payment",
    items: [
      "Event prices are shown in Indian Rupees (INR) on the website. A listing marked Free has no registration fee.",
      "Where a coupon or approved discount applies, the payable amount is calculated before payment confirmation.",
      "Payments may be processed by third-party payment providers. We do not ask you to disclose an OTP, UPI PIN, card PIN or banking password to IEEE Sahrdaya support.",
    ],
  },
  {
    heading: "Event changes and conduct",
    items: [
      "Organisers may update an event's schedule, venue, speaker, format, capacity or programme when reasonably necessary. Material changes will be reflected on the event page and communicated through available event channels where practicable.",
      "Attendees must follow applicable campus rules, event instructions and reasonable directions from organisers. Access may be refused for unsafe, abusive, fraudulent or disruptive conduct.",
    ],
  },
  {
    heading: "Cancellations, delivery and refunds",
    paragraphs: [
      "Electronic ticket/registration delivery is governed by the Shipping & Delivery Policy. Cancellations and refunds are governed by the Refund & Cancellation Policy and any event-specific terms displayed before registration.",
    ],
  },
  {
    heading: "Website use and third-party services",
    paragraphs: [
      "You may not misuse the website, attempt unauthorised access, interfere with payment or registration records, impersonate another attendee, or use the platform for unlawful purposes.",
      "The website may link to IEEE, the college, payment providers and other third-party services. Those services are governed by their own terms and privacy policies.",
    ],
  },
  {
    heading: "Contact and governing law",
    paragraphs: [
      `Questions about these terms may be sent to ${BUSINESS_INFO.email} or to ${BUSINESS_INFO.address}.`,
      "These terms are governed by the laws applicable in India. Any dispute that cannot be resolved through support will be subject to the competent courts having jurisdiction in Thrissur, Kerala.",
    ],
  },
];

export default function TermsAndConditionsPage() {
  return <PolicyPage title={title} path={path} intro={intro} sections={sections} />;
}
