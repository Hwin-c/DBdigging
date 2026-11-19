import { getFeatures, similarity, type AudioFeatures } from "./audio";
import { AbortedError } from "./cache";
import { isBackingTrack } from "./filters";
import {
  findIsrcFallback,
  getArtistCredits,
  getRecording,
  isCoreRole,
  lookupRecordings,
  normalizeTitle,
  resolveWorkToRecording,
  type BatchRecording,
  type PersonCredit,
  type PersonItem,
} from "./mb/api";
import { findPreview, type PreviewResult } from "./preview";

/* ───────────── 상수 ───────────── */

export const DECK = {
  /** 화면에 보일 카드 대기열 최소 장수 */
  QUEUE_MIN: 3,
  /** 대기열 뒤에 다양성 선택용으로 더 모아 둘 후보 수 */
  POOL_EXTRA: 3,
  /** 미리듣기 주소를 미리 받아 둘 앞쪽 카드 수 (모바일에서 스와이프 중 바로 재생하기 위함) */
  PREFETCH: 2,
  /** 시작 곡 크레딧에서 쓸 최대 인물 수 */
  MAX_PEOPLE: 6,
  /** 한 회차에 새로 읽을 인물 크레딧 수 */
  CREDITS_PER_ROUND: 1,
  /** 한 번에 인물 1명당 조회할 후보 수 */
  ROUND_PER_PERSON: 2,
  /** 인물 1명당 후보 대기열 길이 (같은 역할 곡 + 나머지) */
  PERSON_QUEUE_SAME_ROLE: 24,
  PERSON_QUEUE_OTHER: 12,
  /** 같은 가수는 연속 N장 안에 1곡까지 */
  ARTIST_WINDOW: 5,
  /** N장마다 1장은 '같은 사람, 다른 분위기' 카드 */
  CONTRAST_EVERY: 3,
  /** 이미 본 곡 기억 개수 */
  SEEN_MAX: 3000,
} as const;

export const SOUND = {
  /** energy·valence·danceability·acousticness 차이 기준 */
  DIFF: 0.15,
  /** tempo 상대 차이 기준 (15%) */
  TEMPO_RATIO: 0.15,
  MAX_PHRASES: 2,
  /** 유사도 3단계 경계 (1 − 유클리드 거리/3 기준) */
  SIM_VERY: 0.82,
  SIM_SIMILAR: 0.7,
} as const;

/* ───────────── 타입 ───────────── */

export interface Via {
  personId: string;
  name: string;
  /** 시작 곡에서의 역할 */
  originRole: string;
  /** 이 곡에서의 역할 */
  role: string;
}

export interface Origin {
  id: string;
  title: string;
  artist: string;
  credits: PersonCredit[];
  workIds: string[];
  isrc?: string;
  /** ISRC를 같은 작품의 다른 녹음에서 빌림 */
  isrcBorrowed: boolean;
  /** undefined: 확인 중, null: 없음 */
  features?: AudioFeatures | null;
}

export interface DeckCard {
  id: string;
  title: string;
  artist: string;
  primaryArtist: string;
  isrc?: string;
  releaseGroupId?: string;
  via: Via[];
  originId: string;
  originTitle: string;
  /** undefined: 확인 중, null: 없음 */
  features?: AudioFeatures | null;
  /** '같은 사람, 다른 분위기' 카드 */
  contrast?: boolean;
  /** undefined: 아직 안 찾음, null: 미리듣기 없음 */
  preview?: PreviewResult | null;
}

export interface DeckProgress {
  /** origin: 시작 곡 크레딧 읽는 중, collect: 후보 모으는 중 */
  phase: "idle" | "origin" | "collect" | "exhausted";
  done: number;
  total: number;
}

export interface DeckSnapshot {
  trail: Origin[];
  queue: DeckCard[];
  progress: DeckProgress;
  error: string | null;
}

/* ───────────── 이미 본 곡 (localStorage) ───────────── */

const SEEN_KEY = "dig:seen";

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveSeen(list: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-DECK.SEEN_MAX)));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function clearSeen() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* 무시 */
  }
}

/* ───────────── 소리 표시 ───────────── */

/** 시작 곡 대비 소리 차이 문구 (최대 2개). 기준값은 SOUND */
export function soundDiff(base: AudioFeatures, f: AudioFeatures): string[] {
  const dims: Array<{ d: number; up: string; down: string }> = [
    { d: f.energy - base.energy, up: "더 신나는", down: "더 잔잔한" },
    { d: f.valence - base.valence, up: "더 밝은", down: "더 어두운" },
    { d: f.danceability - base.danceability, up: "더 그루브한", down: "덜 그루브한" },
    { d: f.acousticness - base.acousticness, up: "더 어쿠스틱한", down: "더 전자적인" },
  ];
  const out = dims
    .filter((x) => Math.abs(x.d) >= SOUND.DIFF)
    .map((x) => ({ mag: Math.abs(x.d) / SOUND.DIFF, text: x.d > 0 ? x.up : x.down }));
  if (base.tempo > 0) {
    const r = (f.tempo - base.tempo) / base.tempo;
    if (Math.abs(r) >= SOUND.TEMPO_RATIO)
      out.push({ mag: Math.abs(r) / SOUND.TEMPO_RATIO, text: r > 0 ? "더 빠른" : "더 느린" });
  }
  return out
    .sort((a, b) => b.mag - a.mag)
    .slice(0, SOUND.MAX_PHRASES)
    .map((x) => x.text);
}

export type SimLevel = "매우 비슷" | "비슷" | "다른 분위기";

export function simLevel(base: AudioFeatures, f: AudioFeatures): SimLevel {
  const s = similarity(base, f);
  return s >= SOUND.SIM_VERY ? "매우 비슷" : s >= SOUND.SIM_SIMILAR ? "비슷" : "다른 분위기";
}

/** 이유 칩: "{인물} {역할} · 시작 곡과 같은 {역할}" */
export function reasonChip(v: Via): string {
  return v.role === v.originRole
    ? `${v.name} ${v.role} · 시작 곡과 같은 ${v.role}`
    : `${v.name} ${v.role} · 시작 곡에선 ${v.originRole}`;
}

export function coverUrl(c: { preview?: PreviewResult | null; releaseGroupId?: string }): string | undefined {
  if (c.releaseGroupId) return `https://coverartarchive.org/release-group/${c.releaseGroupId}/front-250`;
  return c.preview?.cover ?? undefined;
}

/* ───────────── 시작 곡 ───────────── */

export async function loadOrigin(id: string): Promise<Origin> {
  const d = await getRecording(id);
  let isrc = d.isrcs[0];
  let isrcBorrowed = false;
  if (!isrc) {
    try {
      const fb = await findIsrcFallback(d);
      if (fb) {
        isrc = fb.isrc;
        isrcBorrowed = true;
      }
    } catch {
      /* ISRC 없이 진행 */
    }
  }
  return {
    id,
    title: d.title,
    artist: d.artist,
    credits: d.credits,
    workIds: d.works.map((w) => w.id),
    isrc,
    isrcBorrowed,
    features: isrc ? undefined : null,
  };
}

function pickPeople(credits: PersonCredit[]): Array<{ personId: string; name: string; role: string }> {
  const core = credits.filter((c) => c.roles.some(isCoreRole));
  const pool = core.length ? core : credits;
  return pool.slice(0, DECK.MAX_PEOPLE).map((c) => ({
    personId: c.artist.id,
    name: c.artist.name,
    role: c.roles.find(isCoreRole) ?? c.roles[0],
  }));
}

/** 목록 전체에서 고르게 n개 */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

interface PersonState {
  personId: string;
  name: string;
  role: string;
  queue?: PersonItem[];
  exhausted: boolean;
}

/* ───────────── 덱 ───────────── */

/**
 * 스와이프 카드 대기열.
 * - 시작 곡 크레딧 인물들을 돌아가며 후보를 조금씩 모으고(점진), 1장이라도 준비되면 바로 보여 준다
 * - 녹음 후보는 rid 검색 한 번으로 묶어 조회 (작품 후보는 1건씩, 캐시)
 * - 다양성: 인물별 번갈아, 같은 가수는 연속 ARTIST_WINDOW장 안에 1곡, CONTRAST_EVERY장마다 '다른 분위기' 카드
 * - 제외: 이미 본 곡, 시작 곡과 같은 작품, 같은 제목(커버·버전), 반주 버전
 */
export class Deck {
  private trail: Origin[] = [];
  private queue: DeckCard[] = [];
  private pool: DeckCard[] = [];
  private people: PersonState[] = [];
  private personPtr = 0;
  private pickPtr = 0;
  private served = 0;
  /** 소리 데이터가 늦어 미뤄진 '다른 분위기' 카드 수 */
  private contrastDebt = 0;
  private lastPerson: string | undefined;
  private recentArtists: string[] = [];
  private titles = new Set<string>();
  private seen: Set<string>;
  private seenList: string[];
  private progress: DeckProgress = { phase: "idle", done: 0, total: 0 };
  private error: string | null = null;
  private ctl: AbortController | null = null;
  private running = false;
  private exhausted = false;
  private listeners = new Set<(s: DeckSnapshot) => void>();
  private previewLoading = new Set<string>();

  constructor() {
    this.seenList = loadSeen();
    this.seen = new Set(this.seenList);
  }

  subscribe(fn: (s: DeckSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(): DeckSnapshot {
    return {
      trail: [...this.trail],
      queue: this.queue.map((c) => ({ ...c, via: [...c.via] })),
      progress: { ...this.progress },
      error: this.error,
    };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  get origin(): Origin | undefined {
    return this.trail[this.trail.length - 1];
  }

  dispose() {
    this.ctl?.abort();
    this.listeners.clear();
  }

  /** 새 시작 곡으로 처음부터 */
  async start(id: string) {
    this.queue = [];
    this.trail = [];
    this.recentArtists = [];
    this.served = 0;
    this.contrastDebt = 0;
    await this.setOrigin(id, true);
  }

  /** 이 카드에서 더 파기: 기존 대기열은 그대로 두고, 새 출발점 후보를 뒤에서 모은다 */
  async deeper(card: DeckCard) {
    this.markSeen(card.id);
    this.queue = this.queue.filter((c) => c.id !== card.id);
    await this.setOrigin(card.id, false);
  }

  /** 경로의 i번째 시작 곡으로 돌아가기 */
  async jumpTo(i: number) {
    const target = this.trail[i];
    if (!target) return;
    this.trail = this.trail.slice(0, i);
    this.queue = [];
    this.recentArtists = [];
    this.served = 0;
    await this.setOrigin(target.id, true, target);
  }

  /** 맨 앞 카드 처리(넘기기·담기). 이미 본 곡으로 기록하고 다음 카드로 */
  advance(): DeckCard | undefined {
    const card = this.queue.shift();
    if (card) this.markSeen(card.id);
    this.fillQueue();
    this.prefetch();
    this.emit();
    void this.collect();
    return card;
  }

  /** 캐시를 비우지 않고, 이 출발점 후보를 다시 모은다 (이미 본 곡 기록은 유지) */
  retry() {
    this.error = null;
    if (this.origin && this.people.length === 0) void this.setOrigin(this.origin.id, true, this.origin);
    else void this.collect();
  }

  private markSeen(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.seenList.push(id);
    saveSeen(this.seenList);
  }

  private async setOrigin(id: string, reset: boolean, known?: Origin) {
    this.ctl?.abort();
    const ctl = new AbortController();
    this.ctl = ctl;
    this.error = null;
    this.exhausted = false;
    this.pool = [];
    this.people = [];
    this.personPtr = 0;
    this.pickPtr = 0;
    if (reset) this.titles = new Set();
    this.progress = { phase: "origin", done: 0, total: 1 };
    this.emit();

    let o: Origin;
    try {
      o = known ?? (await loadOrigin(id));
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.error = e instanceof Error ? e.message : "시작 곡을 불러오지 못했습니다.";
      this.progress = { phase: "idle", done: 0, total: 0 };
      this.emit();
      return;
    }
    if (ctl.signal.aborted) return;
    this.trail = [...this.trail, o];
    this.titles.add(normalizeTitle(o.title));
    this.people = pickPeople(o.credits).map((p) => ({ ...p, exhausted: false }));
    if (!this.people.length) this.exhausted = true;
    this.emit();

    // 시작 곡 소리 특성은 기다리지 않고 따로 불러온다
    if (o.features === undefined && o.isrc) {
      getFeatures(o.isrc).then(
        (f) => {
          o.features = f;
          this.fillQueue();
          this.emit();
        },
        () => {
          o.features = null;
          this.emit();
        },
      );
    }
    void this.collect();
  }

  private needMore(): boolean {
    return this.queue.length + this.pool.length < DECK.QUEUE_MIN + DECK.POOL_EXTRA;
  }

  /** 대기열이 부족하면 한 번에 인물별 ROUND_PER_PERSON곡씩 모은다 */
  private async collect() {
    if (this.running) return;
    const ctl = this.ctl;
    if (!ctl) return;
    this.running = true;
    const opts = { low: true as const, signal: ctl.signal };
    try {
      while (!ctl.signal.aborted && !this.exhausted && this.needMore()) {
        await this.round(opts);
        this.fillQueue();
        this.prefetch();
        this.emit();
      }
      if (!ctl.signal.aborted) {
        this.progress = { phase: this.exhausted ? "exhausted" : "idle", done: 0, total: 0 };
        if (this.exhausted) this.fillQueue(true);
        this.emit();
      }
    } catch (e) {
      if (!(e instanceof AbortedError) && !ctl.signal.aborted) {
        this.error = e instanceof Error ? e.message : "후보를 모으지 못했습니다.";
        this.progress = { phase: "idle", done: 0, total: 0 };
        this.emit();
      }
    } finally {
      this.running = false;
      // 출발점이 바뀌는 사이 끝난 경우 새 출발점으로 다시
      if (this.ctl !== ctl && this.ctl && !this.ctl.signal.aborted) void this.collect();
    }
  }

  private async round(opts: { low: true; signal: AbortSignal }) {
    const origin = this.origin;
    if (!origin) return;
    const live = this.people.filter((p) => !p.exhausted);
    if (!live.length) {
      this.exhausted = true;
      return;
    }
    // 첫 카드를 빨리 보이도록, 한 회차에 크레딧은 CREDITS_PER_ROUND명까지만 새로 읽는다
    const toRead = live.filter((p) => !p.queue).slice(0, DECK.CREDITS_PER_ROUND);
    // 진행 문구: 이번 회차 단계 수 = 크레딧 읽기 + 작품 대표 찾기 + 묶음 조회 1
    this.progress = { phase: "collect", done: 0, total: toRead.length + 1 };
    this.emit();
    const step = (extraTotal = 0) => {
      this.progress = {
        phase: "collect",
        done: this.progress.done + 1,
        total: this.progress.total + extraTotal,
      };
      this.emit();
    };

    // 1) 인물별 후보 대기열 (크레딧 읽기)
    for (const p of toRead) {
      try {
        const items = (await getArtistCredits(p.personId, opts)).items;
        const fresh = items.filter((it) => !this.titles.has(normalizeTitle(it.title)));
        const same = fresh.filter((it) => it.roles.includes(p.role));
        const rest = fresh.filter((it) => !it.roles.includes(p.role));
        p.queue = [...spread(same, DECK.PERSON_QUEUE_SAME_ROLE), ...spread(rest, DECK.PERSON_QUEUE_OTHER)];
      } catch (e) {
        if (opts.signal.aborted) throw new AbortedError();
        p.exhausted = true; // 이 인물은 건너뜀
      }
      step();
    }

    // 2) 인물을 돌아가며 ROUND_PER_PERSON곡씩 꺼낸다
    const picked: Array<{ p: PersonState; it: PersonItem }> = [];
    const order = this.people.filter((p) => !p.exhausted && p.queue);
    for (let k = 0; k < order.length; k++) {
      const p = order[(this.personPtr + k) % order.length];
      let n = 0;
      while (n < DECK.ROUND_PER_PERSON && p.queue!.length) {
        const it = p.queue!.shift()!;
        const key = normalizeTitle(it.title);
        if (this.titles.has(key)) {
          this.addVia(key, p, it);
          continue;
        }
        if (it.kind === "work" && origin.workIds.includes(it.id)) continue; // 시작 곡과 같은 작품
        if (it.kind === "recording" && (this.seen.has(it.id) || isBackingTrack(it.title, it.disambiguation)))
          continue;
        picked.push({ p, it });
        n++;
      }
      if (!p.queue!.length) p.exhausted = true;
    }
    this.personPtr++;
    if (!picked.length) {
      if (this.people.every((p) => p.exhausted)) this.exhausted = true;
      return;
    }

    // 3) 작품 → 대표 녹음 (1건씩, 캐시)
    const works = picked.filter((x) => x.it.kind === "work");
    if (works.length) step(works.length);
    const recIds = new Map<{ p: PersonState; it: PersonItem }, string>();
    for (const x of picked) {
      if (x.it.kind === "recording") recIds.set(x, x.it.id);
    }
    for (const x of works) {
      try {
        const rep = await resolveWorkToRecording(x.it.id, opts);
        if (rep) recIds.set(x, rep.id);
      } catch {
        if (opts.signal.aborted) throw new AbortedError();
      }
      step();
    }

    // 4) 녹음 묶음 조회 (rid 검색 1회)
    let recs: Map<string, BatchRecording>;
    try {
      recs = await lookupRecordings([...recIds.values()], opts);
    } catch {
      if (opts.signal.aborted) throw new AbortedError();
      recs = new Map();
    }
    if (opts.signal.aborted) throw new AbortedError();
    this.progress = { ...this.progress, done: this.progress.total };

    for (const [x, id] of recIds) {
      const r = recs.get(id);
      if (!r || r.video || r.id === origin.id || this.seen.has(r.id)) continue;
      if (isBackingTrack(r.title, r.disambiguation)) continue;
      const key = normalizeTitle(x.it.title);
      const rkey = normalizeTitle(r.title) || key;
      if (this.titles.has(rkey) || this.titles.has(key)) {
        this.addVia(rkey, x.p, x.it);
        continue;
      }
      this.titles.add(rkey);
      this.titles.add(key);
      const card: DeckCard = {
        id: r.id,
        title: r.title,
        artist: r.artist,
        primaryArtist: r.artistIds[0] ?? r.artist,
        isrc: r.isrcs[0],
        releaseGroupId: (r as BatchRecording).releaseGroupId,
        via: [this.via(x.p, x.it)],
        originId: origin.id,
        originTitle: origin.title,
        features: r.isrcs[0] ? undefined : null,
      };
      this.pool.push(card);
      this.loadFeatures(card);
    }
  }

  private via(p: PersonState, it: PersonItem): Via {
    return {
      personId: p.personId,
      name: p.name,
      originRole: p.role,
      role: it.roles.includes(p.role) ? p.role : it.roles[0] ?? p.role,
    };
  }

  /** 같은 제목이 이미 대기열·후보에 있으면 이유(인물)만 더한다 */
  private addVia(key: string, p: PersonState, it: PersonItem) {
    const c = [...this.queue, ...this.pool].find((x) => normalizeTitle(x.title) === key);
    if (c && !c.via.some((v) => v.personId === p.personId)) c.via.push(this.via(p, it));
  }

  private loadFeatures(card: DeckCard) {
    if (!card.isrc) return;
    getFeatures(card.isrc).then(
      (f) => {
        card.features = f;
        this.fillQueue();
        this.emit();
      },
      () => {
        card.features = null;
        this.emit();
      },
    );
  }

  private artistOk(c: DeckCard): boolean {
    return !this.recentArtists.includes(c.primaryArtist);
  }

  private take(c: DeckCard, contrast = false) {
    this.pool = this.pool.filter((x) => x !== c);
    c.contrast = contrast;
    this.queue.push(c);
    this.served++;
    this.lastPerson = c.via[0]?.personId;
    this.recentArtists = [...this.recentArtists, c.primaryArtist].slice(-(DECK.ARTIST_WINDOW - 1));
  }

  /**
   * 후보 → 화면 대기열. 다양성 규칙을 지키며 QUEUE_MIN장까지 채운다.
   * relax: 더 모을 후보가 없을 때는 같은 가수 규칙을 풀어 남은 후보를 보여 준다.
   */
  private fillQueue(relax = false) {
    const base = this.origin?.features;
    while (this.queue.length < DECK.QUEUE_MIN && this.pool.length) {
      const position = this.served + 1;
      if (position % DECK.CONTRAST_EVERY === 0) this.contrastDebt = Math.max(this.contrastDebt, 1);
      // N장마다 '같은 사람, 다른 분위기': 같은 인물 후보 중 소리 차이가 가장 큰 곡.
      // 소리 데이터가 아직이면 미뤄 두었다가 다음 자리에서 채운다
      if (base && this.contrastDebt > 0) {
        const lastVia = this.queue[this.queue.length - 1]?.via[0]?.personId;
        const scored = this.pool
          .filter((c) => c.features && this.artistOk(c) && simLevel(base, c.features) !== "매우 비슷")
          .map((c) => ({ c, d: 1 - similarity(base, c.features!) }))
          .sort(
            (a, b) =>
              Number(b.c.via[0]?.personId === lastVia) - Number(a.c.via[0]?.personId === lastVia) ||
              b.d - a.d,
          );
        if (scored[0]) {
          this.take(scored[0].c, true);
          this.contrastDebt = 0;
          continue;
        }
        // 소리 데이터를 기다리는 후보가 있고 보여 줄 카드가 남아 있으면 잠시 기다린다
        if (!relax && this.queue.length > 0 && this.pool.some((c) => c.features === undefined)) break;
      }
      // 인물별 번갈아
      const ids = [...new Set(this.pool.map((c) => c.via[0].personId))];
      let chosen: DeckCard | undefined;
      for (let k = 0; k < this.people.length && !chosen; k++) {
        const person = this.people[(this.pickPtr + k) % Math.max(1, this.people.length)];
        if (!person || !ids.includes(person.personId)) continue;
        chosen = this.pool.find((c) => c.via[0].personId === person.personId && this.artistOk(c));
        if (chosen) this.pickPtr = (this.pickPtr + k + 1) % this.people.length;
      }
      if (!chosen) chosen = this.pool.find((c) => this.artistOk(c));
      if (!chosen && (relax || this.exhausted)) chosen = this.pool[0];
      if (!chosen) break; // 같은 가수 규칙 때문에 기다린다
      // 아직 크레딧을 안 읽은 인물이 남아 있으면 같은 인물 연속 카드는 기다린다 (첫 카드는 바로)
      const othersPending = this.people.some((p) => !p.queue && !p.exhausted);
      if (!relax && this.served > 0 && othersPending && chosen.via[0].personId === this.lastPerson) break;
      this.take(chosen);
    }
  }

  /** 앞쪽 카드 미리듣기 주소를 미리 받아 둔다 (메모리에만, 저장하지 않음) */
  private prefetch() {
    for (const c of this.queue.slice(0, DECK.PREFETCH)) {
      if (c.preview !== undefined || this.previewLoading.has(c.id)) continue;
      this.previewLoading.add(c.id);
      findPreview({ isrc: c.isrc, title: c.title, artist: c.artist })
        .catch(() => null)
        .then((p) => {
          this.previewLoading.delete(c.id);
          c.preview = p;
          this.emit();
        });
    }
  }

  /** 지금 카드 미리듣기가 아직 없으면 받아 온다 (재생 버튼용) */
  async ensurePreview(id: string): Promise<PreviewResult | null> {
    const c = this.queue.find((x) => x.id === id);
    if (!c) return null;
    if (c.preview !== undefined) return c.preview;
    const p = await findPreview({ isrc: c.isrc, title: c.title, artist: c.artist });
    c.preview = p;
    this.emit();
    return p;
  }
}
