import { getGraphEngine } from "../graph/engine";
import { DailyQuestSeed, QuestPayload, SongInfo, PracticeFilterOptions, RawSongTuple } from "../graph/types";

export type { QuestPayload };

/**
 * 곡 속성이 PracticeFilterOptions(Layer 2)에 부합하는지 판정
 */
function checkSongMatchesFilters(tuple: RawSongTuple, options: PracticeFilterOptions): boolean {
  if (options.genre && options.genre !== "all") {
    if (!tuple[4].includes(options.genre)) return false;
  }

  if (options.decade && options.decade !== "all") {
    const year = tuple[3];
    if (options.decade === "2020s" && year < "2020") return false;
    if (options.decade === "2010s" && (year < "2010" || year >= "2020")) return false;
    if (options.decade === "2000s" && (year < "2000" || year >= "2010")) return false;
    if (options.decade === "1990s" && (year < "1990" || year >= "2000")) return false;
    if (options.decade === "1980s_before" && year >= "1990") return false;
  }

  if (options.agency && options.agency.trim()) {
    const q = options.agency.trim().toLowerCase();
    if (!tuple[2].toLowerCase().includes(q)) return false;
  }

  if (options.titleOnly && tuple[6] !== 1) return false;

  if (options.minLikes && options.minLikes > 0 && tuple[5] < options.minLikes) return false;

  return true;
}

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
/**
 * 자유 연습 모드를 위한 4-Layer 커스텀 퀘스트 생성기
 */
export function getRandomQuest(options: PracticeFilterOptions = {}): QuestPayload {
  const engine = getGraphEngine();
  const store = engine.getStore();

  const allSongIds = Array.from(store.songs.keys());
  let startId: string | undefined = undefined;

  // 1. [Layer 1] 출발지 결정
  if (options.startMode === "song" && options.startId && store.songs.has(options.startId)) {
    startId = options.startId;
  } else if ((options.startMode === "artist" || options.startMode === "creator") && options.startId) {
    const personSongs = engine.getConnectedSongs(options.startId, { includeGroupHops: true });
    // 인물 참여곡 중 속성 필터 부합 곡 우선
    const matched = personSongs.filter((s) => {
      const tuple = store.songs.get(s.id);
      return tuple ? checkSongMatchesFilters(tuple, options) : true;
    });
    if (matched.length > 0) {
      startId = matched[0].id;
    } else if (personSongs.length > 0) {
      startId = personSongs[0].id;
    }
  }

  // 출발지가 아직 결정되지 않은 경우: 속성 필터(Layer 2)를 만족하는 곡 탐색
  if (!startId || !store.songs.has(startId)) {
    const preferGiant = options.inGiant !== false;
    for (let attempt = 0; attempt < 150; attempt++) {
      const candId = allSongIds[Math.floor(Math.random() * allSongIds.length)];
      const s = store.songs.get(candId)!;
      if (checkSongMatchesFilters(s, options) && (preferGiant ? s[7] === 1 : true)) {
        startId = candId;
        break;
      }
    }
    if (!startId) startId = allSongIds[0];
  }

  const startSong = engine.getSong(startId)!;
  const isIsland = !startSong.inGiant;

  // 2. [Layer 4] 거리 범위 설정
  let minTurns = 2;
  let maxTurns = 4;
  if (options.turnDistance === "short") {
    minTurns = 1;
    maxTurns = 2;
  } else if (options.turnDistance === "standard") {
    minTurns = 3;
    maxTurns = 4;
  } else if (options.turnDistance === "long") {
    minTurns = 5;
    maxTurns = 6;
  } else if (options.turnDistance === "any") {
    minTurns = 1;
    maxTurns = 12;
  }

  // 3. [Layer 1] 도착지 결정
  let targetId = "";
  let targetPersonMeta: { id: string; name: string; isGroup?: boolean } | undefined = undefined;
  let shortestPathRes = engine.findShortestPath(startId, startId, {
    allowedRoles: options.allowedRoles
  });

  if (options.targetMode === "song" && options.targetId && store.songs.has(options.targetId)) {
    targetId = options.targetId;
    shortestPathRes = engine.findShortestPath(startId, targetId, {
      allowedRoles: options.allowedRoles
    });
  } else if ((options.targetMode === "artist" || options.targetMode === "creator") && options.targetId) {
    const person = store.getPerson(options.targetId);
    if (person) {
      targetPersonMeta = { id: person.id, name: person.name, isGroup: person.isGroup };
    }
    const personSongs = engine.getConnectedSongs(options.targetId, { includeGroupHops: true });
    // 인물 참여곡 중 속성 필터 부합 및 출발곡과 다른 곡 탐색
    for (const s of personSongs) {
      if (s.id === startId) continue;
      const pathRes = engine.findShortestPath(startId, s.id, {
        allowedRoles: options.allowedRoles
      });
      if (pathRes.found) {
        targetId = s.id;
        shortestPathRes = pathRes;
        if (pathRes.turns >= minTurns && pathRes.turns <= maxTurns) {
          break;
        }
      }
    }
  }

  // 4. 도착지가 랜덤이거나 지정되지 않은 경우: Layer 2 속성 및 Layer 4 거리에 부합하는 유명 곡 탐색
  if (!targetId) {
    // (A) 소규모 독립 섬인 경우 ➔ 도달 가능한 서브그래프 내부에서만 목적지 선별
    if (isIsland) {
      const reachable = findConnectedSongs(startId, 300);
      for (const candTarget of reachable) {
        if (candTarget === startId) continue;
        const pathRes = engine.findShortestPath(startId, candTarget, {
          allowedRoles: options.allowedRoles
        });
        if (pathRes.found && pathRes.turns >= minTurns && pathRes.turns <= maxTurns) {
          targetId = candTarget;
          shortestPathRes = pathRes;
          break;
        }
      }
      if (!targetId && reachable.length > 0) {
        targetId = reachable[reachable.length - 1];
        shortestPathRes = engine.findShortestPath(startId, targetId, {
          allowedRoles: options.allowedRoles
        });
      }
    }

    // (B) 메인 대륙 곡인 경우 ➔ 조건 만족 목적지 탐색
    if (!targetId) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const candTarget = allSongIds[Math.floor(Math.random() * allSongIds.length)];
        if (candTarget === startId) continue;
        const tSong = store.songs.get(candTarget)!;
        if (!checkSongMatchesFilters(tSong, options)) continue;

        const pathRes = engine.findShortestPath(startId, candTarget, {
          allowedRoles: options.allowedRoles
        });
        if (pathRes.found && pathRes.turns >= minTurns && pathRes.turns <= maxTurns) {
          targetId = candTarget;
          shortestPathRes = pathRes;
          break;
        }
      }
    }

    // (C) 여전히 못 찾은 경우: 거리 제약 완화하여 아무 유효 도달 곡 탐색
    if (!targetId) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const candTarget = allSongIds[Math.floor(Math.random() * allSongIds.length)];
        if (candTarget === startId) continue;
        const pathRes = engine.findShortestPath(startId, candTarget, {
          allowedRoles: options.allowedRoles
        });
        if (pathRes.found && pathRes.turns >= 1) {
          targetId = candTarget;
          shortestPathRes = pathRes;
          break;
        }
      }
    }

    // 최종 대체
    if (!targetId) {
      targetId = "34211693";
      shortestPathRes = engine.findShortestPath(startId, targetId, {
        allowedRoles: options.allowedRoles
      });
    }
  }

  const targetSong = engine.getSong(targetId)!;

  return {
    questId: `practice_${Date.now()}`,
    startSong,
    targetSong,
    optimalTurns: shortestPathRes.turns > 0 ? shortestPathRes.turns : 3,
    optimalPath: shortestPathRes.path,
    isIsland,
    allowedRoles: options.allowedRoles,
    targetPerson: targetPersonMeta
  };
}
