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
}

interface DeezerTrack {
  id?: number;
  title?: string;
  preview?: string;
  link?: string;
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
  return { source: "deezer", url: t.preview, link: t.link ?? `https://www.deezer.com/track/${t.id}` };
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

/* ───────────── 공유 오디오 요소: 한 번에 한 곡만 재생 ───────────── */

export type PlayerState = { key: string | null; status: "idle" | "loading" | "playing" | "paused" };

let audio: HTMLAudioElement | null = null;
let state: PlayerState = { key: null, status: "idle" };
const listeners = new Set<(s: PlayerState) => void>();

function emit(next: PlayerState) {
  state = next;
  listeners.forEach((l) => l(state));
}

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("ended", () => emit({ key: state.key, status: "paused" }));
    audio.addEventListener("pause", () => {
      if (state.status === "playing") emit({ key: state.key, status: "paused" });
    });
    audio.addEventListener("playing", () => emit({ key: state.key, status: "playing" }));
  }
  return audio;
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
  /** 재생할 때마다 미리듣기 URL을 새로 받아 재생 */
  async play(key: string, resolve: () => Promise<PreviewResult | null>): Promise<PreviewResult | null> {
    const a = getAudio();
    a.pause();
    emit({ key, status: "loading" });
    const p = await resolve();
    if (state.key !== key) return p; // 그 사이 다른 곡을 눌렀다
    if (!p) {
      emit({ key, status: "idle" });
      return null;
    }
    a.src = p.url;
    try {
      await a.play();
    } catch {
      emit({ key, status: "idle" });
      return null;
    }
    return p;
  },
  toggle(key: string) {
    const a = getAudio();
    if (state.key !== key) return;
    if (a.paused) void a.play();
    else a.pause();
  },
  stop() {
    audio?.pause();
    emit({ key: null, status: "idle" });
  },
};
