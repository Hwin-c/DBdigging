import { TwoLevelCache, type RunOptions } from "../cache";
import { isBackingTrack, isVersionRecording } from "../filters";
import { deezerSearchTop } from "../preview";
import { mbGet } from "./client";
import type {
  MbArtistCredit,
  MbArtistLookup,
  MbArtistSearchResponse,
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
  return (ac ?? []).map((c) => ({
    id: c.artist.id,
    name: c.artist.name,
    disambiguation: c.artist.disambiguation,
  }));
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
  /** artist-credit의 가수 MBID (곡 묶기용) */
  artistIds: string[];
  /** 가장 이른 Official·비컴필레이션 발매일 (없으면 "") */
  originalDate: string;
  /** 컴필레이션에만 실린 녹음 */
  compilationOnly: boolean;
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
    releaseTitle: originalRelease(r.releases ?? [])?.title ?? r.releases?.[0]?.title ?? "",
    hasIsrc: (r.isrcs?.length ?? 0) > 0,
    releaseCount: r.releases?.length ?? 0,
    video: !!r.video,
    score: r.score,
    artistIds: ac.map((c) => c.artist.id),
    ...originalInfo(r.releases ?? []),
  };
}

const isCompilation = (rel: MbReleaseRef) => !!rel["release-group"]?.["secondary-types"]?.includes("Compilation");

/** 가장 이른 Official·비컴필레이션 발매 */
function originalRelease(releases: MbReleaseRef[]): MbReleaseRef | undefined {
  return releases
    .filter((x) => x.status === "Official" && !isCompilation(x) && x.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
}

/** 원곡 판별용: 가장 이른 Official·비컴필레이션 발매일, 컴필레이션에만 실렸는지 */
function originalInfo(releases: MbReleaseRef[]): { originalDate: string; compilationOnly: boolean } {
  return {
    originalDate: originalRelease(releases)?.date ?? "",
    compilationOnly: releases.length > 0 && releases.every(isCompilation),
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

/** 같은 곡(정규화 제목 + 첫 가수)의 대표: 버전·반주 아님 → 컴필레이션 아님 → 가장 이른 Official 발매 → 발매 수 */
function representativeOrder(a: SearchHit, b: SearchHit): number {
  const ver = (h: SearchHit) =>
    Number(isBackingTrack(h.title, h.disambiguation)) * 2 + Number(isVersionRecording(h.title, h.disambiguation));
  return (
    ver(a) - ver(b) ||
    Number(a.video) - Number(b.video) ||
    Number(a.compilationOnly) - Number(b.compilationOnly) ||
    Number(!a.originalDate) - Number(!b.originalDate) ||
    a.originalDate.localeCompare(b.originalDate) ||
    b.releaseCount - a.releaseCount
  );
}

/** 점수순 정렬 후 곡당 한 줄로 묶는다. 줄 순서는 묶음 안 최고 점수, 대표는 원곡 */
function rerank(hits: SearchHit[], q: string, splits: Array<[string, string]>): SearchHit[] {
  const seen = new Set<string>();
  const scored = hits
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .filter((h) => matchCount(q, h) > 0) // 질의 단어가 제목·가수 어디에도 없으면 제외
    .map((h) => ({ h, r: relevance(h, q, splits) }))
    .sort((a, b) => b.r - a.r || b.h.score - a.h.score);
  const groups = new Map<string, { best: number; members: SearchHit[] }>();
  for (const { h, r } of scored) {
    const key = `${normalizeTitle(h.title) || h.id}|${h.artistIds[0] ?? normalizeLoose(h.artist)}`;
    const g = groups.get(key);
    if (g) g.members.push(h);
    else groups.set(key, { best: r, members: [h] });
  }
  return [...groups.values()]
    .sort((a, b) => b.best - a.best)
    .map((g) => [...g.members].sort(representativeOrder)[0])
    .slice(0, 15);
}

async function runQuery(query: string, limit = 100): Promise<SearchHit[]> {
  const res = await mbGet<MbSearchResponse>("recording", { query, limit: String(limit) });
  return (res.recordings ?? []).map(toHit);
}

/** 질의의 가수 부분 단어가 모두 결과의 가수 이름에 있는지 */
function artistMatches(a: string, h: SearchHit): boolean {
  const ws = new Set([...h.artistNames.flatMap(words), ...words(h.artist)]);
  const joined = new Set([normalizeLoose(h.artist), ...h.artistNames.map(normalizeLoose)]);
  const ts = tokens(a);
  return ts.length > 0 && (joined.has(normalizeLoose(a)) || ts.every((t) => ws.has(t)));
}

/**
 * 질의의 가수 부분을 MusicBrainz 가수로 확정한다 (이름·별칭 일치, 예: 아이유 → IU).
 * 나누는 경우마다의 가수 후보를 OR로 묶어 한 번에 검색. 일치하는 (제목, 가수MBID) 쌍을 점수순으로 돌려준다.
 */
async function resolveArtists(
  splits: Array<[string, string]>,
): Promise<Array<{ title: string; artistId: string; names: string[] }>> {
  const parts = [...new Set(splits.map(([, a]) => a))];
  const query = parts.map((a) => `artist:${quote(a)} OR alias:${quote(a)}`).join(" OR ");
  const res = await mbGet<MbArtistSearchResponse>("artist", { query, limit: "15" });
  const out: Array<{ title: string; artistId: string; names: string[]; score: number }> = [];
  for (const art of res.artists ?? []) {
    if (art.score < 80) continue;
    const names = [art.name, art["sort-name"], ...(art.aliases ?? []).map((x) => x.name)];
    const norm = new Set(names.map(normalizeLoose));
    for (const [t, a] of splits) {
      if (norm.has(normalizeLoose(a))) out.push({ title: t, artistId: art.id, names, score: art.score });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 2);
}

/**
 * 녹음 검색.
 * 1) 가수 검색으로 가수 MBID를 확정(별칭 포함) → arid:{MBID} AND recording:"{제목}"
 *    결과에 제목이 맞는 곡이 없으면 실패로 본다
 * 2) 실패하면 (제목, 가수)로 나누는 모든 경우를 OR로 묶은 recording AND artist 검색
 * 3) 그래도 없으면 일반 검색
 * 결과는 점수순으로 곡당 한 줄로 묶고, 원곡(가장 이른 Official 발매, 컴필레이션 감점)을 대표로 쓴다.
 */
export async function searchRecordings(q: string): Promise<SearchHit[]> {
  const query = q.trim().replace(/\s+/g, " ");
  if (!query) return [];
  const splits = splitCandidates(query);

  if (splits.length) {
    let pairs: Awaited<ReturnType<typeof resolveArtists>> = [];
    try {
      pairs = await resolveArtists(splits);
    } catch {
      pairs = [];
    }
    for (const pr of pairs) {
      let hits: SearchHit[] = [];
      try {
        hits = await runQuery(`arid:${pr.artistId} AND recording:${quote(pr.title)}`);
      } catch {
        hits = [];
      }
      const want = normalizeTitle(pr.title);
      if (!hits.some((h) => normalizeTitle(h.title) === want)) continue;
      // 별칭(예: 아이유)도 가수 일치로 본다
      for (const h of hits) h.artistNames.push(...pr.names);
      const ranked = rerank(hits, query, splits);
      if (ranked.length) return ranked;
    }

    const fielded = splits.map(([t, a]) => `(recording:${quote(t)} AND artist:${quote(a)})`).join(" OR ");
    let hits: SearchHit[] = [];
    try {
      hits = await runQuery(fielded);
    } catch {
      hits = [];
    }
    // 제목이 맞고 가수도 맞는 결과만 (예: "Get Lucky" → recording:"Get" AND artist:"Lucky" 같은 엉뚱한 결과 제외)
    const plausible = hits.filter((h) =>
      splits.some(([t, a]) => normalizeTitle(h.title) === normalizeTitle(t) && artistMatches(a, h)),
    );
    const ranked = rerank(plausible, query, splits);
    if (ranked.length) return ranked;
  }

  const plain = query.replace(/\s+[-–/|]\s+/, " ");

  // 가수를 못 정했으면(예: "Get Lucky") Deezer 인기순 검색으로 가수를 추정해 제목+가수로 다시 찾는다
  const guess = (await deezerSearchTop(plain)).find((x) => {
    const t = normalizeTitle(x.title);
    return t.length > 0 && normalizeLoose(plain).includes(t);
  });
  if (guess) {
    let hits: SearchHit[] = [];
    try {
      hits = await runQuery(`recording:${quote(guess.title)} AND artist:${quote(guess.artist)}`);
    } catch {
      hits = [];
    }
    const pair: Array<[string, string]> = [[guess.title, guess.artist]];
    const ok = hits.filter((h) => normalizeTitle(h.title) === normalizeTitle(guess.title) && artistMatches(guess.artist, h));
    const ranked = rerank(ok, `${guess.title} ${guess.artist}`, pair);
    if (ranked.length) return ranked;
  }

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
  releaseGroupId?: string;
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

  const artists = creditArtists(r["artist-credit"]);

  // 이 녹음에 핵심 제작 크레딧이 전혀 없으면, 같은 가수·같은 제목의 다른 녹음(예: 원곡/다른 발매본)에 연결된 작품·크레딧을 찾아 보충한다
  if (![...people.values()].some((c) => c.roles.some(isCoreRole)) && artists[0]?.id) {
    try {
      const want = normalizeTitle(r.title);
      const hits = await runQuery(`arid:${artists[0].id} AND recording:${quote(r.title)}`, 10);
      const sib = hits
        .filter((h) => h.id !== r.id && !h.video && normalizeTitle(h.title) === want)
        .sort(representativeOrder)[0];
      if (sib) {
        const sr = await mbGet<MbRecordingLookup>(`recording/${sib.id}`, {
          inc: "artist-rels+work-rels+work-level-rels",
        });
        const srels = sr.relations ?? [];
        for (const rel of srels) {
          if (rel["target-type"] === "work" && rel.work) {
            if (!works.some((w) => w.id === rel.work!.id)) {
              works.push({ id: rel.work.id, title: rel.work.title });
            }
            collectCredits(rel.work.relations ?? [], people);
          }
        }
        collectCredits(srels, people);
      }
    } catch {
      /* 형제 녹음 조회가 실패하면 현재 녹음 정보만 사용한다 */
    }
  }

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
    artists,
    disambiguation: r.disambiguation ?? "",
    length: r.length,
    firstReleaseDate: r["first-release-date"] ?? releases[0]?.date ?? "",
    releaseTitle: releases[0]?.title ?? "",
    releaseGroupId: derived.get<BatchRecording>(`rec:${r.id}`)?.releaseGroupId ?? pickReleaseGroup(r.releases ?? []),
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
  /** 가수(arid) 녹음까지 함께 조회했는지 */
  hasPerformerRecordings?: boolean;
}

export async function getArtistCredits(
  mbid: string,
  opts?: RunOptions & { includePerformer?: boolean },
): Promise<PersonDetail> {
  const ck = `artist:v4:${mbid}`; // v4: 가창 녹음(arid)은 가수 축(includePerformer)일 때만 보충
  const hit = derived.get<PersonDetail>(ck);
  if (hit && (!opts?.includePerformer || hit.hasPerformerRecordings)) return hit;
  const detail = await fetchArtistCredits(mbid, opts);
  derived.set(ck, detail);
  return detail;
}

async function fetchArtistCredits(
  mbid: string,
  opts?: RunOptions & { includePerformer?: boolean },
): Promise<PersonDetail> {
  const a = await mbGet<MbArtistLookup>(`artist/${mbid}`, { inc: "work-rels+recording-rels" }, opts);
  const byTitle = new Map<string, PersonItem>();

  /** 같은 제목은 한 줄: 작품(원곡 대표를 따로 고름) 또는 버전 표기 없는 녹음을 대표로 */
  const add = (kind: PersonItem["kind"], id: string, title: string, dis: string, label: string) => {
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
      add("work", rel.work.id, rel.work.title, rel.work.disambiguation ?? "", roleLabel(rel));
    } else if (rel["target-type"] === "recording" && rel.recording && !rel.recording.video) {
      const dis = rel.recording.disambiguation ?? "";
      if (isBackingTrack(rel.recording.title, dis)) continue; // 반주 버전은 목록에서 뺀다
      add("recording", rel.recording.id, rel.recording.title, dis, roleLabel(rel));
    }
  }

  // 가수 축(핵심 크레딧이 하나도 없는 곡을 파고들 때)에서만 가창 녹음(arid:<mbid>)을 모은다.
  // 작곡·작사·편곡·프로듀서 인물에게는 모으지 않는다: '같은 사람이 만든 곡'에 노래 곡이 섞이고 호출도 늘기 때문
  const needPerformer = !!opts?.includePerformer;
  if (needPerformer) {
    try {
      const res = await mbGet<MbSearchResponse>(
        "recording",
        { query: `arid:${mbid}`, limit: "50" },
        opts,
      );
      const hits = (res.recordings ?? [])
        .filter((r) => !r.video && !isBackingTrack(r.title, r.disambiguation ?? ""))
        .map((r) => ({ r, h: toHit(r) }))
        .sort((x, y) => representativeOrder(x.h, y.h));
      for (const { r } of hits) {
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
        derived.set(`rec:${r.id}`, rec);
        add("recording", r.id, r.title, r.disambiguation ?? "", "노래");
      }
    } catch (e) {
      if (opts?.signal?.aborted) throw e;
      /* 가창 녹음 보충 실패 시 기존 크레딧만 사용 */
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
    hasPerformerRecordings: needPerformer,
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
