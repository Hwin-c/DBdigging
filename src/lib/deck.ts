import { getFeatures, similarity, type AudioFeatures } from "./audio";
import { AbortedError } from "./cache";
import { isBackingTrack } from "./filters";
import {
  findIsrcFallback,
  getArtistCredits,
  getEnglishAliases,
  getRecording,
  getRecordingLite,
  isCoreRole,
  lookupRecordings,
  normalizeTitle,
  resolveWorkToRecording,
  type ArtistLite,
  type BatchRecording,
  type PersonCredit,
  type PersonItem,
} from "./mb/api";
import { findMedia, type MediaResult, type PreviewResult } from "./preview";
import { getIdxPerson, getIdxWork, IDX_ROLES, isSpecialPurpose, type IdxRep } from "./idx";

/* ───────────── 상수 ───────────── */

export const DECK = {
  /** 화면에 보일 카드 대기열 최소 장수 */
  QUEUE_MIN: 3,
  /** 대기열 뒤에 선택용으로 더 모아 둘 후보 수 */
  POOL_EXTRA: 3,
  /** 대기 중인 후보를 최대 몇 개까지 쌓을지 */
  POOL_MAX: 12,
  /** 비중이 큰 새 인물 후보를 모을 때는 이만큼까지 더 쌓는다 */
  POOL_HARD_MAX: 24,
  /**
   * 아직 후보가 없는 인물들의 비중 합이 전체의 이 비율 이상이면,
   * 카드가 1장 이상 남아 있는 동안 그 인물 후보를 기다렸다가 채운다 (담은 방향이 바로 느껴지도록)
   */
  WAIT_SHARE: 0.4,
  /** 미리듣기 주소를 미리 받아 둘 앞쪽 카드 수 (모바일에서 스와이프 중 바로 재생하기 위함) */
  PREFETCH: 2,
  /** 한 곡의 크레딧에서 데려올 최대 인물 수 */
  MAX_PEOPLE: 6,
  /** 한 회차에 비중 비례로 뽑을 인물 수 */
  ROUND_PEOPLE: 3,
  /** 한 회차에 새로 읽을 인물 크레딧 수 (평소 / 새로 합류한 인물을 서둘러 읽을 때) */
  CREDITS_PER_ROUND: 1,
  CREDITS_PER_ROUND_RUSH: 2,
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

/** 사람별 비중 */
export const WEIGHT = {
  /** 시작 곡 크레딧 인물 */
  ORIGIN: 1.0,
  /** 담은 곡의 크레딧 인물에 더하는 값 (새 인물은 이 값으로 합류) */
  KEEP: 1.0,
  /** 가수 축 인물의 시작 비중 (핵심 크레딧이 하나도 없는 곡에서만 쓴다) */
  PERFORMER: 0.5,
  /** 넘긴 카드를 데려온 인물에서 빼는 값 */
  SKIP: 0.3,
  /** 비중 최솟값 (0이 되어 영영 안 나오는 일을 막음) */
  MIN: 0.2,
  /** 집중 중인 인물의 비중 배수 */
  FOCUS: 8,
} as const;

/** 가수 축 역할 이름. 핵심 크레딧(작곡·작사·편곡·프로듀서)이 0명인 곡에서만 쓴다 */
export const PERFORMER_ROLE = "노래";

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

/** 소리 방향: 대기열 정렬 기준만 바꾼다 */
export type SoundMode = "similar" | "energetic" | "calm" | "new";
export const SOUND_MODES: Array<{ id: SoundMode; label: string }> = [
  { id: "similar", label: "비슷한 분위기" },
  { id: "energetic", label: "더 신나게" },
  { id: "calm", label: "더 잔잔하게" },
  { id: "new", label: "다른 분위기" },
];

/** 방향 알림에서 '맞는 곡'으로 세는 에너지 차이 (이보다 작으면 방향이 느껴지지 않는다) */
const MODE_MIN_ENERGY_DIFF = 0.05;

/** 이 곡이 선택한 소리 방향에 맞는지 (알림의 곡 수 계산용) */
export function modeMatch(mode: SoundMode, base: AudioFeatures, f: AudioFeatures): boolean {
  switch (mode) {
    case "energetic":
      return f.energy - base.energy >= MODE_MIN_ENERGY_DIFF;
    case "calm":
      return base.energy - f.energy >= MODE_MIN_ENERGY_DIFF;
    case "new":
      return similarity(base, f) < SOUND.SIM_SIMILAR;
    default:
      return similarity(base, f) >= SOUND.SIM_SIMILAR;
  }
}

/** 받침 있으면 "과", 없으면 "와" */
function josaWaGwa(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "과" : "와";
}

/** 방향을 바꾼 직후 알림 문장. n: 지금 후보 중 맞는 곡 수, pending: 소리 정보를 아직 못 받은 후보 수 */
export function modeToast(mode: SoundMode, baseTitle: string | null, n: number, pending: number): string {
  const label = SOUND_MODES.find((m) => m.id === mode)?.label ?? "";
  const head = `다음 곡부터 ${label}`;
  if (!baseTitle) return `${head} · 시작 곡의 소리 정보가 없어 순서만 바꿔요`;
  if (n === 0) return `${head} · 맞는 곡이 아직 없어요${pending > 0 ? ", 소리 정보를 받는 중" : ", 더 찾는 중"}`;
  const what =
    mode === "energetic"
      ? `${baseTitle}보다 에너지 높은 곡`
      : mode === "calm"
        ? `${baseTitle}보다 에너지 낮은 곡`
        : mode === "new"
          ? `${baseTitle}${josaWaGwa(baseTitle)} 분위기가 다른 곡`
          : `${baseTitle}${josaWaGwa(baseTitle)} 비슷한 곡`;
  return `${head} · ${what} ${n}곡`;
}

/* ───────────── 타입 ───────────── */

export interface Via {
  personId: string;
  name: string;
  disambiguation?: string;
  /** 이 인물을 만난 곡에서의 역할 */
  originRole: string;
  /** 이 곡에서의 역할 */
  role: string;
  /** 이 인물을 만난 담은 곡 (시작 곡 인물이면 없음) */
  fromTitle?: string;
}

export interface Origin {
  id: string;
  title: string;
  artist: string;
  artists: ArtistLite[];
  primaryArtist: string;
  releaseGroupId?: string;
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
  /** 선택한 시작 곡 자체 카드 여부 */
  isOrigin?: boolean;
  /** undefined: 확인 중, null: 없음 */
  features?: AudioFeatures | null;
  /** '같은 사람, 다른 분위기' 카드 */
  contrast?: boolean;
  /** undefined: 아직 안 찾음, null: 미리듣기 없음 */
  preview?: PreviewResult | null;
  /** 앨범 커버 주소 (Deezer·iTunes 조회에서 얻음, 미리듣기가 없어도 채워질 수 있음) */
  cover?: string;
  /** 이 곡이 속한 작품 ID (영문 별칭 조회용) */
  workId?: string;
  /** 이 곡을 만든 사람 (색인 카드: 작품 조각의 크레딧, 이름은 앞쪽 카드가 되면 채움). 없으면 via로 대신 보여 준다 */
  credits?: CardPerson[];
  /** 색인 작품 조각의 크레딧 [인물 ID, 역할 코드] (credits를 채우기 전 원본) */
  idxCredits?: Array<[string, string]>;
}

/** 카드에 보이는 '이 곡을 만든 사람' */
export interface CardPerson {
  personId: string;
  name: string;
  disambiguation?: string;
  /** 화면에 보일 역할 이름 */
  role: string;
  /** 이 사람을 파면 쓰는 역할들 */
  roles: string[];
}

/** 색인 역할 코드의 화면 이름 */
const IDX_ROLE_LABEL: Record<string, string> = { C: "작곡", L: "작사", W: "작사·작곡", A: "편곡" };

export interface DeckProgress {
  /** origin: 시작 곡 크레딧 읽는 중, collect: 후보 모으는 중 */
  phase: "idle" | "origin" | "collect" | "exhausted";
  done: number;
  total: number;
}

/** 지금 파는 사람 */
export interface DiggingPerson {
  id: string;
  name: string;
  disambiguation?: string;
  weight: number;
  /** 이 사람을 만난 담은 곡 (시작 곡 인물이면 없음) */
  fromTitle?: string;
}

/** 디깅 경로: 곡과 사람이 번갈아 */
export type PathStep = { kind: "song"; id: string; label: string } | { kind: "person"; id: string; label: string };

export interface DeckSnapshot {
  origin?: Origin;
  queue: DeckCard[];
  people: DiggingPerson[];
  path: PathStep[];
  focusId: string | null;
  mode: SoundMode;
  /** 마지막으로 합류한 사람들 (n이 바뀌면 새 알림) */
  joined: { names: string[]; n: number } | null;
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

/** 받침 있으면 "이", 없으면 "가" (한글이 아니면 "가") */
export function josaIga(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "이" : "가";
}

/**
 * 이유 문장.
 * - 시작 곡 카드 자체: "Kenzie 작곡"
 * - 시작 곡 인물: "Kenzie 작곡 · 시작 곡과 같은 작곡"
 * - 담은 곡에서 만난 인물: "Supernova에서 만난 Dem Jointz가 작곡"
 * - 가수 축(핵심 크레딧이 없는 곡): "볼빨간사춘기가 부른 다른 곡"
 */
export function reasonText(v: Via, isOrigin = false): string {
  if (isOrigin) return `${v.name} ${v.role}`;
  if (v.role === PERFORMER_ROLE) {
    const sung = `${v.name}${josaIga(v.name)} 부른 다른 곡`;
    return v.fromTitle ? `${v.fromTitle}에서 만난 ${sung}` : sung;
  }
  if (v.fromTitle) return `${v.fromTitle}에서 만난 ${v.name}${josaIga(v.name)} ${v.role}`;
  return v.role === v.originRole
    ? `${v.name} ${v.role} · 시작 곡과 같은 ${v.role}`
    : `${v.name} ${v.role} · 시작 곡에선 ${v.originRole}`;
}

/** 소리 방향별 정렬 점수 (클수록 앞). 소리 데이터가 없으면 null */
export function modeScore(mode: SoundMode, base: AudioFeatures | null | undefined, f: AudioFeatures | null | undefined) {
  if (!f) return null;
  switch (mode) {
    case "energetic":
      return f.energy + 0.5 * f.danceability + 0.3 * Math.min(f.tempo / 200, 1);
    case "calm":
      return -f.energy + 0.5 * f.acousticness - 0.3 * Math.min(f.tempo / 200, 1);
    case "new":
      return base ? 1 - similarity(base, f) : null;
    default:
      return base ? similarity(base, f) : null;
  }
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
    artists: d.artists,
    primaryArtist: d.artists[0]?.id ?? d.artist,
    releaseGroupId: d.releaseGroupId,
    credits: d.credits,
    workIds: d.works.map((w) => w.id),
    isrc,
    isrcBorrowed,
    features: isrc ? undefined : null,
  };
}

interface SeedPerson {
  personId: string;
  name: string;
  disambiguation?: string;
  role: string;
  /** 가수 축 인물 (핵심 크레딧이 없는 곡에서만) */
  performer?: boolean;
  /** 이 곡에서의 핵심 역할 전부 (색인 조회 대상인지 판단) */
  roles: string[];
}

/** 색인이 가진 작품 크레딧 역할 (프로듀서 크레딧은 색인에 없다) */
const IDX_CREDIT_ROLES = ["작곡", "작사", "작사·작곡", "편곡"];

/** 색인(작품 크레딧)으로 조회할 수 있는 인물인지: 가수 축·프로듀서로만 나온 인물은 API 경로 */
function idxEligible(p: { performer?: boolean; roles: string[] }): boolean {
  return !p.performer && p.roles.some((r) => IDX_CREDIT_ROLES.includes(r));
}

/** 색인에서 '특수 목적 항목'([traditional], Various Artists 등)인 인물 ID. 색인이 꺼져 있으면 비어 있다 */
async function specialIds(credits: PersonCredit[], artists: ArtistLite[] = []): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const c of credits) if (c.roles.some(isCoreRole)) ids.add(c.artist.id);
  for (const a of artists) if (a.id) ids.add(a.id);
  const out = new Set<string>();
  await Promise.all(
    [...ids].map(async (id) => {
      if (isSpecialPurpose(await getIdxPerson(id))) out.add(id);
    }),
  );
  return out;
}

/** 색인 경로로 만든 후보 항목: 제목은 대표 녹음을 고를 때 작품 조각에서 채운다 */
interface QItem extends PersonItem {
  viaIdx?: boolean;
  rep?: IdxRep;
  /** 작품 조각의 크레딧 */
  credits?: Array<[string, string]>;
}

/** 가수로 쓰지 않는 특수 항목 */
const NOT_A_SINGER = /^(various artists|\[unknown\]|\[anonymous\]|\[no artist\])$/i;

/**
 * 한 곡에서 디깅할 인물 (고유 MBID 기준):
 * - 핵심 역할(작곡·작사·편곡·프로듀서) 참여자만. 리믹서·악기 같은 그 밖의 크레딧은 쓰지 않는다
 * - 핵심 크레딧이 0명일 때(형제 녹음 보충 후에도)만 가수를 가수 축으로 쓴다
 */
function seedPeople(credits: PersonCredit[], artists: ArtistLite[] = [], special: Set<string> = new Set()): SeedPerson[] {
  const seen = new Set<string>();
  const out: SeedPerson[] = [];
  for (const c of credits) {
    if (out.length >= DECK.MAX_PEOPLE) break;
    if (!c.roles.some(isCoreRole) || seen.has(c.artist.id) || special.has(c.artist.id)) continue;
    seen.add(c.artist.id);
    out.push({
      personId: c.artist.id,
      name: c.artist.name,
      disambiguation: c.artist.disambiguation,
      role: c.roles.find(isCoreRole)!,
      roles: c.roles.filter(isCoreRole),
    });
  }
  if (out.length) return out;
  for (const a of artists) {
    if (out.length >= DECK.MAX_PEOPLE) break;
    if (!a.id || seen.has(a.id) || NOT_A_SINGER.test(a.name) || special.has(a.id)) continue;
    seen.add(a.id);
    out.push({
      personId: a.id,
      name: a.name,
      disambiguation: a.disambiguation,
      role: PERFORMER_ROLE,
      performer: true,
      roles: [PERFORMER_ROLE],
    });
  }
  return out;
}

/** 목록 전체에서 고르게 n개 */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

/** 비중에 비례해 하나 뽑기 */
function weightedPick<T>(items: T[], w: (t: T) => number): T | undefined {
  const total = items.reduce((s, x) => s + Math.max(0, w(x)), 0);
  if (!items.length || total <= 0) return items[0];
  let r = Math.random() * total;
  for (const x of items) {
    r -= Math.max(0, w(x));
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

interface PersonState {
  personId: string;
  name: string;
  disambiguation?: string;
  /** 이 인물을 만난 곡에서의 역할 */
  role: string;
  /** 가수 축 인물 */
  performer?: boolean;
  /** 이 곡에서의 핵심 역할 전부 */
  roles: string[];
  weight: number;
  fromTitle?: string;
  queue?: QItem[];
  exhausted: boolean;
}

/* ───────────── 덱 ───────────── */

/**
 * 스와이프 카드 대기열.
 * - 사람별 비중: 시작 곡 크레딧 인물 1.0. 담으면 그 곡의 크레딧 인물 +1.0(새 인물은 합류), 넘기면 데려온 인물 −0.3
 * - 다음 후보 인물은 비중에 비례해 뽑는다. 집중 중이면 그 사람 비중 × FOCUS
 * - 후보는 점진적으로 모으고(1장이라도 준비되면 표시), 녹음은 rid 검색 한 번으로 묶어 조회
 * - 다양성: 같은 가수는 연속 ARTIST_WINDOW장 안에 1곡, CONTRAST_EVERY장마다 '다른 분위기' 카드
 * - 소리 방향(비슷하게/더 신나게/더 잔잔하게/새롭게)은 대기열 정렬 기준만 바꾼다
 * - 제외: 이미 본 곡, 시작 곡과 같은 작품, 같은 제목(커버·버전), 반주 버전
 */
export class Deck {
  private origin_: Origin | undefined;
  private queue: DeckCard[] = [];
  private pool: DeckCard[] = [];
  private people = new Map<string, PersonState>();
  private path: PathStep[] = [];
  private focusId: string | null = null;
  private mode: SoundMode = "similar";
  private joined: { names: string[]; n: number } | null = null;
  private served = 0;
  private contrastDebt = 0;
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
  /** 곡별 미리듣기 조회 (진행 중·완료). 앞 카드 미리 받기와 재생 요청이 같은 조회를 함께 쓴다. 메모리에만 둔다 */
  private previews = new Map<string, Promise<PreviewResult | null>>();

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

  /** 동명이인(같은 이름, 다른 MBID)이 함께 있을 때만 disambiguation을 붙여 구분 표시 */
  private displayName(personId: string, fallbackName: string, disambiguation?: string): string {
    const p = this.people.get(personId);
    const name = p?.name ?? fallbackName;
    const dis = p?.disambiguation ?? disambiguation;
    if (!dis) return name;
    let sameNameCount = 0;
    for (const other of this.people.values()) {
      if (other.name === name) sameNameCount++;
    }
    return sameNameCount > 1 ? `${name} (${dis})` : name;
  }

  snapshot(): DeckSnapshot {
    return {
      origin: this.origin_,
      queue: this.queue.map((c) => ({
        ...c,
        via: c.via.map((v) => ({
          ...v,
          name: this.displayName(v.personId, v.name, v.disambiguation),
        })),
      })),
      people: [...this.people.values()]
        .filter((p) => !p.exhausted || p.weight > WEIGHT.MIN)
        .map((p) => ({
          id: p.personId,
          name: this.displayName(p.personId, p.name, p.disambiguation),
          disambiguation: p.disambiguation,
          weight: p.weight,
          fromTitle: p.fromTitle,
        }))
        .sort((a, b) => b.weight - a.weight),
      path: this.path.map((s) =>
        s.kind === "person" ? { ...s, label: this.displayName(s.id, s.label) } : s,
      ),
      focusId: this.focusId,
      mode: this.mode,
      joined: this.joined,
      progress: { ...this.progress },
      error: this.error,
    };
  }

  private emit() {
    this.traceReady();
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  /** 비교용 개발자 콘솔 로그: 추천 카드가 처음 대기열에 들어온 시각 (시작 후 ms)과 이유 문장 */
  private traceT0 = 0;
  private traceIds = new Set<string>();
  private traceReady() {
    for (const c of this.queue) {
      if (c.isOrigin || this.traceIds.has(c.id)) continue;
      this.traceIds.add(c.id);
      const v = c.via[0];
      const reason = v ? reasonText({ ...v, name: this.displayName(v.personId, v.name, v.disambiguation) }) : "";
      console.info(
        `[dig] card ${this.traceIds.size} ready +${Math.round(performance.now() - this.traceT0)}ms | ${c.title} - ${c.artist} | ${reason}`,
      );
    }
  }

  get origin(): Origin | undefined {
    return this.origin_;
  }

  dispose() {
    this.ctl?.abort();
    this.listeners.clear();
  }

  private effWeight(p: PersonState): number {
    return p.weight * (this.focusId === p.personId ? WEIGHT.FOCUS : 1);
  }

  /** 새 시작 곡으로 처음부터 */
  async start(id: string) {
    this.ctl?.abort();
    const ctl = new AbortController();
    this.ctl = ctl;
    this.origin_ = undefined;
    this.queue = [];
    this.pool = [];
    this.people = new Map();
    this.path = [];
    this.focusId = null;
    this.joined = null;
    this.recentArtists = [];
    this.served = 0;
    this.contrastDebt = 0;
    this.titles = new Set();
    this.error = null;
    this.exhausted = false;
    this.progress = { phase: "origin", done: 0, total: 1 };
    this.traceT0 = performance.now();
    this.traceIds = new Set();
    this.emit();

    let o: Origin;
    try {
      o = await loadOrigin(id);
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.error = e instanceof Error ? e.message : "시작 곡을 불러오지 못했습니다.";
      this.progress = { phase: "idle", done: 0, total: 0 };
      this.emit();
      return;
    }
    if (ctl.signal.aborted) return;
    this.origin_ = o;
    this.titles.add(normalizeTitle(o.title));
    this.path = [{ kind: "song", id: o.id, label: o.title }];
    const special = await specialIds(o.credits, o.artists);
    if (ctl.signal.aborted) return;
    const initialPeople = seedPeople(o.credits, o.artists, special);
    for (const p of initialPeople) {
      this.people.set(p.personId, { ...p, weight: p.performer ? WEIGHT.PERFORMER : WEIGHT.ORIGIN, exhausted: false });
    }
    const originCard: DeckCard = {
      id: o.id,
      title: o.title,
      artist: o.artist,
      primaryArtist: o.primaryArtist,
      isrc: o.isrc,
      releaseGroupId: o.releaseGroupId,
      via: initialPeople.map((p) => ({
        personId: p.personId,
        name: p.name,
        disambiguation: p.disambiguation,
        originRole: p.role,
        role: p.role,
      })),
      isOrigin: true,
      features: o.features,
      workId: o.workIds[0],
    };
    this.queue = [originCard];
    this.recentArtists = [originCard.primaryArtist];
    this.prefetch();
    if (!this.people.size) this.exhausted = true;
    this.emit();

    // 시작 곡 소리 특성은 기다리지 않고 따로 불러온다
    if (o.features === undefined && o.isrc) {
      getFeatures(o.isrc).then(
        (f) => {
          o.features = f;
          if (this.queue[0]?.isOrigin) this.queue[0].features = f;
          this.requeue();
          this.fillQueue();
          this.emit();
        },
        () => {
          o.features = null;
          if (this.queue[0]?.isOrigin) this.queue[0].features = null;
          this.emit();
        },
      );
    }
    void this.collect();
  }

  /** 넘기기: 시작 곡이 아닌 추천 카드면 데려온 인물 비중 −SKIP */
  skip(): DeckCard | undefined {
    const card = this.queue[0];
    if (card && !card.isOrigin) {
      const p = this.people.get(card.via[0]?.personId ?? "");
      if (p) p.weight = Math.max(WEIGHT.MIN, p.weight - WEIGHT.SKIP);
    }
    return this.advance();
  }

  /**
   * 담기: 저장(노트는 화면 쪽) + 방향. 이 곡의 크레딧 인물을 뒤에서 읽어 비중을 더한다.
   * 시작 곡 카드 자체를 담을 때는 노트에 저장만 하고 첫 추천 카드로 넘어간다.
   */
  keep(): DeckCard | undefined {
    const card = this.queue[0];
    if (!card) return undefined;
    if (card.isOrigin) {
      return this.advance();
    }
    const lead = card.via[0];
    if (lead && this.path[this.path.length - 1]?.id !== lead.personId)
      this.path.push({ kind: "person", id: lead.personId, label: lead.name });
    this.path.push({ kind: "song", id: card.id, label: card.title });
    // 데려온 인물은 바로 비중을 더한다 (크레딧을 읽기 전에도 방향이 바뀌도록)
    for (const v of card.via) {
      const p = this.people.get(v.personId);
      if (p) p.weight += WEIGHT.KEEP;
    }
    const out = this.advance();
    // 지금 보이는 다음 카드는 두고, 그 뒤 대기열은 새 비중으로 다시 고른다
    this.requeue();
    this.emit();
    void this.absorbCredits(card);
    return out;
  }

  /** 담은 곡의 크레딧 인물을 비중에 더하거나 새로 합류시킨다 (뒤에서) */
  private async absorbCredits(card: DeckCard) {
    const ctl = this.ctl;
    if (!ctl) return;
    try {
      const d = await getRecording(card.id);
      if (ctl.signal.aborted) return;
      const already = new Set(card.via.map((v) => v.personId));
      const added: string[] = [];
      const special = await specialIds(d.credits, d.artists);
      if (ctl.signal.aborted) return;
      // 가수 축은 사용자가 직접 고른 경우에만: 담은 곡의 가수는 자동으로 합류시키지 않는다
      for (const c of seedPeople(d.credits, [], special)) {
        if (already.has(c.personId)) continue; // 데려온 인물은 이미 더함
        const p = this.people.get(c.personId);
        if (p) {
          p.weight += WEIGHT.KEEP;
        } else {
          this.people.set(c.personId, {
            personId: c.personId,
            name: c.name,
            disambiguation: c.disambiguation,
            role: c.role,
            performer: c.performer,
            roles: c.roles,
            weight: c.performer ? WEIGHT.PERFORMER : WEIGHT.KEEP,
            fromTitle: card.title,
            exhausted: false,
          });
          added.push(this.displayName(c.personId, c.name, c.disambiguation));
        }
      }
      if (added.length) {
        this.joined = { names: added, n: (this.joined?.n ?? 0) + 1 };
        this.exhausted = false;
      }
      this.requeue();
      this.emit();
      void this.collect();
    } catch {
      /* 크레딧을 못 읽으면 비중만 그대로 */
    }
  }

  /** 카드의 인물 이름을 누르면 그 사람에게 집중. 같은 사람을 다시 누르거나 null이면 해제 */
  focus(personId: string | null) {
    this.focusId = personId && this.focusId !== personId ? personId : null;
    const p = personId ? this.people.get(personId) : undefined;
    if (p) p.exhausted = p.exhausted && !!p.queue && p.queue.length === 0;
    // 대기열 뒤쪽(지금 카드 제외)을 새 비중으로 다시 고른다
    this.requeue();
    this.emit();
    void this.collect();
  }

  /**
   * 소리 방향 바꾸기: 지금 보이는 카드는 두고, 바로 다음 카드부터 새 기준으로 다시 고른다.
   * 알림용으로 지금 후보 중 맞는 곡 수를 돌려준다 (같은 방향을 다시 누르면 null)
   */
  setMode(mode: SoundMode): { baseTitle: string | null; n: number; pending: number } | null {
    if (this.mode === mode) return null;
    this.mode = mode;
    this.requeue();
    this.emit();
    const base = this.origin_?.features;
    const cands = [...this.queue.slice(1), ...this.pool];
    return {
      baseTitle: base ? (this.origin_?.title ?? null) : null,
      n: base ? cands.filter((c) => c.features && modeMatch(mode, base, c.features)).length : 0,
      pending: cands.filter((c) => c.features === undefined).length,
    };
  }

  /** 지금 보이는 카드는 두고, 나머지 대기열 카드를 후보로 돌려 새 기준으로 다시 고른다 */
  private requeue() {
    if (this.queue.length > 1) {
      const rest = this.queue.splice(1);
      this.pool.unshift(...rest);
      this.served = Math.max(0, this.served - rest.length);
      this.recentArtists = this.queue.map((c) => c.primaryArtist).slice(-(DECK.ARTIST_WINDOW - 1));
      this.fillQueue();
    }
    // 새로 앞에 온 카드는 미리듣기가 없을 수 있으니 바로 받아 둔다 (넘길 때 바로 재생되도록)
    this.prefetch();
  }

  /** 맨 앞 카드 처리. 이미 본 곡으로 기록하고 다음 카드로 */
  private advance(): DeckCard | undefined {
    const card = this.queue.shift();
    if (card) this.markSeen(card.id);
    this.fillQueue();
    this.prefetch();
    this.emit();
    void this.collect();
    return card;
  }

  retry() {
    this.error = null;
    if (!this.origin_) return;
    void this.collect();
  }

  private markSeen(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.seenList.push(id);
    saveSeen(this.seenList);
  }

  /**
   * 더 모아야 하는지: 같은 가수 규칙 때문에 지금 못 쓰는 후보는 세지 않는다
   * (한 가수 곡만 쌓여 대기열이 멈추는 것 방지). 후보는 POOL_MAX까지만 쌓는다.
   */
  /** 후보가 아직 없는 (살아 있는) 인물들의 비중 몫 */
  private pendingShare(): number {
    const live = [...this.people.values()].filter((p) => !p.exhausted);
    const total = live.reduce((t, p) => t + this.effWeight(p), 0);
    if (total <= 0) return 0;
    const has = new Set(this.pool.filter((c) => this.artistOk(c)).map((c) => c.via[0].personId));
    const pending = live.filter((p) => !has.has(p.personId)).reduce((t, p) => t + this.effWeight(p), 0);
    return pending / total;
  }

  private needMore(): boolean {
    if (this.pool.length >= DECK.POOL_HARD_MAX) return false;
    if (this.pendingShare() >= DECK.WAIT_SHARE) return true;
    if (this.pool.length >= DECK.POOL_MAX) return false;
    const usable = this.pool.filter((c) => this.artistOk(c)).length;
    // 집중 중이면 그 사람 후보가 충분해야 한다
    if (this.focusId) {
      const mine = this.pool.filter((c) => c.via.some((v) => v.personId === this.focusId)).length;
      const p = this.people.get(this.focusId);
      if (mine < DECK.QUEUE_MIN && p && !p.exhausted) return true;
    }
    return this.queue.length + usable < DECK.QUEUE_MIN + DECK.POOL_EXTRA;
  }

  private async collect() {
    if (this.running) return;
    const ctl = this.ctl;
    if (!ctl || !this.origin_) return;
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
      if (this.ctl !== ctl && this.ctl && !this.ctl.signal.aborted) void this.collect();
    }
  }

  /** 비중 비례로 인물 ROUND_PEOPLE명을 뽑아 후보를 조금씩 모은다 */
  private async round(opts: { low: true; signal: AbortSignal }) {
    const origin = this.origin_;
    if (!origin) return;
    const live = [...this.people.values()].filter((p) => !p.exhausted);
    if (!live.length) {
      this.exhausted = true;
      return;
    }
    // 비중 비례 비복원 추출. 새로 읽는 크레딧은 회차당 CREDITS_PER_ROUND명까지 (첫 카드를 빨리)
    const chosen: PersonState[] = [];
    const cand = [...live];
    let reads = 0;
    const maxReads =
      this.origin_ && this.pendingShare() >= DECK.WAIT_SHARE && this.served > 0
        ? DECK.CREDITS_PER_ROUND_RUSH
        : DECK.CREDITS_PER_ROUND;
    while (chosen.length < DECK.ROUND_PEOPLE && cand.length) {
      const p = weightedPick(cand, (x) => this.effWeight(x))!;
      cand.splice(cand.indexOf(p), 1);
      if (!p.queue) {
        if (reads >= maxReads) continue;
        reads++;
      }
      chosen.push(p);
    }

    const toRead = chosen.filter((p) => !p.queue);
    this.progress = { phase: "collect", done: 0, total: toRead.length + 1 };
    this.emit();
    const step = (extraTotal = 0) => {
      this.progress = { phase: "collect", done: this.progress.done + 1, total: this.progress.total + extraTotal };
      this.emit();
    };

    // 1) 크레딧 읽기
    for (const p of toRead) {
      try {
        const fromIdx = await this.idxQueue(p);
        if (fromIdx) {
          p.queue = fromIdx;
        } else {
          const items = (
            await getArtistCredits(p.personId, {
              ...opts,
              includePerformer: !!p.performer,
            })
          ).items;
          const fresh = items.filter((it) => !this.titles.has(normalizeTitle(it.title)));
          const same = fresh.filter((it) => it.roles.includes(p.role));
          // 나머지는 핵심 역할(작곡·작사·편곡·프로듀서)로 참여한 곡만 (리믹서·보컬 디렉터·악기 등 제외)
          const rest = fresh.filter((it) => !it.roles.includes(p.role) && it.roles.some(isCoreRole));
          p.queue = [...spread(same, DECK.PERSON_QUEUE_SAME_ROLE), ...spread(rest, DECK.PERSON_QUEUE_OTHER)];
        }
      } catch {
        if (opts.signal.aborted) throw new AbortedError();
        p.exhausted = true; // 이 인물은 건너뜀
      }
      step();
    }

    // 2) 뽑힌 인물마다 ROUND_PER_PERSON곡씩 꺼낸다
    const picked: Array<{ p: PersonState; it: QItem }> = [];
    for (const p of chosen) {
      if (!p.queue || p.exhausted) continue;
      let n = 0;
      while (n < DECK.ROUND_PER_PERSON && p.queue.length) {
        const it = p.queue.shift()!;
        if (it.viaIdx && !it.rep) {
          // 색인 항목: 작품 조각에서 제목·대표 녹음을 채운다 (없으면 건너뜀)
          const w = await getIdxWork(it.id);
          if (opts.signal.aborted) throw new AbortedError();
          if (!w?.r?.i) continue;
          it.title = w.t;
          it.rep = w.r;
          it.credits = w.c;
        }
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
      if (!p.queue.length) p.exhausted = true;
    }
    if (!picked.length) {
      if ([...this.people.values()].every((p) => p.exhausted)) this.exhausted = true;
      return;
    }

    // 3) 작품 → 대표 녹음. 색인에서 온 항목은 이미 대표 녹음(ISRC 포함)을 알고 있고, 나머지는 API로 1건씩 (캐시)
    const idxRecs = new Map<string, BatchRecording>();
    const recIds = new Map<{ p: PersonState; it: QItem }, string>();
    for (const x of picked as Array<{ p: PersonState; it: QItem }>) {
      const r = x.it.rep;
      if (!r) continue;
      idxRecs.set(r.id, {
        id: r.id,
        title: r.t,
        artist: r.a,
        artistIds: [],
        disambiguation: "",
        length: null,
        firstReleaseDate: r.y ? String(r.y) : "",
        isrcs: r.i ? [r.i] : [],
        video: false,
      });
      recIds.set(x, r.id);
    }
    const works = picked.filter((x) => x.it.kind === "work" && !(x.it as QItem).rep);
    if (works.length) step(works.length);
    for (const x of picked) if (x.it.kind === "recording") recIds.set(x, x.it.id);
    for (const x of works) {
      try {
        const rep = await resolveWorkToRecording(x.it.id, opts);
        if (rep) recIds.set(x, rep.id);
      } catch {
        if (opts.signal.aborted) throw new AbortedError();
      }
      step();
    }

    // 4) 녹음 묶음 조회 (rid 검색 1회). 색인 항목은 건너뜀
    let recs: Map<string, BatchRecording>;
    try {
      recs = await lookupRecordings([...recIds.values()].filter((id) => !idxRecs.has(id)), opts);
    } catch {
      if (opts.signal.aborted) throw new AbortedError();
      recs = new Map();
    }
    for (const [id, r] of idxRecs) recs.set(id, r);
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
      console.info(idxRecs.has(id) ? "[idx] index hit" : "[idx] api fallback", `${r.title} - ${r.artist} (${x.p.name})`);
      const card: DeckCard = {
        id: r.id,
        title: r.title,
        artist: r.artist,
        primaryArtist: r.artistIds[0] ?? r.artist,
        isrc: r.isrcs[0],
        releaseGroupId: r.releaseGroupId,
        via: [this.via(x.p, x.it)],
        features: r.isrcs[0] ? undefined : null,
        workId: x.it.kind === "work" ? x.it.id : undefined,
        idxCredits: (x.it as QItem).credits,
      };
      this.pool.push(card);
      this.loadFeatures(card);
      this.quickPreview(card);
    }
  }

  /**
   * 색인에서 인물의 후보 대기열을 만든다. 색인에 없거나 조회 대상이 아니면 null (→ API 경로).
   * 작품 제목은 뽑을 때 작품 조각에서 채우므로 여기서는 작품 ID·역할만 쓴다.
   */
  private async idxQueue(p: PersonState): Promise<QItem[] | null> {
    if (!idxEligible(p)) {
      console.info("[idx] api fallback", p.name, p.performer ? "(performer axis)" : "(no work credit role, e.g. producer only)");
      return null;
    }
    const person = await getIdxPerson(p.personId);
    const items: QItem[] = [];
    for (const [wid, code] of person?.w ?? []) {
      const roles = IDX_ROLES[code];
      if (roles) items.push({ kind: "work", id: wid, title: "", disambiguation: "", roles, viaIdx: true });
    }
    if (!items.length) {
      console.info("[idx] api fallback", p.name, person ? "(no usable work in index)" : "(person not in index)");
      return null;
    }
    console.info("[idx] index hit", p.name, `${items.length} works`);
    const same = items.filter((it) => it.roles.includes(p.role));
    const rest = items.filter((it) => !it.roles.includes(p.role));
    return [...spread(same, DECK.PERSON_QUEUE_SAME_ROLE), ...spread(rest, DECK.PERSON_QUEUE_OTHER)];
  }

  private via(p: PersonState, it: PersonItem): Via {
    return {
      personId: p.personId,
      name: p.name,
      disambiguation: p.disambiguation,
      originRole: p.role,
      role: it.roles.includes(p.role) ? p.role : it.roles[0] ?? p.role,
      fromTitle: p.fromTitle,
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

  /** 가수 축으로 데려온 카드(이유가 "X가 부른 다른 곡"): 후보가 전부 그 가수 곡이라 '같은 가수' 규칙을 적용하지 않는다 */
  private isPerformerCard(c: DeckCard): boolean {
    return c.via[0]?.role === PERFORMER_ROLE;
  }

  private artistOk(c: DeckCard): boolean {
    if (this.isPerformerCard(c)) return true;
    return !this.recentArtists.includes(c.primaryArtist);
  }

  private take(c: DeckCard, contrast = false) {
    this.pool = this.pool.filter((x) => x !== c);
    c.contrast = contrast;
    this.queue.push(c);
    this.served++;
    if (!this.isPerformerCard(c)) this.recentArtists = [...this.recentArtists, c.primaryArtist].slice(-(DECK.ARTIST_WINDOW - 1));
  }

  /** 소리 방향 기준으로 후보 정렬 (소리 데이터를 아직 불러오는 중인 곡은 뒤로, 소리 데이터가 없는 곡은 중립 점수로 섞음) */
  private byMode(list: DeckCard[]): DeckCard[] {
    const base = this.origin_?.features;
    const fallbackScore =
      this.mode === "energetic" ? 0.75 : this.mode === "calm" ? -0.3 : this.mode === "new" ? 0.28 : 0.68;
    const scoreOf = (c: DeckCard): number | null => {
      const s = modeScore(this.mode, base, c.features);
      if (s != null) return s;
      if (c.features === null && base) return fallbackScore;
      return null;
    };
    return [...list].sort((a, b) => {
      // 미리듣기가 확인된 카드를 앞에, 아직 모르는 카드는 가운데, 없는 카드는 뒤로 (빼지는 않는다)
      const tier = (c: DeckCard) => (c.preview ? 0 : c.preview === undefined ? 1 : 2);
      const ta = tier(a) - tier(b);
      if (ta) return ta;
      const sa = scoreOf(a);
      const sb = scoreOf(b);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
  }

  /**
   * 후보 → 화면 대기열. QUEUE_MIN장까지 채운다.
   * - CONTRAST_EVERY장마다 '같은 사람, 다른 분위기' (같은 인물 후보 중 소리 차이가 가장 큰 곡)
   * - 그 밖에는 비중 비례로 인물을 뽑고, 그 인물 후보 중 소리 방향 기준 1위
   * relax: 더 모을 후보가 없을 때는 같은 가수 규칙을 풀어 남은 후보를 보여 준다.
   */
  private fillQueue(relax = false) {
    const base = this.origin_?.features;
    while (this.queue.length < DECK.QUEUE_MIN && this.pool.length) {
      const position = this.served + 1;
      if (position % DECK.CONTRAST_EVERY === 0) this.contrastDebt = Math.max(this.contrastDebt, 1);
      // 신나게·잔잔하게로 정한 동안에는 '다른 분위기' 카드를 끼우지 않는다 (방향이 흐려지지 않도록)
      if (base && this.contrastDebt > 0 && !this.focusId && (this.mode === "similar" || this.mode === "new")) {
        const lastVia = this.queue[this.queue.length - 1]?.via[0]?.personId;
        const scored = this.pool
          .filter((c) => c.features && this.artistOk(c) && simLevel(base, c.features) !== "매우 비슷")
          // 소리 차이 × 데려온 인물 비중: 비중이 낮아진(넘긴) 인물의 곡은 덜 나온다
          .map((c) => {
            const p = this.people.get(c.via[0]?.personId ?? "");
            return { c, d: (1 - similarity(base, c.features!)) * (p ? this.effWeight(p) : WEIGHT.MIN) };
          })
          .sort(
            (a, b) =>
              Number(b.c.via[0]?.personId === lastVia) - Number(a.c.via[0]?.personId === lastVia) || b.d - a.d,
          );
        if (scored[0]) {
          this.take(scored[0].c, true);
          this.contrastDebt = 0;
          continue;
        }
        if (!relax && this.queue.length > 0 && this.pool.some((c) => c.features === undefined)) break;
      }

      // 비중이 큰 인물의 후보가 아직 없으면, 보여 줄 추천 카드가 남아 있는 동안 기다린다
      const recInQueue = this.queue.filter((c) => !c.isOrigin).length;
      if (!relax && !this.exhausted && recInQueue >= 1 && this.pendingShare() >= DECK.WAIT_SHARE) break;
      const usable = this.pool.filter((c) => this.artistOk(c));
      let chosen: DeckCard | undefined;
      if (usable.length) {
        // 비슷한 분위기가 아닌 방향은 후보 전체에서 방향에 맞는 위쪽 절반 안에서만 고른다 (사람 안에서만 정렬하면 방향이 안 느껴진다)
        let from = usable;
        if (this.mode !== "similar" && base && usable.length > 2) {
          const ranked = this.byMode(usable);
          from = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2)));
        }
        // 후보가 있는 인물 중 비중 비례로 한 명
        const ids = [...new Set(from.map((c) => c.via[0].personId))];
        const pid = weightedPick(ids, (id) => {
          const p = this.people.get(id);
          return p ? this.effWeight(p) : WEIGHT.MIN;
        });
        chosen = this.byMode(from.filter((c) => c.via[0].personId === pid))[0];
      }
      // 보여 줄 카드가 하나도 없거나 후보가 가득 찼으면 같은 가수 규칙을 푼다 (멈춤 방지)
      if (!chosen && (relax || this.exhausted || this.queue.length === 0 || this.pool.length >= DECK.POOL_MAX))
        chosen = this.byMode(this.pool)[0];
      if (!chosen) break;
      this.take(chosen);
    }
  }

  /** 곡 하나의 미리듣기 조회. 같은 곡은 한 번만 받고, 결과는 대기열·후보의 같은 id 카드에 모두 넣는다 */
  private fetchPreview(c: { id: string; isrc?: string; title: string; artist: string; workId?: string }): Promise<PreviewResult | null> {
    let p = this.previews.get(c.id);
    if (!p) {
      p = findMedia({
        isrc: c.isrc,
        title: c.title,
        artist: c.artist,
        // 영문 별칭은 앞쪽 카드에서 다른 방법이 모두 실패했을 때만 (MusicBrainz 1회, 캐시)
        aliases: () => getEnglishAliases({ workId: c.workId, recordingId: c.id }, { low: true }),
      })
        .catch((): MediaResult => ({ preview: null }))
        .then((m) => {
          for (const x of [...this.queue, ...this.pool]) {
            if (x.id !== c.id) continue;
            x.preview = m.preview;
            if (m.cover) x.cover = m.cover;
          }
          this.emit();
          return m.preview;
        });
      this.previews.set(c.id, p);
    }
    return p;
  }

  /** 대기열 뒤쪽 후보의 미리듣기 유무를 값싸게(Deezer ISRC 1회) 확인한다. 있으면 앞쪽에 오도록 정렬에 쓴다 */
  private quickChecked = new Set<string>();
  private quickPreview(card: DeckCard) {
    if (!card.isrc || card.preview !== undefined || this.quickChecked.has(card.id)) return;
    this.quickChecked.add(card.id);
    void findMedia({ isrc: card.isrc, title: card.title, artist: card.artist, quick: true }).then((m) => {
      if (m.cover && !card.cover) card.cover = m.cover;
      if (m.preview && card.preview === undefined) card.preview = m.preview;
      this.fillQueue();
      this.emit();
    });
  }

  /** 앞쪽 카드 미리듣기 주소를 미리 받아 둔다 */
  private prefetch() {
    for (const c of this.queue.slice(0, DECK.PREFETCH)) {
      if (c.preview === undefined) void this.fetchPreview(c);
      void this.loadCredits(c);
    }
  }

  /** 색인 카드의 크레딧 인물 이름을 채운다 (앞쪽 카드만: 인물 조각 파일을 받아야 하므로) */
  private loadingCredits = new Set<string>();
  private async loadCredits(card: DeckCard) {
    if (card.credits || !card.idxCredits || this.loadingCredits.has(card.id)) return;
    this.loadingCredits.add(card.id);
    const out: CardPerson[] = [];
    for (const [pid, code] of card.idxCredits) {
      const roles = IDX_ROLES[code];
      if (!roles || out.length >= DECK.MAX_PEOPLE) continue;
      const p = await getIdxPerson(pid);
      if (!p || isSpecialPurpose(p)) continue;
      out.push({ personId: pid, name: p.n, disambiguation: p.d, role: IDX_ROLE_LABEL[code], roles });
    }
    card.credits = out;
    this.emit();
  }

  /** 카드의 '이 곡을 만든 사람'을 눌러 그 사람으로 파기 (대기열에 없던 사람이면 합류시킨 뒤 집중) */
  digPerson(p: CardPerson, fromTitle?: string) {
    if (!this.people.has(p.personId)) {
      this.people.set(p.personId, {
        personId: p.personId,
        name: p.name,
        disambiguation: p.disambiguation,
        role: p.roles[0] ?? p.role,
        roles: p.roles,
        weight: WEIGHT.KEEP,
        fromTitle,
        exhausted: false,
      });
      this.exhausted = false;
    }
    this.focus(p.personId);
  }

  /** 카드의 가수를 눌러 가수 축으로 파기: 그 가수가 부른 다른 곡. 사용자가 직접 고른 경우에만 쓴다 */
  async digSinger(card: DeckCard) {
    const ctl = this.ctl;
    if (!ctl) return;
    let id = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(card.primaryArtist) ? card.primaryArtist : undefined;
    if (!id) {
      try {
        // 색인 카드는 가수 ID가 없어 이때만 녹음을 한 번 조회한다
        id = (await getRecordingLite(card.id, { low: true, signal: ctl.signal })).artistIds[0];
      } catch {
        return;
      }
    }
    if (!id || ctl.signal.aborted) return;
    if (!this.people.has(id)) {
      this.people.set(id, {
        personId: id,
        name: card.artist,
        role: PERFORMER_ROLE,
        roles: [PERFORMER_ROLE],
        performer: true,
        weight: WEIGHT.PERFORMER,
        fromTitle: card.title,
        exhausted: false,
      });
      this.exhausted = false;
    }
    this.focus(id);
  }

  /** 재생 버튼·넘길 때 쓰는 미리듣기 조회 (미리 받는 중이면 그 결과를 기다린다) */
  ensurePreview(card: { id: string; isrc?: string; title: string; artist: string; workId?: string }): Promise<PreviewResult | null> {
    return this.fetchPreview(card);
  }
}
