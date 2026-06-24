import log from "../../utils/log";
import { getCleanupManager } from "./cleanupManager";

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

interface MemoryConfig {
  maxHeapMB: number;
  gcInterval: number;
  warningThreshold: number;
  cleanupInterval: number;
}

class MemoryManager {
  private config: MemoryConfig = {
    // Giới hạn heap thấp hơn một chút để chủ động dọn dẹp sớm hơn
    maxHeapMB: 320,
    // Không dùng gcInterval định kỳ, chỉ giữ lại để tương thích cấu trúc
    gcInterval: 60 * 1000,
    // Cảnh báo khi tỷ lệ sử dụng heap cao hơn ngưỡng (chưa dùng tới, giữ để mở rộng sau)
    warningThreshold: 60,
    // Tăng tần suất monitoring/cleanup nhẹ
    cleanupInterval: 45 * 1000,
  };

  private gcTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private statsHistory: MemoryStats[] = [];
  private maxHistorySize = 10; // Giảm từ 20 xuống 10 để tiết kiệm bộ nhớ
  private unregisterCleanup: (() => void) | null = null;
  private lastRssGcAt: number | null = null;

  constructor(config?: Partial<MemoryConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  start(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);

    if (typeof (this.cleanupTimer as any).unref === "function") {
      (this.cleanupTimer as any).unref();
    }

    // Đăng ký cleanup timer vào cleanup manager
    const cleanupManager = getCleanupManager();
    this.unregisterCleanup = cleanupManager.registerTimer(
      "memory-manager-cleanup",
      this.cleanupTimer,
      10 // Priority cao vì memory manager quan trọng
    );

    log.info("Memory Manager đã được khởi động (monitoring only, no periodic GC)");
  }

  private performCleanup(): void {
    const stats = this.getMemoryUsage();
    this.recordStats(stats);

    if (this.statsHistory.length > this.maxHistorySize) {
      this.statsHistory = this.statsHistory.slice(-this.maxHistorySize);
    }

    const heapMB = (stats.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (stats.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (stats.rss / 1024 / 1024).toFixed(1);
    const usagePercent = ((stats.heapUsed / stats.heapTotal) * 100).toFixed(1);

    log.info(
      `[Memory] Heap: ${heapMB}MB / ${heapTotalMB}MB (${usagePercent}%) | RSS: ${rssMB}MB`
    );

    this.checkMemoryWarning(stats);
  }

  private checkMemoryWarning(stats: MemoryStats): void {
    const usagePercent = (stats.heapUsed / stats.heapTotal) * 100;
    const heapMB = stats.heapUsed / 1024 / 1024;
    const rssMB = stats.rss / 1024 / 1024;

    // Khi RSS cao nhưng heap không cao, vẫn thử GC nhẹ để tự phục hồi lâu dài.
    // Có cooldown để tránh spam GC khi RSS ổn định.
    if (rssMB > 280 && typeof global.gc === "function") {
      const now = Date.now();
      const last = this.lastRssGcAt || 0;
      if (now - last > 60_000) {
        this.lastRssGcAt = now;
        try {
          const beforeHeap = heapMB;
          const beforeRss = rssMB;
          global.gc();
          setTimeout(() => {
            const afterStats = this.getMemoryUsage();
            const afterHeap = afterStats.heapUsed / 1024 / 1024;
            const afterRss = afterStats.rss / 1024 / 1024;
            const heapFreed = beforeHeap - afterHeap;
            const rssFreed = beforeRss - afterRss;
            log.warn(
              `[Memory] RSS GC - Heap: ${beforeHeap.toFixed(2)}MB → ${afterHeap.toFixed(2)}MB (−${heapFreed.toFixed(2)}MB) | RSS: ${beforeRss.toFixed(1)}MB → ${afterRss.toFixed(1)}MB (−${rssFreed.toFixed(1)}MB)`
            );
          }, 50);
        } catch {
          // ignore GC errors
        }
      }
    }

    // Chỉ GC khi heap > 130MB (chủ động hơn một chút để tránh tăng RSS đột biến)
    if (heapMB > 130) {
      log.warn(
        `Heap usage cao: ${heapMB.toFixed(2)}MB (${usagePercent.toFixed(1)}%)`
      );

      // Tự động chạy GC khi heap > 150MB
      if (typeof global.gc === "function") {
        try {
          const beforeHeap = stats.heapUsed / 1024 / 1024;
          const beforeRSS = stats.rss / 1024 / 1024;

          global.gc();

          // Đợi một chút để GC hoàn tất
          setTimeout(() => {
            const afterStats = this.getMemoryUsage();
            const afterHeap = afterStats.heapUsed / 1024 / 1024;
            const afterRSS = afterStats.rss / 1024 / 1024;
            const heapFreed = beforeHeap - afterHeap;
            const rssFreed = beforeRSS - afterRSS;

            log.info(
              `[Memory] GC hoàn tất - Heap: ${beforeHeap.toFixed(2)}MB → ${afterHeap.toFixed(2)}MB (giảm ${heapFreed.toFixed(2)}MB) | RSS: ${beforeRSS.toFixed(1)}MB → ${afterRSS.toFixed(1)}MB (giảm ${rssFreed.toFixed(1)}MB)`
            );
          }, 100);
        } catch (error) {
          // Ignore GC errors
        }
      }
    }

    // Cảnh báo RSS khi > 280MB và trigger cleanup tự động (realtime optimization)
    if (rssMB > 280) {
      log.warn(
        `RSS cao: ${rssMB.toFixed(1)}MB - Đang trigger cleanup tự động (các map onReact/onReply, processData, scheduler, v.v.)`
      );

      // Trigger cleanup ngay khi RSS cao (realtime optimization - không đợi interval)
      try {
        const cleanupTimer = (global as any).__autoCleanupTimer;
        if (cleanupTimer && typeof cleanupTimer.refresh === "function") {
          cleanupTimer.refresh();
        }
      } catch {
        // Ignore errors khi trigger cleanup
      }
    }

    if (heapMB >= this.config.maxHeapMB) {
      log.error(
        `Heap vượt quá giới hạn: ${heapMB.toFixed(2)}MB >= ${this.config.maxHeapMB}MB`
      );

      if (rssMB > 500 && global.gc) {
        const beforeHeap = stats.heapUsed / 1024 / 1024;
        const beforeRSS = stats.rss / 1024 / 1024;

        log.warn(`Emergency GC triggered due to high memory usage`);
        global.gc();

        setTimeout(() => {
          const afterStats = this.getMemoryUsage();
          const afterHeap = afterStats.heapUsed / 1024 / 1024;
          const afterRSS = afterStats.rss / 1024 / 1024;
          const heapFreed = beforeHeap - afterHeap;
          const rssFreed = beforeRSS - afterRSS;

          log.warn(
            `[Memory] Emergency GC hoàn tất - Heap: ${beforeHeap.toFixed(2)}MB → ${afterHeap.toFixed(2)}MB (giảm ${heapFreed.toFixed(2)}MB) | RSS: ${beforeRSS.toFixed(1)}MB → ${afterRSS.toFixed(1)}MB (giảm ${rssFreed.toFixed(1)}MB)`
          );
        }, 100);
      }
    }
  }

  getMemoryUsage(): MemoryStats {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      timestamp: Date.now(),
    };
  }

  private recordStats(stats: MemoryStats): void {
    // Tối ưu: chỉ giữ lại số lượng cần thiết
    if (this.statsHistory.length >= this.maxHistorySize) {
      this.statsHistory.shift(); // Xóa phần tử cũ nhất
    }
    this.statsHistory.push(stats);
  }

  getStatsHistory(): ReadonlyArray<MemoryStats> {
    return [...this.statsHistory];
  }

  forceCleanup(): void {
    this.performCleanup();

    const stats = this.getMemoryUsage();
    const rssMB = stats.rss / 1024 / 1024;
    if (rssMB > 500 && global.gc) {
      log.warn(`Emergency GC triggered in forceCleanup: RSS = ${rssMB.toFixed(1)}MB`);
      global.gc();
    }
  }

  stop(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Unregister khỏi cleanup manager
    if (this.unregisterCleanup) {
      this.unregisterCleanup();
      this.unregisterCleanup = null;
    }

    // Clear stats history để giải phóng memory
    this.statsHistory = [];
    this.statsHistory.length = 0; // Đảm bảo array được clear hoàn toàn

    log.info("Memory Manager đã dừng");
  }
}

let memoryManagerInstance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager();
  }
  return memoryManagerInstance;
}

export default MemoryManager;
