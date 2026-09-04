import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ATTENDEE_NOTE_LENGTH, MAX_EVENT_REQUIREMENTS, MAX_EVENT_REQUIREMENT_LENGTH } from "@/lib/event-requirements";

interface Props {
  requirements: string[];
  attendeeNote: string;
  onRequirementsChange: (value: string[]) => void;
  onAttendeeNoteChange: (value: string) => void;
}

export function EventRequirementsEditor({ requirements, attendeeNote, onRequirementsChange, onAttendeeNoteChange }: Props) {
  const add = () => {
    if (requirements.length >= MAX_EVENT_REQUIREMENTS) return;
    onRequirementsChange([...requirements, ""]);
  };
  const update = (index: number, value: string) => onRequirementsChange(requirements.map((item, i) => i === index ? value : item));
  const remove = (index: number) => onRequirementsChange(requirements.filter((_, i) => i !== index));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= requirements.length) return;
    const next = [...requirements];
    const current = next[index];
    const swap = next[target];
    if (current === undefined || swap === undefined) return;
    next[index] = swap;
    next[target] = current;
    onRequirementsChange(next);
  };

  return (
    <div className="space-y-5 rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Label>Before you attend</Label><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Short preparation items shown publicly on the event page and ticket. Keep them practical and attendee-facing.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={requirements.length >= MAX_EVENT_REQUIREMENTS} className="gap-2"><Plus className="h-3.5 w-3.5" /> Add item</Button>
      </div>
      {requirements.length > 0 && <div className="space-y-3">{requirements.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{index + 1}</span>
          <Input aria-label={`Requirement ${index + 1}`} value={item} maxLength={MAX_EVENT_REQUIREMENT_LENGTH} onChange={(e) => update(index, e.target.value)} placeholder="e.g. Bring your college ID card" />
          <button type="button" aria-label={`Move requirement ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-md p-2 text-muted-foreground hover:text-foreground disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label={`Move requirement ${index + 1} down`} disabled={index === requirements.length - 1} onClick={() => move(index, 1)} className="rounded-md p-2 text-muted-foreground hover:text-foreground disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" aria-label={`Remove requirement ${index + 1}`} onClick={() => remove(index)} className="rounded-md p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}</div>}
      <div className="grid gap-2"><Label htmlFor="attendee-note">Attendee note</Label><Textarea id="attendee-note" rows={3} maxLength={MAX_ATTENDEE_NOTE_LENGTH} value={attendeeNote} onChange={(e) => onAttendeeNoteChange(e.target.value)} placeholder="Example: Please report 15 minutes before the session." /><p className="text-xs text-muted-foreground">Optional public guidance. This can be corrected later without changing an attendee&apos;s registration.</p></div>
    </div>
  );
}
