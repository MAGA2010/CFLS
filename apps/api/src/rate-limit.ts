export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly windowMs: number;

  constructor(
    private readonly limit: number,
    windowMs = 60_000,
  ) {
    this.windowMs = windowMs;
  }

  hit(key: string, now = Date.now()): boolean {
    const threshold = now - this.windowMs;
    const entries = (this.buckets.get(key) ?? []).filter((time) => time > threshold);
    if (entries.length >= this.limit) {
      this.buckets.set(key, entries);
      return false;
    }
    entries.push(now);
    this.buckets.set(key, entries);
    return true;
  }

  reset(): void {
    this.buckets.clear();
  }
}
