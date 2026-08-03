/// <reference path="../pb_data/types.d.ts" />

const WIE_PUBLIC_EMAIL = "ieee@sahrdaya.ac.in";

const WIE_PUBLIC_EVENTS = [
  {
    title: "WiTech-Ideathon 2026 – Agentic AI Workshop & Ideathon",
    slug: "witech-ideathon-2026-agentic-ai",
    date: "2026-07-11 07:30:00.000Z",
    endDate: "2026-07-11 10:00:00.000Z",
    venue:
      "Computer AI Lab, Sahrdaya College of Engineering and Technology, Thrissur",
    tags: "AI,Ideathon,Women in Engineering",
    description:
      "WiTech-Ideathon 2026, themed “Innovation that Cares”, was organised with IEEE Women in Engineering and IEEE Education Society Kerala Chapter. The programme featured an AI talk and hands-on session by Ajoe Joseph, Google Developer Expert, on “Building Event-Driven AI Agents Using Google Agent Development Kit”, together with an innovation-focused ideathon activity.",
  },
  {
    title: "Beyond Business – Building a Brand with a Unique Identity",
    slug: "beyond-business-building-a-brand-with-a-unique-identity",
    date: "2026-07-04 13:30:00.000Z",
    endDate: "2026-07-04 14:15:00.000Z",
    venue: "Google Meet",
    tags: "Entrepreneurship,Branding,Leadership,WIE Week",
    description:
      "IEEE FISAT SB, IEEE WIE AG FISAT and IEEE WIE AG Sahrdaya conducted a WIE Week online session on purpose-driven branding and entrepreneurship. Bhavana Prakash Menon, Founder of LOUD, discussed authenticity, storytelling, bold ideas, brand identity and the challenges of building an impactful brand. Attendance: 17 IEEE and 22 non-IEEE participants.",
  },
  {
    title: "Gen AI & Prompt Engineering Workshop",
    slug: "gen-ai-prompt-engineering-workshop-2026",
    date: "2026-03-09 07:30:00.000Z",
    endDate: "2026-03-09 10:30:00.000Z",
    venue: "Decennial Block 3205",
    tags: "Generative AI,Prompt Engineering,Technical Workshop",
    description:
      "IEEE WIE Sahrdaya conducted a hands-on workshop on Generative AI and prompt engineering led by Sebin Thomas, former IEEE Chair at CUSAT SB and an Oracle Cloud Certified Gen AI Professional. Topics included machine learning, deep learning, LLMs, tokenisation, Google AI Studio, hallucinations and bias. Attendance: 4 IEEE and 22 non-IEEE participants.",
  },
  {
    title:
      "Pioneering Safe Cyberspace: Bridging Technology and Light for Security",
    slug: "pioneering-safe-cyberspace-bridging-technology-and-light-for-security",
    date: "2025-07-06 13:30:00.000Z",
    endDate: "2025-07-06 14:30:00.000Z",
    venue: "Google Meet",
    tags: "Cybersecurity,Expert Talk,WIE Week",
    description:
      "IEEE WIE Sahrdaya and IEEE WIE Kerala Section conducted an expert session on building a safer cyberspace. Ruben Abraham, Security Consultant at Black Duck, Chair of IEEE FNTC Kerala and Treasurer of IEEE ComSoc Kerala Chapter, introduced cybersecurity fundamentals, career pathways and emerging approaches to digital protection. The interactive session engaged 32 participants, including nine IEEE members and 23 non-IEEE participants.",
  },
  {
    title: "CyberClash: Debate the Digital Dilemma",
    slug: "cyberclash-debate-the-digital-dilemma",
    date: "2025-07-04 09:00:00.000Z",
    endDate: "2025-07-04 10:30:00.000Z",
    venue: "Sahrdaya College of Engineering and Technology",
    tags: "Debate,Digital Awareness,WIE Week",
    description:
      "As part of IEEE WIE Week 2025, IEEE WIE Sahrdaya, in collaboration with IEEE WIE Kerala Section, conducted CyberClash on the question “Is Social Media More Harmful Than Helpful in Today’s Cyberspace?” Twenty participants examined misinformation, mental health, privacy, connectivity and digital empowerment through a respectful debate that strengthened critical thinking and communication.",
  },
  {
    title: "Beyond Resume: Crafting a Unique Identity as Women in STEM",
    slug: "beyond-resume-crafting-a-unique-identity-as-women-in-stem",
    date: "2025-03-21 13:30:00.000Z",
    endDate: "2025-03-21 14:30:00.000Z",
    venue: "Google Meet",
    tags: "Career Development,Professional Identity,Leadership",
    description:
      "IEEE WIE Sahrdaya hosted Beyond Resume, a talk by Vishnupriya G, Secretary of IEEE Computer Society SYP, on building a distinctive professional identity as women in STEM. The session explored community, meaningful connections, collaboration and contribution beyond qualifications. Nineteen IEEE members and nine non-IEEE participants joined the discussion and were encouraged to pursue careers with purpose and leadership.",
  },
  {
    title: "Tink Her Hack 3.0",
    slug: "tink-her-hack-3-0",
    date: "2025-02-01 09:30:00.000Z",
    endDate: "2025-02-02 06:30:00.000Z",
    venue: "Accenture Lab, Sahrdaya College of Engineering and Technology",
    tags: "Hackathon,Women in Tech,Technical Learning,Collaboration",
    description:
      "IEEE Women in Engineering Sahrdaya organised Tink Her Hack 3.0 as an overnight, beginner-friendly hackathon for women. Sixty-four participants worked with mentors to turn ideas into their first technology projects in a safe and collaborative environment. The programme formed part of a wider Kerala initiative conducted across more than 50 venues, helping thousands of women take their first steps into technology through experiential learning, teamwork and innovation.",
  },
  {
    title: "Elevate Her: Breaking Barriers and Building Bridges",
    slug: "elevate-her-breaking-barriers-and-building-bridges",
    date: "2025-01-31 03:30:00.000Z",
    endDate: "2025-01-31 06:30:00.000Z",
    venue: "Jasmine Hall, Sahrdaya College of Engineering and Technology",
    tags: "Leadership,Professional Development,Women in STEM",
    description:
      "IEEE WIE Sahrdaya hosted Elevate Her, an inspiring session on breaking barriers and building bridges, led by Ms. Jyothika Nithin. The programme encouraged students to approach challenges with confidence, leadership and innovation. It brought together 37 IEEE members and 15 non-IEEE participants at Jasmine Hall and concluded with practical insights for personal and professional growth.",
  },
  {
    title: "RiseHER: Inspiring Spotlight",
    slug: "riseher-inspiring-spotlight",
    date: "2024-03-06 03:30:00.000Z",
    endDate: "2024-03-06 07:30:00.000Z",
    venue: "Sahrdaya College of Engineering and Technology",
    tags: "Women’s Day,Leadership,Community",
    description:
      "RiseHER was organised by IEEE WIE Sahrdaya for International Women’s Day to celebrate women’s achievements and create conversations around equality, confidence and wellbeing. The programme included the engaging “Take It Easy Paulsy” spotlight by RJ Paulsy, an icebreaker and talent showcase, and an inspirational session by guest of honour Gayathri Padmanabhan. The event connected stories of empowerment, career growth, health and community in an inclusive campus setting.",
  },
];

const CREATED_BY_THIS_MIGRATION = [
  "pioneering-safe-cyberspace-bridging-technology-and-light-for-security",
  "cyberclash-debate-the-digital-dilemma",
  "beyond-resume-crafting-a-unique-identity-as-women-in-stem",
  "tink-her-hack-3-0",
  "elevate-her-breaking-barriers-and-building-bridges",
  "riseher-inspiring-spotlight",
];

function findBySlug(app, collection, slug) {
  try {
    return app.findFirstRecordByFilter(collection, `slug = "${slug}"`);
  } catch (_) {
    return null;
  }
}

migrate(
  (app) => {
    const society = findBySlug(app, "societies", "wie");
    if (!society) return;

    // The previous production banner was not an approved WIE Sahrdaya asset.
    // The public route uses the reviewed static IEEE WIE identity artwork.
    if (society.getString("banner")) {
      society.set("banner", "");
      app.save(society);
    }

    const collection = app.findCollectionByNameOrId("events");
    for (const item of WIE_PUBLIC_EVENTS) {
      let record = findBySlug(app, "events", item.slug);
      if (!record) record = new Record(collection);

      for (const [field, value] of Object.entries(item))
        record.set(field, value);
      record.set("society", society.id);
      record.set("status", "completed");
      record.set("price", 0);
      record.set("maxCapacity", 0);
      record.set("registeredCount", 0);
      record.set("checkedInCount", 0);
      record.set("registrationOpen", false);
      record.set("checkInEnabled", false);
      record.set("collectIeeeMember", false);
      record.set("contactEmail", WIE_PUBLIC_EMAIL);
      record.set("isDeleted", false);
      app.save(record);
    }
  },
  (app) => {
    for (const slug of CREATED_BY_THIS_MIGRATION) {
      const record = findBySlug(app, "events", slug);
      if (record) app.delete(record);
    }
  },
);
