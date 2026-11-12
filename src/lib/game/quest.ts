import { getGraphEngine } from "../graph/engine";
import {
  DailyQuestSeed,
  QuestPayload,
  SongInfo,
  PracticeFilterOptions,
  RawSongTuple,
  RoleCode,
  ROLE_LABELS,
  ConnectivityBadgeInfo,
  AlternativeSongRecommendation,
  QuestFailureDiagnostics,
  CustomQuestGenerationResult
} from "../graph/types";
import { normalizeString, extractNameVariants } from "./search";

export type {
  QuestPayload,
  ConnectivityBadgeInfo,
  AlternativeSongRecommendation,
  QuestFailureDiagnostics,
  CustomQuestGenerationResult
};

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
/**
 * 특정 곡에서 도달 가능한 모든 곡 ID 목록을 탐색 (독립 섬 방어용, 비인물 노드 차단 적용)
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
      if (next.startsWith("p:") && store.isBlockedPersonId(next.slice(2))) continue;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return reachableSongs;
}

/**
 * [Step 13-3 Layer 1] 무거운 BFS(413ms) 없이 store.getComponentId(songId) O(1) 비교로
 * 출발/도착 곡(또는 아티스트 참여곡 집합)의 연결 가능 여부를 즉시 반환
 */
export function checkInstantConnectivity(
  startNode: { mode: "song" | "artist" | "creator"; id: string },
  targetNode: { mode: "song" | "artist" | "creator"; id: string }
): ConnectivityBadgeInfo | null {
  const engine = getGraphEngine();
  const store = engine.getStore();

  const resolveCandidateSongIds = (mode: "song" | "artist" | "creator", id: string): string[] => {
    if (mode === "song") {
      return store.songs.has(id) ? [id] : [];
    }
    const pSongs = engine.getConnectedSongs(id, { includeGroupHops: true });
    return pSongs.map((s) => s.id);
  };

  const startCandidates = resolveCandidateSongIds(startNode.mode, startNode.id);
  const targetCandidates = resolveCandidateSongIds(targetNode.mode, targetNode.id);

  if (startCandidates.length === 0 || targetCandidates.length === 0) return null;

  // Giant Component(#1) 소속 곡을 우선 대표곡으로 선택하되, 아티스트 모드일 경우 두 후보 집합 간 동일 컴포넌트 쌍이 있는지 O(|S|+|T|) 검사
  const targetByComp = new Map<number, string[]>();
  for (const tId of targetCandidates) {
    const cId = store.getComponentId(tId);
    if (cId !== null) {
      let list = targetByComp.get(cId);
      if (!list) {
        list = [];
        targetByComp.set(cId, list);
      }
      list.push(tId);
    }
  }

  let matchedStartId: string | null = null;
  let matchedTargetId: string | null = null;

  // 1순위: Giant Component(#1)에서 연결 가능한 쌍 탐색
  for (const sId of startCandidates) {
    const cId = store.getComponentId(sId);
    if (cId === 1 && targetByComp.has(1)) {
      const tList = targetByComp.get(1)!;
      const distinctT = tList.find((tId) => tId !== sId) || tList[0];
      if (store.getComponentSize(1) > 1) {
        matchedStartId = sId;
        matchedTargetId = distinctT;
        break;
      }
    }
  }

  // 2순위: 임의의 동일 컴포넌트(크기 > 1)에서 연결 가능한 쌍 탐색
  if (!matchedStartId) {
    for (const sId of startCandidates) {
      const cId = store.getComponentId(sId);
      if (cId !== null && store.getComponentSize(cId) > 1 && targetByComp.has(cId)) {
        const tList = targetByComp.get(cId)!;
        const distinctT = tList.find((tId) => tId !== sId) || tList[0];
        matchedStartId = sId;
        matchedTargetId = distinctT;
        break;
      }
    }
  }

  const pickPrimary = (ids: string[]): string => {
    return ids.find((id) => store.getComponentId(id) === 1) || ids[0];
  };

  const startSongId = matchedStartId || pickPrimary(startCandidates);
  const targetSongId = matchedTargetId || pickPrimary(targetCandidates);

  const startComponentId = store.getComponentId(startSongId);
  const targetComponentId = store.getComponentId(targetSongId);
  const startComponentSize = startComponentId !== null ? store.getComponentSize(startComponentId) : 0;
  const targetComponentSize = targetComponentId !== null ? store.getComponentSize(targetComponentId) : 0;

  return {
    isConnected:
      startComponentId !== null &&
      targetComponentId !== null &&
      startComponentId === targetComponentId &&
      startComponentSize > 1,
    startComponentId,
    targetComponentId,
    startComponentSize,
    targetComponentSize,
    startSong: store.getSong(startSongId),
    targetSong: store.getSong(targetSongId)
  };
}

/**
 * [Step 13-3 REASON_A] 특정 컴포넌트(targetComponentId) 내부에서 기준 곡(referenceSongId)과
 * 유사한 대체 곡을 (동일 아티스트 ➔ 장르/연대/소속사 유사도 ➔ 좋아요 순)으로 최대 limit곡 추천
 */
export function findSimilarSongsInComponent(
  referenceSongId: string,
  targetComponentId: number | null,
  excludeSongId: string,
  limit = 3
): AlternativeSongRecommendation[] {
  const engine = getGraphEngine();
  const store = engine.getStore();
  if (targetComponentId === null) return [];

  const refSong = store.getSong(referenceSongId);
  if (!refSong) return [];

  const candidateIds = store.getComponentSongs(targetComponentId);
  if (candidateIds.length === 0) return [];

  const refArtistRaw = refSong.artist.trim().toLowerCase();
  const refArtistNorm = normalizeString(refSong.artist);
  const refArtistVariants = extractNameVariants(refSong.artist)
    .map(normalizeString)
    .filter((v) => v.length >= 2);

  const refGenreRaw = (refSong.genre || "").trim();
  const isValidRefGenre = refGenreRaw !== "" && refGenreRaw !== "-" && refGenreRaw !== "미분류";
  const refGenreTokens = isValidRefGenre
    ? refGenreRaw.split(/[,/]/).map((g) => g.trim()).filter(Boolean)
    : [];

  const refYearNum = parseInt(refSong.year, 10);
  const hasValidRefYear = !isNaN(refYearNum) && refYearNum >= 1950 && refYearNum <= 2030;
  const refDecade = hasValidRefYear ? Math.floor(refYearNum / 10) * 10 : null;

  const refAgencyRaw = (refSong.agency || "").trim();
  const isValidRefAgency =
    refAgencyRaw !== "" && refAgencyRaw !== "미분류" && refAgencyRaw !== "무소속";

  interface ScoredCandidate {
    songId: string;
    score: number;
    likes: number;
    reasons: string[];
  }

  const topCandidates: ScoredCandidate[] = [];

  for (let i = 0; i < candidateIds.length; i++) {
    const candId = candidateIds[i];
    if (candId === excludeSongId || candId === referenceSongId) continue;

    const tuple = store.songs.get(candId);
    if (!tuple) continue;

    let score = 0;
    const reasons: string[] = [];

    // 1순위: 아티스트 일치 / 유사도
    const candArtistRaw = tuple[1].trim().toLowerCase();
    if (candArtistRaw === refArtistRaw) {
      score += 100000;
      reasons.push("동일 아티스트");
    } else if (
      refArtistNorm.length >= 2 &&
      (candArtistRaw.includes(refArtistRaw) || refArtistRaw.includes(candArtistRaw))
    ) {
      const candArtistNorm = normalizeString(tuple[1]);
      if (candArtistNorm === refArtistNorm) {
        score += 100000;
        reasons.push("동일 아티스트");
      } else if (refArtistVariants.some((v) => candArtistNorm.includes(v))) {
        score += 50000;
        reasons.push("유사 아티스트");
      }
    }

    // 2순위: 장르 유사도
    const candGenreRaw = (tuple[4] || "").trim();
    if (isValidRefGenre && candGenreRaw) {
      if (candGenreRaw === refGenreRaw) {
        score += 5000;
        reasons.push(`장르(${refGenreRaw})`);
      } else if (refGenreTokens.some((tok) => candGenreRaw.includes(tok))) {
        score += 2500;
        reasons.push("유사 장르");
      }
    }

    // 3순위: 발매 연대 / 연도 유사도
    if (hasValidRefYear) {
      const candYearNum = parseInt(tuple[3], 10);
      if (!isNaN(candYearNum) && candYearNum >= 1950 && candYearNum <= 2030) {
        const candDecade = Math.floor(candYearNum / 10) * 10;
        if (candDecade === refDecade) {
          score += 1000;
          reasons.push(`${refDecade}년대`);
        }
        const yearDiff = Math.abs(candYearNum - refYearNum);
        if (yearDiff === 0) {
          score += 400;
        } else if (yearDiff <= 3) {
          score += 200;
        }
      }
    }

    // 4순위: 소속사 유사도
    if (isValidRefAgency && tuple[2].trim() === refAgencyRaw) {
      score += 600;
      reasons.push(`소속사(${refAgencyRaw})`);
    }

    // 타이틀곡 가점
    if (tuple[6] === 1) {
      score += 20;
    }

    const likes = tuple[5] || 0;

    if (
      topCandidates.length < limit ||
      score > topCandidates[topCandidates.length - 1].score ||
      (score === topCandidates[topCandidates.length - 1].score &&
        likes > topCandidates[topCandidates.length - 1].likes)
    ) {
      topCandidates.push({ songId: candId, score, likes, reasons });
      topCandidates.sort((a, b) => b.score - a.score || b.likes - a.likes);
      if (topCandidates.length > limit) {
        topCandidates.pop();
      }
    }
  }

  return topCandidates
    .map((c) => {
      const song = store.getSong(c.songId);
      if (!song) return null;
      return {
        song,
        similarityScore: c.score,
        matchReasons: c.reasons.length > 0 ? c.reasons : ["동일 컴포넌트 내 인기곡"]
      };
    })
    .filter((item): item is AlternativeSongRecommendation => item !== null);
}

/**
 * [Step 13-3 REASON_B] 전체 역할 허용 시 최단 경로(typedPath) 상의 엣지들 중
 * 현재 allowedRoles에 의해 차단된 역할 코드(RoleCode) 목록을 추출
 */
export function extractMissingRolesOnShortestPath(
  typedPath: string[],
  allowedRoles: RoleCode[]
): RoleCode[] {
  const store = getGraphEngine().getStore();
  const allowedSet = new Set<RoleCode>(allowedRoles);
  const blockedEdgeRoles = new Set<RoleCode>();
  const allUnallowedPathRoles = new Set<RoleCode>();

  for (let i = 0; i < typedPath.length - 1; i++) {
    const u = typedPath[i];
    const v = typedPath[i + 1];
    let edgeRoles: RoleCode[] = [];

    if (u.startsWith("s:") && v.startsWith("p:")) {
      edgeRoles = store.songPersonRoles.get(`${u.slice(2)}_${v.slice(2)}`) || [];
    } else if (u.startsWith("p:") && v.startsWith("s:")) {
      edgeRoles = store.songPersonRoles.get(`${v.slice(2)}_${u.slice(2)}`) || [];
    } else if (u.startsWith("p:") && v.startsWith("p:")) {
      edgeRoles = [6];
    }

    for (const r of edgeRoles) {
      if (!allowedSet.has(r)) {
        allUnallowedPathRoles.add(r);
      }
    }

    const isStepAllowed = edgeRoles.some((r) => allowedSet.has(r));
    if (!isStepAllowed) {
      for (const r of edgeRoles) {
        if (!allowedSet.has(r)) {
          blockedEdgeRoles.add(r);
        }
      }
    }
  }

  const result =
    blockedEdgeRoles.size > 0
      ? Array.from(blockedEdgeRoles)
      : Array.from(allUnallowedPathRoles);
  return result.sort((a, b) => a - b);
}

/**
 * 실제 최단 턴 수를 목표 거리 프리셋("short" | "standard" | "long" | "any")으로 변환
 */
export function mapTurnsToDistancePreset(
  turns: number
): "short" | "standard" | "long" | "any" {
  if (turns <= 2) return "short";
  if (turns <= 4) return "standard";
  if (turns <= 6) return "long";
  return "any";
}

/**
 * 목표 거리 프리셋에 따른 [minTurns, maxTurns] 범위 반환
 */
export function getTurnDistanceRange(
  turnDistance?: "short" | "standard" | "long" | "any"
): { minTurns: number; maxTurns: number } {
  if (turnDistance === "short") return { minTurns: 1, maxTurns: 2 };
  if (turnDistance === "standard") return { minTurns: 3, maxTurns: 4 };
  if (turnDistance === "long") return { minTurns: 5, maxTurns: 6 };
  if (turnDistance === "any") return { minTurns: 1, maxTurns: 99 };
  return { minTurns: 2, maxTurns: 4 };
}

/**
 * [Step 13-3 Layer 2] 특정 출발 곡과 도착 곡 쌍에 대해 3대 실패 원인(REASON_A / REASON_B / REASON_C)을
 * 정밀 판별하고 대안 데이터를 포함한 결과를 반환
 */
export function diagnoseQuestPair(
  startSongId: string,
  targetSongId: string,
  options: PracticeFilterOptions = {},
  targetPersonMeta?: { id: string; name: string; isGroup?: boolean }
): CustomQuestGenerationResult {
  const engine = getGraphEngine();
  const store = engine.getStore();

  const startSong = engine.getSong(startSongId);
  const targetSong = engine.getSong(targetSongId);
  if (!startSong || !targetSong) {
    throw new Error(`[diagnoseQuestPair] Invalid song IDs: start=${startSongId}, target=${targetSongId}`);
  }

  const startComponentId = store.getComponentId(startSongId);
  const targetComponentId = store.getComponentId(targetSongId);
  const startComponentSize = startComponentId !== null ? store.getComponentSize(startComponentId) : 0;
  const targetComponentSize = targetComponentId !== null ? store.getComponentSize(targetComponentId) : 0;

  // 1. 전체 역할 허용 시 최단 경로 확인 (REASON_A 판별)
  const fullPathRes = engine.findShortestPath(startSongId, targetSongId);
  if (
    startComponentId === null ||
    targetComponentId === null ||
    startComponentId !== targetComponentId ||
    !fullPathRes.found ||
    startSongId === targetSongId
  ) {
    const alternativeTargetsInStartComp = findSimilarSongsInComponent(
      targetSongId,
      startComponentId,
      startSongId,
      3
    );
    const alternativeStartsInTargetComp = findSimilarSongsInComponent(
      startSongId,
      targetComponentId,
      targetSongId,
      3
    );

    return {
      ok: false,
      diagnostics: {
        reason: "REASON_A",
        startSong,
        targetSong,
        startComponentId,
        targetComponentId,
        startComponentSize,
        targetComponentSize,
        alternativeTargetsInStartComp,
        alternativeStartsInTargetComp,
        targetPerson: targetPersonMeta
      }
    };
  }

  // 2. 역할 필터 제한 검사 (REASON_B 판별 - 빈 배열 [] 입력도 제한으로 처리)
  const hasRoleFilter =
    options.allowedRoles !== undefined &&
    options.allowedRoles.length < 6;

  const activePathRes = hasRoleFilter
    ? engine.findShortestPath(startSongId, targetSongId, {
        allowedRoles: options.allowedRoles
      })
    : fullPathRes;

  if (!activePathRes.found) {
    const missingRoles = extractMissingRolesOnShortestPath(
      fullPathRes.typedPath,
      options.allowedRoles || []
    );
    const missingRoleLabels = missingRoles.map((r) => ROLE_LABELS[r] || `역할 ${r}`);

    return {
      ok: false,
      diagnostics: {
        reason: "REASON_B",
        startSong,
        targetSong,
        startComponentId,
        targetComponentId,
        startComponentSize,
        targetComponentSize,
        unrestrictedTurns: fullPathRes.turns,
        unrestrictedPath: fullPathRes.path,
        missingRoles,
        missingRoleLabels,
        targetPerson: targetPersonMeta
      }
    };
  }

  // 3. 목표 거리(minTurns ~ maxTurns) 조건 불충족 검사 (REASON_C 판별)
  const { minTurns, maxTurns } = getTurnDistanceRange(options.turnDistance);
  const actualTurns = activePathRes.turns;

  if (
    options.turnDistance &&
    options.turnDistance !== "any" &&
    (actualTurns < minTurns || actualTurns > maxTurns)
  ) {
    const distanceMismatchDirection = actualTurns > maxTurns ? "TOO_LONG" : "TOO_SHORT";
    const recommendedTurnDistance = mapTurnsToDistancePreset(actualTurns);

    return {
      ok: false,
      diagnostics: {
        reason: "REASON_C",
        startSong,
        targetSong,
        startComponentId,
        targetComponentId,
        startComponentSize,
        targetComponentSize,
        actualTurns,
        actualPath: activePathRes.path,
        requestedMinTurns: minTurns,
        requestedMaxTurns: maxTurns,
        distanceMismatchDirection,
        recommendedTurnDistance,
        targetPerson: targetPersonMeta
      }
    };
  }

  // 4. 모든 조건 만족 ➔ 정상 퀘스트 페이로드 반환
  return {
    ok: true,
    quest: {
      questId: `practice_${Date.now()}`,
      startSong,
      targetSong,
      optimalTurns: actualTurns,
      optimalPath: activePathRes.path,
      isIsland: !startSong.inGiant,
      allowedRoles: options.allowedRoles,
      targetPerson: targetPersonMeta
    }
  };
}

/**
 * [Step 13-3] 맞춤 디깅 빌더 전용 퀘스트 생성 및 3단계 예외 진단 통합 엔진
 */
export function generateCustomQuest(options: PracticeFilterOptions = {}): CustomQuestGenerationResult {
  const engine = getGraphEngine();
  const store = engine.getStore();
  const allSongIds = Array.from(store.songs.keys());
  const { minTurns, maxTurns } = getTurnDistanceRange(options.turnDistance);

  const attrFilterFn = (songId: string): boolean => {
    const tuple = store.songs.get(songId);
    return tuple ? checkSongMatchesFilters(tuple, options) : true;
  };

  // 1. 출발 곡 결정
  let startId: string | undefined = undefined;
  if (options.startMode === "song" && options.startId && store.songs.has(options.startId)) {
    startId = options.startId;
  } else if ((options.startMode === "artist" || options.startMode === "creator") && options.startId) {
    const personSongs = engine.getConnectedSongs(options.startId, { includeGroupHops: true });
    if (personSongs.length > 0) {
      if (options.targetMode === "song" && options.targetId && store.songs.has(options.targetId)) {
        const fixedTargetId = options.targetId;
        const targetCompId = store.getComponentId(fixedTargetId);
        let sameCompCandidate: string | null = null;
        let rolePassCandidate: string | null = null;
        const fullMatches: string[] = [];

        for (const s of personSongs) {
          if (s.id === fixedTargetId) continue;
          if (store.getComponentId(s.id) === targetCompId) {
            if (!sameCompCandidate) sameCompCandidate = s.id;
            const res = engine.findShortestPath(s.id, fixedTargetId, {
              allowedRoles: options.allowedRoles
            });
            if (res.found) {
              if (!rolePassCandidate) rolePassCandidate = s.id;
              if (res.turns >= minTurns && res.turns <= maxTurns) {
                fullMatches.push(s.id);
                if (fullMatches.length >= 10) break;
              }
            }
          }
        }

        if (fullMatches.length > 0) {
          startId = fullMatches[Math.floor(Math.random() * fullMatches.length)];
        } else {
          startId = rolePassCandidate || sameCompCandidate || personSongs[0].id;
        }
      } else {
        const matched = personSongs.filter((s) => attrFilterFn(s.id));
        const pool = matched.length > 0 ? matched : personSongs;
        const giantPool = pool.filter((s) => store.getComponentId(s.id) === 1);
        const activePool = giantPool.length > 0 ? giantPool : pool;
        startId = activePool[Math.floor(Math.random() * Math.min(activePool.length, 15))].id;
      }
    }
  }

  if (!startId || !store.songs.has(startId)) {
    // 출발지가 랜덤이고 도착지가 특정 곡으로 고정된 경우: 도착 곡에서 단일 역방향 탐색으로 조건 만족 출발 곡을 즉시 수집
    if (options.targetMode === "song" && options.targetId && store.songs.has(options.targetId)) {
      const fixedTargetSongId = options.targetId;
      const targetFixedCompId = store.getComponentId(fixedTargetSongId);

      if (targetFixedCompId !== null && store.getComponentSize(targetFixedCompId) > 1) {
        const candRes = engine.findCandidatesFromSource(fixedTargetSongId, minTurns, maxTurns, {
          allowedRoles: options.allowedRoles,
          filterFn: attrFilterFn
        });

        if (candRes.strictMatches.length > 0) {
          startId = candRes.strictMatches[Math.floor(Math.random() * candRes.strictMatches.length)];
        } else if (candRes.relaxedMatches.length > 0) {
          startId = candRes.relaxedMatches[Math.floor(Math.random() * candRes.relaxedMatches.length)];
        } else if (candRes.closestTurnSongId) {
          startId = candRes.closestTurnSongId;
        } else {
          const compSongs = store.getComponentSongs(targetFixedCompId);
          startId = compSongs.find((id) => id !== fixedTargetSongId) || allSongIds[0];
        }
      } else {
        // 도착 곡이 1곡 단독 고립 섬인 경우 REASON_A 유도를 위해 메인 대륙 곡을 출발지로 선택
        startId =
          allSongIds.find((id) => id !== fixedTargetSongId && store.getComponentId(id) === 1) ||
          allSongIds[0];
      }
    } else {
      const preferGiant = options.inGiant !== false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const candId = allSongIds[Math.floor(Math.random() * allSongIds.length)];
        if (attrFilterFn(candId) && (preferGiant ? store.getComponentId(candId) === 1 : true)) {
          startId = candId;
          break;
        }
      }
      if (!startId) {
        startId = allSongIds.find((id) => store.getComponentId(id) === 1) || allSongIds[0];
      }
    }
  }

  const startCompId = store.getComponentId(startId);
  let targetPersonMeta: { id: string; name: string; isGroup?: boolean } | undefined = undefined;

  // 2. 도착지가 명시된 경우 (특정 곡 또는 아티스트)
  if (options.targetMode === "song" && options.targetId && store.songs.has(options.targetId)) {
    return diagnoseQuestPair(startId, options.targetId, options);
  }

  if ((options.targetMode === "artist" || options.targetMode === "creator") && options.targetId) {
    const person = store.getPerson(options.targetId);
    if (person) {
      targetPersonMeta = { id: person.id, name: person.name, isGroup: person.isGroup };
    }
    const personSongs = engine.getConnectedSongs(options.targetId, { includeGroupHops: true }).filter(
      (s) => s.id !== startId
    );

    if (personSongs.length > 0) {
      let sameCompCandidate: string | null = null;
      let rolePassCandidate: string | null = null;
      const validTargets: string[] = [];

      for (const s of personSongs) {
        if (store.getComponentId(s.id) === startCompId) {
          if (!sameCompCandidate) sameCompCandidate = s.id;
          const res = engine.findShortestPath(startId, s.id, {
            allowedRoles: options.allowedRoles
          });
          if (res.found) {
            if (!rolePassCandidate) rolePassCandidate = s.id;
            if (res.turns >= minTurns && res.turns <= maxTurns) {
              validTargets.push(s.id);
              if (validTargets.length >= 10) break;
            }
          }
        }
      }

      if (validTargets.length > 0) {
        const pickedTargetId = validTargets[Math.floor(Math.random() * validTargets.length)];
        return diagnoseQuestPair(startId, pickedTargetId, options, targetPersonMeta);
      }

      // 조건 완벽 부합 곡이 없으면 가장 근접한 단계의 대표곡으로 진단 반환 (REASON_C -> REASON_B -> REASON_A 순)
      const diagTargetId = rolePassCandidate || sameCompCandidate || personSongs[0].id;
      return diagnoseQuestPair(startId, diagTargetId, options, targetPersonMeta);
    }
  }

  // 3. 도착지가 랜덤인 경우: 단일 출발점(startId) 탐색으로 조건 만족 후보 곡을 1회 탐색에 수집
  const compSongs = startCompId !== null ? store.getComponentSongs(startCompId) : [];

  // 만약 출발 곡이 단독 고립 곡(컴포넌트 크기 <= 1)이면 REASON_A 진단 반환
  if (compSongs.length <= 1) {
    const refTargetId =
      allSongIds.find((id) => id !== startId && store.getComponentId(id) === 1) || allSongIds[0];
    return diagnoseQuestPair(startId, refTargetId, options);
  }

  const candRes = engine.findCandidatesFromSource(startId, minTurns, maxTurns, {
    allowedRoles: options.allowedRoles,
    filterFn: attrFilterFn
  });

  if (candRes.strictMatches.length > 0) {
    const pickedTarget =
      candRes.strictMatches[Math.floor(Math.random() * candRes.strictMatches.length)];
    return diagnoseQuestPair(startId, pickedTarget, options);
  }

  if (candRes.relaxedMatches.length > 0) {
    const pickedTarget =
      candRes.relaxedMatches[Math.floor(Math.random() * candRes.relaxedMatches.length)];
    return diagnoseQuestPair(startId, pickedTarget, options);
  }

  // 역할 필터는 통과했으나 거리(minTurns~maxTurns) 조건만 불충족인 경우 -> REASON_C
  if (candRes.closestTurnSongId) {
    return diagnoseQuestPair(startId, candRes.closestTurnSongId, options);
  }

  // 역할 필터로 인해 도달 가능한 곡이 0개인 경우 -> REASON_B
  const fallbackSameCompTarget = compSongs.find((id) => id !== startId)!;
  return diagnoseQuestPair(startId, fallbackSameCompTarget, options);
}

/**
 * 자유 연습 모드를 위한 4-Layer 커스텀 퀘스트 생성기 (하위 호환용 QuestPayload 반환)
 */
export function getRandomQuest(options: PracticeFilterOptions = {}): QuestPayload {
  const res = generateCustomQuest(options);
  if (res.ok && res.quest) {
    return res.quest;
  }

  // 만약 진단 실패(예: 거리 불충족 등) 시에도 하위 호환 호출자에게는 가장 근접한 유효 경로 또는 대체 퀘스트 반환
  if (res.diagnostics) {
    const d = res.diagnostics;
    if (d.reason === "REASON_C" && d.actualPath && d.actualTurns) {
      return {
        questId: `practice_${Date.now()}`,
        startSong: d.startSong,
        targetSong: d.targetSong,
        optimalTurns: d.actualTurns,
        optimalPath: d.actualPath,
        isIsland: !d.startSong.inGiant,
        allowedRoles: options.allowedRoles
      };
    }
    if (d.reason === "REASON_B" && d.unrestrictedPath && d.unrestrictedTurns) {
      return {
        questId: `practice_${Date.now()}`,
        startSong: d.startSong,
        targetSong: d.targetSong,
        optimalTurns: d.unrestrictedTurns,
        optimalPath: d.unrestrictedPath,
        isIsland: !d.startSong.inGiant
      };
    }
  }

  return generateCustomQuest({ turnDistance: "any" }).quest!;
}

