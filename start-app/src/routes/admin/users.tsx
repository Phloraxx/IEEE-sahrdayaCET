import { createFileRoute } from '@tanstack/react-router'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'

export const Route = createFileRoute('/admin/users')({
  component: UsersPage,
})

function UsersPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => pb.collection('users').getFullList(1, 100, { sort: '-created' }),
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Users</h2>
      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users?.map((u: Record<string, unknown>) => (
                  <tr key={u.id as string} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.name as string}</td>
                    <td className="px-4 py-3">{u.email as string}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'default' : 'outline'}>
                        {u.role as string}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
