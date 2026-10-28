import { getGraphEngine } from "../graph/engine";
import { DailyQuestSeed, QuestPayload, SongInfo } from "../graph/types";

export type { QuestPayload };

let cachedSeeds: DailyQuestSeed[] | null = null;
let seedLoadPromise: Promise<DailyQuestSeed[]> | null = null;

/**
 * Manifest 버전 쿼리스트링 기반 비동기 시드 로더
 */
export async function loadSeedsAsync(): Promise<DailyQuestSeed[]> {
  if (cachedSeeds) return cachedSeeds;
  if (seedLoadPromise) return seedLoadPromise;

  seedLoadPromise = (async () => {
    let versionQuery = "";
    try {
      const manifestRes = await fetch("/data/dataset_manifest.json", { cache: "no-store" });
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        const v = manifest.build_timestamp_kst || manifest.version;
        if (v) {
          versionQuery = `?v=${encodeURIComponent(v)}`;
        }
      }
    } catch (err) {
      console.warn("[loadSeedsAsync] Failed to fetch manifest, proceeding unversioned:", err);
    }

    const res = await fetch(`/data/firebase_daily_quests_seed.json${versionQuery}`);
    if (!res.ok) {
      throw new Error(`[loadSeedsAsync] Failed to fetch seeds: ${res.status}`);
    }

    const seeds: DailyQuestSeed[] = await res.json();
    cachedSeeds = seeds;
    return seeds;
  })();

  return seedLoadPromise;
}

export function loadSeeds(): DailyQuestSeed[] {
  if (!cachedSeeds) {
    throw new Error("[loadSeeds] Seeds not loaded yet. Await loadSeedsAsync() first.");
  }
  return cachedSeeds;
}

/**
 * 한국 표준시(KST) 기준 오늘 날짜 YYYY-MM-DD 문자열 반환
 */
export function getTodayKST(): string {
  const now = new Date();
  // KST: UTC + 9시간
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

/**
 * 일자별 데일리 퀘스트 조회 (100일 시드 기반, 초과 시 순환 매핑)
 */
export function getDailyQuest(dateStr?: string): QuestPayload {
  const date = dateStr || getTodayKST();
  const seeds = loadSeeds();
  const engine = getGraphEngine();

  // 1. 해당 날짜 시드 검색
  let seed = seeds.find((s) => s.quest_id === date);

  // 2. 100일 초과 시 날짜 해시 기반 결정론적 순환 매핑
  if (!seed) {
    let hash = 0;
    for (let i = 0; i < date.length; i++) {
      hash = (hash << 5) - hash + date.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % seeds.length;
    seed = seeds[idx];
  }

  const startSong = engine.getSong(seed.start_song_id);
  const targetSong = engine.getSong(seed.target_song_id);

  if (!startSong || !targetSong) {
    throw new Error(`[getDailyQuest] Failed to retrieve song metadata for quest ${seed.quest_id}`);
  }

  return {
    questId: date,
    startSong,
    targetSong,
    optimalTurns: seed.optimal_turns,
    optimalPath: seed.optimal_path,
    isIsland: !startSong.inGiant
  };
}

/**
 * 특정 곡에서 도달 가능한 모든 곡 ID 목록을 탐색 (독립 섬 방어용)
 */
export function findConnectedSongs(startSongId: string, maxLimit = 500): string[] {
  const engine = getGraphEngine();
  const store = engine.getStore();

  const startKey = `s:${startSongId}`;
  if (!store.adj.has(startKey)) return [startSongId];

  const queue: string[] = [startKey];
  let head = 0;
  const visited = new Set<string>([startKey]);
  const reachableSongs: string[] = [];

  while (head < queue.length && reachableSongs.length < maxLimit) {
    const curr = queue[head++];
    if (curr.startsWith("s:") && curr !== startKey) {
      reachableSongs.push(curr.slice(2));
    }

    const neighbors = store.adj.get(curr);
    if (!neighbors) continue;

    for (let i = 0; i < neighbors.length; i++) {
      const next = neighbors[i];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return reachableSongs;
}

/**
 * 자유 모드 및 연습 모드를 위한 랜덤 퀘스트 생성기
 * in_giant == 0인 독립 섬 곡 출발 시에도 동일 서브그래프 내에서 안전하게 목적지 매칭
 */
export function getRandomQuest(options: { startSongId?: string; inGiant?: boolean } = {}): QuestPayload {
  const engine = getGraphEngine();
  const store = engine.getStore();

  const allSongIds = Array.from(store.songs.keys());
  let startId = options.startSongId;

  // 출발 곡이 주어지지 않은 경우: 조건에 맞게 랜덤 선별
  if (!startId || !store.songs.has(startId)) {
    const preferGiant = options.inGiant !== false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candId = allSongIds[Math.floor(Math.random() * allSongIds.length)];
      const s = store.songs.get(candId)!;
      // 좋아요 300 이상인 곡 우선 선별
      if (s[5] > 300 && (preferGiant ? s[7] === 1 : s[7] === 0)) {
        startId = candId;
        break;
      }
    }
    if (!startId) startId = allSongIds[0];
  }

  const startSong = engine.getSong(startId)!;
  const isIsland = !startSong.inGiant;

  let targetId = "";
  let shortestPathRes = engine.findShortestPath(startId, startId);

  // (A) 소규모 독립 섬인 경우 ➔ 도달 가능한 서브그래프 내부에서만 목적지 선별
  if (isIsland) {
    const reachable = findConnectedSongs(startId, 300);
    // 2턴 이상 떨어져 있는 곡 탐색
    for (const candTarget of reachable) {
      const pathRes = engine.findShortestPath(startId, candTarget);
      if (pathRes.found && pathRes.turns >= 2 && pathRes.turns <= 4) {
        targetId = candTarget;
        shortestPathRes = pathRes;
        break;
      }
    }
    // 없으면 도달 가능한 아무 곡이나 선별
    if (!targetId && reachable.length > 0) {
      targetId = reachable[reachable.length - 1];
      shortestPathRes = engine.findShortestPath(startId, targetId);
    }
  }

  // (B) 메인 대륙 곡인 경우 ➔ 2~4턴 최적 거리의 유명 곡 선별
  if (!targetId) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const candTarget = allSongIds[Math.floor(Math.random() * allSongIds.length)];
      if (candTarget === startId) continue;
      const tSong = store.songs.get(candTarget)!;
      if (tSong[5] < 300 || tSong[7] !== 1) continue;

      const pathRes = engine.findShortestPath(startId, candTarget);
      if (pathRes.found && pathRes.turns >= 2 && pathRes.turns <= 4) {
        targetId = candTarget;
        shortestPathRes = pathRes;
        break;
      }
    }
  }

  // 최종 대체 (시드 첫 번째 퀘스트 도착곡)
  if (!targetId) {
    targetId = "34211693";
    shortestPathRes = engine.findShortestPath(startId, targetId);
  }

  const targetSong = engine.getSong(targetId)!;

  return {
    questId: `random_${Date.now()}`,
    startSong,
    targetSong,
    optimalTurns: shortestPathRes.turns > 0 ? shortestPathRes.turns : 3,
    optimalPath: shortestPathRes.path,
    isIsland
  };
}
