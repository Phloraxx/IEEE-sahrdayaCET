import { redirect } from "react-router";
export function loader() { throw redirect("/infinia", 301); }
export default function LegacyFlagshipsPage() { return null; }
