import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/events/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/events/$id"!</div>
}
