import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every(
  (value): value is string => typeof value === 'string' && value.length > 0,
)

const app: FirebaseApp | null = firebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(config)
  : null

export const firebaseAuth: Auth | null = app ? getAuth(app) : null
export const firestore: Firestore | null = app ? getFirestore(app) : null
