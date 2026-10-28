/**
 * src/lib/game/clientApi.ts
 * 
 * <디비디깅 (DBDIGGING)> 순수 브라우저 인메모리 클라이언트 API 어댑터
 * - 기존 5대 REST API 라우트(/api/...)를 1:1 대체
 * - 네트워크 왕복 지연 없이 브라우저 RAM 엔진 직접 연산 (0 RTT, < 1ms 즉각 반응)
 * - 모든 호출 전 ensureGraphLoaded()를 통해 비동기 번들 초기화 선행 보장
 */

import { getGraphStoreAsync } from "../graph/loader";
import { getGraphEngine, GraphEngine } from "../graph/engine";
import { loadSeedsAsync, getDailyQuest as getDailyQuestInternal, getRandomQuest as getRandomQuestInternal } from "./quest";
import { searchSongsAndPersons, matchHardcoreAnswer, SearchResultItem, HardcoreMatchResult } from "./search";
import { issueDeepSeaMission, validateDeepSeaStep as validateDeepSeaStepInternal } from "./deepsea";
import {
  ConnectedPerson,
  ConnectedSong,
  DeepSeaCondition,
  DeepSeaMission,
  PersonInfo,
  QuestPayload,
  SongInfo
} from "../graph/types";

let initPromise: Promise<{ engine: GraphEngine }> | null = null;

/**
 * 브라우저 메모리에 그래프 번들과 시드 데이터가 100% 로드되었음을 보장
 */
export async function ensureGraphLoaded(): Promise<{ engine: GraphEngine }> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [store] = await Promise.all([
      getGraphStoreAsync(),
      loadSeedsAsync()
    ]);
    const engine = getGraphEngine(store);
    return { engine };
  })();

  return initPromise;
}

export interface InspectResult {
  type: "song" | "person";
  song?: SongInfo;
  person?: PersonInfo;
  connectedPersons?: ConnectedPerson[];
  connectedSongs?: ConnectedSong[];
  optimalNextId?: string | null;
  remainingTurns?: number | null;
}

export interface SearchApiResult {
  query: string;
  count: number;
  matches: SearchResultItem[];
  hardcoreMatch: HardcoreMatchResult | null;
}

export interface DeepSeaValidationResult {
  isValid: boolean;
  activeCondition: DeepSeaCondition;
  fallbackApplied: boolean;
  fallbackReason?: string;
  fromSong: SongInfo;
  toSong: SongInfo;
  melonUrl: string;
  sharedComposers?: string[];
  nextMission: DeepSeaMission;
}

export const clientApi = {
  /**
   * 데일리 퀘스트 조회
   */
  async getDailyQuest(dateStr?: string): Promise<QuestPayload> {
    await ensureGraphLoaded();
    return getDailyQuestInternal(dateStr);
  },

  /**
   * 자유 연습 모드 랜덤 퀘스트 생성
   */
  async getRandomQuest(options: { startSongId?: string; inGiant?: boolean } = {}): Promise<QuestPayload> {
    await ensureGraphLoaded();
    return getRandomQuestInternal(options);
  },

  /**
   * 곡 또는 인물 노드 탐색 & 힌트 Hoisting
   */
  async inspectGraph(options: {
    songId?: string;
    personId?: string;
    currentSongId?: string;
    targetSongId?: string;
    includeGroupHops?: boolean;
  }): Promise<InspectResult> {
    const { engine } = await ensureGraphLoaded();
    const { songId, personId, currentSongId, targetSongId, includeGroupHops = true } = options;

    // 1. 곡 기준 인물 목록 조회
    if (songId) {
      const song = engine.getSong(songId);
      if (!song) {
        throw new Error(`Song not found: ${songId}`);
      }

      const connectedPersons = [...engine.getConnectedPersons(songId)];
      let optimalNextId: string | null = null;
      let remainingTurns: number | null = null;

      // 힌트 모드 (targetSongId 전달 시 최적 노드 Hoisting)
      if (targetSongId) {
        const pathRes = engine.findShortestPath(songId, targetSongId);
        if (pathRes.found && pathRes.path.length >= 2) {
          optimalNextId = pathRes.path[1];
          remainingTurns = pathRes.turns;

          const matchIdx = connectedPersons.findIndex((p) => p.id === optimalNextId);
          if (matchIdx !== -1) {
            (connectedPersons[matchIdx] as any).isOptimalNext = true;
            if (matchIdx > 0) {
              const [opt] = connectedPersons.splice(matchIdx, 1);
              connectedPersons.unshift(opt);
            }
          }
        }
      }

      return {
        type: "song",
        song,
        connectedPersons,
        optimalNextId,
        remainingTurns
      };
    }

    // 2. 인물 기준 곡 목록 조회
    if (personId) {
      const person = engine.getPerson(personId);
      if (!person) {
        throw new Error(`Person not found: ${personId}`);
      }

      let connectedSongs = [...engine.getConnectedSongs(personId, { includeGroupHops })];

      // [버그 방지 1] 현재 위치 곡은 다음 곡 후보에서 완전히 제외
      if (currentSongId) {
        connectedSongs = connectedSongs.filter((s) => s.id !== currentSongId);
      }

      const connectedSongIdSet = new Set(connectedSongs.map((s) => s.id));
      let optimalNextId: string | null = null;
      let remainingTurns: number | null = null;

      // 힌트 모드 (targetSongId 전달 시 최적 곡 Hoisting)
      if (targetSongId) {
        const directTargetIdx = connectedSongs.findIndex((s) => s.id === targetSongId);
        if (directTargetIdx !== -1) {
          // 목표 곡이 바로 참여곡에 존재하는 경우
          optimalNextId = targetSongId;
          remainingTurns = 1;
        } else {
          // 경우 A: 만약 currentSongId 기준 최단 경로 상 첫 인물이 선택된 personId와 일치하는 경우
          let foundViaShortestPath = false;
          if (currentSongId) {
            const spRes = engine.findShortestPath(currentSongId, targetSongId);
            if (spRes.found && spRes.path.length >= 3 && spRes.path[1] === personId) {
              // 1-hop 그룹 징검다리 대응: path.slice(2)에서 connectedSongIdSet에 속한 첫 번째 곡 찾기
              const nextValidSongId = spRes.path.slice(2).find((id) => connectedSongIdSet.has(id));
              if (nextValidSongId) {
                optimalNextId = nextValidSongId;
                remainingTurns = spRes.turns;
                foundViaShortestPath = true;
              }
            }
          }

          // 경우 B: 다른 인물을 골랐거나 최단 경로와 다른 브랜치인 경우
          // 개별 루프 대신 engine.findClosestCandidateSong 단일 역방향 BFS 실행 (브라우저 프리징 0%)
          if (!foundViaShortestPath) {
            const closest = engine.findClosestCandidateSong(connectedSongIdSet, targetSongId);
            if (closest) {
              optimalNextId = closest.songId;
              remainingTurns = closest.turns + 1;
            }
          }
        }

        // 최적 다음 곡 Index 0으로 Hoisting
        if (optimalNextId) {
          const matchIdx = connectedSongs.findIndex((s) => s.id === optimalNextId);
          if (matchIdx !== -1) {
            (connectedSongs[matchIdx] as any).isOptimalNext = true;
            if (matchIdx > 0) {
              const [opt] = connectedSongs.splice(matchIdx, 1);
              connectedSongs.unshift(opt);
            }
          }
        }
      }

      return {
        type: "person",
        person,
        connectedSongs,
        optimalNextId,
        remainingTurns
      };
    }

    throw new Error("Must provide either songId or personId to inspectGraph");
  },

  /**
   * 통합 검색 및 하드코어 Tier 매칭
   */
  async search(
    query: string,
    options: {
      currentNodeId?: string;
      targetType?: "song" | "person" | "all";
      limit?: number;
    } = {}
  ): Promise<SearchApiResult> {
    await ensureGraphLoaded();
    const { currentNodeId, targetType = "all", limit = 20 } = options;

    const matches = query.trim() ? searchSongsAndPersons(query, { type: targetType, limit }) : [];

    let hardcoreMatch: HardcoreMatchResult | null = null;
    if (currentNodeId && query.trim()) {
      const modeType = targetType === "all" ? "person" : targetType;
      hardcoreMatch = matchHardcoreAnswer(currentNodeId, query, modeType);
    }

    return {
      query,
      count: matches.length,
      matches,
      hardcoreMatch
    };
  },

  /**
   * 심해 디깅 미션 발급 (2-hop 사전 스캔)
   */
  async getDeepSeaMission(songId: string, excludeSongIds: string[] = []): Promise<{ mission: DeepSeaMission }> {
    await ensureGraphLoaded();
    const mission = issueDeepSeaMission(songId, excludeSongIds);
    return { mission };
  },

  /**
   * 심해 디깅 스텝 검증 및 다음 미션 원자적 동시 발급
   */
  async validateDeepSeaStep(
    fromSongId: string,
    toSongId: string,
    condition: DeepSeaCondition,
    excludeSongIds: string[] = []
  ): Promise<DeepSeaValidationResult> {
    await ensureGraphLoaded();
    const result = validateDeepSeaStepInternal(fromSongId, toSongId, condition);
    const nextMission = issueDeepSeaMission(toSongId, excludeSongIds);

    return {
      ...result,
      nextMission
    };
  }
};
