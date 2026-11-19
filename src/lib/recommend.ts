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
 * 후보: 지금 곡의 크레딧 인물 최대 4명에서 돌아가며 1곡씩 (work면 대표 recording 1개), 같은 제목은 하나만.
 * 처음에는 8곡만 모으고, "더 보기"마다 8곡씩 추가한다.
 */

export const MAX_PEOPLE = 4;
export const BATCH = 8;
/** 인물 1명당 후보 대기열 길이 (같은 역할 곡 + 나머지) */
const QUEUE_SAME_ROLE = 16;
const QUEUE_OTHER = 8;

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
  /** 이번 묶음까지의 목표 후보 수 */
  target: number;
  /** 지금 묶음 수집이 끝났는지 */
  finished: boolean;
  /** 더 모을 후보가 없음 */
  exhausted: boolean;
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

/** 인물의 후보 대기열: 지금 곡과 같은 역할로 참여한 곡을 먼저(목록 전체에서 고르게), 그다음 나머지 */
function candidateQueue(items: PersonItem[], via: Via, currentTitle: string): PersonItem[] {
  const fresh = items.filter((it) => normalizeTitle(it.title) !== currentTitle);
  const sameRole = fresh.filter((it) => it.roles.includes(via.role));
  const rest = fresh.filter((it) => !it.roles.includes(via.role));
  return [...spread(sameRole, QUEUE_SAME_ROLE), ...spread(rest, QUEUE_OTHER)];
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

interface PersonState {
  via: Via;
  /** undefined: 아직 안 불러옴 */
  queue?: PersonItem[];
  exhausted: boolean;
}

/**
 * 추천 후보 수집기. more()를 부를 때마다 BATCH곡씩 더 모으고 onUpdate로 알린다.
 * MusicBrainz 요청은 낮은 우선순위로 보내고 signal로 취소한다.
 * 재시도(2초·4초) 뒤에도 실패한 후보·인물은 건너뛰고 나머지로 채운다.
 */
export class RecCollector {
  private people: PersonState[];
  private items: Recommendation[] = [];
  private byTitle = new Map<string, Recommendation>();
  private seen: Set<string>;
  private ptr = 0;
  private order = 0;
  private target = 0;
  private busy = false;
  private exhausted = false;
  private audioOk = false;
  private audioFailed = 0;
  private opts: { low: true; signal: AbortSignal };

  constructor(
    private d: RecordingDetail,
    private onUpdate: (p: RecProgress) => void,
    private signal: AbortSignal,
  ) {
    this.people = pickPeople(d.credits).map((via) => ({ via, exhausted: false }));
    this.seen = new Set([normalizeTitle(d.title)]);
    this.opts = { low: true, signal };
    this.exhausted = this.people.length === 0;
  }

  get isBusy() {
    return this.busy;
  }

  private emit() {
    if (this.signal.aborted) return;
    this.onUpdate({
      items: this.items.map((r) => ({ ...r, via: [...r.via] })),
      target: this.target,
      finished: !this.busy,
      exhausted: this.exhausted,
      audioUnavailable: !this.audioOk && this.audioFailed > 0,
    });
  }

  private loadAudio(r: Recommendation, jobs: Promise<void>[]) {
    if (!r.isrc) {
      r.features = null;
      return;
    }
    jobs.push(
      getFeatures(r.isrc).then(
        (f) => {
          r.features = f;
          if (f) this.audioOk = true;
          this.emit();
        },
        () => {
          r.features = null;
          this.audioFailed++;
          this.emit();
        },
      ),
    );
  }

  /** 인물 한 명에서 새 후보 1곡을 찾는다. 찾으면 true */
  private async takeOne(p: PersonState, jobs: Promise<void>[]): Promise<boolean> {
    if (!p.queue) {
      try {
        p.queue = candidateQueue(
          (await getArtistCredits(p.via.personId, this.opts)).items,
          p.via,
          normalizeTitle(this.d.title),
        );
      } catch (e) {
        if (e instanceof AbortedError || this.signal.aborted) throw new AbortedError();
        p.exhausted = true; // 이 인물은 건너뜀
        return false;
      }
    }
    while (p.queue.length) {
      const it = p.queue.shift()!;
      const key = normalizeTitle(it.title);
      // 이미 다른 인물로 수집된 같은 제목이면 근거만 추가
      const existing = this.byTitle.get(key);
      if (existing) {
        if (!existing.via.some((v) => v.personId === p.via.personId)) {
          existing.via.push(p.via);
          this.emit();
        }
        continue;
      }
      if (this.seen.has(key)) continue;
      let rec;
      try {
        rec =
          it.kind === "work"
            ? await resolveWorkToRecording(it.id, this.opts)
            : await getRecordingLite(it.id, this.opts);
      } catch (e) {
        if (e instanceof AbortedError || this.signal.aborted) throw new AbortedError();
        continue; // 실패한 후보는 건너뜀
      }
      if (!rec || rec.id === this.d.id) continue;
      const rkey = normalizeTitle(rec.title) || key;
      if (this.seen.has(rkey)) continue;
      this.seen.add(rkey);
      this.seen.add(key);
      const r: Recommendation = {
        id: rec.id,
        title: rec.title,
        artist: rec.artist,
        isrc: rec.isrcs[0],
        via: [p.via],
        order: this.order++,
      };
      this.items.push(r);
      this.byTitle.set(key, r);
      this.loadAudio(r, jobs);
      this.emit();
      return true;
    }
    p.exhausted = true;
    return false;
  }

  /** BATCH곡 더 모은다. 인물들을 돌아가며 1곡씩 */
  async more(n = BATCH): Promise<void> {
    if (this.busy || this.exhausted || this.signal.aborted) return;
    this.busy = true;
    this.target = this.items.length + n;
    this.emit();
    const jobs: Promise<void>[] = [];
    try {
      while (this.items.length < this.target) {
        const live = this.people.filter((p) => !p.exhausted);
        if (!live.length) {
          this.exhausted = true;
          break;
        }
        const p = this.people[this.ptr++ % this.people.length];
        if (p.exhausted) continue;
        await this.takeOne(p, jobs);
      }
      if (this.people.every((p) => p.exhausted)) this.exhausted = true;
      await Promise.all(jobs);
    } catch (e) {
      if (!(e instanceof AbortedError)) throw e;
      return;
    } finally {
      this.busy = false;
      this.emit();
    }
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
