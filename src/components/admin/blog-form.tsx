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
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  topicLabel: z.string().optional(),
  category: z.enum(["IEEE", "Society", "Event"]).optional(),
  coverUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  readMinutes: z.coerce.number().min(1).optional(),
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

export function BlogForm({ initialData, societies = [], events = [], onSubmit, isPending, onCancel }: BlogFormProps) {
  const form = useForm<BlogFormValues>({
    resolver: zodResolver(blogFormSchema) as any,
    defaultValues: {
      title: initialData?.title || "",
      slug: initialData?.slug || "",
      excerpt: initialData?.excerpt || "",
      content: initialData?.content || "",
      topicLabel: initialData?.topicLabel || "",
      category: (initialData?.category as "IEEE" | "Society" | "Event") || undefined,
      coverUrl: initialData?.coverUrl || "",
      readMinutes: initialData?.readMinutes || 5,
      published: initialData?.published ?? false,
      societyId: initialData?.societyId || "none",
      eventId: initialData?.eventId || "none",
    },
  })

  // Auto-generate slug from title if slug is empty and title is typed
  const titleValue = form.watch("title")
  const slugValue = form.watch("slug")
  
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    form.setValue("title", val)
    if (!initialData?.id && (!slugValue || slugValue === form.getValues("slug"))) {
      form.setValue("slug", val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""))
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        // Map "none" back to empty string before submitting
        const submitData = { ...data };
        if (submitData.societyId === "none") submitData.societyId = "";
        if (submitData.eventId === "none") submitData.eventId = "";
        onSubmit(submitData);
      })} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Post title" {...field} onChange={handleTitleChange} />
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
                  <Input placeholder="post-url-slug" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (Placement)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="IEEE">IEEE (Featured Top Row)</SelectItem>
                    <SelectItem value="Society">Society (Sidebar Row)</SelectItem>
                    <SelectItem value="Event">Event (General Pool)</SelectItem>
                  </SelectContent>
                </Select>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a society" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {societies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Input placeholder="Brief summary of the post" {...field} />
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
                <FormLabel>Cover Image URL (Unsplash, etc.)</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="readMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Read Minutes</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} />
                </FormControl>
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
                <BlogEditor 
                  value={field.value || ""} 
                  onChange={field.onChange} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="published"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Publish Post</FormLabel>
                <FormDescription>
                  Make this post visible to the public.
                </FormDescription>
              </div>
              <FormControl>
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-input bg-background accent-primary"
                  checked={field.value}
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
