export function inquiryEnabledFor(mode: string, value?: string): boolean {
  return (mode === 'development' || mode === 'staging') && value === 'true'
}
