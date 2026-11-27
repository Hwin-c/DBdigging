import { normalizeTitle } from "./mb/api";

/**
 * 미리듣기 찾기.
 * 1) ISRC가 있으면 Deezer JSONP (CORS 없음). 미리듣기 URL은 만료되므로 저장하지 않고 재생할 때마다 새로 받는다.
 * 2) 없거나 실패하면 iTunes Search (KR → US).
 */

export interface PreviewResult {
  source: "deezer" | "itunes";
  url: string;
  /** 원본 서비스 곡 페이지 */
  link: string;
  /** 앨범 커버 (Deezer album.cover_medium/cover_big, 2026-11-19 응답 확인) */
  cover?: string;
}

interface DeezerTrack {
  id?: number;
  title?: string;
  preview?: string;
  link?: string;
  album?: { cover_medium?: string; cover_big?: string };
  error?: { type: string; message: string; code: number };
}

let jsonpSeq = 0;

function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__dbdig_dz_${Date.now().toString(36)}_${(jsonpSeq++).toString(36)}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      // 늦게 도착한 응답이 오류를 내지 않도록 빈 함수로 남겨 둔다
      w[name] = () => undefined;
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);
    w[name] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}output=jsonp&callback=${name}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };
    document.head.appendChild(script);
  });
}

/** Deezer ISRC 조회. 2026-11-27 확인: 곡은 있는데 preview가 ""인 경우가 있다(밤편지 KRA381700611: readable false). 그때도 커버는 쓸 수 있다 */
async function fromDeezerFull(isrc: string): Promise<{ preview: PreviewResult | null; cover?: string }> {
  const t = await jsonp<DeezerTrack>(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
  if (t.error) return { preview: null };
  const cover = t.album?.cover_big ?? t.album?.cover_medium;
  if (!t.preview) return { preview: null, cover };
  return {
    preview: { source: "deezer", url: t.preview, link: t.link ?? `https://www.deezer.com/track/${t.id}`, cover },
    cover,
  };
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
}

async function itunesSearch(term: string, country: string): Promise<ItunesResult[]> {
  const sp = new URLSearchParams({ term, media: "music", entity: "song", limit: "5", country });
  const res = await fetch(`https://itunes.apple.com/search?${sp.toString()}`);
  if (!res.ok) return [];
  const j = (await res.json()) as { resultCount: number; results: ItunesResult[] };
  return j.results ?? [];
}

const loose = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

function itunesScore(r: ItunesResult, title: string, artist: string): number {
  if (!r.previewUrl || !r.trackName) return -1;
  const want = normalizeTitle(title);
  const got = normalizeTitle(r.trackName);
  let s = 0;
  if (got === want) s += 3;
  else if (want && (got.includes(want) || want.includes(got))) s += 1;
  else return -1;
  const a = loose(artist);
  const ga = loose(r.artistName ?? "");
  if (a && ga && (ga.includes(a) || a.includes(ga))) s += 2;
  return s;
}

/** iTunes artwork는 100px 주소의 크기 표기를 바꿔 600px로 받는다 */
function itunesCover(url?: string): string | undefined {
  return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.$1") : undefined;
}

/** KR → US 순서. 제목이 맞고 미리듣기가 있는 결과 중 가수까지 맞는 것을 고른다 */
async function fromItunes(title: string, artist: string): Promise<PreviewResult | null> {
  const term = `${title} ${artist}`.trim();
  for (const country of ["KR", "US"]) {
    const results = await itunesSearch(term, country);
    const best = results
      .map((r) => ({ r, s: itunesScore(r, title, artist) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)[0];
    if (best)
      return {
        source: "itunes",
        url: best.r.previewUrl!,
        link: best.r.trackViewUrl ?? "",
        cover: itunesCover(best.r.artworkUrl100),
      };
  }
  return null;
}

interface DeezerSearchTrack {
  id?: number;
  title?: string;
  title_short?: string;
  preview?: string;
  link?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
}

/** Deezer 검색(JSONP). 제목·가수가 맞고 미리듣기가 있는 곡만. 가수·곡 지정 검색 → 일반 검색 순 */
async function fromDeezerSearch(title: string, artist: string): Promise<PreviewResult | null> {
  const want = normalizeTitle(title);
  const a = loose(artist);
  const queries = [`artist:"${artist}" track:"${title}"`, `${title} ${artist}`];
  for (const q of queries) {
    const r = await jsonp<{ data?: DeezerSearchTrack[] }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`);
    const hit = (r.data ?? []).find((x) => {
      if (!x.preview) return false;
      const got = normalizeTitle(x.title_short || x.title || "");
      if (!got || got !== want) return false;
      const ga = loose(x.artist?.name ?? "");
      return !!ga && !!a && (ga.includes(a) || a.includes(ga));
    });
    if (hit)
      return {
        source: "deezer",
        url: hit.preview!,
        link: hit.link ?? `https://www.deezer.com/track/${hit.id}`,
        cover: hit.album?.cover_big ?? hit.album?.cover_medium,
      };
  }
  return null;
}

export interface MediaResult {
  preview: PreviewResult | null;
  /** 앨범 커버: 미리듣기가 없어도 Deezer 곡 정보나 iTunes 결과에서 얻으면 채운다 */
  cover?: string;
}

/**
 * 미리듣기·커버 찾기. 순서:
 * 1) Deezer(ISRC)  2) iTunes(원제목, KR→US)  3) 영문 별칭으로 iTunes 재검색 (aliases를 주었을 때만, MusicBrainz 1회)
 * 4) Deezer 검색(가수·곡 지정, JSONP; 원제목과 별칭)
 * quick: 1)만 (대기열 뒤쪽 후보의 미리듣기 유무를 값싸게 확인할 때)
 * 끝까지 없으면 preview null (커버는 얻은 것이 있으면 함께 돌려준다)
 */
export async function findMedia(opts: {
  isrc?: string;
  title: string;
  artist: string;
  quick?: boolean;
  /** 영문 별칭 제목 (필요할 때만 불린다) */
  aliases?: () => Promise<string[]>;
}): Promise<MediaResult> {
  let cover: string | undefined;
  const done = (p: PreviewResult): MediaResult => ({ preview: p, cover: p.cover ?? cover });
  if (opts.isrc) {
    try {
      const d = await fromDeezerFull(opts.isrc);
      if (d.preview) return done(d.preview);
      cover = d.cover;
    } catch {
      /* 다음 단계로 */
    }
  }
  if (opts.quick) return { preview: null, cover };
  try {
    const it = await fromItunes(opts.title, opts.artist);
    if (it) return done(it);
  } catch {
    /* 다음 단계로 */
  }
  let names: string[] = [];
  if (opts.aliases) {
    try {
      names = (await opts.aliases()).filter((n) => normalizeTitle(n) && normalizeTitle(n) !== normalizeTitle(opts.title)).slice(0, 2);
    } catch {
      names = [];
    }
    for (const n of names) {
      try {
        const it = await fromItunes(n, opts.artist);
        if (it) return done(it);
      } catch {
        /* 다음 별칭 */
      }
    }
  }
  for (const t of [opts.title, ...names]) {
    try {
      const dz = await fromDeezerSearch(t, opts.artist);
      if (dz) return done(dz);
    } catch {
      /* 다음 후보 */
    }
  }
  return { preview: null, cover };
}

export async function findPreview(opts: {
  isrc?: string;
  title: string;
  artist: string;
}): Promise<PreviewResult | null> {
  return (await findMedia(opts)).preview;
}


interface DeezerSearch {
  data?: Array<{ title_short?: string; title?: string; artist?: { name?: string }; rank?: number }>;
}

/**
 * Deezer 검색(인기순)으로 질의에 맞는 곡의 (제목, 가수) 후보를 얻는다. 가수 없이 제목만 넣은 검색 보조용.
 * 2026-11-19 응답 확인: data[].title_short, data[].artist.name, data[].rank
 */
export async function deezerSearchTop(q: string, n = 3): Promise<Array<{ title: string; artist: string }>> {
  try {
    const r = await jsonp<DeezerSearch>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${n}`);
    return (r.data ?? [])
      .filter((x) => x.artist?.name && (x.title_short || x.title))
      .map((x) => ({ title: (x.title_short || x.title)!, artist: x.artist!.name! }));
  } catch {
    return [];
  }
}

/** 앨범 커버만 필요할 때: Deezer(ISRC)만 본다 (iTunes 호출 한도를 아끼기 위해) */
export async function findCover(isrc: string): Promise<string | null> {
  try {
    return (await fromDeezerFull(isrc)).cover ?? null;
  } catch {
    return null;
  }
}

/* ───────────── 공유 오디오 요소: 한 번에 한 곡만 재생 ───────────── */

/** blocked: 브라우저(휴대폰)가 사용자 동작 밖의 재생을 막음 → 탭해서 재생 */
export type PlayerState = { key: string | null; status: "idle" | "loading" | "playing" | "paused" | "blocked" };

let audio: HTMLAudioElement | null = null;
let state: PlayerState = { key: null, status: "idle" };
/** audio.src가 가리키는 곡의 key (다른 곡의 src를 되살려 재생하는 일을 막는다) */
let loadedKey: string | null = null;
/**
 * 재생 요청 번호. 새 재생·정지·'없음' 표시마다 올린다.
 * 요청이 비동기로 늦게 도착했을 때 번호가 달라졌으면(그 사이 다른 카드로 넘어감) 결과를 버린다.
 */
let seq = 0;
const listeners = new Set<(s: PlayerState) => void>();

function emit(next: PlayerState) {
  state = next;
  listeners.forEach((l) => l(state));
}

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("ended", () => {
      if (state.key) emit({ key: state.key, status: "paused" });
    });
    audio.addEventListener("pause", () => {
      if (state.status === "playing") emit({ key: state.key, status: "paused" });
    });
    audio.addEventListener("playing", () => {
      if (state.key) emit({ key: state.key, status: "playing" });
    });
  }
  return audio;
}

/** a.play() 실패 처리: 요청이 아직 최신일 때만 상태를 바꾼다. 브라우저가 막은 것이면 blocked */
function onPlayFail(key: string, my: number, e: unknown) {
  if (my !== seq) return;
  const blocked = e instanceof DOMException && e.name === "NotAllowedError";
  emit({ key, status: blocked ? "blocked" : "idle" });
}

export const player = {
  get state() {
    return state;
  },
  subscribe(fn: (s: PlayerState) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** 미리듣기 주소를 받아서 재생. 받는 동안 loading, 그 사이 다른 곡 요청이 오면 결과를 버린다 */
  async play(key: string, resolve: () => Promise<PreviewResult | null>): Promise<PreviewResult | null> {
    const my = ++seq;
    const a = getAudio();
    a.pause(); // 이전 곡은 받는 동안에도 즉시 멈춘다
    emit({ key, status: "loading" });
    let p: PreviewResult | null = null;
    try {
      p = await resolve();
    } catch {
      p = null;
    }
    if (my !== seq) return p; // 그 사이 다른 곡을 눌렀거나 정지했다
    if (!p) {
      emit({ key, status: "idle" });
      return null;
    }
    a.src = p.url;
    loadedKey = key;
    try {
      await a.play();
    } catch (e) {
      onPlayFail(key, my, e);
      return null;
    }
    return p;
  },
  /**
   * 이미 받아 둔 미리듣기를 바로 재생 (await 없이 play()를 불러야 모바일 자동재생 제한을 피한다).
   * 스와이프·탭 이벤트 처리 안에서 부른다.
   */
  playNow(key: string, p: PreviewResult): void {
    const my = ++seq;
    const a = getAudio();
    a.pause();
    emit({ key, status: "loading" });
    a.src = p.url;
    loadedKey = key;
    a.play().catch((e) => onPlayFail(key, my, e));
  },
  /** 이 카드는 재생할 미리듣기가 없다: 이전 곡을 멈추고 이 카드만 선택된 상태로 둔다 */
  markNone(key: string) {
    seq++;
    audio?.pause();
    emit({ key, status: "idle" });
  },
  toggle(key: string) {
    const a = getAudio();
    // 받는 중이거나, 지금 src가 이 곡이 아니면 아무것도 하지 않는다 (이전 곡이 되살아나는 것 방지)
    if (state.key !== key || loadedKey !== key || state.status === "loading") return;
    if (a.paused) {
      const my = ++seq;
      a.play().catch((e) => onPlayFail(key, my, e));
    } else a.pause();
  },
  stop() {
    seq++;
    audio?.pause();
    emit({ key: null, status: "idle" });
  },
};
