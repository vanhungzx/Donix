import log from "../../utils/log";

interface ThreadTask {
  threadID: string;
  task: () => Promise<void>;
  priority: number;
  timestamp: number;
}

interface ThreadPoolConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  defaultPriority: number;
}

class ThreadPool {
  private config: ThreadPoolConfig = {
    maxConcurrent: 10, 
    maxQueueSize: 1000, 
    defaultPriority: 0,
  };

  private queue: ThreadTask[] = [];
  private running: Set<string> = new Set();
  private processing: boolean = false;

  constructor(config?: Partial<ThreadPoolConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  enqueue(threadID: string, task: () => Promise<void>, priority?: number): boolean {
    
    if (this.queue.length >= this.config.maxQueueSize) {
      log.warn(`Thread pool queue đầy (${this.config.maxQueueSize}), bỏ qua task cho thread ${threadID}`);
      return false;
    }

    if (this.running.has(threadID)) {
      
      priority = (priority || this.config.defaultPriority) - 1;
    }

    const threadTask: ThreadTask = {
      threadID,
      task,
      priority: priority ?? this.config.defaultPriority,
      timestamp: Date.now(),
    };

    this.queue.push(threadTask);
    this.queue.sort((a, b) => b.priority - a.priority);

    if (!this.processing) {
      this.process();
    }

    return true;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.running.size < this.config.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      if (this.running.has(task.threadID)) {
        
        this.queue.push(task);
        this.queue.sort((a, b) => b.priority - a.priority);
        
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      this.running.add(task.threadID);

      (async () => {
        try {
          await task.task();
        } catch (error: any) {
          log.error(`Lỗi khi xử lý task cho thread ${task.threadID}: ${error.message}`);
        } finally {
          
          this.running.delete(task.threadID);
          
          if (this.queue.length > 0) {
            setImmediate(() => this.process());
          } else {
            this.processing = false;
          }
        }
      })();
    }

    if (this.queue.length === 0) {
      this.processing = false;
    }
  }

  isProcessing(threadID: string): boolean {
    return this.running.has(threadID);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  clearThread(threadID: string): void {
    this.queue = this.queue.filter((task) => task.threadID !== threadID);
  }

  stop(): void {
    this.queue = [];
    this.running.clear();
    this.processing = false;
    log.info("Thread Pool đã dừng");
  }
}

let threadPoolInstance: ThreadPool | null = null;

export function getThreadPool(): ThreadPool {
  if (!threadPoolInstance) {
    threadPoolInstance = new ThreadPool();
  }
  return threadPoolInstance;
}

export default ThreadPool;
