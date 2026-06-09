/** Shared visual tokens for the field app (dark, high-contrast for field use). */
export const colors = {
  bg: '#0b1f33',
  panel: '#13283f',
  border: '#244563',
  fg: '#e6edf3',
  muted: '#9fb3c8',
  accent: '#58a6ff',
  ok: '#3fb950',
  warn: '#d29922',
  crit: '#f85149',
  sat: '#a371f7', // Iridium / satellite
} as const;

/** Priority 1..5 -> colour (mirrors the commander dashboard convention). */
export function priorityColor(priority: number): string {
  if (priority <= 1) return colors.crit;
  if (priority === 2) return colors.warn;
  return colors.accent;
}
