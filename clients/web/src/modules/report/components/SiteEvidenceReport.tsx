import type { SiteEvidenceImage } from '../lib/siteEvidence'

export default function SiteEvidenceReport({ images }: { images: SiteEvidenceImage[] }) {
  if (images.length === 0) return null

  return (
    <section className="report-section site-evidence-report" aria-labelledby="report-site-evidence-title">
      <h2 id="report-site-evidence-title">Affected Site Evidence</h2>
      <div className="section-rule" />
      <p className="site-evidence-report-note">
        Reviewer-selected field imagery. Categories and metadata are manually supplied and have not been inferred from image content.
      </p>
      <div className="site-evidence-report-grid">
        {images.map((image) => (
          <figure key={image.id}>
            <img src={image.previewUrl} alt={image.note || image.filename} />
            <figcaption>
              <strong>{image.category || 'NOT CLASSIFIED'}</strong>
              <span>{image.location || 'Location not provided'}</span>
              {image.timestamp && <span>{image.timestamp}</span>}
              {image.latitude && image.longitude && <span>{image.latitude}, {image.longitude}</span>}
              {image.note && <p>{image.note}</p>}
              <small>{image.filename}</small>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
