// Editorial archive. Completed reports take precedence over draft schedules.
// Source provenance and unresolved claims: docs/flagship-stories-20261003.md.
export interface FlagshipImage {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}
export interface FlagshipEdition {
  year: string;
  title: string;
  date: string;
  summary: string;
  recordType: "recap" | "programme";
  image?: FlagshipImage;
  tracks: string[];
  highlights: { title: string; text: string }[];
  recap?: { href: string; label: string };
}
export interface Flagship {
  slug: string;
  name: string;
  tagline: string;
  introduction: string;
  overview: string;
  theme: string;
  cover: FlagshipImage;
  gallery: FlagshipImage[];
  editions: FlagshipEdition[];
}
const infinia2025Image: FlagshipImage = {
  src: "/media/flagships/infinia-2025-community.webp",
  alt: "Students and guests gathered in the indoor stadium at Infinia 2.0 in 2025",
  caption: "A shared campus moment · Infinia 2.0, 2025",
  width: 1600, height: 1067,
};

const altair2022Image: FlagshipImage = {
  src: "/media/flagships/altair-2022-inauguration.webp",
  alt: "Guests standing on stage during Altair’s inauguration in November 2022",
  caption: "The opening chapter · Altair, 2022",
  width: 1560, height: 1040,
};

export const FLAGSHIPS: Flagship[] = [
  {
    slug: "infinia",
    name: "Infinia",
    tagline: "Where imagination meets technology.",
    introduction: "A campus-wide meeting of ideas, hands-on technology and the people building what comes next.",
    overview: "Infinia brings several technical disciplines into one shared experience. Students move from workshop benches to expos, from conversations with practitioners to cultural evenings. Each edition gives that curiosity a new set of tools.",
    theme: "Technology • Making • Community",
    cover: infinia2025Image,
    gallery: [{
      src: "/media/flagships/infinia-2025-uixor.webp",
      alt: "Students discussing their work in a computer lab during the UIXOR workshop",
      caption: "UIXOR · Learning UI and UX through Figma, 2025",
      width: 1200, height: 800,
    }],
    editions: [
      {
        recordType: "recap", image: infinia2025Image,
        year: "2025", title: "Infinia 2.0", date: "26–28 September 2025",
        summary: "The second edition connected software, hardware, design and healthcare through six workshop tracks, live demonstrations and conversations about emerging technology.",
        tracks: ["AEGIS · Agentic AI", "UIXOR · UI & UX", "HOVERX · Drones", "QBIT · FPGA", "IONIX · Electric vehicles", "AXIOM · Diagnostics"],
        highlights: [
          { title: "Choose a direction. Build something.", text: "Workshops explored agentic AI, design in Figma, drones, FPGA development, electric vehicles and diagnostic technology. The programme gave students different ways to turn an interest into practical experience." },
          { title: "Technology outside the classroom.", text: "Robotics and drone expos, a drone pilot experience and an AI in healthcare session brought the workshop themes into view. A panel discussion connected those experiments to wider questions about technology." },
          { title: "A campus, brought together.", text: "The inauguration, cultural programmes and a wearable technology fashion show gave the three days a shared rhythm beyond the individual workshop tracks." },
        ],
      },
      {
        recordType: "recap",
        year: "2024", title: "TechX Infinia", date: "27–29 September 2024",
        summary: "Nine workshop tracks brought together software, automation, hardware and creative technology, alongside a hackathon, expos and outreach.",
        tracks: ["Machine learning", "Robotic process automation", "Cloud computing", "Robotics", "Web3", "Flutter", "Generative AI", "Cybersecurity", "Drones"],
        highlights: [
          { title: "Many disciplines, one programme.", text: "The workshop programme ranged from machine learning and cloud computing to robotics and drones. Students could explore the tools behind both digital products and physical systems." },
          { title: "Ideas put to work.", text: "A hackathon and drone, RC car, robotics and origami expos extended the programme beyond sessions. Talks and networking brought students into conversation with technical practitioners." },
          { title: "Learning that reaches further.", text: "Bridge-the-Gap outreach and cultural programmes sat alongside the technical activities, connecting the event to the wider community around the branch." },
        ],
        recap: { href: "/blog/event-recap-techx-infinia-2024-where-imagination-meets-technology", label: "Read the 2024 event recap" },
      },
    ],
  },
  {
    slug: "altair",
    name: "Altair",
    tagline: "Fly into future.",
    introduction: "Technical curiosity meets the confidence to lead, collaborate and take the next step.",
    overview: "Altair brings engineering and professional development into the same conversation. Its programme makes space for practical workshops, leadership, interaction with IEEE professionals and cultural experiences: a reminder that becoming an engineer involves people as much as technology.",
    theme: "Engineering • Leadership • Connection",
    cover: altair2022Image,
    gallery: [
      { src: "/media/flagships/altair-2022-leadership.webp", alt: "Archived Altair 2022 poster for Sujay Kochunarayanan’s leadership management session", caption: "From the programme archive · Leadership management, 2022", width: 675, height: 504 },
      { src: "/media/flagships/altair-2022-managerial.webp", alt: "Archived Altair poster for the managerial workshop with Babusanker S", caption: "From the programme archive · Managerial workshop, 2022", width: 433, height: 562 },
    ],
    editions: [
      {
        recordType: "programme",
        year: "2023", title: "Altair 2.0", date: "2023 programme",
        summary: "The Altair 2.0 brochure introduced a new mix of management, immersive technology, robotics and electric vehicle modelling, alongside entrepreneurship and leadership sessions.",
        tracks: ["Managerial skills", "AR & VR", "ROS 2 & Docker", "MATLAB & electric vehicles"],
        highlights: [
          { title: "A broader technical horizon.", text: "The published programme offered workshops in managerial skills, AR and VR, robotics using ROS 2 and Docker, and electric vehicle modelling with MATLAB." },
          { title: "The person behind the engineer.", text: "The brochure placed entrepreneurship, IEEE membership, leadership and the future of technology alongside the workshops, with cultural and interactive sessions woven through the programme." },
        ],
      },
      {
        recordType: "recap", image: altair2022Image,
        year: "2022", title: "Altair", date: "11–13 November 2022",
        summary: "A three-day technical conclave at Sahrdaya combined hands-on learning with sessions on leadership, confidence and life beyond campus.",
        tracks: ["Managerial skills", "Blockchain & cryptocurrency", "Molecular docking & drug design", "PCB design & soldering"],
        highlights: [
          { title: "Learn by doing.", text: "Four workshop tracks connected engineering management, blockchain and cryptocurrency, molecular docking and drug design, and PCB design with professional soldering practice." },
          { title: "Find the confidence to lead.", text: "Leadership development and confidence-building sessions complemented the technical programme. A Young Professionals interaction explored the value of continuing an IEEE journey after student membership." },
          { title: "Fly into future.", text: "Talks on technology and the future, a women’s empowerment session, mentalism and cultural programmes brought different voices into the three-day experience." },
        ],
      },
    ],
  },
];

export function getFlagship(slug: string | undefined): Flagship | undefined {
  return FLAGSHIPS.find((flagship) => flagship.slug === slug);
}

export const FLAGSHIP_TIMELINE = FLAGSHIPS.flatMap(flagship =>
  flagship.editions.map(edition => ({ flagship, edition, href: `/flagships/${flagship.slug}/${edition.year}` }))
).sort((a, b) => Number(a.edition.year) - Number(b.edition.year));
