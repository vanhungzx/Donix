import { IncomingMessage } from 'http';
import WebSocket, { ServerOptions, WebSocketServer } from 'ws';
import WebSocketStream, { SocketLike, WebSocketStreamOptions, WebSocketStreamType } from './stream';

type StreamServerOptions = ServerOptions & WebSocketStreamOptions;

type StreamCallback = (stream: WebSocketStreamType, request: IncomingMessage) => void;

export class Server extends WebSocketServer {
  constructor(opts?: StreamServerOptions, cb?: StreamCallback) {
    super(opts);
    let proxied = false;

    this.on('newListener', (event: string) => {
      if (!proxied && event === 'stream') {
        proxied = true;
        this.on('connection', (conn: WebSocket, req: IncomingMessage) => {
          const socket = conn as SocketLike;
          const stream = WebSocketStream(socket, opts);
          this.emit('stream', stream, req);
        });
      }
    });

    if (cb) {
      this.on('stream', cb);
    }
  }
}

export function createServer(opts?: StreamServerOptions, cb?: StreamCallback): Server {
  return new Server(opts, cb);
}
