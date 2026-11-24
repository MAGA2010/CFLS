export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly windowMs: number;
  private hitsSinceSweep = 0;

  constructor(
    private readonly limit: number,
    windowMs = 60_000,
  ) {
    this.windowMs = windowMs;
  }

  hit(key: string, now = Date.now()): boolean {
    this.hitsSinceSweep += 1;
    if (this.hitsSinceSweep >= 1000) {
      this.hitsSinceSweep = 0;
      this.sweep(now);
    }
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
    this.hitsSinceSweep = 0;
  }

  private sweep(now: number): void {
    const threshold = now - this.windowMs;
    for (const [key, entries] of this.buckets) {
      const active = entries.filter((time) => time > threshold);
      if (active.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, active);
    }
  }
}
