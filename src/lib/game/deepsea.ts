import { getGraphEngine } from "../graph/engine";
import { ConnectedSong, DeepSeaCondition, DeepSeaMission, getMelonSongUrl, SongInfo } from "../graph/types";

export type { DeepSeaCondition, DeepSeaMission };
export { getMelonSongUrl };

export interface DeepSeaValidationResult {
  isValid: boolean;
  requestedCondition: DeepSeaCondition;
  activeCondition: DeepSeaCondition;
  fallbackApplied: boolean;
  fallbackReason?: string;
  fromSong: SongInfo;
  toSong: SongInfo;
  melonUrl: string;
  sharedComposers?: string[];
}

export interface DeepSeaValidationResponse extends DeepSeaValidationResult {
  nextMission: DeepSeaMission;
}

/**
 * 특정 곡에 참여한 작곡가(role code 4) person_id 목록 반환
 */
export function getSongComposers(songId: string): string[] {
  const engine = getGraphEngine();
  const store = engine.getStore();
  const edges = store.songEdges.get(songId);
  if (!edges) return [];

  return edges.filter(([, roles]) => roles.includes(4)).map(([personId]) => personId);
}

/**
 * 2-hop 도달 가능 후보 곡을 사전 스캔하여 실제 정답 곡이 존재하는 조건만 안전 발급하는 미션 생성기
 * - 이미 방문한 곡(excludeSongIds)은 2-hop 정답 풀에서 제외하여 무한 왕복 어뷰징 방지
 * - 정답이 0개인 함정 미션 원천 차단 (전부 0개일 경우 any_song 보너스 자동 대체)
 */
export function issueDeepSeaMission(
  songId: string,
  excludeSongIds: string[] = []
): DeepSeaMission {
  const engine = getGraphEngine();
  const store = engine.getStore();
  const fromSong = engine.getSong(songId);

  if (!fromSong) {
    throw new Error(`[issueDeepSeaMission] Song not found: ${songId}`);
  }

  const excludeSet = new Set<string>([songId, ...excludeSongIds]);

  // 1. 현재 곡에서 1-hop 연결된 인물들
  const connectedPersons = engine.getConnectedPersons(songId);

  // 2. 2-hop 도달 가능한 모든 곡 수집 (songId -> { song, bridgePersonIds })
  const twoHopSongMap = new Map<string, { song: ConnectedSong; bridgePersonIds: Set<string> }>();

  for (const person of connectedPersons) {
    const pSongs = engine.getConnectedSongs(person.id, { includeGroupHops: true });
    for (const song of pSongs) {
      if (excludeSet.has(song.id)) continue;

      let entry = twoHopSongMap.get(song.id);
      if (!entry) {
        entry = { song, bridgePersonIds: new Set<string>() };
        twoHopSongMap.set(song.id, entry);
      }
      entry.bridgePersonIds.add(person.id);
    }
  }

  const twoHopSongs = Array.from(twoHopSongMap.values());

  // 3. 3대 조건별 정답 후보 풀 평가
  const fromComposers = getSongComposers(songId);
  const fromAgency = fromSong.agency ? fromSong.agency.trim() : "";
  const hasValidAgency = fromAgency && fromAgency !== "미분류" && fromAgency !== "무소속";

  // (A) same_year 평가
  const yearCandidates: { songId: string; bridgePersonIds: Set<string> }[] = [];
  // (B) same_agency 평가
  const agencyCandidates: { songId: string; bridgePersonIds: Set<string> }[] = [];
  // (C) same_composer 평가
  const composerCandidates: { songId: string; bridgePersonIds: Set<string> }[] = [];

  for (const item of twoHopSongs) {
    // 1) same_year
    if (item.song.year === fromSong.year) {
      yearCandidates.push({ songId: item.song.id, bridgePersonIds: item.bridgePersonIds });
    }

    // 2) same_agency
    if (hasValidAgency && item.song.agency.trim() === fromAgency) {
      agencyCandidates.push({ songId: item.song.id, bridgePersonIds: item.bridgePersonIds });
    }

    // 3) same_composer
    if (fromComposers.length > 0) {
      const candComposers = getSongComposers(item.song.id);
      if (fromComposers.some((cId) => candComposers.includes(cId))) {
        composerCandidates.push({ songId: item.song.id, bridgePersonIds: item.bridgePersonIds });
      }
    }
  }

  // 4. 유효 정답이 1개 이상 있는 조건 풀 구성
  interface ConditionCandidate {
    condition: DeepSeaCondition;
    criteriaText: string;
    items: { songId: string; bridgePersonIds: Set<string> }[];
  }

  const eligibleConditions: ConditionCandidate[] = [];

  if (yearCandidates.length > 0) {
    eligibleConditions.push({
      condition: "same_year",
      criteriaText: `${fromSong.year}년 발매곡`,
      items: yearCandidates
    });
  }

  if (agencyCandidates.length > 0) {
    eligibleConditions.push({
      condition: "same_agency",
      criteriaText: `소속사: ${fromAgency}`,
      items: agencyCandidates
    });
  }

  if (composerCandidates.length > 0) {
    const compNames = fromComposers
      .map((cId) => store.getPerson(cId)?.name)
      .filter((n): n is string => Boolean(n));
    const label = compNames.length > 0 ? `작곡: ${compNames[0]}${compNames.length > 1 ? " 외" : ""}` : "동일 작곡가";

    eligibleConditions.push({
      condition: "same_composer",
      criteriaText: `${label} 참여곡`,
      items: composerCandidates
    });
  }

  // 5. 조건 선별 (정답이 있는 조건 중 무작위 선택, 전무할 경우 any_song 자동 대체)
  if (eligibleConditions.length > 0) {
    const selected = eligibleConditions[Math.floor(Math.random() * eligibleConditions.length)];
    const validTargetSongIds = selected.items.map((i) => i.songId);
    const bridgeSet = new Set<string>();
    for (const i of selected.items) {
      for (const pId of i.bridgePersonIds) {
        bridgeSet.add(pId);
      }
    }

    return {
      songId,
      condition: selected.condition,
      targetCriteriaText: selected.criteriaText,
      validBridgePersonIds: Array.from(bridgeSet),
      validTargetSongIds,
      validCount: validTargetSongIds.length
    };
  }

  // (구제 방어) 3개 조건 모두 정답이 0개인 고립/희귀 곡 ➔ any_song 자유 점프 보너스 발급
  const allTargetSongIds = twoHopSongs.map((i) => i.song.id);
  const allBridgeSet = new Set<string>();
  for (const i of twoHopSongs) {
    for (const pId of i.bridgePersonIds) {
      allBridgeSet.add(pId);
    }
  }

  return {
    songId,
    condition: "any_song",
    targetCriteriaText: "자유 다이빙 (아무 곡이나 이동 가능)",
    validBridgePersonIds: Array.from(allBridgeSet),
    validTargetSongIds: allTargetSongIds,
    validCount: allTargetSongIds.length
  };
}

/**
 * 심해 디깅 모드(Endless Survival)의 턴 이동 조건 판정 및 2중 예외 방어
 */
export function validateDeepSeaStep(
  fromSongId: string,
  toSongId: string,
  condition: DeepSeaCondition
): DeepSeaValidationResult {
  const engine = getGraphEngine();
  const fromSong = engine.getSong(fromSongId);
  const toSong = engine.getSong(toSongId);

  if (!fromSong || !toSong) {
    throw new Error(`[validateDeepSeaStep] Invalid song IDs: from=${fromSongId}, to=${toSongId}`);
  }

  // any_song 자유 다이빙은 무조건 성공
  if (condition === "any_song") {
    return {
      isValid: true,
      requestedCondition: condition,
      activeCondition: condition,
      fallbackApplied: false,
      fromSong,
      toSong,
      melonUrl: getMelonSongUrl(toSongId)
    };
  }

  let activeCondition = condition;
  let fallbackApplied = false;
  let fallbackReason: string | undefined;

  // 1. 소속사 예외 방어: '미분류' 또는 '무소속'이면 same_year로 자동 대체
  if (condition === "same_agency") {
    const rawAgency = fromSong.agency.trim();
    if (!rawAgency || rawAgency === "미분류" || rawAgency === "무소속") {
      activeCondition = "same_year";
      fallbackApplied = true;
      fallbackReason = `출발 곡의 소속사가 '${rawAgency}'이므로 같은 발매연도(same_year) 미션으로 자동 대체되었습니다.`;
    }
  }

  // 2. 작곡가 예외 방어: 등록 작곡가가 0명이면 same_year로 자동 대체
  if (condition === "same_composer") {
    const fromComposers = getSongComposers(fromSongId);
    if (fromComposers.length === 0) {
      activeCondition = "same_year";
      fallbackApplied = true;
      fallbackReason = "출발 곡에 등록된 작곡가가 없어 같은 발매연도(same_year) 미션으로 자동 대체되었습니다.";
    }
  }

  let isValid = false;
  let sharedComposers: string[] | undefined;

  // 3. 최종 조건 판정
  switch (activeCondition) {
    case "same_year": {
      isValid = fromSong.year === toSong.year;
      break;
    }
    case "same_agency": {
      isValid = fromSong.agency.trim() === toSong.agency.trim();
      break;
    }
    case "same_composer": {
      const fromComposers = getSongComposers(fromSongId);
      const toComposers = getSongComposers(toSongId);
      const common = fromComposers.filter((c) => toComposers.includes(c));
      isValid = common.length > 0;
      if (isValid) {
        const store = engine.getStore();
        sharedComposers = common.map((cId) => store.getPerson(cId)?.name || cId);
      }
      break;
    }
  }

  return {
    isValid,
    requestedCondition: condition,
    activeCondition,
    fallbackApplied,
    fallbackReason,
    fromSong,
    toSong,
    melonUrl: getMelonSongUrl(toSongId),
    sharedComposers
  };
}
