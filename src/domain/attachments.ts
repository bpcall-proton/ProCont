export const attachmentAccept = [
  'image/*',
  'application/pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.rtf',
  '.odt',
  '.ods',
].join(',')

const mimeExtensions: Record<string, string> = {
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'application/rtf': 'rtf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/csv': 'csv',
  'text/plain': 'txt',
}

export function fileAttachmentDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const commaIndex = result.indexOf(',')
      if (commaIndex < 0) {
        reject(new Error('Allegato non valido'))
        return
      }
      const mimeType =
        file.type || result.slice(5, commaIndex).split(';')[0] ||
        'application/octet-stream'
      const encodedName = encodeURIComponent(file.name || 'allegato')
      resolve(
        `data:${mimeType};name=${encodedName};base64,${result.slice(commaIndex + 1)}`,
      )
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function attachmentMimeType(attachment: string) {
  return (
    attachment.match(/^data:([^;,]+)/i)?.[1]?.toLocaleLowerCase() ??
    'application/octet-stream'
  )
}

export function attachmentOriginalName(attachment: string) {
  const encodedName = attachment.match(
    /^data:[^;,]+;name=([^;,]+);base64,/i,
  )?.[1]
  if (!encodedName) return ''
  try {
    return decodeURIComponent(encodedName)
  } catch {
    return encodedName
  }
}

export function isImageAttachment(attachment: string) {
  return attachmentMimeType(attachment).startsWith('image/')
}

export function isPdfAttachment(attachment: string) {
  return attachmentMimeType(attachment) === 'application/pdf'
}

function attachmentExtension(attachment: string) {
  const originalName = attachmentOriginalName(attachment)
  const originalExtension = originalName.match(/\.([a-zA-Z0-9]{1,12})$/)?.[1]
  if (originalExtension) return originalExtension.toLocaleLowerCase()
  const mimeType = attachmentMimeType(attachment)
  if (mimeExtensions[mimeType]) return mimeExtensions[mimeType]
  if (mimeType.startsWith('image/')) {
    const imageExtension = mimeType.slice('image/'.length)
    return imageExtension === 'jpeg' ? 'jpg' : imageExtension.replaceAll('+', '-')
  }
  return 'bin'
}

function safeFilename(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.slice(0, 170)
}

export function attachmentFilename(attachment: string, index: number) {
  const originalName = safeFilename(attachmentOriginalName(attachment))
  const extension = attachmentExtension(attachment)
  if (originalName) {
    return /\.[a-zA-Z0-9]{1,12}$/.test(originalName)
      ? originalName
      : `${originalName}.${extension}`
  }
  return `allegato-${index + 1}.${extension}`
}

export function attachmentTypeLabel(attachment: string) {
  const extension = attachmentExtension(attachment)
  return extension === 'bin' ? 'FILE' : extension.toLocaleUpperCase()
}
