import { PolicyPage } from "@/components/legal/PolicyPage";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO, EVENT_SERVICE_DESCRIPTION } from "@/lib/business-info";

const title = "About Us";
const path = "/about";
const description = "About IEEE Sahrdaya Student Branch, its activities, services and campus presence.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  `${BUSINESS_INFO.name} is the IEEE student branch at Sahrdaya College of Engineering & Technology, Kodakara, Thrissur, Kerala. The branch brings students, faculty and IEEE communities together through technical learning, professional development and student-led activities.`,
  "This website is the branch's public platform for event information, registrations, payment-enabled event enrolment where applicable, attendee tickets, certificates and related branch updates.",
];
const sections = [
  {
    heading: "What we do",
    paragraphs: [EVENT_SERVICE_DESCRIPTION],
    items: [
      "Publish event schedules, descriptions, venues, registration status and event-specific pricing.",
      "Accept registrations for free and paid events when online registration is enabled.",
      "Provide attendee-facing ticket, payment-status and certificate-verification experiences where applicable.",
      "Share branch, society, affinity-group and executive-committee information with the IEEE Sahrdaya community.",
    ],
  },
  {
    heading: "Our campus",
    paragraphs: [
      `The branch operates from ${BUSINESS_INFO.address}.`,
      "IEEE Sahrdaya Student Branch is a student-branch activity platform. This website is not a general retail marketplace and does not currently sell or ship physical merchandise.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      `For event registration, payment or website queries, contact ${BUSINESS_INFO.email} or ${BUSINESS_INFO.phoneDisplay} (${BUSINESS_INFO.contactPerson}, ${BUSINESS_INFO.contactRole}).`,
    ],
  },
];
export default function AboutPage() {
  return (
    <PolicyPage
      title={title}
      path={path}
      intro={intro}
      sections={sections}
    />
  );
}
