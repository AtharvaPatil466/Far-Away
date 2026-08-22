import type { EscalationItem } from '../lib/mapTypes'

export const MOCK_ESCALATIONS: EscalationItem[] = [
  {
    id: 'ESC-001',
    trigger: 'MANDATORY_EVACUATION',
    zone: 'Zone 7 — Kendrapara Coast',
    priority: 'CRITICAL',
    memo: {
      situation:
        'River gauge at 94% danger level with 187mm rainfall in 48h. Inundation model projects Zone 7 flooding within 90 minutes at 92% confidence.',
      recommended:
        'Immediately issue mandatory evacuation order for 14,200 residents in Zone 7 low-lying areas.',
      riskIfYes:
        'Traffic congestion on NH-16 may slow evacuation; nearest shelter at 8.2km has 73% capacity.',
      riskIfNo:
        'Projected 2.1m inundation in 90 minutes places 14,200 residents at direct life risk.',
    },
    decisionEvidence: {
      source: 'demo',
      riskScore: 92,
      confidence: 92,
      recommendedAction: 'Issue mandatory evacuation order for 14,200 residents in Zone 7 low-lying areas.',
      authorityLevel: 'HUMAN APPROVAL REQUIRED',
      authorityRule: 'Mandatory evacuation > 10,000 residents',
      topFactors: [
        { label: 'River level', impact: '+31%' },
        { label: 'Rainfall', impact: '+24%' },
        { label: 'Low elevation', impact: '+18%' },
        { label: 'Vulnerable population', impact: '+11%' },
      ],
      riskIfApproved: 'Traffic congestion may slow evacuation; the nearest shelter is operating at 73% capacity.',
      riskIfRejected: 'Projected inundation places 14,200 residents at direct life risk within 90 minutes.',
      agentPath: ['Ingestion', 'Prediction', 'Cascade', 'Resource', 'Routing', 'Commander'],
    },
    createdAt: Date.now() - 60000,
    timeoutMs: 300000,
    status: 'PENDING',
  },
  {
    id: 'ESC-002',
    trigger: 'CROSS_STATE_RESOURCE',
    zone: 'Zone 3 — Jagatsinghpur District',
    priority: 'HIGH',
    memo: {
      situation:
        'All 12 ODRAF boats deployed. Zone 3 requires 4 additional rescue boats for 340 stranded residents across 6 villages.',
      recommended:
        'Request 4 NDRF boats from Andhra Pradesh standby pool via cross-state mutual aid protocol.',
      riskIfYes:
        'AP boats have 3-hour ETA; interim gap must be covered by helicopter sorties.',
      riskIfNo:
        '340 residents remain stranded with water levels rising at 12cm/hour.',
    },
    decisionEvidence: {
      source: 'demo',
      riskScore: 86,
      confidence: 87,
      recommendedAction: 'Request four NDRF boats from the Andhra Pradesh standby pool.',
      authorityLevel: 'HUMAN APPROVAL REQUIRED',
      authorityRule: 'Cross-state resource mobilisation',
      topFactors: [
        { label: 'ODRAF boats deployed', impact: '+29%' },
        { label: 'Stranded residents', impact: '+25%' },
        { label: 'Water rise rate', impact: '+19%' },
        { label: 'Village access loss', impact: '+13%' },
      ],
      riskIfApproved: 'The requested boats have a three-hour ETA; aerial coverage remains necessary in the interim.',
      riskIfRejected: '340 residents remain stranded while water levels continue to rise.',
      agentPath: ['Ingestion', 'Prediction', 'Cascade', 'Resource', 'Routing', 'Commander'],
    },
    createdAt: Date.now() - 120000,
    timeoutMs: 300000,
    status: 'PENDING',
  },
  {
    id: 'ESC-003',
    trigger: 'REQUISITION_INFRASTRUCTURE',
    zone: 'Zone 5 — Puri Urban',
    priority: 'HIGH',
    memo: {
      situation:
        'Government shelter capacity exhausted at 98%. 1,840 displaced persons require immediate shelter placement.',
      recommended:
        'Requisition Hotel Grand Puri (420 rooms) and DAV School (capacity 800) as temporary relief centres.',
      riskIfYes:
        'Compensation claims from hotel owner likely; school requires 6-hour setup before occupancy.',
      riskIfNo:
        '1,840 displaced persons have no shelter assignment with night temperatures dropping to 22°C.',
    },
    decisionEvidence: {
      source: 'demo',
      riskScore: 81,
      confidence: 84,
      recommendedAction: 'Requisition Hotel Grand Puri and DAV School as temporary relief centres.',
      authorityLevel: 'HUMAN APPROVAL REQUIRED',
      authorityRule: 'Emergency requisition of private infrastructure',
      topFactors: [
        { label: 'Shelter occupancy', impact: '+28%' },
        { label: 'Displaced population', impact: '+23%' },
        { label: 'Overnight exposure', impact: '+17%' },
        { label: 'Available room capacity', impact: '+12%' },
      ],
      riskIfApproved: 'Property compensation and a six-hour school setup period will need coordination.',
      riskIfRejected: '1,840 displaced people remain without an assigned shelter overnight.',
      agentPath: ['Ingestion', 'Prediction', 'Cascade', 'Resource', 'Routing', 'Commander'],
    },
    createdAt: Date.now() - 30000,
    timeoutMs: 300000,
    status: 'PENDING',
  },
  {
    id: 'ESC-004',
    trigger: 'STATE_OF_EMERGENCY',
    zone: 'Odisha — State Level',
    priority: 'CRITICAL',
    memo: {
      situation:
        'Cyclone Remal has made landfall. 4 districts affected, 38,000 residents at risk, central government NDRF activation threshold met.',
      recommended:
        'Declare State of Emergency under Disaster Management Act 2005 to unlock central government funding and NDRF battalions.',
      riskIfYes:
        'Declaration triggers mandatory media reporting and may cause public panic if not accompanied by clear communication.',
      riskIfNo:
        'Central government funding and additional NDRF battalions cannot be activated without formal emergency declaration.',
    },
    decisionEvidence: {
      source: 'demo',
      riskScore: 95,
      confidence: 91,
      recommendedAction: 'Declare a State of Emergency under the Disaster Management Act 2005.',
      authorityLevel: 'HUMAN APPROVAL REQUIRED',
      authorityRule: 'State of Emergency declaration — human authority only',
      topFactors: [
        { label: 'Districts affected', impact: '+30%' },
        { label: 'Residents at risk', impact: '+27%' },
        { label: 'Landfall confirmed', impact: '+21%' },
        { label: 'NDRF threshold met', impact: '+14%' },
      ],
      riskIfApproved: 'The declaration may cause public concern without coordinated public communication.',
      riskIfRejected: 'Central funding and additional NDRF battalions cannot be formally activated.',
      agentPath: ['Ingestion', 'Prediction', 'Cascade', 'Resource', 'Routing', 'Commander'],
    },
    createdAt: Date.now() - 180000,
    timeoutMs: Infinity,  // HUMAN_ONLY — never auto-executes
    status: 'PENDING',
  },
]
