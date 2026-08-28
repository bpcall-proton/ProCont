import { createContext, useContext } from 'react'
import type { SessionUser, UserRole } from '../domain/types'

export interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  firebaseConfigured: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  continuePreview: (role: UserRole) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider mancante')
  return value
}
