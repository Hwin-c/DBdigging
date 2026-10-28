/**
 * src/lib/storage/stats.ts
 * 
 * <디비디깅 (DBDIGGING)> 무로그인 LocalStorage 전적/스트릭 시스템
 * - 모드 1 (오늘의 디깅): 도전/클리어 분리, 연속 스트릭, 턴 분포 히스토그램, 자유 연습 모드 격리
 * - 모드 2 (심해 디깅): 최고 수심, 최고 다이버 칭호, 멜론 플레이리스트, 최근 5회 기록 큐
 * - 백업/복원: UTF-8(한글) 안전 Base64 인코딩 및 FNV-1a 정규화 체크섬 무결성 검증
 * - SSR 및 Node.js 테스트 환경 호환: In-Memory Storage 폴백 내장
 */

export interface DailyModeStats {
  played: number;                // 총 정규 데일리 도전 횟수 (1일 1회만 카운트)
  cleared: number;               // 총 정규 데일리 클리어 성공 횟수 (1일 1회만 카운트)
  winRate: number;               // 승률 (0 ~ 100 %, Math.round((cleared / played) * 100))
  currentStreak: number;         // 현재 연속 스트릭 (일 단위)
  maxStreak: number;             // 역대 최대 연속 스트릭
  lastAttemptedQuestId?: string; // 마지막 도전 데일리 퀘스트 ID ("YYYY-MM-DD")
  lastClearedQuestId?: string;   // 마지막 클리어 데일리 퀘스트 ID ("YYYY-MM-DD")
  practiceCleared: number;       // [보완 1] 자유 연습 모드 총 클리어 횟수 (스트릭과 완전 격리!)
  turnDistribution: {            // 정규 데일리 퀘스트 턴 수 분포 히스토그램
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;                   // 5턴 이상
  };
}

export interface DeepSeaDiveRecord {
  depth: number;                 // 도달 수심 (m)
  diverTitle: string;            // 다이버 칭호 ("🫧 스노클링", "🤿 스쿠버", "🌊 심해 탐험가", "🔱 마리아나 마스터")
  date: string;                  // 달성 일자 ("YYYY-MM-DD HH:mm")
  playlist: {
    id: string;
    title: string;
    artist: string;
    year: string;
    melonUrl: string;
  }[];
}

export interface DeepSeaModeStats {
  totalDives: number;            // 총 다이빙 횟수
  maxDepth: number;              // 역대 최고 도달 수심 (m)
  bestDiverTitle: string;        // 최고 다이버 칭호
  bestRecord?: DeepSeaDiveRecord;// 최고 수심 다이빙 기록 및 멜론 플레이리스트
  recentRecords: DeepSeaDiveRecord[]; // 최근 5회 다이빙 기록 목록
}

export interface UserStatsPayload {
  version: number;               // 스키마 버전 (1)
  updatedAt: string;             // 마지막 업데이트 ISO 타임스탬프
  daily: DailyModeStats;
  deepSea: DeepSeaModeStats;
}

export interface BackupPackage {
  magic: "DBDIGGING_BACKUP";
  version: 1;
  createdAt: string;
  data: UserStatsPayload;
  checksum: string;
}

const STORAGE_KEY = "dbdigging_user_stats";

// ----------------------------------------------------------------------------
// SSR 및 Node.js 테스트 환경을 위한 In-Memory Storage 폴백
// ----------------------------------------------------------------------------
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();

function getStorage(): Storage | MemoryStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage;
}

// ----------------------------------------------------------------------------
// 기본 전적 스키마 초기화
// ----------------------------------------------------------------------------
export function getDefaultStats(): UserStatsPayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    daily: {
      played: 0,
      cleared: 0,
      winRate: 0,
      currentStreak: 0,
      maxStreak: 0,
      practiceCleared: 0,
      turnDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    },
    deepSea: {
      totalDives: 0,
      maxDepth: 0,
      bestDiverTitle: "🫧 스노클링",
      recentRecords: []
    }
  };
}

// ----------------------------------------------------------------------------
// LocalStorage I/O
// ----------------------------------------------------------------------------
export function getUserStats(): UserStatsPayload {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    const parsed = JSON.parse(raw);
    const defaults = getDefaultStats();

    return {
      version: parsed.version || defaults.version,
      updatedAt: parsed.updatedAt || defaults.updatedAt,
      daily: {
        ...defaults.daily,
        ...(parsed.daily || {}),
        turnDistribution: {
          ...defaults.daily.turnDistribution,
          ...(parsed.daily?.turnDistribution || {})
        }
      },
      deepSea: {
        ...defaults.deepSea,
        ...(parsed.deepSea || {}),
        recentRecords: Array.isArray(parsed.deepSea?.recentRecords)
          ? parsed.deepSea.recentRecords
          : []
      }
    };
  } catch (err) {
    console.error("[getUserStats] Failed to parse stats from storage:", err);
    return getDefaultStats();
  }
}

export function saveUserStats(stats: UserStatsPayload): void {
  try {
    stats.updatedAt = new Date().toISOString();
    getStorage().setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (err) {
    console.error("[saveUserStats] Failed to save stats to storage:", err);
  }
}

export function resetUserStats(): UserStatsPayload {
  const defaults = getDefaultStats();
  saveUserStats(defaults);
  return defaults;
}

// ----------------------------------------------------------------------------
// 모드 1 (오늘의 디깅): 도전 및 클리어 처리
// ----------------------------------------------------------------------------

/**
 * 데일리 모드 첫 턴 이동 시도 시 1회 카운트
 */
export function recordDailyAttempt(questId: string): UserStatsPayload {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(questId)) {
    return getUserStats();
  }

  const stats = getUserStats();

  if (stats.daily.lastAttemptedQuestId !== questId) {
    stats.daily.played += 1;
    stats.daily.lastAttemptedQuestId = questId;
    stats.daily.winRate =
      stats.daily.played > 0
        ? Math.round((stats.daily.cleared / stats.daily.played) * 100)
        : 0;
    saveUserStats(stats);
  }

  return stats;
}

/**
 * 데일리 모드 클리어 성공 시 카운트 (중복 클리어 방어 및 연속 스트릭 갱신)
 */
export function recordDailyClear(questId: string, turns: number): UserStatsPayload {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(questId)) {
    return getUserStats();
  }

  const stats = getUserStats();

  // 동일 퀘스트 중복 클리어 시 스트릭 및 클리어 수 중복 가산 방어
  if (stats.daily.lastClearedQuestId === questId) {
    return stats;
  }

  // 첫 턴 기록이 누락된 예외 케이스 보정
  if (stats.daily.lastAttemptedQuestId !== questId) {
    stats.daily.played += 1;
    stats.daily.lastAttemptedQuestId = questId;
  }

  stats.daily.cleared += 1;

  // 타임존 오차 없는 UTC 기준 일자 차이 계산
  if (stats.daily.lastClearedQuestId) {
    const prevUtc = Date.parse(stats.daily.lastClearedQuestId + "T00:00:00Z");
    const currUtc = Date.parse(questId + "T00:00:00Z");
    const diffDays = Math.round((currUtc - prevUtc) / 86400000);

    if (diffDays === 1) {
      stats.daily.currentStreak += 1;
    } else if (diffDays > 1) {
      stats.daily.currentStreak = 1;
    }
  } else {
    stats.daily.currentStreak = 1;
  }

  stats.daily.maxStreak = Math.max(stats.daily.maxStreak, stats.daily.currentStreak);
  stats.daily.lastClearedQuestId = questId;

  // 턴 수 분포 히스토그램 갱신 (1 ~ 5+턴)
  const bucket = Math.min(Math.max(turns, 1), 5) as 1 | 2 | 3 | 4 | 5;
  stats.daily.turnDistribution[bucket] = (stats.daily.turnDistribution[bucket] || 0) + 1;

  // 승률 재계산
  stats.daily.winRate =
    stats.daily.played > 0
      ? Math.round((stats.daily.cleared / stats.daily.played) * 100)
      : 0;

  saveUserStats(stats);
  return stats;
}

/**
 * [보완 1] 자유 연습 모드 클리어 카운트 (데일리 스트릭 완전 격리)
 */
export function recordPracticeClear(): UserStatsPayload {
  const stats = getUserStats();
  stats.daily.practiceCleared = (stats.daily.practiceCleared || 0) + 1;
  saveUserStats(stats);
  return stats;
}

// ----------------------------------------------------------------------------
// 모드 2 (심해 디깅): 다이빙 기록 저장
// ----------------------------------------------------------------------------
export function recordDeepSeaDive(
  depth: number,
  diverTitle: string,
  playlist: Array<{ id: string; title: string; artist: string; year: string; melonUrl: string }>
): UserStatsPayload {
  const stats = getUserStats();

  stats.deepSea.totalDives += 1;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const newRecord: DeepSeaDiveRecord = {
    depth,
    diverTitle,
    date: dateStr,
    playlist: playlist || []
  };

  if (depth >= stats.deepSea.maxDepth) {
    stats.deepSea.maxDepth = depth;
    stats.deepSea.bestDiverTitle = diverTitle;
    stats.deepSea.bestRecord = newRecord;
  }

  stats.deepSea.recentRecords = [newRecord, ...(stats.deepSea.recentRecords || [])].slice(0, 5);

  saveUserStats(stats);
  return stats;
}

// ----------------------------------------------------------------------------
// UTF-8(한글) 안전 Base64 인코더/디코더 & FNV-1a 체크섬
// ----------------------------------------------------------------------------

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * undefined 제거 및 표준 정규화 JSON 직렬화 후 FNV-1a 해시 생성
 */
export function computeStatsChecksum(data: UserStatsPayload): string {
  const normalizedJson = JSON.stringify(JSON.parse(JSON.stringify(data)));
  const salt = "DBDIGGING_V1_SALT";
  let hash = 0x811c9dc5;
  const target = salt + ":" + normalizedJson;
  for (let i = 0; i < target.length; i++) {
    hash ^= target.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 전적 백업 코드 생성 ("DBD-" + Base64)
 */
export function exportBackupCode(stats?: UserStatsPayload): string {
  const currentStats = stats ?? getUserStats();
  const normalized = JSON.parse(JSON.stringify(currentStats));
  const checksum = computeStatsChecksum(normalized);
  const pkg: BackupPackage = {
    magic: "DBDIGGING_BACKUP",
    version: 1,
    createdAt: new Date().toISOString(),
    data: normalized,
    checksum
  };
  return "DBD-" + utf8ToBase64(JSON.stringify(pkg));
}

/**
 * 전적 백업 코드 검증 및 복원
 */
export function importBackupCode(backupCode: string): {
  success: boolean;
  stats?: UserStatsPayload;
  error?: string;
} {
  try {
    const trimmed = backupCode.trim();
    if (!trimmed.startsWith("DBD-")) {
      return { success: false, error: "올바른 디비디깅 백업 코드가 아닙니다. (DBD- 접두사 누락)" };
    }

    const rawBase64 = trimmed.slice(4);
    let jsonStr: string;
    try {
      jsonStr = base64ToUtf8(rawBase64);
    } catch {
      return { success: false, error: "Base64 디코딩에 실패했습니다. 코드가 손상되었습니다." };
    }

    const pkg = JSON.parse(jsonStr) as BackupPackage;
    if (pkg.magic !== "DBDIGGING_BACKUP" || pkg.version !== 1 || !pkg.data) {
      return { success: false, error: "지원되지 않는 백업 패키지 포맷입니다." };
    }

    const expectedChecksum = computeStatsChecksum(pkg.data);
    if (pkg.checksum !== expectedChecksum) {
      return {
        success: false,
        error: "백업 코드의 무결성 체크섬이 일치하지 않습니다. (데이터 변조 감지)"
      };
    }

    // 필수 스키마 필드 무결성 확인
    if (
      typeof pkg.data.daily?.played !== "number" ||
      typeof pkg.data.daily?.cleared !== "number" ||
      typeof pkg.data.deepSea?.totalDives !== "number"
    ) {
      return { success: false, error: "유효하지 않은 전적 데이터 스키마입니다." };
    }

    saveUserStats(pkg.data);
    return { success: true, stats: pkg.data };
  } catch (err: any) {
    return { success: false, error: `백업 코드 처리 중 오류 발생: ${err.message}` };
  }
}
