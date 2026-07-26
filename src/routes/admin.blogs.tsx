import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Eye, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createAdminBlog,
  deleteAdminBlog,
  listAdminBlogs,
  listEventsForBlog,
  listSocietiesForBlog,
  updateAdminBlog,
} from "@/lib/admin-blog-client";
import { BlogForm, type BlogFormValues } from "@/components/admin/blog-form";
import type { BlogPost } from "@/types";
import { formatDateShort } from "@/lib/dates";

function BlogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

function formatDate(value?: string): string {
  return value ? formatDateShort(value) : "—";
}

export default function AdminBlogs() {
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<BlogPost | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

  const { data: blogs = [], isLoading } = useQuery({
    queryKey: ["admin-blogs"],
    queryFn: listAdminBlogs,
  });

  const { data: societies = [] } = useQuery({
    queryKey: ["admin-societies-select"],
    queryFn: listSocietiesForBlog,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["admin-events-select"],
    queryFn: listEventsForBlog,
  });

  const filteredBlogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return blogs.filter((blog) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" ? blog.published : !blog.published);
      const matchesSearch =
        !needle ||
        [blog.title, blog.slug, blog.topicLabel, blog.category]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [blogs, search, statusFilter]);

  const publishedCount = blogs.filter((blog) => blog.published).length;
  const draftCount = blogs.length - publishedCount;

  const createMutation = useMutation({
    mutationFn: createAdminBlog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-blogs"] });
      setIsSheetOpen(false);
      toast.success("Blog post created");
    },
    onError: (error) => toast.error(error.message || "Failed to create blog"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BlogFormValues> }) =>
      await updateAdminBlog(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-blogs"] });
      setIsSheetOpen(false);
      setEditingBlog(null);
      toast.success("Blog post updated");
    },
    onError: (error) => toast.error(error.message || "Failed to update blog"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminBlog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-blogs"] });
      toast.success("Blog post deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete blog"),
  });

  const handleCreateNew = () => {
    setEditingBlog(null);
    setIsSheetOpen(true);
  };

  const handleEdit = (blog: BlogPost) => {
    setEditingBlog(blog);
    setIsSheetOpen(true);
  };

  const handleFormSubmit = (data: BlogFormValues) => {
    if (editingBlog?.id) {
      updateMutation.mutate({ id: editingBlog.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Content"
        title="Manage Blogs"
        description="Draft, publish and maintain the public IEEE Sahrdaya story archive."
        actions={
          <Button size="sm" className="gap-1.5" onClick={handleCreateNew}>
            <Plus className="h-3.5 w-3.5" />
            Create post
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["All posts", blogs.length, "all"],
          ["Published", publishedCount, "published"],
          ["Drafts", draftCount, "draft"],
        ].map(([label, count, key]) => (
          <button
            key={String(key)}
            type="button"
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter(key as "all" | "published" | "draft")}
            className={`rounded-xl border p-4 text-left transition ${
              statusFilter === key
                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/15"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{count}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search blog posts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, slug, topic or category"
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {filteredBlogs.length} of {blogs.length}
        </p>
      </div>

      {isLoading ? (
        <BlogsSkeleton />
      ) : filteredBlogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            {blogs.length === 0 ? "No blog posts found" : "No posts match these filters"}
          </p>
          <p className="text-xs text-muted-foreground">
            {blogs.length === 0
              ? "Create your first post to get started."
              : "Try another search or status filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
          <div className="hidden grid-cols-[minmax(0,2fr)_140px_120px_150px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Post</span>
            <span>Category</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {filteredBlogs.map((blog) => (
            <div
              key={blog.id}
              className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,2fr)_140px_120px_150px] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-foreground">{blog.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>/{blog.slug}</span>
                  <span>•</span>
                  <span>{formatDate(blog.publishedAt || blog.updatedAt || blog.createdAt)}</span>
                  {blog.topicLabel ? <><span>•</span><span>{blog.topicLabel}</span></> : null}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{blog.category || "—"}</div>
              <div>
                {blog.published ? (
                  <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25">
                    Published
                  </Badge>
                ) : (
                  <Badge variant="secondary">Draft</Badge>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                {blog.published && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                    <Link to={`/blog/${blog.slug}`} target="_blank" aria-label={`View ${blog.title}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
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
                  confirmMessage="Delete this post? This cannot be undone."
                  variant="destructive"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onConfirm={() => {
                    deleteMutation.mutate(blog.id);
                    return true;
                  }}
                  disabled={deleteMutation.isPending}
                  className="h-8 w-8 p-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingBlog(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 text-foreground sm:max-w-3xl">
          <SheetHeader className="border-b border-border bg-muted/20 px-8 py-6">
            <SheetTitle className="text-xl">{editingBlog ? "Edit Post" : "Create Post"}</SheetTitle>
            <SheetDescription>
              {editingBlog
                ? "Update the story, links and publication state."
                : "Create a draft or publish a new story to the public blog."}
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
  );
}
