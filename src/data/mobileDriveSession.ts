const sessionKey = 'fip:mobile-drive-session'

export const mobileDriveSyncUrl = (
  import.meta.env.VITE_DRIVE_SYNC_URL ?? ''
).replace(/\/$/, '')

export const mobileDriveServiceConfigured = mobileDriveSyncUrl.length > 0

export interface MobileDriveSession {
  deviceToken: string
  email: string
}

interface MobileDrivePairing {
  pairingId: string
  authorizationUrl: string
  expiresAt: number
}

export function loadMobileDriveSession(): MobileDriveSession | null {
  try {
    const value = localStorage.getItem(sessionKey)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<MobileDriveSession>
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

function saveMobileDriveSession(session: MobileDriveSession) {
  localStorage.setItem(sessionKey, JSON.stringify(session))
}

function clearMobileDriveSession() {
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

export async function createMobileDrivePairing(
  deviceName: string,
): Promise<MobileDrivePairing> {
  if (!mobileDriveServiceConfigured) {
    throw new Error('Servizio Google Drive non configurato')
  }
  const response = await fetch(`${mobileDriveSyncUrl}/v1/pairings`, {
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

export async function readMobileDrivePairing(
  pairingId: string,
): Promise<MobileDriveSession | null> {
  const response = await fetch(
    `${mobileDriveSyncUrl}/v1/pairings/${encodeURIComponent(pairingId)}`,
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
  saveMobileDriveSession(session)
  return session
}

export async function disconnectMobileDriveSession() {
  const session = loadMobileDriveSession()
  clearMobileDriveSession()
  if (!session || !mobileDriveServiceConfigured) return
  await fetch(`${mobileDriveSyncUrl}/v1/session`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.deviceToken}` },
  })
}
