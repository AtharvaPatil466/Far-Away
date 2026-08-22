import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import {
  formatEvidenceFileSize,
  isSupportedSiteEvidenceFile,
  SITE_EVIDENCE_CATEGORIES,
  type SiteEvidenceImage,
} from '../lib/siteEvidence'

type EditableEvidenceFields = Pick<
  SiteEvidenceImage,
  'included' | 'category' | 'location' | 'timestamp' | 'latitude' | 'longitude' | 'note'
>

type SiteEvidenceSectionProps = {
  images: SiteEvidenceImage[]
  onAddFiles: (files: File[]) => void
  onUpdate: (id: string, updates: Partial<EditableEvidenceFields>) => void
  onRemove: (id: string) => void
}

export default function SiteEvidenceSection({
  images,
  onAddFiles,
  onUpdate,
  onRemove,
}: SiteEvidenceSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const activeImage = images.find((image) => image.id === activeImageId) ?? null

  useEffect(() => {
    if (!activeImage) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImageId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeImage])

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const supported = files.filter(isSupportedSiteEvidenceFile)
    const rejectedCount = files.length - supported.length

    if (supported.length > 0) onAddFiles(supported)
    setUploadNotice(
      rejectedCount > 0
        ? `${rejectedCount} unsupported ${rejectedCount === 1 ? 'file was' : 'files were'} skipped. Use PNG, JPG, JPEG, or WEBP.`
        : null,
    )
    event.target.value = ''
  }

  const removeImage = (id: string) => {
    if (activeImageId === id) setActiveImageId(null)
    onRemove(id)
  }

  return (
    <section className="site-evidence-section" aria-labelledby="site-evidence-title">
      <div className="site-evidence-heading">
        <div>
          <p className="evidence-kicker">Field documentation / manual evidence</p>
          <h2 id="site-evidence-title">Affected Site Evidence</h2>
          <p>Attach field imagery, damage photos, or affected-site evidence for inclusion in the report.</p>
        </div>
        <button className="site-evidence-add" type="button" onClick={() => inputRef.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          Add site images
        </button>
        <input
          ref={inputRef}
          className="site-evidence-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          multiple
          onChange={handleFileSelection}
        />
      </div>

      {uploadNotice && <p className="site-evidence-notice" role="status">{uploadNotice}</p>}

      {images.length === 0 ? (
        <div className="site-evidence-empty">
          <strong>Affected site evidence</strong>
          <p>No field imagery attached.</p>
          <button type="button" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            Add site images
          </button>
          <span>Attach photos captured by field teams, drones, or district authorities.</span>
        </div>
      ) : (
        <div className="site-evidence-grid">
          {images.map((image) => (
            <article className={`site-evidence-item ${image.included ? 'included' : ''}`} key={image.id}>
              <button
                className="site-evidence-thumbnail"
                type="button"
                onClick={() => setActiveImageId(image.id)}
                aria-label={`Review ${image.filename}`}
              >
                <img src={image.previewUrl} alt="" />
                <span>{image.included ? 'Included' : 'Excluded'}</span>
              </button>

              <div className="site-evidence-file-row">
                <div>
                  <strong title={image.filename}>{image.filename}</strong>
                  <span>{formatEvidenceFileSize(image.size)}</span>
                </div>
                <button type="button" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.filename}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>

              <label className="site-evidence-include">
                <input
                  type="checkbox"
                  checked={image.included}
                  onChange={(event) => onUpdate(image.id, { included: event.target.checked })}
                />
                <span>Include in report</span>
              </label>

              <div className="site-evidence-fields">
                <label>
                  <span>Affected-site label</span>
                  <select
                    value={image.category ?? ''}
                    onChange={(event) => onUpdate(image.id, { category: event.target.value as SiteEvidenceImage['category'] })}
                  >
                    <option value="" disabled>Select label</option>
                    {SITE_EVIDENCE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  <span>Location</span>
                  <input
                    value={image.location ?? ''}
                    placeholder="Kendrapara Coast, Zone 7"
                    onChange={(event) => onUpdate(image.id, { location: event.target.value })}
                  />
                </label>
                <label>
                  <span>Timestamp</span>
                  <input
                    type="datetime-local"
                    value={image.timestamp ?? ''}
                    onChange={(event) => onUpdate(image.id, { timestamp: event.target.value })}
                  />
                </label>
                <div className="site-evidence-coordinates">
                  <label>
                    <span>Latitude</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="-90"
                      max="90"
                      value={image.latitude ?? ''}
                      onChange={(event) => onUpdate(image.id, { latitude: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Longitude</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="-180"
                      max="180"
                      value={image.longitude ?? ''}
                      onChange={(event) => onUpdate(image.id, { longitude: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  <span>Field note</span>
                  <textarea
                    rows={2}
                    value={image.note ?? ''}
                    placeholder="Road access submerged near evacuation corridor."
                    onChange={(event) => onUpdate(image.id, { note: event.target.value })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}

      {activeImage && (
        <div
          className="site-evidence-lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-evidence-viewer-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveImageId(null)
          }}
        >
          <div className="site-evidence-lightbox-panel">
            <div className="site-evidence-lightbox-head">
              <div>
                <p>Site evidence / manual record</p>
                <h3 id="site-evidence-viewer-title">{activeImage.filename}</h3>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setActiveImageId(null)} aria-label="Close image viewer">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="site-evidence-lightbox-body">
              <img src={activeImage.previewUrl} alt={activeImage.note || activeImage.filename} />
              <dl>
                <div><dt>Category</dt><dd>{activeImage.category || 'Not classified'}</dd></div>
                <div><dt>Location</dt><dd>{activeImage.location || 'Not provided'}</dd></div>
                <div><dt>Timestamp</dt><dd>{activeImage.timestamp || 'Not provided'}</dd></div>
                <div>
                  <dt>Coordinates</dt>
                  <dd>{activeImage.latitude && activeImage.longitude ? `${activeImage.latitude}, ${activeImage.longitude}` : 'Not provided'}</dd>
                </div>
                <div><dt>Field note</dt><dd>{activeImage.note || 'Not provided'}</dd></div>
              </dl>
            </div>
            <div className="site-evidence-lightbox-actions">
              <button
                className={activeImage.included ? 'active' : ''}
                type="button"
                onClick={() => onUpdate(activeImage.id, { included: true })}
              >
                Include in report
              </button>
              <button type="button" onClick={() => onUpdate(activeImage.id, { included: false })}>Exclude</button>
              <button className="remove" type="button" onClick={() => removeImage(activeImage.id)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
