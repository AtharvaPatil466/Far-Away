import { useEffect, useRef, useState } from 'react'
import ReportConfig from './components/ReportConfig'
import ReportViewer from './components/ReportViewer'
import {
  buildFallbackReport,
  generateReport,
  parseReport,
  type ReportSection,
} from './lib/anthropic'
import { incidents, reportSections, type Incident } from './lib/incidents'
import {
  AFFECTED_SITE_EVIDENCE_SECTION,
  includedSiteEvidence,
  type SiteEvidenceImage,
} from './lib/siteEvidence'

export function Report() {
  const [view, setView] = useState<'config' | 'viewer'>('config')
  const [selectedIncident, setSelectedIncident] = useState<Incident>(incidents[0])
  const [checkedSections, setCheckedSections] = useState<string[]>(reportSections)
  const [audience, setAudience] = useState('SDMA')
  const [generatedAt, setGeneratedAt] = useState(new Date())
  const [isGenerating, setIsGenerating] = useState(false)
  const [sections, setSections] = useState<ReportSection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [siteEvidence, setSiteEvidence] = useState<SiteEvidenceImage[]>([])
  const [reportEvidence, setReportEvidence] = useState<SiteEvidenceImage[]>([])
  const siteEvidenceRef = useRef<SiteEvidenceImage[]>([])

  useEffect(() => {
    siteEvidenceRef.current = siteEvidence
  }, [siteEvidence])

  useEffect(() => () => {
    siteEvidenceRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
  }, [])

  const toggleSection = (section: string) => {
    setCheckedSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    )
  }

  const input = {
    incident: selectedIncident,
    sections: checkedSections.filter((section) => section !== AFFECTED_SITE_EVIDENCE_SECTION),
    audience,
  }

  const addSiteEvidence = (files: File[]) => {
    const newImages = files.map<SiteEvidenceImage>((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      filename: file.name,
      size: file.size,
      included: true,
    }))
    setSiteEvidence((current) => [...current, ...newImages])
  }

  const updateSiteEvidence = (id: string, updates: Partial<SiteEvidenceImage>) => {
    setSiteEvidence((current) => current.map((image) => image.id === id ? { ...image, ...updates } : image))
  }

  const removeSiteEvidence = (id: string) => {
    const image = siteEvidence.find((item) => item.id === id)
    if (image) URL.revokeObjectURL(image.previewUrl)
    setSiteEvidence((current) => current.filter((item) => item.id !== id))
  }

  const handleGenerate = async () => {
    setView('viewer')
    setGeneratedAt(new Date())
    setIsGenerating(true)
    setError(null)
    setSections([])
    setReportEvidence(includedSiteEvidence(
      siteEvidence,
      checkedSections.includes(AFFECTED_SITE_EVIDENCE_SECTION),
    ))

    try {
      const text = await generateReport(input)
      setSections(parseReport(text))
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? `Local Ollama was unavailable or returned an error (${generationError.message}). Showing a generated fallback report for review.`
          : 'Local Ollama was unavailable. Showing a generated fallback report for review.'
      setError(message)
      setSections(parseReport(buildFallbackReport(input)))
    } finally {
      setIsGenerating(false)
    }
  }

  const handleNewReport = () => {
    setView('config')
    setError(null)
  }

  return (
    <div className="report-module">
      {view === 'config' ? (
        <ReportConfig
          audience={audience}
          checkedSections={checkedSections}
          isGenerating={isGenerating}
          onAudienceChange={setAudience}
          onEvidenceAdd={addSiteEvidence}
          onEvidenceRemove={removeSiteEvidence}
          onEvidenceUpdate={updateSiteEvidence}
          onGenerate={handleGenerate}
          onIncidentChange={setSelectedIncident}
          onSectionToggle={toggleSection}
          selectedIncident={selectedIncident}
          siteEvidence={siteEvidence}
        />
      ) : (
        <ReportViewer
          audience={audience}
          error={error}
          generatedAt={generatedAt}
          incident={selectedIncident}
          isLoading={isGenerating}
          onNewReport={handleNewReport}
          sections={sections}
          siteEvidence={reportEvidence}
        />
      )}
    </div>
  )
}
