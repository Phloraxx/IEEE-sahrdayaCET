import { useState, useRef } from "react";
import { ImageUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  label: string;
  accept?: string;
  currentUrl?: string | null;
  onChange: (file: File | null) => void;
  className?: string;
  previewClassName?: string;
}

/**
 * Reusable image upload with preview and remove button.
 * Shows a dashed dropzone when empty, or a preview card with an X to clear.
 */
export function ImageUpload({
  label,
  accept = "image/*",
  currentUrl,
  onChange,
  className,
  previewClassName,
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onChange(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {preview ? (
        <div className="relative inline-block">
          <img
            src={preview}
            alt={label}
            className={cn(
              "h-32 w-auto rounded-lg border border-border object-cover",
              previewClassName,
            )}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background transition-colors"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
          <ImageUp className="h-6 w-6 text-muted-foreground/60 mb-1" />
          <span className="text-xs text-muted-foreground">
            Click to upload
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
