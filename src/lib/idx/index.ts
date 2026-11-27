/**
 * 정적 색인(public/idx/v1) 로더.
 * - 조각 파일을 fetch하고 메모리에 캐시한다. 실패(404 포함)·깨진 응답은 null (호스팅이 없는 주소를 index.html로 돌려줘도 JSON 파싱에서 걸러진다)
 * - 주소에 ?noindex=1 이 있으면 색인을 건너뛴다 (비교용). 한 번 정해지면 페이지를 다시 열 때까지 유지
 * - 형식: p/{인물ID 앞 2글자}.json → {인물ID: {n, d?, w: [[작품ID, 역할코드]]}}
 *         w/{작품ID 앞 3글자}.json → {작품ID: {t, c: [[인물ID, 역할코드]], r: {id, t, a, i, y}}}
 */
const BASE = "/idx/v1";

export interface IdxPerson {
  n: string;
  /** 구분 설명 (MusicBrainz disambiguation) */
  d?: string;
  /** [작품 ID, 역할 코드] — C 작곡, L 작사, W 작사·작곡, A 편곡, O 그 밖 */
  w: Array<[string, string]>;
}

/** 작품의 대표 녹음 */
export interface IdxRep {
  id: string;
  t: string;
  a: string;
  /** ISRC */
  i?: string;
  y?: number;
}

export interface IdxWork {
  t: string;
  c: Array<[string, string]>;
  r?: IdxRep;
}

/** 받은 조각 파일 통계 (비교용) */
export const idxStats = { files: 0, bytes: 0, failed: 0 };

let enabled: boolean | null = null;

export function idxEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("noindex") !== "1";
    } catch {
      enabled = false;
    }
    if (typeof window !== "undefined") console.info(`[idx] ${enabled ? "index on" : "index skipped (?noindex=1)"}`);
  }
  return enabled;
}

const shards = new Map<string, Promise<Record<string, unknown> | null>>();

function loadShard(path: string): Promise<Record<string, unknown> | null> {
  let p = shards.get(path);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${BASE}/${path}.json`);
        if (!res.ok) {
          idxStats.failed++;
          return null;
        }
        const text = await res.text();
        const json = JSON.parse(text) as unknown;
        if (!json || typeof json !== "object" || Array.isArray(json)) {
          idxStats.failed++;
          return null;
        }
        idxStats.files++;
        idxStats.bytes += text.length; // 대략값(문자 수). 정확한 전송 용량은 개발자 도구 Network에서 확인
        console.debug(`[idx] shard ${path} (${(text.length / 1024).toFixed(0)}KB)`);
        return json as Record<string, unknown>;
      } catch {
        idxStats.failed++;
        return null;
      }
    })();
    shards.set(path, p);
  }
  return p;
}

export async function getIdxPerson(personId: string): Promise<IdxPerson | null> {
  if (!idxEnabled() || personId.length < 2) return null;
  const s = await loadShard(`p/${personId.slice(0, 2)}`);
  return (s?.[personId] as IdxPerson | undefined) ?? null;
}

export async function getIdxWork(workId: string): Promise<IdxWork | null> {
  if (!idxEnabled() || workId.length < 3) return null;
  const s = await loadShard(`w/${workId.slice(0, 3)}`);
  return (s?.[workId] as IdxWork | undefined) ?? null;
}

/** [traditional], Various Artists 등 사람이 아닌 특수 항목 */
export function isSpecialPurpose(p: IdxPerson | null): boolean {
  return !!p && p.d?.trim().toLowerCase() === "special purpose artist";
}

/** 색인 역할 코드 → 화면 역할 이름 (API 경로의 역할 이름과 같게). W는 작곡·작사 어느 쪽으로 찾아도 맞도록 셋 모두 */
export const IDX_ROLES: Record<string, string[]> = {
  C: ["작곡"],
  L: ["작사"],
  W: ["작곡", "작사", "작사·작곡"],
  A: ["편곡"],
};
