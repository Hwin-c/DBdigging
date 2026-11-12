/**
 * scripts/analysis/connectivity_audit.ts
 *
 * Phase 13 — 과제 1 (13-1 네트워크 연결성 통계 & 13-2 동명이인/가상 ID 실측)
 * - 원본 데이터(public/data/*) 수정 일체 없음
 * - 실제 게임 엔진 코드(GraphStore, GraphEngine) 100% 재사용
 * - 고정 시드(SEED = 20261105, Mulberry32 PRNG) 사용
 * - 산출물 저장 경로: scripts/analysis/output/
 */

import * as fs from "fs";
import * as path from "path";
import { GraphStore } from "../../src/lib/graph/loader";
import { GraphEngine } from "../../src/lib/graph/engine";
import { RawGraphBundle, DailyQuestSeed } from "../../src/lib/graph/types";

const FIXED_SEED = 20261105;
const SAMPLE_PAIRS_COUNT = 10000;
const SINGLE_SOURCE_SAMPLE_COUNT = 200;

/**
 * 결정론적 난수 생성기 (Mulberry32)
 */
function createPRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ComponentInfo {
  compId: number;
  totalNodes: number;
  songNodes: number;
  personNodes: number;
  sampleSongIds: string[];
}

/**
 * 주어진 인접 리스트(adj)와 전체 곡 ID 목록에 대해 연결 컴포넌트(WCC) 및 P를 계산
 */
function analyzeComponents(
  adj: Map<string, string[]>,
  allSongIds: string[],
  allPersonIds: string[],
  blockedNodeSet?: Set<string>
) {
  const visited = new Set<string>();
  const songCompMap = new Map<string, number>();
  const components: ComponentInfo[] = [];
  let compSeq = 0;

  // 모든 곡 노드('s:...')와 인물 노드('p:...')를 순회하며 WCC 산출
  const allTypedNodes: string[] = [
    ...allSongIds.map((id) => `s:${id}`),
    ...allPersonIds.map((id) => `p:${id}`)
  ];

  for (const startNode of allTypedNodes) {
    if (blockedNodeSet && blockedNodeSet.has(startNode)) continue;
    if (visited.has(startNode)) continue;

    compSeq++;
    const queue: string[] = [startNode];
    visited.add(startNode);
    let head = 0;

    let songCount = 0;
    let personCount = 0;
    const sampleSongs: string[] = [];

    while (head < queue.length) {
      const curr = queue[head++];
      if (curr.startsWith("s:")) {
        songCount++;
        const rawSongId = curr.slice(2);
        songCompMap.set(rawSongId, compSeq);
        if (sampleSongs.length < 3) sampleSongs.push(rawSongId);
      } else {
        personCount++;
      }

      const neighbors = adj.get(curr);
      if (!neighbors) continue;

      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        if (blockedNodeSet && blockedNodeSet.has(next)) continue;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    components.push({
      compId: compSeq,
      totalNodes: songCount + personCount,
      songNodes: songCount,
      personNodes: personCount,
      sampleSongIds: sampleSongs
    });
  }

  // 곡이 1개 이상 포함된 컴포넌트만 정렬 (곡 수 내림차순, 같으면 전체 노드 수 내림차순)
  const songComponents = components
    .filter((c) => c.songNodes > 0)
    .sort((a, b) => b.songNodes - a.songNodes || b.totalNodes - a.totalNodes);

  const N = allSongIds.length;
  let sumSq = 0;
  let sumPairsWithoutReplacement = 0;
  for (const c of songComponents) {
    const ratio = c.songNodes / N;
    sumSq += ratio * ratio;
    sumPairsWithoutReplacement += (c.songNodes * (c.songNodes - 1)) / (N * (N - 1));
  }

  const giantSongCount = songComponents.length > 0 ? songComponents[0].songNodes : 0;
  const giantCompId = songComponents.length > 0 ? songComponents[0].compId : -1;

  return {
    allComponentsCount: components.length,
    songComponentsCount: songComponents.length,
    personOnlyComponentsCount: components.length - songComponents.length,
    songComponents,
    songCompMap,
    P_withReplacement: sumSq,
    P_withoutReplacement: sumPairsWithoutReplacement,
    giantSongCount,
    giantCoveragePercent: (giantSongCount / N) * 100,
    giantCompId
  };
}

/**
 * 단일 출발점(Single-Source) BFS를 200개 출발 곡에서 수행하여 최단 턴 수 분포 산출
 * (엔진의 findShortestPath와 100% 동일한 거리 정의: turns = Math.floor(edgeDist / 2))
 */
function analyzeShortestTurnsFromSample(
  adj: Map<string, string[]>,
  sampleStartSongIds: string[],
  blockedNodeSet?: Set<string>,
  weightedPenaltyNodeSet?: Set<string>
) {
  const turnHistogram = new Map<number, number>();
  let totalReachablePairs = 0;
  let totalTurnsSum = 0;

  for (const startSongId of sampleStartSongIds) {
    const startKey = `s:${startSongId}`;
    if (blockedNodeSet && blockedNodeSet.has(startKey)) continue;

    if (!weightedPenaltyNodeSet) {
      // 표준 Unweighted BFS (store.adj 기준)
      const dist = new Map<string, number>();
      dist.set(startKey, 0);
      const queue: string[] = [startKey];
      let head = 0;

      while (head < queue.length) {
        const curr = queue[head++];
        const d = dist.get(curr)!;
        const neighbors = adj.get(curr);
        if (!neighbors) continue;

        for (let i = 0; i < neighbors.length; i++) {
          const next = neighbors[i];
          if (blockedNodeSet && blockedNodeSet.has(next)) continue;
          if (!dist.has(next)) {
            dist.set(next, d + 1);
            queue.push(next);
          }
        }
      }

      dist.forEach((edgeDist, nodeKey) => {
        if (nodeKey !== startKey && nodeKey.startsWith("s:")) {
          const turns = Math.floor(edgeDist / 2);
          turnHistogram.set(turns, (turnHistogram.get(turns) || 0) + 1);
          totalReachablePairs++;
          totalTurnsSum += turns;
        }
      });
    } else {
      // Candidate 2: 정식 ID 우선 / 가상 ID 페널티 가중치 (0-1 / 1-2 BFS)
      // 가상 ID 노드로 진입할 때 추가 엣지 비용(+2, 즉 +1턴 상당의 페널티)을 부여하되,
      // 실제 유저가 치르는 물리적 턴 수를 함께 기록하거나 가중 최단 경로의 실제 턴 수를 집계
      const costDist = new Map<string, number>();
      const actualEdgeDist = new Map<string, number>();
      costDist.set(startKey, 0);
      actualEdgeDist.set(startKey, 0);

      // Bucket queue for small integer weights (1 or 3)
      const buckets: string[][] = [[startKey]];
      let currentCost = 0;
      let remaining = 1;

      while (remaining > 0) {
        while (!buckets[currentCost] || buckets[currentCost].length === 0) {
          currentCost++;
        }
        const curr = buckets[currentCost].pop()!;
        remaining--;

        if (currentCost > (costDist.get(curr) ?? Infinity)) continue;
        const currActual = actualEdgeDist.get(curr)!;

        const neighbors = adj.get(curr);
        if (!neighbors) continue;

        for (let i = 0; i < neighbors.length; i++) {
          const next = neighbors[i];
          if (blockedNodeSet && blockedNodeSet.has(next)) continue;

          const stepWeight = weightedPenaltyNodeSet.has(next) ? 3 : 1;
          const nextCost = currentCost + stepWeight;
          const prevBestCost = costDist.get(next);

          if (prevBestCost === undefined || nextCost < prevBestCost) {
            costDist.set(next, nextCost);
            actualEdgeDist.set(next, currActual + 1);
            if (!buckets[nextCost]) buckets[nextCost] = [];
            buckets[nextCost].push(next);
            remaining++;
          }
        }
      }

      actualEdgeDist.forEach((edgeDist, nodeKey) => {
        if (nodeKey !== startKey && nodeKey.startsWith("s:")) {
          const turns = Math.floor(edgeDist / 2);
          turnHistogram.set(turns, (turnHistogram.get(turns) || 0) + 1);
          totalReachablePairs++;
          totalTurnsSum += turns;
        }
      });
    }
  }

  // 평균 및 중앙값 산출
  const meanTurns = totalReachablePairs > 0 ? totalTurnsSum / totalReachablePairs : 0;
  const sortedTurns = Array.from(turnHistogram.keys()).sort((a, b) => a - b);
  let cumulative = 0;
  let medianTurns = 0;
  const half = totalReachablePairs / 2;

  for (const t of sortedTurns) {
    cumulative += turnHistogram.get(t)!;
    if (cumulative >= half) {
      medianTurns = t;
      break;
    }
  }

  // 1, 2, 3, 4, 5, 6+ 집계
  const bucketCounts: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6+": 0
  };
  const exactTurnCounts: Record<number, number> = {};

  for (const t of sortedTurns) {
    const cnt = turnHistogram.get(t)!;
    exactTurnCounts[t] = cnt;
    if (t >= 1 && t <= 5) {
      bucketCounts[String(t)] += cnt;
    } else if (t >= 6) {
      bucketCounts["6+"] += cnt;
    }
  }

  return {
    totalReachablePairs,
    meanTurns,
    medianTurns,
    bucketCounts,
    exactTurnCounts
  };
}

async function main() {
  const startTime = Date.now();
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, "public", "data");
  const outDir = path.join(rootDir, "scripts", "analysis", "output");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("[1/6] Loading dataset_manifest.json, firebase_graph_bundle.json, and seeds...");
  const manifestRaw = JSON.parse(
    fs.readFileSync(path.join(dataDir, "dataset_manifest.json"), "utf-8")
  );
  const bundle: RawGraphBundle = JSON.parse(
    fs.readFileSync(path.join(dataDir, "firebase_graph_bundle.json"), "utf-8")
  );
  const seeds: DailyQuestSeed[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "firebase_daily_quests_seed.json"), "utf-8")
  );

  // 실제 게임 엔진 초기화
  const store = new GraphStore();
  store.populate(bundle);
  const engine = new GraphEngine(store);

  const allSongIds = Array.from(store.songs.keys());
  const allPersonIds = Array.from(store.persons.keys());
  const N = allSongIds.length;
  const M = allPersonIds.length;

  // =========================================================================
  // 13-1 (A): 노드 수, 엣지 수 전수 재집계 및 기존 기록 불일치 원인 규명
  // =========================================================================
  console.log("[2/6] Counting nodes, edges, and resolving historical discrepancies...");
  let songEdgePairsCount = 0;
  let totalRoleCodesInSongEdges = 0;
  let songsWithEdgesCount = 0;
  let songsWithZeroEdgesCount = 0;

  for (const songId of allSongIds) {
    const edges = store.songEdges.get(songId);
    if (!edges || edges.length === 0) {
      songsWithZeroEdgesCount++;
    } else {
      songsWithEdgesCount++;
      songEdgePairsCount += edges.length;
      for (const [, roles] of edges) {
        totalRoleCodesInSongEdges += roles.length;
      }
    }
  }

  const groupEdgePairsCount = bundle.group_edges.length;
  const combinedEdgeCount = songEdgePairsCount + groupEdgePairsCount;

  // 인물/그룹 노드 세부 분류 (65,608 vs 65,291 원인 규명)
  let groupNodesCount = 0;
  let individualNodesCount = 0;
  let personsInSongEdgesCount = 0;
  let personsInGroupEdgesOnlyCount = 0;
  let personsDegreeZeroCount = 0;

  const personsInGroupEdgesSet = new Set<string>();
  for (const [mId, gId] of bundle.group_edges) {
    personsInGroupEdgesSet.add(mId);
    personsInGroupEdgesSet.add(gId);
  }

  for (const [pId, tuple] of store.persons.entries()) {
    if (tuple[1] === 1) groupNodesCount++;
    else individualNodesCount++;

    const hasSongEdge = (store.personToSongs.get(pId)?.length || 0) > 0;
    const hasGroupEdge = personsInGroupEdgesSet.has(pId);

    if (hasSongEdge) {
      personsInSongEdgesCount++;
    } else if (hasGroupEdge) {
      personsInGroupEdgesOnlyCount++;
    } else {
      personsDegreeZeroCount++;
    }
  }

  // 곡 ID와 인물 ID 간 숫자 충돌 건수 확인
  let songPersonIdCollisionCount = 0;
  for (const sId of allSongIds) {
    if (store.persons.has(sId)) songPersonIdCollisionCount++;
  }

  // 번들에 기록된 in_giant === 1 곡 수 확인
  let bundleInGiantFlagCount = 0;
  for (const [, tuple] of store.songs.entries()) {
    if (tuple[7] === 1) bundleInGiantFlagCount++;
  }

  // =========================================================================
  // 13-1 (B): 연결 컴포넌트(WCC) 및 임의 두 곡 연결 확률 P 산출 + 10,000쌍 교차 검증
  // =========================================================================
  console.log("[3/6] Computing Connected Components (WCC) and cross-validating P (10,000 pairs)...");
  const compAnalysis = analyzeComponents(store.adj, allSongIds, allPersonIds);

  // 곡 기준 컴포넌트 크기 분포
  const compSizeDistribution: Record<string, { componentCount: number; totalSongs: number }> = {
    "Giant Component (195,000+)": { componentCount: 0, totalSongs: 0 },
    "Medium Island (10 ~ 999 songs)": { componentCount: 0, totalSongs: 0 },
    "Small Island (2 ~ 9 songs)": { componentCount: 0, totalSongs: 0 },
    "Isolated Single Song (1 song)": { componentCount: 0, totalSongs: 0 }
  };

  for (const c of compAnalysis.songComponents) {
    if (c.songNodes >= 1000) {
      compSizeDistribution["Giant Component (195,000+)"].componentCount++;
      compSizeDistribution["Giant Component (195,000+)"].totalSongs += c.songNodes;
    } else if (c.songNodes >= 10) {
      compSizeDistribution["Medium Island (10 ~ 999 songs)"].componentCount++;
      compSizeDistribution["Medium Island (10 ~ 999 songs)"].totalSongs += c.songNodes;
    } else if (c.songNodes >= 2) {
      compSizeDistribution["Small Island (2 ~ 9 songs)"].componentCount++;
      compSizeDistribution["Small Island (2 ~ 9 songs)"].totalSongs += c.songNodes;
    } else if (c.songNodes === 1) {
      compSizeDistribution["Isolated Single Song (1 song)"].componentCount++;
      compSizeDistribution["Isolated Single Song (1 song)"].totalSongs += c.songNodes;
    }
  }

  // 고정 시드 기반 10,000쌍 무작위 샘플링 (BFS 없이 컴포넌트 ID 일치 여부만 O(1) 비교)
  const prngPairs = createPRNG(FIXED_SEED);
  let connectedPairsWithRep = 0;
  for (let i = 0; i < SAMPLE_PAIRS_COUNT; i++) {
    const idxA = Math.floor(prngPairs() * N);
    const idxB = Math.floor(prngPairs() * N);
    const sA = allSongIds[idxA];
    const sB = allSongIds[idxB];
    if (compAnalysis.songCompMap.get(sA) === compAnalysis.songCompMap.get(sB)) {
      connectedPairsWithRep++;
    }
  }

  const prngDistinctPairs = createPRNG(FIXED_SEED);
  let connectedPairsWithoutRep = 0;
  for (let i = 0; i < SAMPLE_PAIRS_COUNT; i++) {
    const idxA = Math.floor(prngDistinctPairs() * N);
    let idxB = Math.floor(prngDistinctPairs() * (N - 1));
    if (idxB >= idxA) idxB++;
    const sA = allSongIds[idxA];
    const sB = allSongIds[idxB];
    if (compAnalysis.songCompMap.get(sA) === compAnalysis.songCompMap.get(sB)) {
      connectedPairsWithoutRep++;
    }
  }

  // =========================================================================
  // 13-1 (C): 무작위 출발 곡 200개 단일 출발점 BFS 최단 턴 분포 vs 데일리 시드 100개
  // =========================================================================
  console.log(`[4/6] Running Single-Source BFS from ${SINGLE_SOURCE_SAMPLE_COUNT} random starting songs...`);
  const bfsStartTime = Date.now();
  const prngSources = createPRNG(FIXED_SEED);
  const sampleStartSongIds: string[] = [];
  const pickedSet = new Set<string>();

  while (sampleStartSongIds.length < SINGLE_SOURCE_SAMPLE_COUNT) {
    const cand = allSongIds[Math.floor(prngSources() * N)];
    if (!pickedSet.has(cand)) {
      pickedSet.add(cand);
      sampleStartSongIds.push(cand);
    }
  }

  const turnDistBaseline = analyzeShortestTurnsFromSample(store.adj, sampleStartSongIds);
  const bfsElapsedMs = Date.now() - bfsStartTime;

  // 데일리 시드 100개의 턴 수 분포 집계
  const seedRecordedTurnDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };
  const seedEngineTurnDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };
  let seedRecordedSum = 0;
  let seedEngineSum = 0;
  let seedValidCount = 0;

  for (const seed of seeds) {
    const recT = seed.optimal_turns;
    seedRecordedSum += recT;
    if (recT >= 1 && recT <= 5) seedRecordedTurnDist[String(recT)]++;
    else seedRecordedTurnDist["6+"]++;

    const sp = engine.findShortestPath(seed.start_song_id, seed.target_song_id);
    if (sp.found) {
      seedValidCount++;
      seedEngineSum += sp.turns;
      if (sp.turns >= 1 && sp.turns <= 5) seedEngineTurnDist[String(sp.turns)]++;
      else seedEngineTurnDist["6+"]++;
    }
  }

  // =========================================================================
  // 13-1 (D): 고립 곡(Giant Component 외부 곡) 원인 분류
  // =========================================================================
  console.log("[5/6] Classifying isolated / non-giant songs...");
  const nonGiantSongIds = allSongIds.filter(
    (sId) => compAnalysis.songCompMap.get(sId) !== compAnalysis.giantCompId
  );

  let nonGiantDegree0 = 0;
  let nonGiantDegree1 = 0;
  let nonGiantDegree2Plus = 0;
  let nonGiantOnlyVirtualPersons = 0;
  let nonGiantHasFormalPerson = 0;
  let nonGiantOnlySingerRole = 0; // 가창(role 1)만 있고 작사/작곡/편곡 크레딧이 전무한 경우
  const nonGiantGenreCounts = new Map<string, number>();

  for (const sId of nonGiantSongIds) {
    const edges = store.songEdges.get(sId) || [];
    const tuple = store.songs.get(sId)!;
    const genre = tuple[4] || "미분류";
    nonGiantGenreCounts.set(genre, (nonGiantGenreCounts.get(genre) || 0) + 1);

    if (edges.length === 0) {
      nonGiantDegree0++;
      continue;
    }
    if (edges.length === 1) nonGiantDegree1++;
    else nonGiantDegree2Plus++;

    const allVirtual = edges.every(([pId]) => !/^\d+$/.test(pId));
    if (allVirtual) nonGiantOnlyVirtualPersons++;
    else nonGiantHasFormalPerson++;

    const hasCreatorRole = edges.some(([, roles]) =>
      roles.some((r) => r === 3 || r === 4 || r === 5)
    );
    if (!hasCreatorRole) {
      nonGiantOnlySingerRole++;
    }
  }

  const topNonGiantGenres = Array.from(nonGiantGenreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // =========================================================================
  // 13-2: 동명이인 & 가상 ID 전수 실측 및 후보 1~3 비교 실험
  // =========================================================================
  console.log("[6/6] Auditing Virtual IDs, Split Identities, and evaluating Candidates 1~3...");

  // 1) 가상 ID 접두사 전수 실측 (사전 가정 없이 추출)
  const prefixCounts = new Map<string, { total: number; groupCount: number; personCount: number; withSongsCount: number }>();
  let formalNumericIdCount = 0;
  let totalVirtualIdCount = 0;

  const virtualNodeDegrees: Array<{
    personId: string;
    prefix: string;
    name: string;
    isGroup: boolean;
    songDegree: number;
    groupEdgeDegree: number;
    minYear: string;
    maxYear: string;
    yearSpan: number;
    distinctGenresCount: number;
    topGenres: string[];
  }> = [];

  for (const [pId, tuple] of store.persons.entries()) {
    const name = tuple[0];
    const isGroup = tuple[1] === 1;
    const isNumeric = /^\d+$/.test(pId);

    if (isNumeric) {
      formalNumericIdCount++;
    } else {
      totalVirtualIdCount++;
      const match = pId.match(/^([a-zA-Z0-9]+_)/);
      const prefix = match ? match[1] : "other_non_numeric";

      let stat = prefixCounts.get(prefix);
      if (!stat) {
        stat = { total: 0, groupCount: 0, personCount: 0, withSongsCount: 0 };
        prefixCounts.set(prefix, stat);
      }
      stat.total++;
      if (isGroup) stat.groupCount++;
      else stat.personCount++;

      const pSongs = store.personToSongs.get(pId) || [];
      if (pSongs.length > 0) stat.withSongsCount++;

      const gEdgesCount =
        (store.memberToGroups.get(pId)?.length || 0) +
        (store.groupToMembers.get(pId)?.length || 0);

      let minY = 9999;
      let maxY = 0;
      const gCounts = new Map<string, number>();

      for (const [sId] of pSongs) {
        const sTuple = store.songs.get(sId);
        if (!sTuple) continue;
        const y = parseInt(sTuple[3], 10);
        if (!isNaN(y) && y >= 1900 && y <= 2030) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const g = sTuple[4] || "미분류";
        gCounts.set(g, (gCounts.get(g) || 0) + 1);
      }

      const yearSpan = maxY >= minY ? maxY - minY : 0;
      const topGenres = Array.from(gCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g, c]) => `${g}(${c})`);

      virtualNodeDegrees.push({
        personId: pId,
        prefix,
        name,
        isGroup,
        songDegree: pSongs.length,
        groupEdgeDegree: gEdgesCount,
        minYear: minY === 9999 ? "-" : String(minY),
        maxYear: maxY === 0 ? "-" : String(maxY),
        yearSpan,
        distinctGenresCount: gCounts.size,
        topGenres
      });
    }
  }

  virtualNodeDegrees.sort((a, b) => b.songDegree - a.songDegree);
  const top20VirtualNodes = virtualNodeDegrees.slice(0, 20);

  // `name_` 접두사 중 차수 상위 20개도 별도 추출
  const top20NameVirtualNodes = virtualNodeDegrees
    .filter((v) => v.prefix === "name_")
    .slice(0, 20);

  // 2) 데일리 시드 100개 최단 경로 내 가상 ID 포함 현황
  let seedsWithVirtualInSeedPath = 0;
  let seedsWithNameVirtualInSeedPath = 0;
  const seedVirtualDetails: Array<{
    questId: string;
    virtualIdsInSeedPath: string[];
    virtualNamesInSeedPath: string[];
  }> = [];

  for (const seed of seeds) {
    const vIds = seed.optimal_path.filter(
      (id, idx) => idx % 2 === 1 && !/^\d+$/.test(id)
    );
    // optimal_path에는 그룹 1-hop이 포함될 수 있으므로 store.persons에 있고 비숫자인 모든 노드 검사
    const allVIds = seed.optimal_path.filter(
      (id) => store.persons.has(id) && !/^\d+$/.test(id)
    );
    if (allVIds.length > 0) {
      seedsWithVirtualInSeedPath++;
      if (allVIds.some((id) => id.startsWith("name_"))) {
        seedsWithNameVirtualInSeedPath++;
      }
      seedVirtualDetails.push({
        questId: seed.quest_id,
        virtualIdsInSeedPath: allVIds,
        virtualNamesInSeedPath: allVIds.map((id) => store.persons.get(id)?.[0] || id)
      });
    }
  }

  // 3) 반대 방향 위험: '동일인 분리' (가상 ID의 이름과 동일한 이름을 가진 정식 멜론 숫자 ID 인물)
  const nameToFormalIds = new Map<string, string[]>();
  const nameToVirtualIds = new Map<string, string[]>();

  for (const [pId, tuple] of store.persons.entries()) {
    const cleanName = tuple[0].trim();
    if (/^\d+$/.test(pId)) {
      const list = nameToFormalIds.get(cleanName) || [];
      list.push(pId);
      nameToFormalIds.set(cleanName, list);
    } else {
      const list = nameToVirtualIds.get(cleanName) || [];
      list.push(pId);
      nameToVirtualIds.set(cleanName, list);
    }
  }

  // 정식 숫자 ID 내부에서의 동명이인 현황 (서로 다른 숫자 ID가 같은 이름을 공유)
  let formalHomonymNameCount = 0;
  let formalHomonymTotalIds = 0;
  for (const [, fIds] of nameToFormalIds.entries()) {
    if (fIds.length > 1) {
      formalHomonymNameCount++;
      formalHomonymTotalIds += fIds.length;
    }
  }

  // 가상 ID 이름과 정식 멜론 숫자 ID 이름이 겹치는 '동일인 분리' 사례 집계
  interface SplitIdentityCase {
    name: string;
    formalIds: string[];
    virtualIds: string[];
    formalSongCount: number;
    virtualSongCount: number;
    overlapSongCount: number;
    totalUniqueSongCount: number;
  }

  const splitIdentityCases: SplitIdentityCase[] = [];
  let virtualIdsMatchingFormalNameCount = 0;

  for (const [name, vIds] of nameToVirtualIds.entries()) {
    const fIds = nameToFormalIds.get(name);
    if (fIds && fIds.length > 0) {
      virtualIdsMatchingFormalNameCount += vIds.length;

      const formalSongs = new Set<string>();
      for (const fid of fIds) {
        for (const [sId] of store.personToSongs.get(fid) || []) {
          formalSongs.add(sId);
        }
      }

      const virtualSongs = new Set<string>();
      for (const vid of vIds) {
        for (const [sId] of store.personToSongs.get(vid) || []) {
          virtualSongs.add(sId);
        }
      }

      let overlap = 0;
      for (const sId of virtualSongs) {
        if (formalSongs.has(sId)) overlap++;
      }

      const combined = new Set<string>([...formalSongs, ...virtualSongs]);
      splitIdentityCases.push({
        name,
        formalIds: fIds,
        virtualIds: vIds,
        formalSongCount: formalSongs.size,
        virtualSongCount: virtualSongs.size,
        overlapSongCount: overlap,
        totalUniqueSongCount: combined.size
      });
    }
  }

  // 가상 ID에 분리된 곡 수가 많고 전체 영향도가 큰 순서로 정렬 (가상 ID 곡 수 >= 1 이면서 정식 ID 곡 수 >= 1인 실질 분리 사례 우선)
  const activeSplitCases = splitIdentityCases
    .filter((c) => c.virtualSongCount > 0 && c.formalSongCount > 0)
    .sort((a, b) => b.virtualSongCount + b.formalSongCount - (a.virtualSongCount + a.formalSongCount));

  const top20SplitIdentityCases = activeSplitCases.slice(0, 20);

  // 4) 위험 완화 후보 1~3 적용 시 4대 지표 비교
  // - Baseline: 현재 store.adj 그대로
  // - Candidate 1A: `name_*` 가상 ID 노드를 경로 탐색에서 제외
  // - Candidate 1B: 모든 가상 ID(`!/^\d+$/`) 노드를 경로 탐색에서 제외
  // - Candidate 2: 가상 ID 노드에 페널티 가중치 부여 (정식 ID 우선 탐색) + 단일 정식 ID와 동일 이름 가상 ID 안전 병합
  // - Candidate 3: 연도(10년 초과 공백) 및 장르 기반 `name_*` 가상 ID 분리 (Homonym Disambiguation by Era/Genre)

  const blockedCand1A = new Set<string>(
    allPersonIds.filter((id) => id.startsWith("name_")).map((id) => `p:${id}`)
  );
  const blockedCand1B = new Set<string>(
    allPersonIds.filter((id) => !/^\d+$/.test(id)).map((id) => `p:${id}`)
  );

  console.log("  -> Evaluating Candidate 1A (Exclude name_* virtual IDs)...");
  const compCand1A = analyzeComponents(store.adj, allSongIds, allPersonIds, blockedCand1A);
  const turnsCand1A = analyzeShortestTurnsFromSample(store.adj, sampleStartSongIds, blockedCand1A);

  console.log("  -> Evaluating Candidate 1B (Exclude ALL non-numeric virtual IDs)...");
  const compCand1B = analyzeComponents(store.adj, allSongIds, allPersonIds, blockedCand1B);
  const turnsCand1B = analyzeShortestTurnsFromSample(store.adj, sampleStartSongIds, blockedCand1B);

  console.log("  -> Evaluating Candidate 2 (Penalty weight on virtual IDs, preferring formal IDs)...");
  const penaltySetCand2 = blockedCand1B; // 모든 가상 ID에 가중치 페널티 부여
  const compCand2 = compAnalysis; // 연결성(도달 가능 여부)은 Baseline과 동일하게 보존
  const turnsCand2 = analyzeShortestTurnsFromSample(
    store.adj,
    sampleStartSongIds,
    undefined,
    penaltySetCand2
  );

  console.log("  -> Evaluating Candidate 3 (Era/Genre Clustering Split on Virtual IDs)...");
  // Candidate 3 그래프 구성:
  // `name_*` 가상 ID 중 참여곡 수가 2곡 이상인 노드에 대해,
  // 곡들을 (장르 그룹, 발매연도 10년 단위 클러스터) 또는 연도 정렬 시 10년 이상 단절 구간 기준으로 서브 노드로 분리
  const adjCand3 = new Map<string, string[]>();
  const cand3PersonIds: string[] = [];

  const addCand3Edge = (u: string, v: string) => {
    let lu = adjCand3.get(u);
    if (!lu) {
      lu = [];
      adjCand3.set(u, lu);
    }
    lu.push(v);
    let lv = adjCand3.get(v);
    if (!lv) {
      lv = [];
      adjCand3.set(v, lv);
    }
    lv.push(u);
  };

  for (const [mId, gId] of bundle.group_edges) {
    addCand3Edge(`p:${mId}`, `p:${gId}`);
  }

  let splitVirtualNodeCount = 0;
  let createdSubNodesCount = 0;

  for (const pId of allPersonIds) {
    const pSongs = store.personToSongs.get(pId) || [];
    if (!pId.startsWith("name_") || pSongs.length <= 1) {
      cand3PersonIds.push(pId);
      for (const [sId] of pSongs) {
        addCand3Edge(`s:${sId}`, `p:${pId}`);
      }
      continue;
    }

    // `name_*` 노드의 참여곡들을 연도 및 주요 장르로 클러스터링
    // 1) 연도 순 정렬 후 인접 곡 간 연도 차이가 10년 이상이거나, 장르가 완전히 다른 클러스터 분리
    const songMeta = pSongs.map(([sId]) => {
      const t = store.songs.get(sId)!;
      const y = parseInt(t[3], 10);
      const validY = !isNaN(y) && y >= 1900 && y <= 2030 ? y : 2000;
      const primaryGenre = (t[4] || "미분류").split(",")[0].trim();
      return { sId, year: validY, genre: primaryGenre };
    });

    songMeta.sort((a, b) => a.year - b.year);

    // 연도 gap > 10년 또는 장르 불일치(연도 차이 >= 5년이면서 장르 불일치) 시 새로운 동명이인 클러스터로 분할
    const clusters: Array<string[]> = [];
    let currentCluster: string[] = [songMeta[0].sId];
    let prevYear = songMeta[0].year;
    let clusterGenres = new Set<string>([songMeta[0].genre]);

    for (let i = 1; i < songMeta.length; i++) {
      const item = songMeta[i];
      const yearGap = item.year - prevYear;
      const genreMatch = clusterGenres.has(item.genre);

      if (yearGap > 10 || (yearGap >= 5 && !genreMatch)) {
        clusters.push(currentCluster);
        currentCluster = [item.sId];
        clusterGenres = new Set<string>([item.genre]);
      } else {
        currentCluster.push(item.sId);
        clusterGenres.add(item.genre);
      }
      prevYear = item.year;
    }
    clusters.push(currentCluster);

    if (clusters.length > 1) {
      splitVirtualNodeCount++;
      createdSubNodesCount += clusters.length;
      clusters.forEach((cSongs, idx) => {
        const subId = `${pId}#c${idx + 1}`;
        cand3PersonIds.push(subId);
        for (const sId of cSongs) {
          addCand3Edge(`s:${sId}`, `p:${subId}`);
        }
      });
    } else {
      cand3PersonIds.push(pId);
      for (const [sId] of pSongs) {
        addCand3Edge(`s:${sId}`, `p:${pId}`);
      }
    }
  }

  const compCand3 = analyzeComponents(adjCand3, allSongIds, cand3PersonIds);
  const turnsCand3 = analyzeShortestTurnsFromSample(adjCand3, sampleStartSongIds);

  // 각 후보별 데일리 시드 100개 유효성(도달 가능 여부) 평가 함수
  function evaluateDailySeedsOnGraph(
    adj: Map<string, string[]>,
    blockedSet?: Set<string>,
    penaltySet?: Set<string>
  ) {
    let reachableCount = 0;
    let exactTurnMatchCount = 0;
    let virtualFreePathCount = 0;

    for (const seed of seeds) {
      const startKey = `s:${seed.start_song_id}`;
      const targetKey = `s:${seed.target_song_id}`;
      if (blockedSet && (blockedSet.has(startKey) || blockedSet.has(targetKey))) continue;

      // BFS
      const dist = new Map<string, number>();
      const parent = new Map<string, string>();
      dist.set(startKey, 0);
      const queue: string[] = [startKey];
      let head = 0;
      let found = false;

      if (!penaltySet) {
        while (head < queue.length) {
          const curr = queue[head++];
          if (curr === targetKey) {
            found = true;
            break;
          }
          const neighbors = adj.get(curr);
          if (!neighbors) continue;
          for (const next of neighbors) {
            if (blockedSet && blockedSet.has(next)) continue;
            if (!dist.has(next)) {
              dist.set(next, dist.get(curr)! + 1);
              parent.set(next, curr);
              if (next === targetKey) {
                found = true;
                break;
              }
              queue.push(next);
            }
          }
          if (found) break;
        }
      } else {
        // Penalty BFS
        const costDist = new Map<string, number>([[startKey, 0]]);
        const buckets: string[][] = [[startKey]];
        let cCost = 0;
        let rem = 1;
        while (rem > 0) {
          while (!buckets[cCost] || buckets[cCost].length === 0) cCost++;
          const curr = buckets[cCost].pop()!;
          rem--;
          if (curr === targetKey) {
            found = true;
            break;
          }
          if (cCost > (costDist.get(curr) ?? Infinity)) continue;
          for (const next of adj.get(curr) || []) {
            const w = penaltySet.has(next) ? 3 : 1;
            const nCost = cCost + w;
            if (nCost < (costDist.get(next) ?? Infinity)) {
              costDist.set(next, nCost);
              dist.set(next, dist.get(curr)! + 1);
              parent.set(next, curr);
              if (!buckets[nCost]) buckets[nCost] = [];
              buckets[nCost].push(next);
              rem++;
            }
          }
        }
      }

      if (found) {
        reachableCount++;
        const edgeDist = dist.get(targetKey)!;
        const turns = Math.floor(edgeDist / 2);
        if (turns === seed.optimal_turns) exactTurnMatchCount++;

        // 경로 내 가상 ID 포함 여부 확인
        let curr: string | undefined = targetKey;
        let hasVirtual = false;
        while (curr !== undefined) {
          if (curr.startsWith("p:")) {
            const rawP = curr.slice(2).split("#")[0];
            if (!/^\d+$/.test(rawP)) hasVirtual = true;
          }
          curr = parent.get(curr);
        }
        if (!hasVirtual) virtualFreePathCount++;
      }
    }

    return {
      reachableCount,
      exactTurnMatchCount,
      virtualFreePathCount
    };
  }

  const seedEvalBaseline = evaluateDailySeedsOnGraph(store.adj);
  const seedEvalCand1A = evaluateDailySeedsOnGraph(store.adj, blockedCand1A);
  const seedEvalCand1B = evaluateDailySeedsOnGraph(store.adj, blockedCand1B);
  const seedEvalCand2 = evaluateDailySeedsOnGraph(store.adj, undefined, penaltySetCand2);
  const seedEvalCand3 = evaluateDailySeedsOnGraph(adjCand3);

  // =========================================================================
  // 최종 결과 JSON 저장
  // =========================================================================
  const summaryReport = {
    metadata: {
      manifestBuildTimestampKst: manifestRaw.build_timestamp_kst,
      bundleVersion: bundle.version,
      includedGroups: bundle.included_groups,
      fixedSeed: FIXED_SEED,
      samplePairsCount: SAMPLE_PAIRS_COUNT,
      singleSourceSampleCount: SINGLE_SOURCE_SAMPLE_COUNT,
      singleSourceBfsElapsedMs: bfsElapsedMs,
      totalAuditElapsedMs: Date.now() - startTime
    },
    countsAndDiscrepancy: {
      totalSongs_N: N,
      totalPersonsAndGroups_M: M,
      individualNodesCount,
      groupNodesCount,
      personsInSongEdgesCount,
      personsInGroupEdgesOnlyCount,
      personsDegreeZeroCount,
      songEdgePairsCount,
      groupEdgePairsCount,
      combinedEdgeCount,
      totalRoleCodesInSongEdges,
      songsWithEdgesCount,
      songsWithZeroEdgesCount,
      songPersonIdCollisionCount,
      bundleInGiantFlagCount
    },
    connectivity13_1: {
      allComponentsCount: compAnalysis.allComponentsCount,
      songComponentsCount: compAnalysis.songComponentsCount,
      personOnlyComponentsCount: compAnalysis.personOnlyComponentsCount,
      giantSongCount: compAnalysis.giantSongCount,
      giantCoveragePercent: Number(compAnalysis.giantCoveragePercent.toFixed(4)),
      P_theoretical_withReplacement: Number(compAnalysis.P_withReplacement.toFixed(6)),
      P_theoretical_withoutReplacement: Number(compAnalysis.P_withoutReplacement.toFixed(6)),
      P_empirical_10000_withReplacement: connectedPairsWithRep / SAMPLE_PAIRS_COUNT,
      P_empirical_10000_withoutReplacement: connectedPairsWithoutRep / SAMPLE_PAIRS_COUNT,
      connectedPairsCount_withReplacement: connectedPairsWithRep,
      connectedPairsCount_withoutReplacement: connectedPairsWithoutRep,
      top10SongComponents: compAnalysis.songComponents.slice(0, 10).map((c, idx) => ({
        rank: idx + 1,
        compId: c.compId,
        songNodes: c.songNodes,
        personNodes: c.personNodes,
        totalNodes: c.totalNodes,
        shareOfSongsPercent: Number(((c.songNodes / N) * 100).toFixed(4)),
        sampleSongs: c.sampleSongIds.map((id) => store.getSong(id)?.display || id)
      })),
      compSizeDistribution,
      shortestTurnsSample200: {
        sourceCount: SINGLE_SOURCE_SAMPLE_COUNT,
        totalReachablePairs: turnDistBaseline.totalReachablePairs,
        meanTurns: Number(turnDistBaseline.meanTurns.toFixed(4)),
        medianTurns: turnDistBaseline.medianTurns,
        bucketCounts: turnDistBaseline.bucketCounts,
        bucketPercents: Object.fromEntries(
          Object.entries(turnDistBaseline.bucketCounts).map(([k, v]) => [
            k,
            Number(((v / turnDistBaseline.totalReachablePairs) * 100).toFixed(2))
          ])
        ),
        exactTurnCounts: turnDistBaseline.exactTurnCounts
      },
      dailySeeds100TurnDistribution: {
        totalSeeds: seeds.length,
        validSeedsCount: seedValidCount,
        recordedMeanTurns: Number((seedRecordedSum / seeds.length).toFixed(4)),
        engineMeanTurns: Number((seedEngineSum / seedValidCount).toFixed(4)),
        recordedBucketCounts: seedRecordedTurnDist,
        engineBucketCounts: seedEngineTurnDist
      },
      isolatedNonGiantSongsAnalysis: {
        totalNonGiantSongs: nonGiantSongIds.length,
        degree0Count: nonGiantDegree0,
        degree1Count: nonGiantDegree1,
        degree2PlusCount: nonGiantDegree2Plus,
        onlyVirtualPersonsCount: nonGiantOnlyVirtualPersons,
        hasFormalPersonCount: nonGiantHasFormalPerson,
        onlySingerRoleNoCreatorCount: nonGiantOnlySingerRole,
        topGenres: topNonGiantGenres
      }
    },
    entityResolution13_2: {
      formalNumericIdCount,
      totalVirtualIdCount,
      virtualIdRatioPercent: Number(((totalVirtualIdCount / M) * 100).toFixed(2)),
      discoveredPrefixes: Object.fromEntries(prefixCounts.entries()),
      top20VirtualNodesAll: top20VirtualNodes,
      top20NameVirtualNodes: top20NameVirtualNodes,
      dailySeedsVirtualUsage: {
        totalSeeds: seeds.length,
        seedsWithAnyVirtualId: seedsWithVirtualInSeedPath,
        seedsWithNameVirtualId: seedsWithNameVirtualInSeedPath,
        details: seedVirtualDetails
      },
      splitIdentityAnalysis: {
        formalHomonymDistinctNamesCount: formalHomonymNameCount,
        formalHomonymTotalIdsCount: formalHomonymTotalIds,
        distinctNamesWithBothFormalAndVirtualCount: splitIdentityCases.length,
        activeSplitNamesCount: activeSplitCases.length,
        virtualIdsMatchingFormalNameCount,
        top20SplitIdentityCases
      },
      candidateComparison: {
        baseline: {
          label: "Baseline (현재: 모든 가상 ID 허용)",
          P: Number(compAnalysis.P_withReplacement.toFixed(6)),
          giantCoveragePercent: Number(compAnalysis.giantCoveragePercent.toFixed(2)),
          giantSongCount: compAnalysis.giantSongCount,
          meanTurns: Number(turnDistBaseline.meanTurns.toFixed(3)),
          dailySeedsReachable: seedEvalBaseline.reachableCount,
          dailySeedsExactTurnMatch: seedEvalBaseline.exactTurnMatchCount,
          dailySeedsVirtualFreePath: seedEvalBaseline.virtualFreePathCount
        },
        candidate1A_excludeNamePrefix: {
          label: "후보 1A (name_* 미등록 창작자 가상 ID 제외)",
          P: Number(compCand1A.P_withReplacement.toFixed(6)),
          giantCoveragePercent: Number(compCand1A.giantCoveragePercent.toFixed(2)),
          giantSongCount: compCand1A.giantSongCount,
          meanTurns: Number(turnsCand1A.meanTurns.toFixed(3)),
          dailySeedsReachable: seedEvalCand1A.reachableCount,
          dailySeedsExactTurnMatch: seedEvalCand1A.exactTurnMatchCount,
          dailySeedsVirtualFreePath: seedEvalCand1A.virtualFreePathCount
        },
        candidate1B_excludeAllVirtual: {
          label: "후보 1B (모든 가상 ID [name_, singer_, feat_, group_] 전면 제외)",
          P: Number(compCand1B.P_withReplacement.toFixed(6)),
          giantCoveragePercent: Number(compCand1B.giantCoveragePercent.toFixed(2)),
          giantSongCount: compCand1B.giantSongCount,
          meanTurns: Number(turnsCand1B.meanTurns.toFixed(3)),
          dailySeedsReachable: seedEvalCand1B.reachableCount,
          dailySeedsExactTurnMatch: seedEvalCand1B.exactTurnMatchCount,
          dailySeedsVirtualFreePath: seedEvalCand1B.virtualFreePathCount
        },
        candidate2_penaltyWeight: {
          label: "후보 2 (가상 ID 페널티 가중치 부여 — 정식 멜론 ID 우선 경유)",
          P: Number(compCand2.P_withReplacement.toFixed(6)),
          giantCoveragePercent: Number(compCand2.giantCoveragePercent.toFixed(2)),
          giantSongCount: compCand2.giantSongCount,
          meanTurns: Number(turnsCand2.meanTurns.toFixed(3)),
          dailySeedsReachable: seedEvalCand2.reachableCount,
          dailySeedsExactTurnMatch: seedEvalCand2.exactTurnMatchCount,
          dailySeedsVirtualFreePath: seedEvalCand2.virtualFreePathCount
        },
        candidate3_eraGenreSplit: {
          label: `후보 3 (name_* 연도·장르 클러스터 분리: ${splitVirtualNodeCount}개 노드 -> ${createdSubNodesCount}개 서브노드 분할)`,
          P: Number(compCand3.P_withReplacement.toFixed(6)),
          giantCoveragePercent: Number(compCand3.giantCoveragePercent.toFixed(2)),
          giantSongCount: compCand3.giantSongCount,
          meanTurns: Number(turnsCand3.meanTurns.toFixed(3)),
          dailySeedsReachable: seedEvalCand3.reachableCount,
          dailySeedsExactTurnMatch: seedEvalCand3.exactTurnMatchCount,
          dailySeedsVirtualFreePath: seedEvalCand3.virtualFreePathCount
        }
      }
    }
  };

  const outJsonPath = path.join(outDir, "connectivity_and_entity_audit.json");
  fs.writeFileSync(outJsonPath, JSON.stringify(summaryReport, null, 2), "utf-8");
  console.log(`\n[DONE] Audit report saved to: ${outJsonPath}`);
}

main().catch((err) => {
  console.error("[connectivity_audit] Fatal error:", err);
  process.exit(1);
});

