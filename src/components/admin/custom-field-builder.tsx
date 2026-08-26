import { ChevronDown, ChevronUp, Copy, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "email" | "phone" | "date" | "boolean";
  required: boolean;
  options: string[];
  placeholder?: string;
  defaultValue?: string;
  dependsOn?: { fieldId: string; value: string };
}

const FIELD_TYPES: Array<{ value: FormField["type"]; label: string }> = [
  { value: "text", label: "Short text" }, { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" }, { value: "radio", label: "Choice cards" },
  { value: "checkbox", label: "Checkbox" }, { value: "boolean", label: "Yes / No" },
  { value: "number", label: "Number" }, { value: "email", label: "Email" },
  { value: "phone", label: "Phone" }, { value: "date", label: "Date" },
];
function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
}

function newField(): FormField {
  return { id: newId(), label: "", type: "text", required: false, options: [""] };
}

export function CustomFieldBuilder({ fields, onChange, readOnly = false }: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  readOnly?: boolean;
}) {
  const update = (id: string, patch: Partial<FormField>) =>
    onChange(fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  const remove = (id: string) => onChange(fields.filter((field) => field.id !== id));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const duplicate = (index: number) => {
    const source = fields[index];
    if (!source) return;
    const next = [...fields];
    next.splice(index + 1, 0, { ...source, id: newId(), label: source.label ? `${source.label} (copy)` : "" });
    onChange(next);
  };
  if (fields.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-5 py-10 text-center">
      <p className="text-sm font-semibold">No event-specific questions.</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Name, email, phone, college, department and semester are already handled by the standard attendee form.</p>
      {!readOnly && <Button type="button" variant="outline" size="sm" className="mt-5 gap-2" onClick={() => onChange([newField()])}><Plus className="h-4 w-4" />Add first question</Button>}
    </div>;
  }

  return <div className="space-y-4">
    {fields.map((field, index) => {
      const supportsPlaceholder = ["text", "textarea", "number", "email", "phone"].includes(field.type);
      const hasOptions = field.type === "select" || field.type === "radio";
      const dependencyOptions = fields.filter((candidate) => candidate.id !== field.id);
      return <article key={field.id} className="overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Question {index + 1}</p><p className="mt-0.5 text-xs text-muted-foreground">{FIELD_TYPES.find((item) => item.value === field.type)?.label}</p></div>
          {!readOnly && <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move question up"><ChevronUp className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label="Move question down"><ChevronDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicate(index)} aria-label="Duplicate question"><Copy className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(field.id)} aria-label="Delete question"><Trash2 className="h-4 w-4" /></Button>
          </div>}
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-2"><Label htmlFor={`question-${field.id}`}>Question *</Label><Input id={`question-${field.id}`} value={field.label} disabled={readOnly} onChange={(event) => update(field.id, { label: event.target.value })} placeholder="e.g. Dietary preference" /></div>
            <div className="grid gap-2"><Label>Answer type</Label><Select value={field.type} disabled={readOnly} onValueChange={(value: FormField["type"]) => update(field.id, { type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <span><span className="block text-sm font-medium">Required answer</span><span className="mt-0.5 block text-xs text-muted-foreground">Participants cannot continue without answering this question.</span></span>
            <input type="checkbox" checked={field.required} disabled={readOnly} onChange={(event) => update(field.id, { required: event.target.checked })} />
          </label>

          {hasOptions && <div className="rounded-xl border border-border p-4"><div className="flex items-center justify-between"><div><Label>Answer options</Label><p className="mt-1 text-xs text-muted-foreground">Participants choose one option.</p></div>{!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => update(field.id, { options: [...field.options, ""] })}><Plus className="mr-1 h-3.5 w-3.5" />Option</Button>}</div>
            <div className="mt-4 space-y-2">{field.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2"><span className="w-5 text-right text-xs text-muted-foreground">{optionIndex + 1}</span><Input value={option} disabled={readOnly} onChange={(event) => { const options = [...field.options]; options[optionIndex] = event.target.value; update(field.id, { options }); }} placeholder={`Option ${optionIndex + 1}`} />{!readOnly && field.options.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => update(field.id, { options: field.options.filter((_, i) => i !== optionIndex) })} aria-label="Remove option"><X className="h-4 w-4" /></Button>}</div>)}</div>
          </div>}
          <details className="rounded-xl border border-border bg-muted/15 p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Settings2 className="h-4 w-4 text-muted-foreground" />Advanced question settings</summary>
            <div className="mt-5 grid gap-5">
              {supportsPlaceholder && <div className="grid gap-2"><Label>Placeholder / hint</Label><Input value={field.placeholder || ""} disabled={readOnly} onChange={(event) => update(field.id, { placeholder: event.target.value })} placeholder="Optional hint shown inside the answer field" /></div>}
              {field.type === "checkbox" ? <div className="grid gap-2"><Label>Checkbox statement</Label><Input value={field.defaultValue || ""} disabled={readOnly} onChange={(event) => update(field.id, { defaultValue: event.target.value })} placeholder="e.g. I agree to bring my laptop" /></div> : field.type !== "boolean" && <div className="grid gap-2"><Label>Default answer</Label><Input value={field.defaultValue || ""} disabled={readOnly} onChange={(event) => update(field.id, { defaultValue: event.target.value })} placeholder="Usually leave this empty" /></div>}
              {dependencyOptions.length > 0 && <div className="rounded-lg border border-border bg-background p-4">
                <label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-medium">Conditional question</span><span className="mt-0.5 block text-xs text-muted-foreground">Only show this after a particular answer.</span></span><input type="checkbox" checked={Boolean(field.dependsOn)} disabled={readOnly} onChange={(event) => update(field.id, { dependsOn: event.target.checked ? { fieldId: dependencyOptions[0]!.id, value: "" } : undefined })} /></label>
                {field.dependsOn && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end"><div className="grid gap-2"><Label>Show when</Label><Select value={field.dependsOn.fieldId} disabled={readOnly} onValueChange={(fieldId) => update(field.id, { dependsOn: { fieldId, value: field.dependsOn?.value || "" } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{dependencyOptions.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.label || "Untitled question"}</SelectItem>)}</SelectContent></Select></div><span className="pb-2 text-center text-xs text-muted-foreground">equals</span><div className="grid gap-2"><Label>Answer</Label><Input value={field.dependsOn.value} disabled={readOnly} onChange={(event) => update(field.id, { dependsOn: { fieldId: field.dependsOn!.fieldId, value: event.target.value } })} placeholder="Answer value" /></div></div>}
              </div>}
            </div>
          </details>
        </div>
      </article>;
    })}
    {!readOnly && <Button type="button" variant="outline" className="w-full gap-2 border-dashed py-6" onClick={() => onChange([...fields, newField()])}><Plus className="h-4 w-4" />Add another question</Button>}
  </div>;
}
