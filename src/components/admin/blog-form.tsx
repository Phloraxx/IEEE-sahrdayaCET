import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BlogEditor } from "@/components/admin/blog-editor"
import { Loader2 } from "lucide-react"
import type { BlogPost } from "@/types"

const blogFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  slug: z.string().trim().min(1, "Slug is required"),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  topicLabel: z.string().optional(),
  category: z.enum(["IEEE", "Society", "Event"]).optional(),
  coverUrl: z
    .string()
    .url("Must be a valid URL")
    .refine((value) => {
      if (!value) return true
      const protocol = new URL(value).protocol
      return protocol === "http:" || protocol === "https:"
    }, "Cover image URL must use HTTP or HTTPS")
    .optional()
    .or(z.literal("")),
  readMinutes: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().int().min(1).max(240).optional(),
  ),
  published: z.boolean().optional(),
  societyId: z.string().optional(),
  eventId: z.string().optional(),
})

export type BlogFormValues = z.infer<typeof blogFormSchema>

interface BlogFormProps {
  initialData?: Partial<BlogPost>
  societies?: { id: string; name: string }[]
  events?: { id: string; title: string }[]
  onSubmit: (data: BlogFormValues) => void
  isPending: boolean
  onCancel: () => void
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function BlogForm({
  initialData,
  societies = [],
  events = [],
  onSubmit,
  isPending,
  onCancel,
}: BlogFormProps) {
  const [slugTouched, setSlugTouched] = useState(Boolean(initialData?.id))
  const form = useForm<BlogFormValues>({
    resolver: zodResolver(blogFormSchema) as any,
    defaultValues: {
      title: initialData?.title || "",
      slug: initialData?.slug || "",
      excerpt: initialData?.excerpt || "",
      content: initialData?.content || "",
      topicLabel: initialData?.topicLabel || "",
      category:
        (initialData?.category as "IEEE" | "Society" | "Event") || undefined,
      coverUrl: initialData?.coverUrl || "",
      readMinutes: initialData?.readMinutes || undefined,
      published: initialData?.published ?? false,
      societyId: initialData?.societyId || "none",
      eventId: initialData?.eventId || "none",
    },
  })

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    form.setValue("title", value, { shouldValidate: true })
    if (!initialData?.id && !slugTouched) {
      form.setValue("slug", slugify(value), { shouldValidate: true })
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          const submitData = { ...data }
          if (submitData.societyId === "none") submitData.societyId = ""
          if (submitData.eventId === "none") submitData.eventId = ""
          onSubmit(submitData)
        })}
        className="space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Post title"
                    {...field}
                    onChange={handleTitleChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="post-url-slug"
                    {...field}
                    onChange={(event) => {
                      setSlugTouched(true)
                      field.onChange(slugify(event.target.value))
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Used in the public URL. It auto-follows the title until you edit it.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="IEEE">IEEE — Branch / featured stories</SelectItem>
                    <SelectItem value="Society">Society — Chapter & affinity-group stories</SelectItem>
                    <SelectItem value="Event">Event — Recaps & event coverage</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Category influences featured placement; every published post still appears in the full archive.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="topicLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Topic Label</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. AI / ML" {...field} />
                </FormControl>
                <FormDescription>
                  Optional reader-facing topic used by the public topic filter.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="societyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Linked Society (Optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "none"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a society" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {societies.map((society) => (
                      <SelectItem key={society.id} value={society.id}>
                        {society.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Published posts linked here are surfaced on that society page.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Linked Event (Optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "none"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Published posts linked here appear in the event detail view.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="excerpt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Excerpt</FormLabel>
              <FormControl>
                <Input placeholder="Brief summary shown on story cards" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cover Image URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." {...field} />
                </FormControl>
                <FormDescription>
                  Optional HTTPS/HTTP image URL used on cards and the article header.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="readMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Read Minutes (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="Auto"
                  />
                </FormControl>
                <FormDescription>
                  Leave blank to estimate from the article content.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <BlogEditor value={field.value || ""} onChange={field.onChange} />
              </FormControl>
              <FormDescription>
                Rich text is sanitized on the server before it is stored and rendered publicly.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="published"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5 pr-4">
                <FormLabel className="text-base">Publish Post</FormLabel>
                <FormDescription>
                  Published posts become publicly readable and appear in the blog archive. Drafts remain editor-only.
                </FormDescription>
              </div>
              <FormControl>
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-input bg-background accent-primary"
                  checked={field.value ?? false}
                  onChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData?.id ? "Update Post" : "Create Post"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
