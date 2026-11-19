import { Throttle, TwoLevelCache, sleep, type RunOptions } from "../cache";

const BASE = "https://musicbrainz.org/ws/2";
/** MusicBrainz는 초당 1회 제한. 여유를 두고 1100ms 간격. */
const MIN_GAP_MS = 1100;
/** 503: 2초 → 4초 뒤 재시도 (실측 시 503이 연속 2회 나는 경우가 잦았음). 재시도도 전역 대기열을 지난다 */
const RETRY_DELAYS_MS = [2000, 4000];

const queue = new Throttle(MIN_GAP_MS);
const cache = new TwoLevelCache("mb:");
const inflight = new Map<string, Promise<unknown>>();
const lowInflight = new Set<string>();

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

/**
 * MusicBrainz GET. 전역 대기열(1100ms, 우선순위 2단계) + 503 재시도 + 2단 캐시.
 * opts.low: 추천 후보 수집처럼 배경 작업. 사용자 동작 요청이 먼저 나간다.
 */
export function mbGet<T>(path: string, params: Record<string, string> = {}, opts: RunOptions = {}): Promise<T> {
  const url = buildUrl(path, params);
  const cached = cache.get<T>(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) {
    if (!opts.low) {
      queue.promote(url);
      lowInflight.delete(url);
    }
    return pending as Promise<T>;
  }

  // 사용자 요청과 공유될 수 있으므로, 한 번 올려진 요청은 이후 재시도도 높은 우선순위
  if (opts.low) lowInflight.add(url);
  const fetchOnce = () =>
    queue.run(() => fetch(url, { headers: { Accept: "application/json" } }), {
      ...(lowInflight.has(url) ? opts : {}),
      key: url,
    });

  const p = (async () => {
    let res = await fetchOnce();
    for (let i = 0; res.status === 503 && i < RETRY_DELAYS_MS.length; i++) {
      await sleep(RETRY_DELAYS_MS[i]);
      res = await fetchOnce();
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
  p.finally(() => {
    inflight.delete(url);
    lowInflight.delete(url);
  }).catch(() => undefined);
  return p;
}
