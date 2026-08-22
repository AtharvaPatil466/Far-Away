export const AFFECTED_SITE_EVIDENCE_SECTION = 'Affected Site Evidence'

export const SITE_EVIDENCE_CATEGORIES = [
  'FLOODING',
  'STRUCTURAL DAMAGE',
  'ROAD BLOCKAGE',
  'SHELTER',
  'MEDICAL',
  'FIRE',
  'INFRASTRUCTURE',
  'OTHER',
] as const

export type SiteEvidenceCategory = (typeof SITE_EVIDENCE_CATEGORIES)[number]

export interface SiteEvidenceImage {
  id: string
  file: File
  previewUrl: string
  filename: string
  size: number
  included: boolean
  category?: SiteEvidenceCategory
  location?: string
  timestamp?: string
  latitude?: string
  longitude?: string
  note?: string
}

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const SUPPORTED_EXTENSIONS = /\.(png|jpe?g|webp)$/i

export function isSupportedSiteEvidenceFile(file: File): boolean {
  return SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())
    || (file.type === '' && SUPPORTED_EXTENSIONS.test(file.name))
}

export function formatEvidenceFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function includedSiteEvidence(
  images: SiteEvidenceImage[],
  sectionEnabled: boolean,
): SiteEvidenceImage[] {
  return sectionEnabled ? images.filter((image) => image.included) : []
}
