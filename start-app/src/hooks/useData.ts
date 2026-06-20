// Data hooks for PocketBase
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import type { Event, Society, Registration, ExecomMember, AuthUser } from '@/types'

// ─── Events ───────────────────────────────────────────────

export function useEventsList(filter?: string) {
  return useQuery({
    queryKey: ['events', filter],
    queryFn: async () => {
      const result = await pb.collection('events').getList<Event>(1, 50, {
        sort: '-date',
        expand: 'society',
        ...(filter ? { filter } : {}),
      })
      return result.items
    },
  })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const doc = await pb.collection('events').getOne<Event>(id, { expand: 'society' })
      return doc
    },
    enabled: !!id,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      pb.collection('events').create<Event>(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      pb.collection('events').update<Event>(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

// ─── Societies ────────────────────────────────────────────

export function useSocietiesList() {
  return useQuery({
    queryKey: ['societies'],
    queryFn: async () => {
      const result = await pb.collection('societies').getFullList<Society>()
      return result
    },
  })
}

export function useSociety(id: string) {
  return useQuery({
    queryKey: ['society', id],
    queryFn: async () => pb.collection('societies').getOne<Society>(id),
    enabled: !!id,
  })
}

// ─── Registrations ────────────────────────────────────────

export function useRegistrationsList(eventId?: string) {
  return useQuery({
    queryKey: ['registrations', eventId],
    queryFn: async () => {
      const filter = eventId ? `event = "${eventId}"` : ''
      const result = await pb.collection('registrations').getList<Registration>(1, 50, {
        sort: '-created',
        expand: 'event,user',
        ...(filter ? { filter } : {}),
      })
      return result.items
    },
  })
}

// ─── Execom ───────────────────────────────────────────────

export function useExecomList() {
  return useQuery({
    queryKey: ['execom'],
    queryFn: async () => {
      const result = await pb.collection('execom').getFullList<ExecomMember>({
        sort: 'order',
      })
      return result
    },
  })
}

// ─── Users ────────────────────────────────────────────────

export function useUsersList() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const result = await pb.collection('users').getFullList<AuthUser>({
        sort: '-created',
      })
      return result
    },
  })
}
