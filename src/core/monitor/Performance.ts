import os from "node:os";

export interface PerformanceMetrics {
  messagesProcessed: number;
  avgResponseTime: number;
  errors: number;
  lastError?: string | null;
  memory: number;
  uptime: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    messagesProcessed: 0,
    avgResponseTime: 0,
    errors: 0,
    lastError: null,
    memory: 0,
    uptime: 0,
  };

  trackMessage(startTime: number): void {
    const duration = Date.now() - startTime;
    const prevCount = this.metrics.messagesProcessed;
    this.metrics.messagesProcessed = prevCount + 1;
    // Simple EMA-like average to avoid overflow and keep it cheap
    if (prevCount === 0) {
      this.metrics.avgResponseTime = duration;
    } else {
      this.metrics.avgResponseTime =
        (this.metrics.avgResponseTime + duration) / 2;
    }
  }

  trackError(error: unknown): void {
    this.metrics.errors += 1;
    if (error) {
      if (error instanceof Error) {
        this.metrics.lastError = error.message;
      } else {
        this.metrics.lastError = String(error);
      }
    }
  }

  getStats(): PerformanceMetrics {
    const mem = process.memoryUsage();
    this.metrics.memory = mem.rss / 1024 / 1024;
    this.metrics.uptime = process.uptime();
    return {
      ...this.metrics,
      // normalize lastError to null if undefined
      lastError: this.metrics.lastError ?? null,
    };
  }

  getSystemInfo(): { loadAvg: number[]; cpus: number; platform: string } {
    return {
      loadAvg: os.loadavg(),
      cpus: os.cpus().length,
      platform: os.platform(),
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Expose globally for quick debugging / commands without re-importing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__performanceMonitor = performanceMonitor;
