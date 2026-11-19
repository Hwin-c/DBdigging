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

async function fromDeezer(isrc: string): Promise<PreviewResult | null> {
  const t = await jsonp<DeezerTrack>(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
  if (t.error || !t.preview) return null;
  return {
    source: "deezer",
    url: t.preview,
    link: t.link ?? `https://www.deezer.com/track/${t.id}`,
    cover: t.album?.cover_big ?? t.album?.cover_medium,
  };
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
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

async function fromItunes(title: string, artist: string): Promise<PreviewResult | null> {
  const term = `${title} ${artist}`.trim();
  for (const country of ["KR", "US"]) {
    const results = await itunesSearch(term, country);
    const best = results
      .map((r) => ({ r, s: itunesScore(r, title, artist) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)[0];
    if (best) return { source: "itunes", url: best.r.previewUrl!, link: best.r.trackViewUrl ?? "" };
  }
  return null;
}

export async function findPreview(opts: {
  isrc?: string;
  title: string;
  artist: string;
}): Promise<PreviewResult | null> {
  if (opts.isrc) {
    try {
      const d = await fromDeezer(opts.isrc);
      if (d) return d;
    } catch {
      /* iTunes로 넘어간다 */
    }
  }
  try {
    return await fromItunes(opts.title, opts.artist);
  } catch {
    return null;
  }
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
    return (await fromDeezer(isrc))?.cover ?? null;
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
