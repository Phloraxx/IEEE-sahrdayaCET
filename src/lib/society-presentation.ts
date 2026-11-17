export type SocietyPalette = {
  accent: string;
  soft: string;
  dark: string;
  /**
   * The accent, lightened for the `#07121f` sections (the people band and the
   * member cards). The base accent is tuned for light backgrounds and drops to
   * 3.75:1 there, below the 4.5:1 AA floor for the 10px labels that use it.
   */
  onDark: string;
};

const DEFAULT: SocietyPalette = { accent: "#00629B", soft: "#eaf5fb", dark: "#07324a", onDark: "#7cc4e8" };

const PALETTES: Record<string, SocietyPalette> = {
  cas: { accent: "#146c35", soft: "#edf8f0", dark: "#103c22", onDark: "#6ee7a0" },
  css: { accent: "#0284c7", soft: "#edf8fe", dark: "#073852", onDark: "#7dd3fc" },
  cs: { accent: "#2563eb", soft: "#edf3ff", dark: "#102d72", onDark: "#93c5fd" },
  edsoc: { accent: "#4f46e5", soft: "#f0efff", dark: "#292271", onDark: "#a5b4fc" },
  embs: { accent: "#c026d3", soft: "#fbf0fd", dark: "#5b1764", onDark: "#f0abfc" },
  ies: { accent: "#ea580c", soft: "#fff2e9", dark: "#6d2b09", onDark: "#fdba74" },
  ias: { accent: "#65a30d", soft: "#f4f9e9", dark: "#36570c", onDark: "#bef264" },
  npss: { accent: "#e11d48", soft: "#fff0f3", dark: "#6d1028", onDark: "#fda4af" },
  pes: { accent: "#146c35", soft: "#edf8f0", dark: "#103c22", onDark: "#6ee7a0" },
  ras: { accent: "#dc2626", soft: "#fff0f0", dark: "#641515", onDark: "#fca5a5" },
  sight: { accent: "#ea580c", soft: "#fff2e9", dark: "#6d2b09", onDark: "#fdba74" },
  sps: { accent: "#0d9488", soft: "#ebfaf8", dark: "#0a4c47", onDark: "#5eead4" },
  wie: { accent: "#9333ea", soft: "#f7efff", dark: "#48206b", onDark: "#d8b4fe" },
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
