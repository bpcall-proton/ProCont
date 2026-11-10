import { useState } from 'react'
import {
  attachmentFilename,
  attachmentTypeLabel,
  isImageAttachment,
  isPdfAttachment,
} from '../domain/attachments'

async function downloadAttachment(attachment: string, index: number) {
  const filename = attachmentFilename(attachment, index)
  if (window.desktopApp?.saveAttachment) {
    await window.desktopApp.saveAttachment(attachment, filename)
    return
  }
  const anchor = document.createElement('a')
  anchor.href = attachment
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

export function AttachmentItem({
  attachment,
  index,
  large = false,
  onRemove,
}: {
  attachment: string
  index: number
  large?: boolean
  onRemove?: () => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const filename = attachmentFilename(attachment, index)
  const image = isImageAttachment(attachment)
  const pdf = isPdfAttachment(attachment)
  return (
    <figure className={large ? 'attachment-item-large' : undefined}>
      <button
        className="attachment-photo-button"
        onClick={() => setPreviewOpen(true)}
        title={filename}
        type="button"
      >
        {image ? (
          <img alt={filename} src={attachment} />
        ) : (
          <span className="attachment-document-tile">
            <strong>{attachmentTypeLabel(attachment)}</strong>
            <small>{filename}</small>
          </span>
        )}
      </button>
      <span className="attachment-photo-actions">
        <button onClick={() => setPreviewOpen(true)} type="button">
          Apri
        </button>
        <button
          onClick={() => void downloadAttachment(attachment, index)}
          type="button"
        >
          Scarica
        </button>
        {onRemove && (
          <button className="danger-text" onClick={onRemove} type="button">
            Rimuovi
          </button>
        )}
      </span>
      {previewOpen && (
        <div
          className="attachment-preview-overlay"
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <div
            aria-label={`Anteprima ${filename}`}
            aria-modal="true"
            className="attachment-preview"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            {image ? (
              <img alt={filename} src={attachment} />
            ) : pdf ? (
              <iframe src={attachment} title={filename} />
            ) : (
              <div className="attachment-document-preview">
                <strong>{attachmentTypeLabel(attachment)}</strong>
                <span>{filename}</span>
                <small>
                  Anteprima non disponibile. Scarica il file per aprirlo.
                </small>
              </div>
            )}
            <div className="attachment-preview-actions">
              <button
                className="button button-secondary"
                onClick={() => setPreviewOpen(false)}
                type="button"
              >
                Chiudi
              </button>
              <button
                className="button button-primary"
                onClick={() => void downloadAttachment(attachment, index)}
                type="button"
              >
                Scarica
              </button>
            </div>
          </div>
        </div>
      )}
    </figure>
  )
}
