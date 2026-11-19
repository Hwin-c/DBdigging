import { Throttle, TwoLevelCache } from "./cache";

/**
 * ReccoBeats 소리 특성.
 * ISRC → GET /v1/track?ids=<ISRC,…> → content[].id (isrc 필드로 짝 맞춤)
 *      → GET /v1/track/<id>/audio-features
 * 2026-11-19 실제 응답 확인 (KRA302500478 → Flutter).
 */

const BASE = "https://api.reccobeats.com/v1";
const queue = new Throttle(300);
const cache = new TwoLevelCache("rb:");

export interface AudioFeatures {
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  key: number;
  liveness: number;
  loudness: number;
  mode: number;
  speechiness: number;
  tempo: number;
  valence: number;
}

interface RbTrack {
  id: string;
  trackTitle: string;
  isrc: string;
}

interface RbTrackList {
  content: RbTrack[];
}

/**
 * 개발·검증용 실패 흉내: 주소에 ?nofeat=1 을 붙이면 이 탭에서는 ReccoBeats 호출을 모두 실패로 처리.
 * 곡을 옮겨 다녀도 유지되도록 sessionStorage에 기억하고, ?nofeat=0 으로 해제.
 */
function simulateFailure(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get("nofeat");
    if (v === "1") sessionStorage.setItem("dig:nofeat", "1");
    if (v === "0") sessionStorage.removeItem("dig:nofeat");
    return sessionStorage.getItem("dig:nofeat") === "1";
  } catch {
    return false;
  }
}

async function rbGet<T>(path: string): Promise<T> {
  if (simulateFailure()) throw new Error("ReccoBeats 실패 흉내 (?nofeat=1)");
  const res = await queue.run(() => fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } }));
  if (!res.ok) throw new Error(`ReccoBeats ${res.status}`);
  return (await res.json()) as T;
}

/** ISRC → ReccoBeats ID. 여러 개를 쉼표로 묶어 먼저 시도하고, 실패하면 하나씩 */
async function lookupIds(isrcs: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const todo: string[] = [];
  for (const i of isrcs) {
    const c = cache.get<string | null>(`id:${i}`);
    if (c !== undefined) out.set(i, c);
    else todo.push(i);
  }
  if (!todo.length) return out;

  const record = (list: RbTrack[], asked: string[]) => {
    for (const t of list) {
      const k = t.isrc?.toUpperCase();
      if (k && asked.includes(k) && !out.get(k)) out.set(k, t.id);
    }
  };

  let batchOk = false;
  if (todo.length > 1) {
    try {
      for (let i = 0; i < todo.length; i += 20) {
        const chunk = todo.slice(i, i + 20);
        const r = await rbGet<RbTrackList>(`/track?ids=${chunk.map(encodeURIComponent).join(",")}`);
        record(r.content ?? [], chunk);
      }
      batchOk = true;
    } catch {
      batchOk = false;
    }
  }
  if (!batchOk) {
    for (const i of todo) {
      if (out.get(i)) continue;
      try {
        const r = await rbGet<RbTrackList>(`/track?ids=${encodeURIComponent(i)}`);
        record(r.content ?? [], [i]);
      } catch {
        if (simulateFailure()) throw new Error("ReccoBeats 실패 흉내");
        /* 이 곡만 건너뜀 */
      }
    }
  }
  for (const i of todo) {
    if (!out.has(i)) out.set(i, null);
    cache.set(`id:${i}`, out.get(i) ?? null);
  }
  return out;
}

async function featuresById(id: string): Promise<AudioFeatures | null> {
  const c = cache.get<AudioFeatures | null>(`f:${id}`);
  if (c !== undefined) return c;
  try {
    const f = await rbGet<AudioFeatures & { id: string }>(`/track/${encodeURIComponent(id)}/audio-features`);
    const ok = typeof f.energy === "number" && typeof f.tempo === "number";
    const v: AudioFeatures | null = ok
      ? {
          acousticness: f.acousticness,
          danceability: f.danceability,
          energy: f.energy,
          instrumentalness: f.instrumentalness,
          key: f.key,
          liveness: f.liveness,
          loudness: f.loudness,
          mode: f.mode,
          speechiness: f.speechiness,
          tempo: f.tempo,
          valence: f.valence,
        }
      : null;
    cache.set(`f:${id}`, v);
    return v;
  } catch (e) {
    if (simulateFailure()) throw e;
    return null;
  }
}

/** ISRC 여러 개의 소리 특성. 없는 곡은 null */
export async function getFeaturesForIsrcs(isrcs: string[]): Promise<Map<string, AudioFeatures | null>> {
  const uniq = [...new Set(isrcs.map((i) => i.toUpperCase()))];
  const ids = await lookupIds(uniq);
  const out = new Map<string, AudioFeatures | null>();
  for (const i of uniq) {
    const id = ids.get(i);
    out.set(i, id ? await featuresById(id) : null);
  }
  return out;
}

export async function getFeatures(isrc: string): Promise<AudioFeatures | null> {
  return (await getFeaturesForIsrcs([isrc])).get(isrc.toUpperCase()) ?? null;
}

/* ───────────── 표시 ───────────── */

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function keyLabel(f: AudioFeatures): string | null {
  if (f.key < 0 || f.key > 11) return null;
  return `${KEYS[f.key]} ${f.mode === 1 ? "장조" : "단조"}`;
}

export function level(v: number): "낮음" | "중간" | "높음" {
  return v >= 0.66 ? "높음" : v >= 0.33 ? "중간" : "낮음";
}

export interface FeatureChip {
  label: string;
  value: string;
}

export function featureChips(f: AudioFeatures): FeatureChip[] {
  const chips: FeatureChip[] = [{ label: "BPM", value: String(Math.round(f.tempo)) }];
  const k = keyLabel(f);
  if (k) chips.push({ label: "조성", value: k });
  chips.push({ label: "에너지", value: level(f.energy) });
  chips.push({ label: "밝기", value: level(f.valence) });
  chips.push({ label: "어쿠스틱", value: level(f.acousticness) });
  return chips;
}

/* ───────────── 유사도 ───────────── */

/** [danceability, energy, valence, acousticness, instrumentalness, speechiness, liveness, min(tempo/200,1), (loudness+60)/60] */
export function featureVector(f: AudioFeatures): number[] {
  return [
    f.danceability,
    f.energy,
    f.valence,
    f.acousticness,
    f.instrumentalness,
    f.speechiness,
    f.liveness,
    Math.min(f.tempo / 200, 1),
    (f.loudness + 60) / 60,
  ];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function similarity(a: AudioFeatures, b: AudioFeatures): number {
  return cosine(featureVector(a), featureVector(b));
}

/** 두 곡에 공통된 두드러진 특성 (근거 문구용) */
export function sharedTraits(a: AudioFeatures, b: AudioFeatures): string[] {
  const out: string[] = [];
  const both = (name: string, x: number, y: number) => {
    const la = level(x);
    if (la !== "중간" && la === level(y)) out.push(`둘 다 ${name} ${la}`);
  };
  both("에너지", a.energy, b.energy);
  both("밝기", a.valence, b.valence);
  both("어쿠스틱", a.acousticness, b.acousticness);
  both("춤추기 좋음", a.danceability, b.danceability);
  if (Math.abs(a.tempo - b.tempo) <= 8) out.push(`BPM 비슷 (${Math.round(a.tempo)}·${Math.round(b.tempo)})`);
  return out;
}
