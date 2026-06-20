import { Suspense } from "react";
import { UsersContent } from "./UsersContent";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          User directory and role management.
        </p>
      </div>
      <UsersContent />
    </div>
  );
}
