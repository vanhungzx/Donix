declare module "m3u8stream" {
  import { Readable } from "stream";

  export interface M3u8Segment {
    num: number;
    size: number;
  }

  export interface M3u8StreamOptions {
    begin?: Date | number | string | false;
    chunkReadahead?: number;
    id?: number | string;
    liveBuffer?: number;
    parser?: "dash-mpd" | "m3u8";
    requestOptions?: Record<string, unknown>;
  }

  export interface M3u8Readable extends Readable {
    on(event: string, listener: (...args: unknown[]) => void): this;
    on(event: "progress", listener: (segment: M3u8Segment, totalSegments: number) => void): this;
  }

  export function parseTimestamp(value: Date | number | string): number;

  export default function m3u8stream(url: string, options?: M3u8StreamOptions): M3u8Readable;
}

declare module "miniget" {
  import { Readable } from "stream";

  export interface MinigetOptions {
    backoff?: {
      inc: number;
      max: number;
    };
    headers?: Record<string, string>;
    maxReconnects?: number;
    maxRetries?: number;
  }

  export interface MinigetStream extends Readable {
    destroy(error?: Error): void;
    end(): void;
  }

  export default function miniget(url: string, options?: MinigetOptions): MinigetStream;
}
