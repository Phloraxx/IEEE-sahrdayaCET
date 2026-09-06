export const BRANCH_SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/ieee_sahrdaya_sb/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/ieee-sahrdaya-sb/" },
  { label: "YouTube", href: "https://www.youtube.com/@ieeesahrdaya" },
] as const;

export const ORGANIZATION_SAME_AS = [
  "https://www.ieee.org",
  "https://ieeekerala.org",
  ...BRANCH_SOCIAL_LINKS.map((social) => social.href),
];
