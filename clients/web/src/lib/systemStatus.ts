/** Explicit runtime state used by command UI; values are never inferred optimistically. */
export type BackendState = 'live' | 'offline' | 'unknown'
export type DataSourceState = 'live' | 'simulation' | 'historical' | 'fallback'
export type AuditState = 'intact' | 'unknown'
export type AgentRuntimeState = 'online' | 'unknown'
export type FeedState = 'usgs-connected' | 'unknown'

export interface SystemStatusSnapshot {
  backend: BackendState
  dataSource: DataSourceState
  audit: AuditState
  agents: AgentRuntimeState
  feed: FeedState
}

export interface SourcedResult<T> {
  data: T
  source: 'live' | 'fallback' | 'unknown'
}
