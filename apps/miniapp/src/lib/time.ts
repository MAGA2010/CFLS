const two = (part: number) => String(part).padStart(2, '0')

export function formatLocalTime(value?: string | null): string {
  if (!value) return '—'
  const local = new Date(value)
  if (!Number.isFinite(local.getTime())) return '—'
  return `${local.getFullYear()}-${two(local.getMonth() + 1)}-${two(local.getDate())} ${two(local.getHours())}:${two(local.getMinutes())}`
}
