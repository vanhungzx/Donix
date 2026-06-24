import log from "../../utils/log";

interface CleanupResource {
  id: string;
  cleanup: () => void | Promise<void>;
  priority: number; // Higher priority = cleanup first
}

class CleanupManager {
  private resources: Map<string, CleanupResource> = new Map();
  private isShuttingDown = false;
  private cleanupInProgress = false;

  /**
   * Đăng ký một resource cần cleanup khi shutdown
   */
  register(id: string, cleanup: () => void | Promise<void>, priority: number = 0): () => void {
    if (this.isShuttingDown) {
      log.warn(`Không thể đăng ký cleanup ${id} - đang shutdown`);
      return () => {};
    }

    this.resources.set(id, { id, cleanup, priority });

    // Trả về hàm để unregister
    return () => {
      this.resources.delete(id);
    };
  }

  /**
   * Đăng ký một timer (setInterval/setTimeout) để tự động cleanup
   */
  registerTimer(id: string, timer: NodeJS.Timeout | null, priority: number = 0): () => void {
    if (!timer) {
      return () => {};
    }

    return this.register(
      id,
      () => {
        if (timer) {
          if ('ref' in timer && typeof (timer as any).ref === 'function') {
            // Có thể là setInterval hoặc setTimeout
            clearInterval(timer as any);
            clearTimeout(timer as any);
          } else {
            clearInterval(timer as any);
            clearTimeout(timer as any);
          }
        }
      },
      priority
    );
  }

  /**
   * Đăng ký một event listener để tự động remove
   */
  registerEventListener(
    id: string,
    emitter: NodeJS.EventEmitter,
    event: string,
    listener: (...args: any[]) => void,
    priority: number = 0
  ): () => void {
    emitter.on(event, listener);

    return this.register(
      id,
      () => {
        emitter.removeListener(event, listener);
      },
      priority
    );
  }

  /**
   * Cleanup một resource cụ thể
   */
  async cleanupResource(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource) {
      return false;
    }

    try {
      await resource.cleanup();
      this.resources.delete(id);
      return true;
    } catch (error: any) {
      log.error(`Lỗi khi cleanup ${id}: ${error?.message || String(error)}`);
      return false;
    }
  }

  /**
   * Cleanup tất cả resources theo thứ tự priority
   */
  async cleanupAll(): Promise<void> {
    if (this.cleanupInProgress) {
      log.warn("Cleanup đã đang được thực hiện, bỏ qua...");
      return;
    }

    this.isShuttingDown = true;
    this.cleanupInProgress = true;

    log.info(`Bắt đầu cleanup ${this.resources.size} resources...`);

    // Sắp xếp theo priority (cao -> thấp)
    const sortedResources = Array.from(this.resources.values()).sort(
      (a, b) => b.priority - a.priority
    );

    let successCount = 0;
    let failCount = 0;

    for (const resource of sortedResources) {
      try {
        await resource.cleanup();
        successCount++;
      } catch (error: any) {
        log.error(`Lỗi cleanup ${resource.id}: ${error?.message || String(error)}`);
        failCount++;
      }
    }

    this.resources.clear();
    this.cleanupInProgress = false;

    log.info(
      `Cleanup hoàn tất: ${successCount} thành công, ${failCount} thất bại`
    );
  }

  /**
   * Lấy số lượng resources đang được quản lý
   */
  getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Kiểm tra xem có đang shutdown không
   */
  isShuttingDownNow(): boolean {
    return this.isShuttingDown;
  }
}

let cleanupManagerInstance: CleanupManager | null = null;

export function getCleanupManager(): CleanupManager {
  if (!cleanupManagerInstance) {
    cleanupManagerInstance = new CleanupManager();
  }
  return cleanupManagerInstance;
}

export default CleanupManager;
