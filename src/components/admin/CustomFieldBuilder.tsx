'use client'

import { Plus, X, GripVertical, Copy } from 'lucide-react'

export interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number' | 'email' | 'phone' | 'date' | 'boolean'
  required: boolean
  options: string[]
  placeholder?: string
  defaultValue?: string
  dependsOn?: { fieldId: string; value: string }
}

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

interface CustomFieldBuilderProps {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
  readOnly?: boolean
}

export function CustomFieldBuilder({ fields, onChange, readOnly = false }: CustomFieldBuilderProps) {
  const addField = () => {
    onChange([...fields, { id: generateId(), label: '', type: 'text', required: false, options: [''] }])
  }

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id))
  }

  const updateField = (id: string, updates: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= fields.length) return
    const next = [...fields]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    onChange(next)
  }

  const cloneField = (id: string) => {
    const field = fields.find((f) => f.id === id)
    if (!field) return
    const clone = { ...field, id: generateId(), label: field.label + ' (copy)' }
    const idx = fields.findIndex((f) => f.id === id)
    const next = [...fields]
    next.splice(idx + 1, 0, clone)
    onChange(next)
  }

  const fieldTypes: { value: FormField['type']; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'number', label: 'Number' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'radio', label: 'Radio' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'boolean', label: 'Yes/No' },
  ]

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No custom fields yet. Add questions like &ldquo;Department&rdquo;, &ldquo;Year&rdquo;, or custom selections.
        </p>
      ) : (
        fields.map((field, idx) => (
          <div key={field.id} className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {/* Move up/down */}
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => moveField(idx, -1)} disabled={idx === 0}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                  <GripVertical className="size-3.5" />
                </button>
              </div>

              {/* Label */}
              <input
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder="Field label (e.g. Department)"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
              />

              {/* Type selector */}
              <select
                value={field.type}
                onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
              >
                {fieldTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {/* Required toggle */}
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(field.id, { required: e.target.checked })}
                  className="rounded border-input"
                />
                Req
              </label>

              {/* Clone button */}
              <button type="button" onClick={() => cloneField(field.id)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Duplicate field">
                <Copy className="size-3.5" />
              </button>

              {/* Delete button */}
              <button type="button" onClick={() => removeField(field.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                <X className="size-4" />
              </button>
            </div>

            {/* Extra options row */}
            <div className="ml-8 flex flex-wrap items-center gap-2">
              {/* Placeholder */}
              {(field.type === 'text' || field.type === 'textarea' || field.type === 'number' || field.type === 'email' || field.type === 'phone') && (
                <input
                  value={field.placeholder || ''}
                  onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                  placeholder="Placeholder text"
                  className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              )}

              {/* Default value */}
              {field.type !== 'boolean' && field.type !== 'checkbox' && (
                <input
                  value={field.defaultValue || ''}
                  onChange={(e) => updateField(field.id, { defaultValue: e.target.value })}
                  placeholder="Default value"
                  className="flex-1 min-w-[100px] rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              )}

              {/* Conditional logic */}
              {fields.length > 1 && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={!!field.dependsOn}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const otherField = fields.find((f) => f.id !== field.id)
                        updateField(field.id, { dependsOn: { fieldId: otherField?.id || '', value: '' } })
                      } else {
                        updateField(field.id, { dependsOn: undefined })
                      }
                    }}
                    className="rounded border-input"
                  />
                  Conditional
                </label>
              )}
            </div>

            {/* Conditional logic config */}
            {field.dependsOn && (
              <div className="ml-8 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Show if</span>
                <select
                  value={field.dependsOn.fieldId}
                  onChange={(e) => {
                    const dep = field.dependsOn!
                    updateField(field.id, { dependsOn: { fieldId: e.target.value, value: dep.value } })
                  }}
                  className="rounded border border-input bg-background px-2 py-1 text-xs outline-none"
                >
                  {fields.filter((f) => f.id !== field.id).map((f) => (
                    <option key={f.id} value={f.id}>{f.label || 'Unnamed field'}</option>
                  ))}
                </select>
                <span className="text-muted-foreground">equals</span>
                <input
                  value={field.dependsOn.value}
                  onChange={(e) => {
                    const dep = field.dependsOn!
                    updateField(field.id, { dependsOn: { fieldId: dep.fieldId, value: e.target.value } })
                  }}
                  placeholder="Value"
                  className="rounded border border-input bg-background px-2 py-1 text-xs outline-none w-24"
                />
              </div>
            )}

            {/* Options editor for select and radio */}
            {(field.type === 'select' || field.type === 'radio') && (
              <div className="ml-8 space-y-1">
                {field.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{oi + 1}.</span>
                    <input
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...field.options]
                        newOpts[oi] = e.target.value
                        updateField(field.id, { options: newOpts })
                      }}
                      placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                    />
                    {field.options.length > 1 && (
                      <button type="button" onClick={() => {
                        const newOpts = field.options.filter((_, i) => i !== oi)
                        updateField(field.id, { options: newOpts })
                      }} className="p-0.5 text-muted-foreground hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => updateField(field.id, { options: [...field.options, ''] })}
                  className="text-xs text-ieee-blue hover:underline">+ Add option</button>
              </div>
            )}

            {/* Checkbox-specific: define the label shown next to the checkbox */}
            {field.type === 'checkbox' && (
              <div className="ml-8">
                <input
                  value={field.defaultValue || ''}
                  onChange={(e) => updateField(field.id, { defaultValue: e.target.value })}
                  placeholder="Checkbox label text"
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none w-full"
                />
              </div>
            )}
          </div>
        ))
      )}

      {!readOnly && (
        <button type="button" onClick={addField}
          className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-2.5 py-1.5 text-xs font-medium transition-colors">
          <Plus className="size-3.5" />
          Add Field
        </button>
      )}
    </div>
  )
}
