/**
 * 메모리 Map + localStorage 2단 캐시 (7일 만료).
 * - 저장 형식: "<저장 시각 ms>|<JSON>" (시각만 빠르게 읽어 만료·오래된 순 삭제에 사용)
 * - 용량 초과 시 이 앱의 캐시 항목을 오래된 것부터 지우고 한 번 더 시도
 * - localStorage는 시크릿 창·차단·용량 초과 시 예외를 던질 수 있으므로 모두 try/catch. 실패하면 메모리 캐시만 사용
 */
const LS_PREFIX = "dbc:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 한 항목 최대 크기 (문자 수). 이보다 큰 응답은 메모리에만 둔다 */
const DEFAULT_MAX_CHARS = 150_000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storedAt(raw: string): number {
  const i = raw.indexOf("|");
  const t = i > 0 ? Number(raw.slice(0, i)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** 이 앱 캐시 키를 (저장 시각, 키)로 나열 */
function ownEntries(ls: Storage): Array<{ key: string; t: number }> {
  const out: Array<{ key: string; t: number }> = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key?.startsWith(LS_PREFIX)) continue;
    out.push({ key, t: storedAt(ls.getItem(key) ?? "") });
  }
  return out;
}

let swept = false;
/** 페이지당 한 번 만료 항목 정리 */
function sweepExpired(ls: Storage) {
  if (swept) return;
  swept = true;
  const now = Date.now();
  for (const e of ownEntries(ls)) if (now - e.t > TTL_MS) ls.removeItem(e.key);
}

/** 오래된 것부터 전체의 1/4 (최소 10개) 삭제. 지운 개수 반환 */
function evictOldest(ls: Storage): number {
  const list = ownEntries(ls).sort((a, b) => a.t - b.t);
  const n = Math.min(list.length, Math.max(10, Math.ceil(list.length / 4)));
  for (let i = 0; i < n; i++) ls.removeItem(list[i].key);
  return n;
}

export class TwoLevelCache {
  private mem = new Map<string, unknown>();
  constructor(
    private prefix: string,
    private maxChars = DEFAULT_MAX_CHARS,
  ) {}

  get<T>(key: string): T | undefined {
    if (this.mem.has(key)) return this.mem.get(key) as T;
    try {
      const ls = storage();
      if (!ls) return undefined;
      sweepExpired(ls);
      const k = LS_PREFIX + this.prefix + key;
      const raw = ls.getItem(k);
      if (raw == null) return undefined;
      if (Date.now() - storedAt(raw) > TTL_MS) {
        ls.removeItem(k);
        return undefined;
      }
      const value = JSON.parse(raw.slice(raw.indexOf("|") + 1)) as T;
      this.mem.set(key, value);
      return value;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    this.mem.set(key, value);
    try {
      const ls = storage();
      if (!ls) return;
      const json = JSON.stringify(value);
      if (json.length > this.maxChars) return;
      const k = LS_PREFIX + this.prefix + key;
      const raw = `${Date.now()}|${json}`;
      try {
        ls.setItem(k, raw);
      } catch {
        // 용량 초과: 오래된 것부터 지우고 한 번 더
        if (evictOldest(ls) > 0) ls.setItem(k, raw);
      }
    } catch {
      /* 저장 실패는 무시: 메모리 캐시만 사용 */
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
