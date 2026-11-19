/**
 * 메모리 Map + sessionStorage 2단 캐시.
 * sessionStorage는 시크릿 창·차단·용량 초과 시 예외를 던질 수 있으므로 모두 try/catch로 감싼다.
 */
const MAX_STORE_CHARS = 400_000;

export class TwoLevelCache {
  private mem = new Map<string, unknown>();
  constructor(private prefix: string) {}

  get<T>(key: string): T | undefined {
    if (this.mem.has(key)) return this.mem.get(key) as T;
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (raw != null) {
        const value = JSON.parse(raw) as T;
        this.mem.set(key, value);
        return value;
      }
    } catch {
      /* sessionStorage 사용 불가 */
    }
    return undefined;
  }

  set(key: string, value: unknown): void {
    this.mem.set(key, value);
    try {
      const raw = JSON.stringify(value);
      if (raw.length <= MAX_STORE_CHARS) sessionStorage.setItem(this.prefix + key, raw);
    } catch {
      /* 용량 초과 등은 무시: 메모리 캐시만 사용 */
    }
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

export interface RunOptions {
  /** 낮은 우선순위: 사용자 동작(높음) 요청이 모두 끝난 뒤 실행 */
  low?: boolean;
  /** 실행 전에 취소되면 요청을 보내지 않고 AbortedError */
  signal?: AbortSignal;
  /** promote()로 찾기 위한 키 */
  key?: string;
}

interface QueueItem {
  task: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  low: boolean;
  signal?: AbortSignal;
  key?: string;
}

/**
 * 호출 사이 최소 간격을 보장하는 전역 직렬 대기열 (우선순위 2단계).
 */
export class Throttle {
  private q: QueueItem[] = [];
  private running = false;
  private last = 0;
  constructor(private gapMs: number) {}

  run<T>(task: () => Promise<T>, opts: RunOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new AbortedError());
      const item: QueueItem = {
        task,
        resolve: resolve as (v: unknown) => void,
        reject,
        low: !!opts.low,
        signal: opts.signal,
        key: opts.key,
      };
      this.insert(item);
      void this.pump();
    });
  }

  private insert(item: QueueItem) {
    if (item.low) this.q.push(item);
    else {
      const i = this.q.findIndex((x) => x.low);
      if (i === -1) this.q.push(item);
      else this.q.splice(i, 0, item);
    }
  }

  /** 대기 중인 낮은 우선순위 요청을 사용자 요청으로 올린다 (취소 대상에서도 제외) */
  promote(key: string) {
    const i = this.q.findIndex((x) => x.key === key && x.low);
    if (i === -1) return;
    const [item] = this.q.splice(i, 1);
    item.low = false;
    item.signal = undefined;
    this.insert(item);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.q.length) {
        const wait = this.last + this.gapMs - Date.now();
        if (wait > 0) await sleep(wait);
        const item = this.q.shift();
        if (!item) break;
        if (item.signal?.aborted) {
          item.reject(new AbortedError());
          continue;
        }
        try {
          item.resolve(await item.task());
        } catch (e) {
          item.reject(e);
        } finally {
          this.last = Date.now();
        }
      }
    } finally {
      this.running = false;
    }
  }
}
