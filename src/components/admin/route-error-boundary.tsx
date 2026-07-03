interface RouteErrorBoundaryProps {
  title?: string;
  error: Error;
  info?: { componentStack?: string };
}

export default function RouteErrorBoundary({
  title,
  error,
  info,
}: RouteErrorBoundaryProps) {
  const message = title ?? error?.message ?? "Something went wrong";
  const details = "An unexpected error occurred while loading this page.";

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">
          Error
        </p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{message}</h1>
        <p className="text-sm text-muted-foreground">{details}</p>
        {import.meta.env.DEV && info?.componentStack && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-4 text-left text-xs text-muted-foreground">
            {info.componentStack}
          </pre>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
