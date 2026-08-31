const sessionKey = 'fip:drive-device-session'

export const driveSyncUrl = (
  import.meta.env.VITE_DRIVE_SYNC_URL ?? ''
).replace(/\/$/, '')

export const driveServiceConfigured = driveSyncUrl.length > 0

export interface DriveSession {
  deviceToken: string
  email: string
}

export interface DrivePairing {
  pairingId: string
  authorizationUrl: string
  expiresAt: number
}

export function loadDriveSession(): DriveSession | null {
  try {
    const value = localStorage.getItem(sessionKey)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<DriveSession>
    if (
      typeof parsed.deviceToken !== 'string' ||
      typeof parsed.email !== 'string'
    ) {
      return null
    }
    return {
      deviceToken: parsed.deviceToken,
      email: parsed.email,
    }
  } catch {
    return null
  }
}

export function saveDriveSession(session: DriveSession) {
  localStorage.setItem(sessionKey, JSON.stringify(session))
}

export function clearDriveSession() {
  localStorage.removeItem(sessionKey)
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? `Errore servizio Drive (${response.status})`
  } catch {
    return `Errore servizio Drive (${response.status})`
  }
}

export async function createDrivePairing(
  deviceName: string,
): Promise<DrivePairing> {
  if (!driveServiceConfigured) {
    throw new Error('Servizio Google Drive non configurato')
  }
  const response = await fetch(`${driveSyncUrl}/v1/pairings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_name: deviceName }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const result = (await response.json()) as {
    pairing_id: string
    authorization_url: string
    expires_at: number
  }
  return {
    pairingId: result.pairing_id,
    authorizationUrl: result.authorization_url,
    expiresAt: result.expires_at,
  }
}

export async function readDrivePairing(
  pairingId: string,
): Promise<DriveSession | null> {
  const response = await fetch(
    `${driveSyncUrl}/v1/pairings/${encodeURIComponent(pairingId)}`,
  )
  if (!response.ok) throw new Error(await responseError(response))
  const result = (await response.json()) as {
    status: 'pending' | 'ready'
    email?: string
    device_token?: string
  }
  if (
    result.status !== 'ready' ||
    !result.email ||
    !result.device_token
  ) {
    return null
  }
  const session = {
    deviceToken: result.device_token,
    email: result.email,
  }
  saveDriveSession(session)
  return session
}

export async function validateDriveSession(
  session = loadDriveSession(),
): Promise<DriveSession | null> {
  if (!session || !driveServiceConfigured) return null
  const response = await fetch(`${driveSyncUrl}/v1/session`, {
    headers: { Authorization: `Bearer ${session.deviceToken}` },
  })
  if (response.status === 401) {
    clearDriveSession()
    return null
  }
  if (!response.ok) throw new Error(await responseError(response))
  const result = (await response.json()) as { email: string }
  const validated = { ...session, email: result.email }
  saveDriveSession(validated)
  return validated
}

export async function disconnectDriveSession() {
  const session = loadDriveSession()
  clearDriveSession()
  if (!session || !driveServiceConfigured) return
  await fetch(`${driveSyncUrl}/v1/session`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.deviceToken}` },
  })
}
