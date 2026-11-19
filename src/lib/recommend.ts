import { AbortedError } from "./cache";
import { getFeatures, sharedTraits, similarity, type AudioFeatures } from "./audio";
import {
  getArtistCredits,
  getRecordingLite,
  isCoreRole,
  normalizeTitle,
  resolveWorkToRecording,
  type PersonCredit,
  type PersonItem,
  type RecordingDetail,
} from "./mb/api";

/**
 * 같은 사람 × 소리 유사도 추천.
 * 후보: 지금 곡의 크레딧 인물 최대 4명 × 1명당 최대 5곡 (work면 대표 recording 1개), 같은 제목은 하나만.
 */

export const MAX_PEOPLE = 4;
export const PER_PERSON = 5;

export interface Via {
  personId: string;
  name: string;
  /** 지금 곡에서 이 인물의 대표 역할 (예: 작곡) */
  role: string;
}

export interface Recommendation {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
  via: Via[];
  /** 수집 순서 (크레딧 순 정렬용) */
  order: number;
  /** undefined: 아직 확인 중, null: 소리 데이터 없음 */
  features?: AudioFeatures | null;
  similarity?: number;
  traits?: string[];
}

export interface RecProgress {
  items: Recommendation[];
  /** 수집한 후보 수 / 최대 후보 수 */
  done: number;
  max: number;
  finished: boolean;
  /** 소리 데이터를 아예 가져오지 못함 (ReccoBeats 실패) */
  audioUnavailable: boolean;
}

const ROLE_NOUN: Record<string, string> = {
  작곡: "작곡가",
  작사: "작사가",
  "작사·작곡": "작사·작곡가",
  편곡: "편곡가",
  프로듀서: "프로듀서",
};

export function roleNoun(role: string): string {
  return ROLE_NOUN[role] ?? "참여자";
}

/** 추천에 쓸 인물: 핵심 역할(작곡·작사·편곡·프로듀서) 참여자 우선, 최대 4명 */
export function pickPeople(credits: PersonCredit[]): Via[] {
  const core = credits.filter((c) => c.roles.some(isCoreRole));
  const pool = core.length ? core : credits;
  return pool.slice(0, MAX_PEOPLE).map((c) => ({
    personId: c.artist.id,
    name: c.artist.name,
    role: c.roles.find(isCoreRole) ?? c.roles[0],
  }));
}

/** 목록 전체에서 고르게 n개 (가나다순 앞쪽에만 몰리지 않도록) */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

function chooseItems(items: PersonItem[], via: Via, skip: Set<string>): PersonItem[] {
  const fresh = items.filter((it) => !skip.has(normalizeTitle(it.title)));
  // 지금 곡과 같은 역할로 참여한 곡을 먼저, 모자라면 나머지에서
  const sameRole = fresh.filter((it) => it.roles.includes(via.role));
  const picked = spread(sameRole, PER_PERSON + 2);
  if (picked.length < PER_PERSON + 2) {
    const rest = fresh.filter((it) => !sameRole.includes(it));
    picked.push(...spread(rest, PER_PERSON + 2 - picked.length));
  }
  return picked;
}

export function rankRecommendations(items: Recommendation[]): Recommendation[] {
  return [...items].sort((a, b) => {
    const sa = a.similarity;
    const sb = b.similarity;
    if (sa != null && sb != null) return sb - sa || a.order - b.order;
    if (sa != null) return -1;
    if (sb != null) return 1;
    return a.order - b.order;
  });
}

/** 기준 곡 소리 특성으로 유사도·공통 특성을 붙이고 정렬 */
export function scoreAndRank(items: Recommendation[], base: AudioFeatures | null | undefined): Recommendation[] {
  return rankRecommendations(
    items.map((r) =>
      base && r.features
        ? { ...r, similarity: similarity(base, r.features), traits: sharedTraits(base, r.features) }
        : { ...r, similarity: undefined, traits: undefined },
    ),
  );
}

/**
 * 후보를 수집하는 대로 onUpdate로 알린다. MusicBrainz 요청은 낮은 우선순위로 보내고 signal로 취소한다.
 */
export async function collectRecommendations(
  d: RecordingDetail,
  onUpdate: (p: RecProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const people = pickPeople(d.credits);
  const max = people.length * PER_PERSON;
  const items: Recommendation[] = [];
  const byTitle = new Map<string, Recommendation>();
  const seen = new Set<string>([normalizeTitle(d.title)]);
  let done = 0;
  let order = 0;
  let audioOk = false;
  let audioFailed = 0;
  const opts = { low: true, signal };

  const emit = (finished = false) => {
    if (signal.aborted) return;
    onUpdate({
      items: items.map((r) => ({ ...r, via: [...r.via] })),
      done,
      max,
      finished,
      audioUnavailable: !audioOk && audioFailed > 0,
    });
  };
  emit();

  const audioJobs: Promise<void>[] = [];
  const loadAudio = (r: Recommendation) => {
    if (!r.isrc) {
      r.features = null;
      return;
    }
    audioJobs.push(
      getFeatures(r.isrc).then(
        (f) => {
          r.features = f;
          if (f) audioOk = true;
          emit();
        },
        () => {
          r.features = null;
          audioFailed++;
          emit();
        },
      ),
    );
  };

  try {
    for (const via of people) {
      let credits;
      try {
        credits = await getArtistCredits(via.personId, opts);
      } catch (e) {
        if (e instanceof AbortedError || signal.aborted) return;
        continue; // 이 인물은 건너뜀
      }
      const candidates = chooseItems(credits.items, via, seen);
      let got = 0;
      for (const it of candidates) {
        if (got >= PER_PERSON) break;
        if (signal.aborted) return;
        // 이미 다른 인물로 수집된 같은 제목이면 근거만 추가
        const key = normalizeTitle(it.title);
        const existing = byTitle.get(key);
        if (existing) {
          if (!existing.via.some((v) => v.personId === via.personId)) {
            existing.via.push(via);
            emit();
          }
          continue;
        }
        let rec;
        try {
          rec =
            it.kind === "work"
              ? await resolveWorkToRecording(it.id, opts)
              : await getRecordingLite(it.id, opts);
        } catch (e) {
          if (e instanceof AbortedError || signal.aborted) return;
          rec = undefined;
        }
        if (!rec || rec.id === d.id) continue;
        const rkey = normalizeTitle(rec.title) || key;
        if (seen.has(rkey) || seen.has(key)) continue;
        seen.add(rkey);
        seen.add(key);
        const r: Recommendation = {
          id: rec.id,
          title: rec.title,
          artist: rec.artist,
          isrc: rec.isrcs[0],
          via: [via],
          order: order++,
        };
        items.push(r);
        byTitle.set(key, r);
        got++;
        done++;
        loadAudio(r);
        emit();
      }
    }
    await Promise.all(audioJobs);
  } finally {
    emit(true);
  }
}

/** 근거 문구: "같은 작곡가 Kenzie · 소리 유사도 0.92 · 둘 다 에너지 높음" */
export function reasonText(r: Recommendation): string[] {
  const parts: string[] = [];
  // 역할별로 이름 묶기
  const byRole = new Map<string, string[]>();
  for (const v of r.via) {
    const k = roleNoun(v.role);
    byRole.set(k, [...(byRole.get(k) ?? []), v.name]);
  }
  for (const [noun, names] of byRole) parts.push(`같은 ${noun} ${names.join("·")}`);
  if (r.similarity != null) parts.push(`소리 유사도 ${r.similarity.toFixed(2)}`);
  if (r.traits?.length) parts.push(r.traits[0]);
  return parts;
}
