type WebSocketConstructorLike = new (...args: any[]) => any;

let wsConstructor: WebSocketConstructorLike | null = null;
const globalAny = globalThis as Record<string, any>;

if (typeof globalAny.WebSocket !== 'undefined') {
  wsConstructor = globalAny.WebSocket;
} else if (typeof globalAny.MozWebSocket !== 'undefined') {
  wsConstructor = globalAny.MozWebSocket;
} else if (typeof globalAny.window !== 'undefined') {
  wsConstructor = globalAny.window.WebSocket || globalAny.window.MozWebSocket || null;
}

export default wsConstructor;
