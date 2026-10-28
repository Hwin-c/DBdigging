/**
 * 디비디깅 (DBDIGGING) — 불변 그래프 도메인 스키마 및 타입 명세 (GEMINI.md 규약)
 */

export type RoleCode = 1 | 2 | 3 | 4 | 5 | 6;

export const ROLE_LABELS: Record<RoleCode, string> = {
  1: "가창",
  2: "피처링",
  3: "작사",
  4: "작곡",
  5: "편곡",
  6: "그룹소속"
};

/**
 * songs_schema: ["title", "artist", "agency", "year", "genre", "likes", "is_title", "in_giant"]
 */
export type RawSongTuple = [
  title: string,
  artist: string,
  agency: string,
  year: string,
  genre: string,
  likes: number,
  is_title: 0 | 1,
  in_giant: 0 | 1
];

/**
 * persons schema: [name, is_group]
 */
export type RawPersonTuple = [
  name: string,
  is_group: 0 | 1
];

/**
 * song_edges element: [person_id, [role_codes]]
 */
export type RawSongEdge = [string, RoleCode[]];

/**
 * group_edges element: [member_person_id, group_person_id]
 */
export type RawGroupEdge = [string, string];

/**
 * firebase_graph_bundle.json 전체 구조
 */
export interface RawGraphBundle {
  version: string;
  included_groups: string[];
  role_codes: Record<string, string>;
  songs_schema: string[];
  songs: Record<string, RawSongTuple>;
  persons: Record<string, RawPersonTuple>;
  song_edges: Record<string, RawSongEdge[]>;
  group_edges: RawGroupEdge[];
}

/**
 * firebase_daily_quests_seed.json 원소 구조
 */
export interface DailyQuestSeed {
  quest_id: string; // YYYY-MM-DD
  start_song_id: string;
  start_display: string;
  target_song_id: string;
  target_display: string;
  optimal_turns: number;
  optimal_path: string[];
}

/**
 * 앱 내부에서 사용하는 정제된 곡 정보 모델
 */
export interface SongInfo {
  id: string;
  title: string;
  artist: string;
  display: string; // `${title} - ${artist}`
  agency: string;
  year: string;
  genre: string;
  likes: number;
  isTitle: boolean;
  inGiant: boolean;
}

/**
 * 앱 내부에서 사용하는 정제된 인물/그룹 모델
 */
export interface PersonInfo {
  id: string;
  name: string;
  isGroup: boolean;
}

/**
 * 현재 곡과 연결된 인물 정보 (역할 배지 포함)
 */
export interface ConnectedPerson extends PersonInfo {
  roles: RoleCode[];
  roleLabels: string[];
  movableSongCount?: number; // 심해 모드 및 탐색에서 이동 가능한 유효 곡 수
  // 멤버인 경우 소속 그룹 목록, 그룹인 경우 소속 멤버 목록
  affiliatedGroups?: PersonInfo[];
  affiliatedMembers?: PersonInfo[];
}

/**
 * 특정 인물/그룹과 연결되어 유저가 다음으로 선택할 수 있는 곡 정보
 */
export interface ConnectedSong extends SongInfo {
  roles: RoleCode[];
  roleLabels: string[];
  isViaGroupHop?: boolean; // 1-hop 그룹/멤버 관계를 통해 점프 연결된 곡 여부
  hopSourcePersonId?: string; // 징검다리가 된 원본 인물/그룹 ID
  hopSourcePersonName?: string;
}

/**
 * 최단 경로 탐색 결과
 */
export interface ShortestPathResult {
  startSongId: string;
  targetSongId: string;
  path: string[]; // 노드 ID 시퀀스 (예: [song_id, person_id, song_id, ...])
  typedPath: string[]; // 접두사 보존 시퀀스 (예: ['s:song_id', 'p:person_id', ...])
  turns: number; // Math.floor((path.length - 1) / 2)
  found: boolean;
}

/**
 * 퀘스트 페이로드 모델
 */
export interface QuestPayload {
  questId: string;
  startSong: SongInfo;
  targetSong: SongInfo;
  optimalTurns: number;
  optimalPath: string[];
  isIsland?: boolean;
  allowedRoles?: RoleCode[];
  targetPerson?: {
    id: string;
    name: string;
    isGroup?: boolean;
  };
}

/**
 * 2-Mode 이종 네트워크 탐험 트리 노드 모델
 */
export type ExplorationNodeType = "song" | "person";

export interface ExplorationNode {
  nodeId: string;
  nodeType: ExplorationNodeType; // "song" | "person"
  songId?: string;
  song?: SongInfo;
  personId?: string;
  personName?: string;
  isGroup?: boolean;
  depth: number;
  parentNodeId?: string;
  viaRoleCodes?: RoleCode[];
  viaRoleLabels?: string[];
  roles?: RoleCode[];
  roleLabels?: string[];
  viaPerson?: {
    id: string;
    name: string;
    roles: RoleCode[];
    roleLabels: string[];
  };
  childrenNodeIds: string[];
  isCurrent: boolean;
  isPending?: boolean; // Step 1에서 선택된 임시 아티스트 캡슐 노드
  isStart?: boolean;
  isTarget?: boolean;
}

/**
 * 자유 연습 4-Layer 필터 옵션
 */
export interface PracticeFilterOptions {
  // Layer 1: 출발/도착 정밀 지정
  startMode?: "random" | "song" | "artist" | "creator";
  startId?: string;
  startName?: string;
  targetMode?: "random" | "song" | "artist" | "creator";
  targetId?: string;
  targetName?: string;
  // Layer 2: 노드 속성 필터
  genre?: string;
  decade?: string;
  agency?: string;
  titleOnly?: boolean;
  minLikes?: number;
  // Layer 3: 허용 크레딧 역할
  allowedRoles?: RoleCode[];
  // Layer 4: 목표 최단 턴 거리
  turnDistance?: "short" | "standard" | "long" | "any"; // 1~2, 3~4, 5~6, any
  inGiant?: boolean;
}

/**
 * 곡 및 인물 통합 검색 결과 아이템 모델
 */
export interface SearchResultItem {
  id: string;
  name: string;
  type: "song" | "person";
  display: string;
  details?: {
    artist?: string;
    year?: string;
    genre?: string;
    likes?: number;
    isGroup?: boolean;
    isTitle?: boolean;
  };
}

/**
 * 인게임 이동 히스토리 및 브레드크럼 스텝 모델
 */
export interface HistoryStep {
  song: SongInfo;
  viaPerson?: {
    id: string;
    name: string;
    roles: RoleCode[];
    roleLabels: string[];
  };
}

/**
 * 심해 디깅 모드 조건 및 미션 명세
 */
export type DeepSeaCondition = "same_year" | "same_agency" | "same_composer" | "any_song";

export interface DeepSeaMission {
  songId: string;
  condition: DeepSeaCondition;
  targetCriteriaText: string;
  validBridgePersonIds: string[];
  validTargetSongIds: string[];
  validCount: number;
}

/**
 * 멜론 곡 상세 딥링크 URL 생성기 (클라이언트/서버 공용 순수 함수)
 */
export function getMelonSongUrl(songId: string): string {
  return `https://www.melon.com/song/detail.htm?songId=${songId}`;
}


