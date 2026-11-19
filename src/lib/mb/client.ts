import { Throttle, TwoLevelCache, sleep } from "../cache";

const BASE = "https://musicbrainz.org/ws/2";
/** MusicBrainz는 초당 1회 제한. 여유를 두고 1100ms 간격. */
const MIN_GAP_MS = 1100;
const RETRY_DELAYS_MS = [2000, 4000];

const queue = new Throttle(MIN_GAP_MS);
const cache = new TwoLevelCache("mb:");
const inflight = new Map<string, Promise<unknown>>();

export class MbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function buildUrl(path: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({ ...params, fmt: "json" });
  return `${BASE}/${path}?${sp.toString()}`;
}

async function fetchOnce(url: string): Promise<Response> {
  return queue.run(() => fetch(url, { headers: { Accept: "application/json" } }));
}

/**
 * MusicBrainz GET. 전역 대기열(1100ms) + 503 시 2초 뒤 1회 재시도 + 2단 캐시.
 */
export function mbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = buildUrl(path, params);
  const cached = cache.get<T>(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    let res = await fetchOnce(url);
    // 503: 2초 → 4초 뒤 재시도 (실측 시 503이 연속 2회 나는 경우가 잦았음). 재시도도 전역 대기열을 지난다
    for (let i = 0; res.status === 503 && i < RETRY_DELAYS_MS.length; i++) {
      await sleep(RETRY_DELAYS_MS[i]);
      res = await fetchOnce(url);
    }
    if (!res.ok) {
      throw new MbError(
        res.status === 503
          ? "MusicBrainz 서버가 바쁩니다. 잠시 뒤 다시 시도해 주세요."
          : `MusicBrainz 요청 실패 (${res.status})`,
        res.status,
      );
    }
    const json = (await res.json()) as T;
    cache.set(url, json);
    return json;
  })();

  inflight.set(url, p);
  p.finally(() => inflight.delete(url)).catch(() => undefined);
  return p;
}
