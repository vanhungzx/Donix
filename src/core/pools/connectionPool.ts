import log from "../../utils/log";

interface PoolConfig {
  maxConnections: number;
  idleTimeout: number; 
  connectionTimeout: number; 
}

interface Connection {
  id: string;
  createdAt: number;
  lastUsed: number;
  inUse: boolean;
}

class ConnectionPool {
  private config: PoolConfig = {
    maxConnections: 10,
    idleTimeout: 30000, 
    connectionTimeout: 60000, 
  };

  private connections: Map<string, Connection> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<PoolConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  start(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, 10000); 

    if (typeof (this.cleanupTimer as any).unref === "function") {
      (this.cleanupTimer as any).unref();
    }

    log.info("Connection Pool đã được khởi động");
  }

  register(id: string): void {
    const now = Date.now();
    this.connections.set(id, {
      id,
      createdAt: now,
      lastUsed: now,
      inUse: false,
    });
  }

  acquire(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) {
      this.register(id);
      return true;
    }

    if (conn.inUse) {
      return false; 
    }

    conn.inUse = true;
    conn.lastUsed = Date.now();
    return true;
  }

  release(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
    }
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, conn] of this.connections.entries()) {
      
      if (
        !conn.inUse &&
        now - conn.lastUsed > this.config.idleTimeout
      ) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.connections.delete(id);
    }

    if (toRemove.length > 0) {
      log.info(`Đã cleanup ${toRemove.length} idle connections`);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getActiveConnectionCount(): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.inUse) count++;
    }
    return count;
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.connections.clear();
    log.info("Connection Pool đã dừng");
  }
}

let connectionPoolInstance: ConnectionPool | null = null;

export function getConnectionPool(): ConnectionPool {
  if (!connectionPoolInstance) {
    connectionPoolInstance = new ConnectionPool();
  }
  return connectionPoolInstance;
}

export default ConnectionPool;
