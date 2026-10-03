import { getFlagship, type FlagshipImage } from "@/lib/flagships";

// Historical figures and media mapping: docs/infinia-showcase-20261004.md.
export const INFINIA = getFlagship("infinia")!;
export const INFINIA_STATS = [
  { value: "400+", label: "Participants" },
  { value: "70", label: "Volunteers" },
  { value: "15", label: "Professional speakers" },
  { value: "10+", label: "Industry collaborations" },
];
export const INFINIA_WORKSHOPS = [
  { name: "AEGIS", topic: "Agentic AI", host: "Muhammed Nisham · Soft Served Web", count: 63, poster: "aegis",
    text: "Explore how AI agents plan, reason and work together.",
    detail: "Chained requests, single-agent orchestration and multi-agent teams led into a practical discussion of secure, structured agent design." },
  { name: "UIXOR", topic: "UI & UX design", host: "Lakshmi K P & Toshi Panwalker", count: 61, poster: "uixor",
    text: "Start with people. Turn their needs into a product.",
    detail: "Students mapped shopping-app flows in Figma, built wireframes and used team interviews to design a college companion app." },
  { name: "HOVERX", topic: "Drone technology", host: "Team SpinX", count: 52, poster: "hoverx",
    text: "Understand the machine before taking it into the sky.",
    detail: "UAV fundamentals, quadcopter dynamics and drone components connected to a live flying demonstration led by the SpinX team." },
  { name: "QBIT", topic: "FPGA & digital design", host: "Sreejeesh Sreedharan · NIELIT", count: 40, poster: "qbit",
    text: "Give digital logic a physical form.",
    detail: "Verilog and FPGA architecture became hands-on examples: multiplexers and a magnitude comparator implemented on a Basys 3 board." },
  { name: "IONIX", topic: "Electric vehicles", host: "Sunil Jacob & Sajeesh · Hyundai", count: 53, poster: "ionix",
    text: "Get closer to the engineering behind electric mobility.",
    detail: "EV fundamentals, charging and vehicle architecture were paired with a live Hyundai electric-car demonstration." },
  { name: "AXIOM", topic: "Biomedical diagnostics", host: "Jasmine Francis & Dil Sabu · Agappe Diagnostics", count: 30, poster: "axiom",
    text: "See how laboratory principles become diagnostic tools.",
    detail: "Analytical principles met real instruments and their internal components, connecting biotechnology to the practice of modern diagnostics." },
];

export function infiniaPoster(name: string, caption: string): FlagshipImage {
  const small = name === "healthcare";
  return { src: `/media/infinia/2025-${name}-poster.webp`, alt: `Archived Infinia 2.0 poster: ${caption}`, caption,
    width: small ? 640 : name === "uixor" ? 978 : 1000, height: small ? 800 : name === "uixor" ? 1222 : 1250 };
}
export const INFINIA_POSTERS = [
  infiniaPoster("identity", "Beyond imagination, beyond technology"),
  infiniaPoster("panel", "Future-proof skills · Panel discussion"),
  infiniaPoster("healthcare", "AI in healthcare · Cijo Chacko"),
  infiniaPoster("expo", "Robotics expo"),
  infiniaPoster("wearables", "Wearable technology · Fashion show"),
  infiniaPoster("concert", "GLIVE & Eagle Gaming · Cultural night"),
];
const photo = (name: string, alt: string, caption: string): FlagshipImage => ({
  src: `/media/infinia/2025-${name}-photo.webp`, alt, caption: `${caption  } · 2025`, width: 1200, height: 800,
});
export const INFINIA_PHOTOS = [
  photo("opening", "Guests lighting the ceremonial lamp on the Infinia 2.0 stage", "Opening a shared conversation"),
  photo("panel", "Industry and academic speakers in conversation on the Infinia 2.0 stage", "The future-proof skills panel"),
  photo("aegis", "Students gathered with their workshop group in a computer lab", "AEGIS · Agentic AI"),
  ...INFINIA.editions[0]!.gallery,
  photo("drones", "Drones and electronic components arranged on a demonstration table", "HOVERX · Inside the technology"),
  photo("fpga", "Students listening to an instructor during the FPGA workshop", "QBIT · Digital design in practice"),
  photo("closing", "The Infinia 2.0 community gathered beneath the event sign", "One edition, many shared moments"),
];
export const INFINIA_PANEL = [
  ["Vinil Vijayan", "Project Manager · UST"],
  ["Cijo Chacko", "Clinical Science Specialist · Philips R&D"],
  ["Sreekanth N S", "Associate Professor · Kannur University"],
  ["Anjali Prasad", "Technical Lead & Talent Development Leader"],
  ["Dr. Mini Ulanat", "IEEE Computer Society · Region 10"],
];

export const INFINIA_2024_PHOTOS: FlagshipImage[] = [
  ...INFINIA.editions[1]!.gallery,
  { src: "/media/infinia/2024-rpa-conversation.webp", alt: "Students and a workshop host standing together in a classroom", caption: "RPA-Forge · A shared workshop moment, 2024", width: 1200, height: 800 },
  { src: "/media/infinia/2024-rpa-community.webp", alt: "The RPA-Forge workshop group gathered outside a campus building", caption: "RPA-Forge · The workshop community, 2024", width: 1200, height: 800 },
  { src: "/media/infinia/2024-robotics-workshop.webp", alt: "Students working together with electronic components in a robotics lab", caption: "Robolve · Robotics at the workbench, 2024", width: 1200, height: 800 },
];
