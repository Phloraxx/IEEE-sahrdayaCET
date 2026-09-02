export type SocietyPalette = {
  accent: string;
  soft: string;
  dark: string;
};

const DEFAULT: SocietyPalette = { accent: "#00629B", soft: "#eaf5fb", dark: "#07324a" };

const PALETTES: Record<string, SocietyPalette> = {
  cas: { accent: "#15803d", soft: "#edf8f0", dark: "#103c22" },
  css: { accent: "#0284c7", soft: "#edf8fe", dark: "#073852" },
  cs: { accent: "#2563eb", soft: "#edf3ff", dark: "#102d72" },
  edsoc: { accent: "#4f46e5", soft: "#f0efff", dark: "#292271" },
  embs: { accent: "#c026d3", soft: "#fbf0fd", dark: "#5b1764" },
  ies: { accent: "#ea580c", soft: "#fff2e9", dark: "#6d2b09" },
  ias: { accent: "#65a30d", soft: "#f4f9e9", dark: "#36570c" },
  npss: { accent: "#e11d48", soft: "#fff0f3", dark: "#6d1028" },
  pes: { accent: "#15803d", soft: "#edf8f0", dark: "#103c22" },
  ras: { accent: "#dc2626", soft: "#fff0f0", dark: "#641515" },
  sight: { accent: "#ea580c", soft: "#fff2e9", dark: "#6d2b09" },
  sps: { accent: "#0d9488", soft: "#ebfaf8", dark: "#0a4c47" },
  wie: { accent: "#9333ea", soft: "#f7efff", dark: "#48206b" },
};

export function getSocietyPalette(slug: string): SocietyPalette {
  return PALETTES[slug.trim().toLowerCase()] ?? DEFAULT;
}

export function societyCode(slug: string): string {
  return slug.trim().toUpperCase();
}

export function personInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "IE";
}
