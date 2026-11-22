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
  gallery: FlagshipImage[];
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
const infinia2025Gallery: FlagshipImage[] = [
  { src: "/media/flagships/infinia-2025-uixor.webp", alt: "Students discussing their work in a computer lab during the UIXOR workshop", caption: "UIXOR · Learning UI and UX through Figma, 2025", width: 1200, height: 800 },
  { src: "/media/flagships/infinia-2025-expo.webp", alt: "Students gathered around a laptop and demonstration table at an Infinia 2.0 expo", caption: "Exploring an expo demonstration · Infinia 2.0, 28 September 2025", width: 1200, height: 800 },
];
const infinia2024Image: FlagshipImage = {
  src: "/media/flagships/infinia-2024-community.webp",
  alt: "Students gathered on stage beneath the Infinia sign at the 2024 event",
  caption: "The people behind the ideas · TechX Infinia, 29 September 2024",
  width: 1600, height: 1067,
};
const infinia2024Gallery: FlagshipImage[] = [
  { src: "/media/flagships/infinia-2024-robotics.webp", alt: "Students examining equipment and a demonstration at the TechX Infinia robotics expo", caption: "Inside the robotics expo · TechX Infinia, 2024", width: 1200, height: 800 },
];
const altair2023Image: FlagshipImage = {
  src: "/media/flagships/altair-2023-audience.webp",
  alt: "An audience facing the stage and an Altair 2.0 display in the indoor stadium",
  caption: "A room for new perspectives · Altair 2.0, 2023",
  width: 1600, height: 1200,
};
const altair2023Gallery: FlagshipImage[] = [
  { src: "/media/flagships/altair-2023-teamwork.webp", alt: "Students taking part in a group activity with balloons on the Altair 2.0 stage", caption: "Learning together through a group activity · Altair 2.0, 1 October 2023", width: 675, height: 1200 },
  { src: "/media/flagships/altair-2023-conversations.webp", alt: "Two speakers holding microphones on stage at Altair 2.0", caption: "Conversations on stage · Altair 2.0, 2 October 2023", width: 675, height: 1200 },
];
const altair2022Image: FlagshipImage = {
  src: "/media/flagships/altair-2022-community.webp",
  alt: "Students gathered outside a campus building with letters spelling Altair in November 2022",
  caption: "A campus chapter, shared · Altair, 13 November 2022",
  width: 1600, height: 1201,
};
const altair2022Gallery: FlagshipImage[] = [
  { src: "/media/flagships/altair-2022-inauguration.webp", alt: "Guests standing on stage during Altair’s inauguration in November 2022", caption: "The opening ceremony · Altair, 2022", width: 1560, height: 1040 },
  { src: "/media/flagships/altair-2022-leadership.webp", alt: "Archived Altair 2022 poster for Sujay Kochunarayanan’s leadership management session", caption: "From the programme archive · Leadership management, 2022", width: 675, height: 504 },
];

export const FLAGSHIPS: Flagship[] = [
  {
    slug: "infinia",
    name: "Infinia",
    tagline: "Where imagination meets technology.",
    introduction: "A campus-wide meeting of ideas, hands-on technology and the people building what comes next.",
    overview: "Infinia brings several technical disciplines into one shared experience. In 2024, nine workshop tracks met a hackathon, expos and STEM outreach. In 2025, six focused workshops connected software, hardware, design and healthcare. Across both editions, the story moves between making things, asking questions and meeting the people behind the technology.",
    theme: "Technology • Making • Community",
    cover: infinia2025Image,
    gallery: [...infinia2025Gallery, infinia2024Image, ...infinia2024Gallery],
    editions: [
      {
        recordType: "recap", image: infinia2025Image, gallery: infinia2025Gallery,
        year: "2025", title: "Infinia 2.0", date: "26–28 September 2025",
        summary: "Infinia 2.0 ran for three days at Sahrdaya, with six technical workshops, a panel discussion, an AI in healthcare talk, live expos and cultural programmes.",
        tracks: ["AEGIS · Agentic AI", "UIXOR · UI & UX", "HOVERX · Drones", "QBIT · FPGA", "IONIX · Electric vehicles", "AXIOM · Diagnostics"],
        highlights: [
          { title: "26 September · Opening and panel discussion", text: "The opening ceremony was followed by a panel with speakers from UST, Philips R&D, Kannur University and IEEE. They discussed career choices, emerging technology and the skills students need when moving from academia to industry." },
          { title: "27 September · Six workshops", text: "Students worked on agentic AI, app design in Figma and FPGA circuits in Verilog. Other tracks covered drones, electric vehicles and biomedical diagnostics, with live demonstrations by SpinX, Hyundai and Agappe Diagnostics. A wearable technology fashion show followed in the evening." },
          { title: "28 September · Healthcare, expos and culturals", text: "The AI in healthcare talk covered imaging, monitoring and clinical decision-making, including questions about data quality. Robotics and drone expos, a drone pilot experience and cultural programmes completed the final day." },
        ],
      },
      {
        recordType: "recap", image: infinia2024Image, gallery: infinia2024Gallery,
        year: "2024", title: "TechX Infinia", date: "27–29 September 2024",
        summary: "The first Infinia edition brought nine workshop tracks, a team hackathon, four expos and STEM outreach to Sahrdaya over three days in September 2024.",
        tracks: ["opimaML · Machine learning", "RPA-Forge · Automation", "Cloudify · Cloud computing", "Robolve · Robotics", "WebTrix · Web3", "Flut-Drive · Flutter", "Cre-8-AI · Generative AI", "CybArmor · Cybersecurity", "AeroX · Drones"],
        highlights: [
          { title: "27 September · Opening sessions and musical night", text: "Following the inauguration, Sarika Nair of IBM India spoke on personal branding. Babusanker S’s “Igniting the Leader in You” icebreaker brought delegates into shared activities and conversation. A musical night with Sreerag’s Collective Band closed the opening day." },
          { title: "28 September · Workshops and Lantern Fest", text: "The workshop day ranged from machine learning, generative AI and cloud computing to automation, robotics and drones. Web3, Flutter and cybersecurity completed the nine-track programme. Hands-on sessions with practitioners were followed by networking, RJ Paulsy’s “Essentials of Life” talk and a Lantern Fest." },
          { title: "29 September · Hackathon, expos and STEM outreach", text: "Vishal Nair of the Wadhwani Foundation discussed product design from MVP to MLP. Teams tackled a hackathon and an IEEE Puzzlers treasure hunt. Drone, RC-car, robotics and origami expos ran alongside Bridge-the-Gap STEM outreach for pre-university students." },
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
    overview: "Altair places the person and the engineer in the same story. The 2022 conclave combined blockchain, drug design and circuit-making with leadership and professional confidence. The Altair 2.0 brochure broadened that horizon to immersive technology, robotics and EV modelling. Each edition makes room for practical skills, collaboration and the choices that come after campus.",
    theme: "Engineering • Leadership • Connection",
    cover: altair2022Image,
    gallery: [altair2023Image, ...altair2023Gallery, ...altair2022Gallery],
    editions: [
      {
        recordType: "programme", image: altair2023Image, gallery: altair2023Gallery,
        year: "2023", title: "Altair 2.0", date: "2023 programme",
        summary: "Altair 2.0’s published programme paired AR and VR, ROS 2 with Docker, and MATLAB-based EV modelling with the skills to manage, lead and begin an entrepreneurial journey.",
        tracks: ["Managerial skills", "AR & VR", "ROS 2 & Docker", "MATLAB & electric vehicles"],
        highlights: [
          { title: "1 October · Four workshop directions.", text: "The brochure scheduled four workshops for Sunday, 1 October: managerial skills with Babusanker S; AR and VR with Aromal P S and Muhammed Salah K T; ROS 2 through Docker with Govind S Warrier; and electric vehicle modelling using MATLAB with Abhinav Rajeev. Together, they offered routes into management, immersive experiences, automation and mobility." },
          { title: "From an idea to an entrepreneurial path.", text: "An entrepreneurship session with Dr. Thomas George K was announced alongside the workshops. The programme also included a session on membership development and scope in IEEE with Antony Paul, connecting technical interests to the opportunities of a wider professional community." },
          { title: "Confidence belongs in the programme, too.", text: "Leadership with Muhammad Ikan and a technology-and-future session with Kaztro extended the brochure’s focus beyond technical tools. Its schedule also made room for cybersecurity, icebreaking, cultural events and Mentalism 2.0." },
          { title: "Moments from the 2023 photo archive.", text: "The edition’s photographs show the audience, a group activity and conversations on stage. These moments sit beside the announced programme as a visual record of Altair 2.0; the workshop and session descriptions above follow the published brochure." },
        ],
      },
      {
        recordType: "recap", image: altair2022Image, gallery: altair2022Gallery,
        year: "2022", title: "Altair", date: "11–13 November 2022",
        summary: "Altair’s three-day conclave moved from leadership challenges to blockchain, drug design and circuit-making, then asked what confidence and an IEEE journey could look like beyond campus.",
        tracks: ["Managerial skills", "Blockchain & cryptocurrency", "Molecular docking & drug design", "PCB design & soldering"],
        highlights: [
          { title: "11 November · Open a conversation about the future.", text: "The inauguration at Sahrdaya’s Multipurpose Indoor Stadium was followed by Karthik Surya’s “Technology and Future” session. Sujay Kochunarayanan led a leadership session built around challenges and tasks, giving delegates an early opportunity to work together." },
          { title: "12 November · Four ways to learn by doing.", text: "Babusanker S used group activities in the managerial workshop. Alphin Paul Antony’s Cryptalk introduced blockchain transactions and cryptocurrency fundamentals. Dr. Abi T G explored molecular docking and drug design, while Antu Dominic connected PCB design with fabrication, assembly and soldering practice." },
          { title: "Put confidence into practice.", text: "Mohammed Ikan’s session brought professionalism, interview preparation and impromptu presentations into the day. Nipin Niravath’s mentalism show and the cultural evenings offered a shared experience outside the workshops." },
          { title: "13 November · Carry the story beyond campus.", text: "Fr. Jose Kannampuzha’s “Fly into Future” session connected self-motivation, technology and personal development. An interaction with Sarath S explored IEEE Young Professionals and continued membership, while Aswathy Sreekanth’s women’s empowerment session brought another perspective to the closing day." },
        ],
      },
    ],
  },
];

export function getFlagship(slug: string | undefined): Flagship | undefined {
  return FLAGSHIPS.find((flagship) => flagship.slug === slug);
}

export const FLAGSHIP_TIMELINE = FLAGSHIPS.flatMap(flagship =>
  flagship.editions.map(edition => ({ flagship, edition, href: flagship.slug === "infinia" ? `/infinia/${edition.year}` : `/flagships/${flagship.slug}/${edition.year}` }))
).sort((a, b) => Number(b.edition.year) - Number(a.edition.year));
