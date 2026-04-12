import duplexify, { Duplexify as DuplexifyStream } from 'duplexify';
import { Transform } from 'readable-stream';
import { Buffer } from 'safe-buffer';
import { TransformCallback } from 'stream';
import WebSocket, { ClientOptions, RawData } from 'ws';

export interface WebSocketStreamOptions extends Omit<ClientOptions, 'protocol'> {
  objectMode?: boolean;
  binary?: boolean;
  browserBufferSize?: number;
  browserBufferTimeout?: number;
  protocol?: string | string[];
}

type SocketWrite = (chunk: any, enc: BufferEncoding, next: TransformCallback) => void;
type SocketEnd = (next: TransformCallback) => void;

type MessageLike = {
  data: ArrayBuffer | Buffer | string | Uint8Array;
};

type BrowserSocket = {
  new(address: string, protocols?: string | string[]): SocketLike;
  prototype: SocketLike;
};

type SocketEventListener =
  | WebSocket['addEventListener']
  | ((event: string, listener: (...args: any[]) => void) => void);

export type SocketLike = (WebSocket & {
  addEventListener?: SocketEventListener;
  onopen?: ((...args: any[]) => void) | null;
  onclose?: ((...args: any[]) => void) | null;
  onerror?: ((...args: any[]) => void) | null;
  onmessage?: ((...args: any[]) => void) | null;
}) | (Omit<WebSocket, keyof WebSocket> & {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  send: (data: RawData | ArrayBuffer | string, cb?: (err?: Error) => void) => void;
  close: () => void;
  binaryType?: string;
  addEventListener?: SocketEventListener;
  onopen?: ((...args: any[]) => void) | null;
  onclose?: ((...args: any[]) => void) | null;
  onerror?: ((...args: any[]) => void) | null;
  onmessage?: ((...args: any[]) => void) | null;
});

export type WebSocketStreamType = (DuplexifyStream | Transform) & {
  socket: SocketLike;
  setReadable?: DuplexifyStream['setReadable'];
  setWritable?: DuplexifyStream['setWritable'];
  _writev?: (chunks: any[], cb: (error?: Error | null) => void) => void;
};

function buildProxy(
  options: WebSocketStreamOptions,
  socketWrite: SocketWrite,
  socketEnd: SocketEnd
): Transform {
  const proxy = new Transform({
    objectMode: options.objectMode
  });

  proxy._write = socketWrite;
  proxy._flush = socketEnd;

  return proxy;
}

export default function WebSocketStream(
  target: string | SocketLike,
  protocols?: string | string[] | WebSocketStreamOptions | null,
  options?: WebSocketStreamOptions
): WebSocketStreamType {
  let stream: WebSocketStreamType;
  let socket: SocketLike;

  const isBrowser = process.title === 'browser';
  const isNative = Boolean((globalThis as any).WebSocket);
  const socketWrite = isBrowser ? socketWriteBrowser : socketWriteNode;

  if (protocols && !Array.isArray(protocols) && typeof protocols === 'object') {
    options = protocols;
    protocols = null;

    if (typeof options.protocol === 'string' || Array.isArray(options.protocol)) {
      protocols = options.protocol;
    }
  }

  options = options || {};
  const wsOptions = options as ClientOptions;

  if (options.objectMode === undefined) {
    options.objectMode = !(options.binary === true || options.binary === undefined);
  }

  const proxy = buildProxy(options, socketWrite, socketEnd);

  if (!options.objectMode) {
    proxy._writev = writev;
  }

  const bufferSize = options.browserBufferSize || 1024 * 512;
  const bufferTimeout = options.browserBufferTimeout || 1000;

  if (typeof target === 'object' && target !== null) {
    socket = target as SocketLike;
  } else {
    if (isNative && isBrowser) {
      const NativeWebSocket = ((globalThis as any).WebSocket ||
        (globalThis as any).MozWebSocket) as BrowserSocket | undefined;
      if (!NativeWebSocket) {
        throw new Error('WebSocket constructor is not available in this environment.');
      }
      socket = new NativeWebSocket(target as string, protocols as string[] ?? undefined);
    } else {
      socket = new WebSocket(target as string, protocols as string[] ?? undefined, wsOptions);
    }

    socket.binaryType = 'arraybuffer';
  }

  const eventListenerSupport = typeof socket.addEventListener === 'function';

  if (socket.readyState === socket.OPEN) {
    stream = proxy as WebSocketStreamType;
  } else {
    stream = duplexify(undefined, undefined, options) as WebSocketStreamType;
    if (!options.objectMode) {
      stream._writev = writev;
    }

    if (eventListenerSupport) {
      socket.addEventListener?.('open', onopen);
    } else {
      socket.onopen = onopen;
    }
  }

  stream.socket = socket;

  if (eventListenerSupport) {
    socket.addEventListener?.('open', (event: WebSocket.Event) => onopen(event));
    socket.addEventListener?.('close', (event: WebSocket.CloseEvent) => onclose(event));
    socket.addEventListener?.('error', (event: WebSocket.ErrorEvent) => onerror(event));
    socket.addEventListener?.('message', (event: WebSocket.MessageEvent) => onmessage(event));
  } else {
    socket.onopen = onopen;
    socket.onclose = onclose;
    socket.onerror = onerror;
    socket.onmessage = onmessage;
  }

  proxy.on('close', destroy);

  const coerceToBuffer = !options.objectMode;

  function socketWriteNode(chunk: any, _enc: BufferEncoding, next: TransformCallback) {
    if (socket.readyState !== socket.OPEN) {
      // Stream is not open, silently ignore write
      next();
      return;
    }

    let payload = chunk;
    if (coerceToBuffer && typeof chunk === 'string') {
      payload = Buffer.from(chunk, 'utf8');
    }

    try {
      (socket as WebSocket).send(payload, (err?: Error) => {
        // Handle "write after end" and other stream errors gracefully
        if (err) {
          const errMsg = err.message || String(err);
          if (errMsg.includes('write after end') || errMsg.includes('not opened')) {
            // Stream is closed, silently ignore
            next();
          } else {
            next(err);
          }
        } else {
          next();
        }
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err || '');
      if (errMsg.includes('write after end') || errMsg.includes('not opened')) {
        // Stream is closed, silently ignore
        next();
      } else {
        next(err as Error);
      }
    }
  }

  function socketWriteBrowser(chunk: any, enc: BufferEncoding, next: TransformCallback) {
    if (socket.readyState !== socket.OPEN) {
      // Stream is not open, silently ignore write
      next();
      return;
    }

    if (socket.bufferedAmount > bufferSize) {
      setTimeout(socketWriteBrowser, bufferTimeout, chunk, enc, next);
      return;
    }

    let payload = chunk;

    if (coerceToBuffer && typeof chunk === 'string') {
      payload = Buffer.from(chunk, 'utf8');
    }

    try {
      (socket as any).send(payload);
    } catch (err: any) {
      const errMsg = err?.message || String(err || '');
      if (errMsg.includes('write after end') || errMsg.includes('not opened')) {
        // Stream is closed, silently ignore
        next();
      } else {
        next(err as Error);
      }
      return;
    }

    next();
  }

  function socketEnd(done: TransformCallback) {
    socket.close();
    done();
  }

  function onopen(_event?: WebSocket.Event) {
    stream.setReadable?.(proxy);
    stream.setWritable?.(proxy);
    stream.emit('connect');
  }

  function onclose(_event?: WebSocket.CloseEvent) {
    stream.end();
    stream.destroy();
  }

  function onerror(err: Error | WebSocket.ErrorEvent) {
    stream.destroy(normalizeError(err));
  }

  function onmessage(event: MessageLike | WebSocket.MessageEvent) {
    const rawData =
      typeof (event as MessageLike).data !== 'undefined' ? (event as MessageLike).data : (event as unknown);

    let data: Buffer;
    if (Array.isArray(rawData)) {
      data = Buffer.concat(rawData as Buffer[]);
    } else if (rawData instanceof ArrayBuffer) {
      data = Buffer.from(rawData);
    } else if (ArrayBuffer.isView(rawData)) {
      const view = rawData as ArrayBufferView;
      const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      data = Buffer.from(Array.from(uint8));
    } else if (Buffer.isBuffer(rawData)) {
      data = rawData as Buffer;
    } else {
      data = Buffer.from(String(rawData), 'utf8');
    }

    proxy.push(data);
  }

  function destroy() {
    socket.close();
  }

  function writev(this: Transform, chunks: Array<{ chunk: Buffer | string }>, cb: (error?: Error | null) => void) {
    const buffers = new Array<Buffer>(chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].chunk;
      buffers[i] = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    }

    (this as any)._write(Buffer.concat(buffers), 'binary', cb);
  }

  function normalizeError(err: Error | WebSocket.ErrorEvent): Error {
    if (err instanceof Error) {
      return err;
    }

    const errorEvent = err as WebSocket.ErrorEvent;
    if (errorEvent?.error instanceof Error) {
      return errorEvent.error;
    }

    if (typeof errorEvent?.message === 'string') {
      return new Error(errorEvent.message);
    }

    return new Error('WebSocket error');
  }

  return stream;
}
