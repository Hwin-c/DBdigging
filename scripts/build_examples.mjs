#!/usr/bin/env node
/**
 * 시작 화면 "요즘 많이 듣는 곡" 만들기: public/examples.json
 *
 * 1) Apple Music 한국 인기곡 RSS(키 없는 공개 JSON)를 받는다
 *    https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/50/songs.json  (2026-11-27 응답 확인:
 *    feed.updated, feed.results[].{name, artistName, id, releaseDate})
 * 2) 곡마다 MusicBrainz 녹음으로 맞춘다 (요청 간격 1.2초, fmt=json)
 * 3) 색인(public/idx/v1)에 크레딧이 있는 곡만 남겨 6개를 저장한다
 *
 * 실행: node scripts/build_examples.mjs   (npm run build 전에 한 번. 의존성 없음, Node 18+)
 * 하나라도 실패하면(네트워크·색인 없음·6개 미만) 기존 public/examples.json을 그대로 두고 0으로 끝난다.
 * 화면은 examples.json이 없거나 읽기 실패하면 코드에 있는 예시 곡을 쓴다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RSS = "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/25/songs.json";
const OUT = path.join(ROOT, "public", "examples.json");
const IDX_W = path.join(ROOT, "public", "idx", "v1", "w");
const UA = "DBdigging/0.1 (7mida58@gmail.com)";
const WANT = 6;
const GAP_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function mb(pathname, params) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = `https://musicbrainz.org/ws/2/${pathname}?${new URLSearchParams({ ...params, fmt: "json" })}`;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status !== 503) throw new Error(`MusicBrainz ${res.status}`);
    await sleep(2000 * (i + 1));
    last = Date.now();
  }
  throw new Error("MusicBrainz 503");
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, " ")
    .replace(/\b(feat|ft)\.?\s.*$/i, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");

function indexCredits(workId) {
  try {
    const sh = JSON.parse(fs.readFileSync(path.join(IDX_W, `${workId.slice(0, 3)}.json`), "utf8"));
    return (sh[workId]?.c ?? []).filter(([, code]) => code !== "O").length;
  } catch {
    return 0;
  }
}

async function main() {
  if (!fs.existsSync(IDX_W)) throw new Error("public/idx/v1 이 없습니다 (scripts/build_index.py로 먼저 만들기)");
  const feed = (await (await fetch(RSS)).json()).feed;
  const results = feed?.results ?? [];
  if (!results.length) throw new Error("RSS 결과가 비었습니다");
  const songs = [];
  for (const r of results) {
    if (songs.length >= WANT) break;
    try {
      const q = `recording:"${r.name.replace(/"/g, " ")}" AND artist:"${r.artistName.replace(/"/g, " ")}"`;
      let s = await mb("recording", { query: q, limit: "5" });
      let hit = (s.recordings ?? []).find((x) => (x.score ?? 0) >= 90 && norm(x.title) === norm(r.name));
      if (!hit && r.releaseDate) {
        // 가수 이름 표기가 달라(한글/영문) 못 찾으면 제목만으로 찾고, 첫 발매일이 Apple 발매일 ±45일인 녹음만 받는다
        const want = Date.parse(r.releaseDate);
        s = await mb("recording", { query: `recording:"${r.name.replace(/"/g, " ")}"`, limit: "10" });
        hit = (s.recordings ?? []).find((x) => {
          const t = Date.parse((x["first-release-date"] ?? "").padEnd(10, "-01").slice(0, 10));
          return (x.score ?? 0) >= 90 && norm(x.title) === norm(r.name) && Number.isFinite(t) && Math.abs(t - want) <= 45 * 86400000;
        });
      }
      if (!hit) {
        console.log(`- 맞는 녹음 없음: ${r.name} / ${r.artistName}`);
        continue;
      }
      const d = await mb(`recording/${hit.id}`, { inc: "work-rels" });
      const works = (d.relations ?? []).filter((x) => x.work).map((x) => x.work.id);
      const n = Math.max(0, ...works.map(indexCredits));
      if (!n) {
        console.log(`- 색인에 크레딧 없음: ${r.name} / ${r.artistName}`);
        continue;
      }
      songs.push({
        id: hit.id,
        title: hit.title,
        artist: (hit["artist-credit"] ?? []).map((a) => (a.name ?? "") + (a.joinphrase ?? "")).join("") || r.artistName,
        isrc: hit.isrcs?.[0],
        releaseGroupId: hit.releases?.[0]?.["release-group"]?.id,
      });
      console.log(`+ ${hit.title} / ${r.artistName} (색인 크레딧 ${n}명)`);
    } catch (e) {
      console.log(`- 실패: ${r.name}: ${e.message}`);
    }
  }
  if (songs.length < WANT) throw new Error(`색인에 크레딧이 있는 곡이 ${songs.length}개뿐입니다 (필요 ${WANT})`);
  const updated = new Date(feed.updated);
  const out = {
    title: "요즘 많이 듣는 곡",
    source: "Apple Music 한국 인기곡 RSS",
    date: (Number.isNaN(updated.getTime()) ? new Date() : updated).toISOString().slice(0, 10),
    songs,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`저장: ${OUT} (${out.date})`);
}

main().catch((e) => {
  console.warn(`examples.json을 갱신하지 못해 기존 파일을 둡니다: ${e.message}`);
});
