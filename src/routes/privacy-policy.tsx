import { PolicyPage } from "@/components/legal/PolicyPage";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO } from "@/lib/business-info";

const title = "Privacy Policy";
const path = "/privacy-policy";
const description = "How IEEE Sahrdaya Student Branch collects, uses, protects and retains data for its website and events.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  `${BUSINESS_INFO.name} uses personal information only as needed to operate this website, manage events and registrations, provide attendee support, maintain event records and comply with applicable obligations.`,
];

const sections = [
  {
    heading: "Information we collect",
    paragraphs: [
      "Depending on the event or website feature, we may collect your name, email address, phone number, college or academic details, IEEE membership information when requested, registration responses, ticket identifiers, attendance/check-in records and certificate records.",
      "For paid registrations, we may store payment references, amount and payment status received from the payment provider. We do not request or store your card PIN, UPI PIN, OTP or online-banking password.",
    ],
  },
  {
    heading: "How we use information",
    items: [
      "To create and manage event registrations, tickets, attendance records and certificates where applicable.",
      "To verify payment status, reconcile payment-related issues and process approved refunds.",
      "To communicate event information, answer support requests and maintain operational records.",
      "To protect the website, prevent fraud or abuse, enforce event rules and investigate technical problems.",
      "To comply with applicable legal, accounting, audit or regulatory requirements.",
    ],
  },
  {
    heading: "Sharing and service providers",
    paragraphs: [
      "Registration data may be available to authorised IEEE Sahrdaya organisers and college/IEEE personnel involved in delivering the relevant event, subject to their operational role.",
      "We may use service providers for hosting, payment processing, transactional communications and other technical functions. These providers receive only the information needed to perform the relevant service and may process it under their own privacy terms.",
      "We may disclose information when required by law, court order or a lawful request from an authorised government or law-enforcement agency.",
    ],
  },
  {
    heading: "Retention and security",
    paragraphs: [
      "We retain personal information only for as long as reasonably necessary for event operations, support, payment/accounting records, certificate verification, dispute handling and applicable legal obligations. Some historical event and certificate records may be retained longer where a durable verification record is required.",
      "We use reasonable technical and organisational measures to restrict access and protect stored data. No internet service can guarantee absolute security, and users should protect their own account credentials and devices.",
    ],
  },
  {
    heading: "Your choices and requests",
    paragraphs: [
      `You may contact ${BUSINESS_INFO.email} to ask about personal information associated with your registration, request correction of inaccurate information, or raise a privacy concern. We may need to verify your identity before acting on a request.`,
      "A deletion request may be limited where information must be retained for payment records, fraud prevention, certificate verification, dispute resolution or legal obligations.",
    ],
  },
  {
    heading: "Updates to this policy",
    paragraphs: [
      "We may update this policy when our event, payment or website practices change. The current version published on this page applies to use of the website after that update.",
    ],
  },
  {
    heading: "Privacy contact",
    paragraphs: [
      `Email: ${BUSINESS_INFO.email}`,
      `Address: ${BUSINESS_INFO.address}`,
    ],
  },
];

export default function PrivacyPolicyPage() {
  return <PolicyPage title={title} path={path} intro={intro} sections={sections} />;
}
