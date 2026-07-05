import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

interface BlogEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function BlogEditor({ value, onChange, className }: BlogEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync value if it changes externally (e.g. initial load)
  useEffect(() => {
    if (editor && value && editor.getHTML() !== value) {
      // Small timeout to prevent layout thrashing on first render
      setTimeout(() => {
        if (editor.getHTML() !== value) {
          editor.commands.setContent(value)
        }
      }, 0)
    }
  }, [editor, value])

  if (!editor) return null

  const ToolbarButton = ({ 
    active, 
    onClick, 
    children 
  }: { 
    active: boolean; 
    onClick: () => void; 
    children: React.ReactNode 
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 w-8 p-0", active && "bg-muted text-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  )

  return (
    <div className={cn("flex flex-col rounded-md border border-input bg-transparent overflow-hidden focus-within:ring-1 focus-within:ring-ring", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/20 p-1">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div 
        className="p-4 min-h-[300px] max-h-[600px] overflow-y-auto cursor-text text-sm [&_.ProseMirror]:min-h-[268px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-2 [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:my-4 [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:my-3 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-accent [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic" 
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
