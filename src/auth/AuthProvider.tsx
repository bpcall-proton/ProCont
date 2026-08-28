import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { SessionUser, UserRole } from '../domain/types'
import { AuthContext, type AuthContextValue } from './AuthContext'
import {
  firebaseAuth,
  firebaseConfigured,
  firestore,
} from './firebase'

const PREVIEW_KEY = 'fip:preview-session'

function loadPreviewSession() {
  if (firebaseAuth) return null
  const raw = sessionStorage.getItem(PREVIEW_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    sessionStorage.removeItem(PREVIEW_KEY)
    return null
  }
}

function messageForError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Operazione non riuscita'
}

async function sessionFromFirebase(
  id: string,
  email: string,
): Promise<SessionUser> {
  if (!firestore) {
    return {
      id,
      companyId: `company-${id}`,
      email,
      role: 'owner',
      preview: false,
    }
  }
  const reference = doc(firestore, 'users', id)
  const snapshot = await getDoc(reference)
  const profileData = snapshot.data()
  const savedRole = profileData?.role
  const role: UserRole = savedRole === 'accountant' ? 'accountant' : 'owner'
  const companyId =
    typeof profileData?.companyId === 'string'
      ? profileData.companyId
      : `company-${id}`
  if (!snapshot.exists()) {
    await setDoc(reference, {
      companyId,
      email,
      role,
      createdAt: new Date().toISOString(),
    })
  }
  return { id, companyId, email, role, preview: false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loadPreviewSession)
  const [loading, setLoading] = useState(Boolean(firebaseAuth))

  useEffect(() => {
    if (!firebaseAuth) return

    return onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }
      void sessionFromFirebase(firebaseUser.uid, firebaseUser.email ?? '').then(
        (session) => {
          setUser(session)
          setLoading(false)
        },
      )
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseConfigured,
      signIn: async (email, password) => {
        if (!firebaseAuth) return 'Firebase non configurato'
        try {
          await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
          return null
        } catch (error) {
          return messageForError(error)
        }
      },
      register: async (email, password) => {
        if (!firebaseAuth) return 'Firebase non configurato'
        try {
          await createUserWithEmailAndPassword(
            firebaseAuth,
            email.trim(),
            password,
          )
          return null
        } catch (error) {
          return messageForError(error)
        }
      },
      signInWithGoogle: async () => {
        if (!firebaseAuth) return 'Firebase non configurato'
        try {
          await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
          return null
        } catch (error) {
          return messageForError(error)
        }
      },
      continuePreview: (role) => {
        const previewUser: SessionUser = {
          id: `preview-${role}`,
          companyId: 'preview-company',
          email:
            role === 'owner'
              ? 'titolare@anteprima.local'
              : 'contabile@anteprima.local',
          role,
          preview: true,
        }
        sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(previewUser))
        setUser(previewUser)
      },
      signOut: () => {
        sessionStorage.removeItem(PREVIEW_KEY)
        if (firebaseAuth) {
          void firebaseSignOut(firebaseAuth)
        } else {
          setUser(null)
        }
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
