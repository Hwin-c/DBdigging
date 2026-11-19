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

/**
 * 호출 사이 최소 간격을 보장하는 전역 직렬 대기열.
 */
export class Throttle {
  private tail: Promise<void> = Promise.resolve();
  private last = 0;
  constructor(private gapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.last = Date.now();
      }
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
