import { mbGet } from "./client";
import type {
  MbArtistCredit,
  MbArtistLookup,
  MbRecordingBrowse,
  MbRecordingLookup,
  MbRelation,
  MbSearchRecording,
  MbSearchResponse,
} from "./types";

/* ───────────────────────── 공통 ───────────────────────── */

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
  disambiguation: string;
  firstReleaseDate: string;
  releaseTitle: string;
  hasIsrc: boolean;
  score: number;
}

const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;
const esc = (s: string) => s.replace(LUCENE_SPECIAL, "\\$&");
const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

function toHit(r: MbSearchRecording): SearchHit {
  return {
    id: r.id,
    title: r.title,
    artist: creditText(r["artist-credit"]),
    disambiguation: r.disambiguation ?? "",
    firstReleaseDate: r["first-release-date"] ?? "",
    releaseTitle: r.releases?.[0]?.title ?? "",
    hasIsrc: (r.isrcs?.length ?? 0) > 0,
    score: r.score,
  };
}

function tokens(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => normalizeLoose(t))
    .filter(Boolean);
}

/** 상위 결과 중 질의 단어를 모두 (제목+가수에) 포함하는 결과가 있으면 '맞는 결과'로 본다 */
function looksRelevant(q: string, hits: SearchHit[]): boolean {
  const ts = tokens(q);
  return hits.slice(0, 5).some((h) => {
    const hay = normalizeLoose(`${h.title} ${h.artist}`);
    return ts.every((t) => hay.includes(t));
  });
}

function rank(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.hasIsrc) - Number(a.hasIsrc) ||
      Number(!b.disambiguation) - Number(!a.disambiguation),
  );
}

async function runQuery(query: string): Promise<SearchHit[]> {
  const res = await mbGet<MbSearchResponse>("recording", { query, limit: "10" });
  return (res.recordings ?? []).map(toHit);
}

/** 질의를 (제목, 가수) 후보로 나눈다. "제목 - 가수" 형식이면 그대로 사용 */
function splitCandidates(q: string): Array<[string, string]> {
  const sep = q.split(/\s+[-–/|]\s+/);
  if (sep.length === 2 && sep[0].trim() && sep[1].trim()) return [[sep[0].trim(), sep[1].trim()]];
  const words = q.trim().split(/\s+/);
  if (words.length < 2) return [];
  const out: Array<[string, string]> = [];
  out.push([words.slice(0, -1).join(" "), words[words.length - 1]]); // 제목 … 가수
  out.push([words.slice(1).join(" "), words[0]]); // 가수 제목 …
  if (words.length >= 4) out.push([words.slice(0, -2).join(" "), words.slice(-2).join(" ")]);
  return out;
}

/**
 * 녹음 검색.
 * 1) 일반 검색 → 2) recording:"제목" AND artist:"가수" → 3) "제목" 가수
 * 일반 검색이 0건이거나 질의 단어와 맞지 않는 결과뿐이면 2·3단계로 재검색한다.
 */
export async function searchRecordings(q: string): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];

  const sep = splitCandidates(query);
  const explicit = sep.length === 1 && /\s+[-–/|]\s+/.test(query);

  let first: SearchHit[] = [];
  if (!explicit) {
    first = await runQuery(esc(query));
    if (first.length && looksRelevant(query, first)) return rank(first);
  }

  for (const [title, artist] of sep) {
    let hits: SearchHit[] = [];
    try {
      hits = await runQuery(`recording:${quote(title)} AND artist:${quote(artist)}`);
    } catch {
      hits = [];
    }
    if (!hits.length) hits = await runQuery(`${quote(title)} ${esc(artist)}`);
    if (hits.length && looksRelevant(`${title} ${artist}`, hits)) return rank(hits);
  }
  return rank(first);
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

/** 녹음 버전 표기 중 대표곡에서 제외할 것 */
const NON_ORIGINAL = /(inst|instrumental|mr|remix|live|karaoke|acoustic|ver\.|version|edit|mix|demo|sped|slowed|반주|라이브)/i;

export async function getArtistCredits(mbid: string): Promise<PersonDetail> {
  const a = await mbGet<MbArtistLookup>(`artist/${mbid}`, { inc: "work-rels+recording-rels" });
  const byTitle = new Map<string, PersonItem>();

  const add = (kind: PersonItem["kind"], id: string, title: string, dis: string, rel: MbRelation) => {
    const label = roleLabel(rel);
    const key = normalizeTitle(title) || id;
    const cur = byTitle.get(key);
    if (cur) {
      if (!cur.roles.includes(label)) cur.roles.push(label);
      // 같은 제목이면 버전 표기 없는 녹음을 대표로
      if (kind === "recording" && (cur.kind === "work" || (cur.disambiguation && !dis))) {
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
      if (NON_ORIGINAL.test(dis) || NON_ORIGINAL.test(rel.recording.title.replace(/^[^(]*/, ""))) {
        // 리믹스·라이브 등 버전 녹음은 원곡이 따로 없을 때만 남긴다
        const key = normalizeTitle(rel.recording.title);
        if (byTitle.has(key)) {
          const cur = byTitle.get(key)!;
          const label = roleLabel(rel);
          if (!cur.roles.includes(label)) cur.roles.push(label);
          continue;
        }
      }
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
export async function getWorkRecordings(workId: string): Promise<WorkRecording[]> {
  const res = await mbGet<MbRecordingBrowse>("recording", {
    work: workId,
    inc: "artist-credits+isrcs",
    limit: "100",
  });
  return (res.recordings ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    artist: creditText(r["artist-credit"]),
    artistIds: (r["artist-credit"] ?? []).map((c) => c.artist.id),
    disambiguation: r.disambiguation ?? "",
    length: r.length,
    firstReleaseDate: r["first-release-date"] ?? "",
    isrcs: r.isrcs ?? [],
    video: r.video,
  }));
}

function originalness(r: WorkRecording): number {
  let s = 0;
  if (r.video) s -= 10;
  if (r.disambiguation) s -= NON_ORIGINAL.test(r.disambiguation) ? 4 : 1;
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

export async function resolveWorkToRecording(workId: string): Promise<WorkRecording | undefined> {
  return pickRepresentative(await getWorkRecordings(workId));
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
