import { TwoLevelCache, type RunOptions } from "../cache";
import { isBackingTrack, isVersionRecording } from "../filters";
import { mbGet } from "./client";
import type {
  MbArtistCredit,
  MbArtistLookup,
  MbRecordingBrowse,
  MbRecordingLookup,
  MbRelation,
  MbReleaseRef,
  MbSearchRecording,
  MbSearchResponse,
} from "./types";

/* ───────────────────────── 공통 ───────────────────────── */

/**
 * 가공한 결과 캐시 (localStorage 7일). 인물·작품 원본 응답은 커서 저장 한도를 넘기 쉬우므로
 * 필요한 필드만 남긴 결과를 따로 저장해, 한 번 본 인물·작품은 다시 호출하지 않는다.
 */
const derived = new TwoLevelCache("mbd:", 400_000);

export interface ArtistLite {
  id: string;
  name: string;
  disambiguation?: string;
}

export function creditText(ac: MbArtistCredit[] | undefined): string {
  if (!ac?.length) return "";
  return ac.map((c) => c.name + (c.joinphrase ?? "")).join("");
}

function creditArtists(ac: MbArtistCredit[] | undefined): ArtistLite[] {
  return (ac ?? []).map((c) => ({ id: c.artist.id, name: c.artist.name }));
}

/** 제목 비교용 정규화: 괄호 안 버전 표기·문장부호·공백 제거, 소문자 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, " ")
    .replace(/\b(feat|ft)\.?\s.*$/i, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/* ───────────────────────── 역할 ───────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  composer: "작곡",
  lyricist: "작사",
  writer: "작사·작곡",
  arranger: "편곡",
  producer: "프로듀서",
};

const TASK_LABELS: Record<string, string> = {
  producer: "프로듀서",
  composer: "작곡",
  lyricist: "작사",
  arranger: "편곡",
};

/** 표시 순서 (작은 값이 먼저) */
const ROLE_ORDER = ["작곡", "작사·작곡", "작사", "편곡", "프로듀서"];

export function roleOrder(label: string): number {
  const i = ROLE_ORDER.indexOf(label);
  return i === -1 ? ROLE_ORDER.length : i;
}

/** 관계 하나를 한국어 역할 표기로 변환. 작품의 performance 등 크레딧이 아닌 관계는 null */
export function roleLabel(rel: MbRelation): string {
  const known = ROLE_LABELS[rel.type];
  if (known) return known;
  const task = rel["attribute-values"]?.task;
  if (task) return TASK_LABELS[task.trim().toLowerCase()] ?? task;
  return `기타 참여(${rel.type})`;
}

/** 크레딧의 핵심 역할(작곡·작사·편곡·프로듀서)인지 */
export function isCoreRole(label: string): boolean {
  return ROLE_ORDER.includes(label);
}

/* ───────────────────────── 검색 ───────────────────────── */

export interface SearchHit {
  id: string;
  title: string;
  artist: string;
  /** artist-credit의 개별 이름 (가수 일치 판단용) */
  artistNames: string[];
  disambiguation: string;
  firstReleaseDate: string;
  releaseTitle: string;
  hasIsrc: boolean;
  /** 이 녹음이 실린 발매 수 (원곡일수록 많다) */
  releaseCount: number;
  video: boolean;
  score: number;
}

const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;
const esc = (s: string) => s.replace(LUCENE_SPECIAL, "\\$&");
const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

function toHit(r: MbSearchRecording): SearchHit {
  const ac = r["artist-credit"] ?? [];
  return {
    id: r.id,
    title: r.title,
    artist: creditText(ac),
    artistNames: ac.flatMap((c) => [c.name, c.artist.name]),
    disambiguation: r.disambiguation ?? "",
    firstReleaseDate: r["first-release-date"] ?? "",
    releaseTitle: r.releases?.[0]?.title ?? "",
    hasIsrc: (r.isrcs?.length ?? 0) > 0,
    releaseCount: r.releases?.length ?? 0,
    video: !!r.video,
    score: r.score,
  };
}

function tokens(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => normalizeLoose(t))
    .filter(Boolean);
}

/** 제목·가수를 단어 단위로 나눈다 (밑줄·문장부호 포함 분리) */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\p{P}\p{S}_]+/u)
    .filter(Boolean);
}

/**
 * 질의 단어 중 제목·가수의 '단어'와 일치하는 수.
 * 부분 문자열이 아니라 단어 단위로 본다 (예: "AESPAsupernova_phixelremix"는 Supernova·aespa에 맞지 않음).
 * 여러 단어로 된 제목·가수는 질의 안에 이어 붙은 형태도 허용한다.
 */
function matchCount(q: string, h: SearchHit): number {
  const ws = new Set([...words(h.title), ...h.artistNames.flatMap(words), ...words(h.artist)]);
  const joined = new Set([normalizeLoose(h.title), normalizeLoose(h.artist), ...h.artistNames.map(normalizeLoose)]);
  return tokens(q).filter((t) => ws.has(t) || joined.has(t)).length;
}

/** 원곡이 아닌 버전 표기. 질의에 같은 단어가 없으면 감점 */
const VERSION_WORDS = ["cover", "remix", "karaoke", "lullaby", "instrumental", "inst", "live", "커버", "리믹스"];

function versionWords(text: string): string[] {
  const ws = new Set(words(text));
  const lower = text.toLowerCase();
  // 영문은 단어 단위, 한글은 부분 문자열 (예: "리믹스버전")
  return VERSION_WORDS.filter((w) => (/^[a-z]+$/.test(w) ? ws.has(w) : lower.includes(w)));
}

/** 질의를 (제목, 가수) 후보로 나눈다. "제목 - 가수" 형식이면 그대로 사용 */
function splitCandidates(q: string): Array<[string, string]> {
  const sep = q.split(/\s+[-–/|]\s+/);
  if (sep.length === 2 && sep[0].trim() && sep[1].trim()) return [[sep[0].trim(), sep[1].trim()]];
  const ws = q.trim().split(/\s+/);
  if (ws.length < 2) return [];
  const out: Array<[string, string]> = [];
  for (let k = 1; k <= Math.min(3, ws.length - 1); k++) {
    out.push([ws.slice(0, -k).join(" "), ws.slice(-k).join(" ")]); // 제목 … 가수
    out.push([ws.slice(k).join(" "), ws.slice(0, k).join(" ")]); // 가수 … 제목
  }
  return out;
}

/**
 * 결과 점수: 가수 일치·제목 일치·ISRC·발매 수 가점, 질의에 없는 버전 표기·괄호 표기·영상 감점.
 * 실제 검색 응답에는 isrcs가 오지 않아(확인: Get Lucky 질의) 원곡 판별은 발매 수가 주로 맡는다.
 * 예: Get Lucky 원곡 833f00e1은 발매 33개, 같은 제목의 다른 녹음은 대부분 1개.
 */
function relevance(h: SearchHit, q: string, splits: Array<[string, string]>): number {
  let s = matchCount(q, h) * 10;
  const names = new Set([normalizeLoose(h.artist), ...h.artistNames.map(normalizeLoose)]);
  const title = normalizeTitle(h.title);
  let best = 0;
  for (const [t, a] of splits) {
    const artistHit = names.has(normalizeLoose(a));
    const titleHit = title === normalizeTitle(t);
    best = Math.max(best, (artistHit ? 40 : 0) + (titleHit ? 20 : 0));
  }
  s += best;
  const qWords = new Set(versionWords(q));
  const vs = versionWords(`${h.title} ${h.disambiguation}`).filter((w) => !qWords.has(w));
  if (vs.length) s -= 50;
  if (h.hasIsrc) s += 8;
  s += Math.min(25, Math.round(6 * Math.log2(1 + h.releaseCount)));
  // 질의에 없는 괄호 표기 (예: "(DMC Hotmix)", "(Sundance version)")
  const paren = h.title.match(/[([].*?[)\]]/g)?.join(" ") ?? "";
  if (paren && matchCount(q, { ...h, title: paren, artist: "", artistNames: [] }) === 0) s -= 10;
  if (h.video) s -= 30;
  if (h.disambiguation) s -= 1;
  return s;
}

function rerank(hits: SearchHit[], q: string, splits: Array<[string, string]>): SearchHit[] {
  const seen = new Set<string>();
  return hits
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .filter((h) => matchCount(q, h) > 0) // 질의 단어가 제목·가수 어디에도 없으면 제외
    .map((h) => ({ h, r: relevance(h, q, splits) }))
    .sort((a, b) => b.r - a.r || b.h.score - a.h.score)
    .map((x) => x.h)
    .slice(0, 15);
}

async function runQuery(query: string, limit = 100): Promise<SearchHit[]> {
  const res = await mbGet<MbSearchResponse>("recording", { query, limit: String(limit) });
  return (res.recordings ?? []).map(toHit);
}

/**
 * 녹음 검색.
 * 1) 질의를 (제목, 가수)로 나눌 수 있으면 나누는 모든 경우를 OR로 묶어
 *    (recording:"제목" AND artist:"가수") 한 번에 요청
 * 2) 결과가 없을 때만 일반 검색
 * 결과는 가수 일치·버전 표기·ISRC로 다시 정렬하고, 질의 단어가 하나도 없는 결과는 뺀다.
 */
export async function searchRecordings(q: string): Promise<SearchHit[]> {
  const query = q.trim().replace(/\s+/g, " ");
  if (!query) return [];
  const splits = splitCandidates(query);

  if (splits.length) {
    const fielded = splits.map(([t, a]) => `(recording:${quote(t)} AND artist:${quote(a)})`).join(" OR ");
    let hits: SearchHit[] = [];
    try {
      hits = await runQuery(fielded);
    } catch {
      hits = [];
    }
    const ranked = rerank(hits, query, splits);
    if (ranked.length) return ranked;
  }

  const plain = query.replace(/\s+[-–/|]\s+/, " ");
  return rerank(await runQuery(esc(plain)), plain, splits);
}

/* ───────────────────────── 곡 상세 ───────────────────────── */

export interface PersonCredit {
  artist: ArtistLite;
  roles: string[];
}

export interface RecordingDetail {
  id: string;
  title: string;
  artist: string;
  artists: ArtistLite[];
  disambiguation: string;
  length: number | null;
  firstReleaseDate: string;
  releaseTitle: string;
  isrcs: string[];
  works: Array<{ id: string; title: string }>;
  credits: PersonCredit[];
  youtube: string[];
}

const YT_RE = /(^|\.)(youtube\.com|youtu\.be)$/i;

export function isYoutubeUrl(u: string): boolean {
  try {
    return YT_RE.test(new URL(u).hostname);
  } catch {
    return false;
  }
}

/** 관계 목록에서 인물별 역할을 묶는다 (같은 인물 여러 역할 → 한 줄) */
function collectCredits(rels: MbRelation[], into: Map<string, PersonCredit>) {
  for (const rel of rels) {
    if (rel["target-type"] !== "artist" || !rel.artist) continue;
    const label = roleLabel(rel);
    const cur = into.get(rel.artist.id) ?? {
      artist: {
        id: rel.artist.id,
        name: rel.artist.name,
        disambiguation: rel.artist.disambiguation,
      },
      roles: [],
    };
    if (!cur.roles.includes(label)) cur.roles.push(label);
    into.set(rel.artist.id, cur);
  }
}

export function sortCredits(list: PersonCredit[]): PersonCredit[] {
  for (const c of list) c.roles.sort((a, b) => roleOrder(a) - roleOrder(b));
  return list.sort(
    (a, b) =>
      Math.min(...a.roles.map(roleOrder)) - Math.min(...b.roles.map(roleOrder)) ||
      b.roles.filter(isCoreRole).length - a.roles.filter(isCoreRole).length ||
      a.artist.name.localeCompare(b.artist.name),
  );
}

export async function getRecording(mbid: string): Promise<RecordingDetail> {
  const r = await mbGet<MbRecordingLookup>(`recording/${mbid}`, {
    inc: "artist-credits+isrcs+releases+artist-rels+work-rels+work-level-rels+url-rels",
  });
  const rels = r.relations ?? [];
  const people = new Map<string, PersonCredit>();
  // 작품(작곡·작사 등) 먼저, 녹음 단위 참여자(프로듀서·편곡 등) 다음
  const works: RecordingDetail["works"] = [];
  for (const rel of rels) {
    if (rel["target-type"] === "work" && rel.work) {
      works.push({ id: rel.work.id, title: rel.work.title });
      collectCredits(rel.work.relations ?? [], people);
    }
  }
  collectCredits(rels, people);

  const youtube = rels
    .filter((x) => x["target-type"] === "url" && x.url && isYoutubeUrl(x.url.resource))
    .map((x) => x.url!.resource);

  const releases = [...(r.releases ?? [])].sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999"),
  );

  return {
    id: r.id,
    title: r.title,
    artist: creditText(r["artist-credit"]),
    artists: creditArtists(r["artist-credit"]),
    disambiguation: r.disambiguation ?? "",
    length: r.length,
    firstReleaseDate: r["first-release-date"] ?? releases[0]?.date ?? "",
    releaseTitle: releases[0]?.title ?? "",
    isrcs: r.isrcs ?? [],
    works,
    credits: sortCredits([...people.values()]),
    youtube: [...new Set(youtube)],
  };
}

/* ───────────────────────── 인물 ───────────────────────── */

export interface PersonItem {
  /** recording이면 바로 열고, work면 대표 녹음을 찾아서 연다 */
  kind: "recording" | "work";
  id: string;
  title: string;
  disambiguation: string;
  roles: string[];
}

export interface PersonDetail {
  artist: ArtistLite & { type: string | null; country: string | null };
  items: PersonItem[];
}

export async function getArtistCredits(mbid: string, opts?: RunOptions): Promise<PersonDetail> {
  const ck = `artist:v2:${mbid}`; // v2: 반주 제외·원곡 대표 규칙 변경
  const hit = derived.get<PersonDetail>(ck);
  if (hit) return hit;
  const detail = await fetchArtistCredits(mbid, opts);
  derived.set(ck, detail);
  return detail;
}

async function fetchArtistCredits(mbid: string, opts?: RunOptions): Promise<PersonDetail> {
  const a = await mbGet<MbArtistLookup>(`artist/${mbid}`, { inc: "work-rels+recording-rels" }, opts);
  const byTitle = new Map<string, PersonItem>();

  /** 같은 제목은 한 줄: 작품(원곡 대표를 따로 고름) 또는 버전 표기 없는 녹음을 대표로 */
  const add = (kind: PersonItem["kind"], id: string, title: string, dis: string, rel: MbRelation) => {
    const label = roleLabel(rel);
    const key = normalizeTitle(title) || id;
    const cur = byTitle.get(key);
    const isVersion = kind === "recording" && isVersionRecording(title, dis);
    if (cur) {
      if (!cur.roles.includes(label)) cur.roles.push(label);
      const curIsVersion = cur.kind === "recording" && isVersionRecording(cur.title, cur.disambiguation);
      // 버전 녹음(Japanese Ver., Remix 등)은 작품·원곡 녹음이 있으면 대표가 될 수 없다
      const better =
        (curIsVersion && !isVersion) || // 원곡 녹음·작품이 버전 녹음을 대신
        (kind === "recording" && !isVersion && cur.kind === "work"); // 원곡 녹음은 작품보다 바로 열 수 있어 우선
      if (better) {
        cur.kind = kind;
        cur.id = id;
        cur.title = title;
        cur.disambiguation = dis;
      }
      return;
    }
    byTitle.set(key, { kind, id, title, disambiguation: dis, roles: [label] });
  };

  for (const rel of a.relations ?? []) {
    if (rel["target-type"] === "work" && rel.work) {
      add("work", rel.work.id, rel.work.title, rel.work.disambiguation ?? "", rel);
    } else if (rel["target-type"] === "recording" && rel.recording && !rel.recording.video) {
      const dis = rel.recording.disambiguation ?? "";
      if (isBackingTrack(rel.recording.title, dis)) continue; // 반주 버전은 목록에서 뺀다
      add("recording", rel.recording.id, rel.recording.title, dis, rel);
    }
  }

  const items = [...byTitle.values()];
  for (const it of items) it.roles.sort((x, y) => roleOrder(x) - roleOrder(y));
  items.sort(
    (x, y) =>
      Math.min(...x.roles.map(roleOrder)) - Math.min(...y.roles.map(roleOrder)) ||
      x.title.localeCompare(y.title),
  );

  return {
    artist: {
      id: a.id,
      name: a.name,
      disambiguation: a.disambiguation,
      type: a.type,
      country: a.country,
    },
    items,
  };
}

/* ───────────────────────── 작품 → 녹음 ───────────────────────── */

export interface WorkRecording {
  id: string;
  title: string;
  artist: string;
  artistIds: string[];
  disambiguation: string;
  length: number | null;
  firstReleaseDate: string;
  isrcs: string[];
  video: boolean;
}

/**
 * 작품에 연결된 녹음 목록.
 * /work/<mbid>?inc=recording-rels 응답에는 가수·ISRC가 없어서,
 * 같은 연결을 가수·ISRC와 함께 돌려주는 browse 요청(recording?work=)을 사용한다.
 */
export async function getWorkRecordings(workId: string, opts?: RunOptions): Promise<WorkRecording[]> {
  const res = await mbGet<MbRecordingBrowse>(
    "recording",
    { work: workId, inc: "artist-credits+isrcs", limit: "100" },
    opts,
  );
  return (res.recordings ?? []).map(toWorkRecording);
}

type BrowseRec = MbRecordingBrowse["recordings"][number];

function toWorkRecording(r: BrowseRec): WorkRecording {
  return {
    id: r.id,
    title: r.title,
    artist: creditText(r["artist-credit"]),
    artistIds: (r["artist-credit"] ?? []).map((c) => c.artist.id),
    disambiguation: r.disambiguation ?? "",
    length: r.length,
    firstReleaseDate: r["first-release-date"] ?? "",
    isrcs: r.isrcs ?? [],
    video: r.video,
  };
}

/** 가벼운 녹음 조회 (추천 후보용): 가수·ISRC만 */
export async function getRecordingLite(mbid: string, opts?: RunOptions): Promise<WorkRecording> {
  const r = await mbGet<BrowseRec>(`recording/${mbid}`, { inc: "artist-credits+isrcs" }, opts);
  return toWorkRecording(r);
}

function originalness(r: WorkRecording): number {
  let s = 0;
  if (r.video) s -= 10;
  if (isBackingTrack(r.title, r.disambiguation)) s -= 20;
  if (isVersionRecording(r.title, r.disambiguation)) s -= 6;
  else if (r.disambiguation) s -= 1;
  if (/[([]/.test(r.title)) s -= 2;
  if (r.isrcs.length) s += 2;
  return s;
}

/** 작품의 대표 녹음: 버전 표기 없음·ISRC 있음·가장 이른 발매 */
export function pickRepresentative(recs: WorkRecording[]): WorkRecording | undefined {
  return [...recs].sort(
    (a, b) =>
      originalness(b) - originalness(a) ||
      (a.firstReleaseDate || "9999").localeCompare(b.firstReleaseDate || "9999"),
  )[0];
}

export async function resolveWorkToRecording(
  workId: string,
  opts?: RunOptions,
): Promise<WorkRecording | undefined> {
  const ck = `work-rep:v2:${workId}`;
  const hit = derived.get<WorkRecording | null>(ck);
  if (hit !== undefined) return hit ?? undefined;
  const rep = pickRepresentative(await getWorkRecordings(workId, opts));
  derived.set(ck, rep ?? null);
  return rep;
}

/**
 * 녹음에 ISRC가 없을 때 같은 작품·같은 가수·같은 제목의 다른 녹음에서 ISRC를 빌려 온다.
 * (예: Get Lucky 앨범 녹음에는 ISRC가 없고 radio edit 녹음에는 있음)
 */
export async function findIsrcFallback(
  d: RecordingDetail,
): Promise<{ isrc: string; recording: WorkRecording } | undefined> {
  if (d.isrcs.length || !d.works.length) return undefined;
  const mainArtist = d.artists[0]?.id;
  const want = normalizeTitle(d.title);
  const recs = await getWorkRecordings(d.works[0].id);
  const pool = recs.filter(
    (r) =>
      r.isrcs.length &&
      !r.video &&
      (!mainArtist || r.artistIds.includes(mainArtist)) &&
      normalizeTitle(r.title) === want &&
      !/(live|remix|karaoke|instrumental)/i.test(r.disambiguation),
  );
  if (!pool.length) return undefined;
  const len = d.length ?? 0;
  pool.sort(
    (a, b) =>
      Math.abs((a.length ?? 1e9) - len) - Math.abs((b.length ?? 1e9) - len) ||
      (a.firstReleaseDate || "9999").localeCompare(b.firstReleaseDate || "9999"),
  );
  return { isrc: pool[0].isrcs[0], recording: pool[0] };
}

/* ───────────────────────── 녹음 묶음 조회 ───────────────────────── */

export interface BatchRecording extends WorkRecording {
  /** 커버용 앨범 묶음 (Cover Art Archive release-group) */
  releaseGroupId?: string;
}

const RID_BATCH = 25;

/**
 * 여러 녹음을 검색 한 번(rid:(a OR b …))으로 조회해 가수·ISRC·앨범 묶음을 받는다.
 * 검색 인덱스에 아직 없는 녹음은 하나씩 조회로 보충한다. 결과는 가공 캐시에 저장.
 * (wid:는 녹음 검색 필드가 아니어서 작품은 묶을 수 없음 — 2026-11-19 확인)
 */
export async function lookupRecordings(ids: string[], opts?: RunOptions): Promise<Map<string, BatchRecording>> {
  const out = new Map<string, BatchRecording>();
  const need: string[] = [];
  for (const id of new Set(ids)) {
    const hit = derived.get<BatchRecording>(`rec:${id}`);
    if (hit) out.set(id, hit);
    else need.push(id);
  }
  for (let i = 0; i < need.length; i += RID_BATCH) {
    const chunk = need.slice(i, i + RID_BATCH);
    try {
      const res = await mbGet<MbSearchResponse>(
        "recording",
        { query: `rid:(${chunk.join(" OR ")})`, limit: String(chunk.length) },
        opts,
      );
      for (const r of res.recordings ?? []) {
        const rec: BatchRecording = {
          id: r.id,
          title: r.title,
          artist: creditText(r["artist-credit"]),
          artistIds: (r["artist-credit"] ?? []).map((c) => c.artist.id),
          disambiguation: r.disambiguation ?? "",
          length: r.length ?? null,
          firstReleaseDate: r["first-release-date"] ?? "",
          isrcs: r.isrcs ?? [],
          video: !!r.video,
          releaseGroupId: pickReleaseGroup(r.releases ?? []),
        };
        out.set(r.id, rec);
        derived.set(`rec:${r.id}`, rec);
      }
    } catch (e) {
      if (opts?.signal?.aborted) throw e;
      /* 아래에서 하나씩 보충 */
    }
  }
  for (const id of need) {
    if (out.has(id)) continue;
    try {
      const rec = await getRecordingLite(id, opts);
      out.set(id, rec);
    } catch (e) {
      if (opts?.signal?.aborted) throw e;
      /* 실패한 후보는 건너뜀 */
    }
  }
  return out;
}

/** 커버로 쓸 앨범 묶음: Official·컴필레이션 아님·이른 발매 우선 */
function pickReleaseGroup(releases: MbReleaseRef[]): string | undefined {
  const scored = releases
    .filter((r) => r["release-group"]?.id)
    .map((r) => ({
      id: r["release-group"]!.id,
      s:
        (r.status === "Official" ? 2 : 0) +
        (r["release-group"]?.["secondary-types"]?.includes("Compilation") ? -3 : 0),
      d: r.date || "9999",
    }))
    .sort((a, b) => b.s - a.s || a.d.localeCompare(b.d));
  return scored[0]?.id;
}
