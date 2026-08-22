import { describe, expect, it } from 'vitest'
import {
  formatEvidenceFileSize,
  includedSiteEvidence,
  isSupportedSiteEvidenceFile,
  type SiteEvidenceImage,
} from './siteEvidence'

function image(id: string, included: boolean): SiteEvidenceImage {
  return {
    id,
    file: new File(['image'], `${id}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:${id}`,
    filename: `${id}.jpg`,
    size: 5,
    included,
    category: 'OTHER',
  }
}

describe('site evidence', () => {
  it('accepts only supported image formats', () => {
    expect(isSupportedSiteEvidenceFile(new File([], 'field.png', { type: 'image/png' }))).toBe(true)
    expect(isSupportedSiteEvidenceFile(new File([], 'field.jpeg', { type: 'image/jpeg' }))).toBe(true)
    expect(isSupportedSiteEvidenceFile(new File([], 'field.webp', { type: 'image/webp' }))).toBe(true)
    expect(isSupportedSiteEvidenceFile(new File([], 'notes.pdf', { type: 'application/pdf' }))).toBe(false)
  })

  it('allows a supported extension when the browser omits the MIME type', () => {
    expect(isSupportedSiteEvidenceFile(new File([], 'field.JPG'))).toBe(true)
    expect(isSupportedSiteEvidenceFile(new File([], 'field.gif'))).toBe(false)
  })

  it('includes only explicitly selected images when the report section is enabled', () => {
    const images = [image('included', true), image('excluded', false)]
    expect(includedSiteEvidence(images, true).map((item) => item.id)).toEqual(['included'])
    expect(includedSiteEvidence(images, false)).toEqual([])
  })

  it('formats evidence file sizes for compact telemetry', () => {
    expect(formatEvidenceFileSize(512)).toBe('512 B')
    expect(formatEvidenceFileSize(2048)).toBe('2.0 KB')
    expect(formatEvidenceFileSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})
