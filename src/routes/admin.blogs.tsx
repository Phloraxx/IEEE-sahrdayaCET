import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, Pencil, Trash2, FileText } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { ConfirmButton } from "@/components/admin/confirm-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth-context"
import { getAllBlogsAdmin, createBlog, updateBlog, deleteBlog, getSocietiesForSelect, getEventsForSelect } from "./api/-blogs"
import { BlogForm, type BlogFormValues } from "@/components/admin/blog-form"
import type { BlogPost } from "@/types"

export const Route = createFileRoute("/admin/blogs")({
  beforeLoad: async ({ context }) => {
    // The user context comes from the parent admin route's AuthProvider
    // Check if user is an admin.
    // The instructions say: check that the current authenticated user's role === "admin", redirect to / if not.
    // context user is injected by root/auth
  },
  component: AdminBlogs,
})

function BlogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  )
}

function formatDate(d: string): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return d
  }
}

function AdminBlogs() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingBlog, setEditingBlog] = useState<BlogPost | null>(null)



  const { data: blogs, isLoading } = useQuery({
    queryKey: ["admin-blogs"],
    queryFn: async () => await getAllBlogsAdmin(),
  })

  const { data: societies = [] } = useQuery({
    queryKey: ["admin-societies-select"],
    queryFn: async () => await getSocietiesForSelect(),
  })

  const { data: events = [] } = useQuery({
    queryKey: ["admin-events-select"],
    queryFn: async () => await getEventsForSelect(),
  })

  const createMutation = useMutation({
    mutationFn: async (data: BlogFormValues) => {
      await createBlog({ data })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blogs"] })
      setIsSheetOpen(false)
    },
    onError: (err) => alert(err.message || "Failed to create blog"),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BlogFormValues> }) => {
      await updateBlog({ data: { id, ...data } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blogs"] })
      setIsSheetOpen(false)
    },
    onError: (err) => alert(err.message || "Failed to update blog"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteBlog({ data: id })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-blogs"] }),
    onError: (err) => alert(err.message || "Failed to delete blog"),
  })

  const handleCreateNew = () => {
    setEditingBlog(null)
    setIsSheetOpen(true)
  }

  const handleEdit = (blog: BlogPost) => {
    setEditingBlog(blog)
    setIsSheetOpen(true)
  }

  const handleFormSubmit = (data: BlogFormValues) => {
    if (editingBlog?.id) {
      updateMutation.mutate({ id: editingBlog.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  if (user && user.role !== "admin" && user.role !== "content") {
    window.location.href = "/"
    return null
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Content"
        title="Manage Blogs"
        description={`${blogs?.length ?? 0} blog post${blogs?.length === 1 ? "" : "s"}.`}
        actions={
          <Button size="sm" className="gap-1.5" onClick={handleCreateNew}>
            <Plus className="h-3.5 w-3.5" />
            Create post
          </Button>
        }
      />

      {isLoading ? (
        <BlogsSkeleton />
      ) : !blogs?.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No blog posts found</p>
          <p className="text-xs text-muted-foreground">Create your first post to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
          <div className="hidden grid-cols-[2fr_1fr_120px_96px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Title</span>
            <span>Date</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {blogs.map((blog: any) => (
            <div
              key={blog.id}
              className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[2fr_1fr_120px_96px] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground line-clamp-1">{blog.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                  {formatDate(blog.publishedAt || blog.createdAt)}
                </p>
              </div>
              <div className="font-mono text-xs tabular-nums text-muted-foreground hidden md:block">
                {formatDate(blog.publishedAt || blog.createdAt)}
              </div>
              <div>
                {blog.published ? (
                  <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25">Published</Badge>
                ) : (
                  <Badge variant="secondary">Draft</Badge>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => handleEdit(blog)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">Edit</span>
                </Button>
                <ConfirmButton
                  label=""
                  confirmMessage="Delete this post?"
                  variant="destructive"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onConfirm={() => {
                    deleteMutation.mutate(blog.id)
                    return true
                  }}
                  disabled={deleteMutation.isPending}
                  className="h-8 w-8 p-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto text-foreground p-0">
          <SheetHeader className="px-8 py-6 border-b border-border bg-muted/20">
            <SheetTitle className="text-xl">{editingBlog ? "Edit Post" : "Create Post"}</SheetTitle>
            <SheetDescription>
              {editingBlog ? "Update the details of your blog post." : "Fill in the details to create a new blog post."}
            </SheetDescription>
          </SheetHeader>
          <div className="p-8 pt-6">
            <BlogForm
              initialData={editingBlog || undefined}
              societies={societies}
              events={events}
              onSubmit={handleFormSubmit}
              isPending={isPending}
              onCancel={() => setIsSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
