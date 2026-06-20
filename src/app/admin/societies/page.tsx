import { SocietiesContent } from "./SocietiesContent";
import { Link } from "@tanstack/react-router";

export default function SocietiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Societies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage IEEE societies and their chairs.
          </p>
        </div>
        <Link
          to="/admin/societies/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-4 py-2 text-sm font-medium transition-all"
        >
          Create Society
        </Link>
      </div>
      <SocietiesContent />
    </div>
  );
}
