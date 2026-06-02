import type { Access } from 'payload'

export const isPublic: Access = () => true

export const isAuthenticated: Access = ({ req: { user } }) => {
  return Boolean(user)
}

export const isAdmin: Access = ({ req: { user } }) => {
  return user?.role === 'admin'
}

export const isSelfOrAdmin: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  if (user?.id) return { id: { equals: user.id } }
  return false
}
