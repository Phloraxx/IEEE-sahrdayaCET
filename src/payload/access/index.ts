import type { Access } from 'payload'

export const isAdmin: Access = ({ req: { user } }) => {
  return user?.role === 'admin'
}

export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  return { id: { equals: user?.id } }
}

export const isAdminOrChair: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  return { teams: { contains: user?.id } }
}

export const isAuthenticated: Access = ({ req: { user } }) => {
  return Boolean(user)
}

export const isPublic: Access = () => true
