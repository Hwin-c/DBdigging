import { getGraphEngine } from "../graph/engine";
import { ConnectedPerson, ConnectedSong, PersonInfo, SearchResultItem, SongInfo } from "../graph/types";

export type { SearchResultItem };

/**
 * 한글, 영문, 숫자를 모두 보존하는 유니코드 정규화 함수
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

/**
 * 괄호 병기된 노드명 또는 다중 괄호가 포함된 명칭에서
 * [전체명, 괄호 앞 본명, 괄호 안 별칭] 등 유효한 별칭 후보군을 모두 분해 추출
 */
export function extractNameVariants(rawName: string): string[] {
  if (!rawName) return [];
  const variants = new Set<string>();
  const trimmed = rawName.trim();
  variants.add(trimmed);

  // 1. 괄호·대괄호 구분자로 분해
  const tokens = trimmed.split(/[()\[\]]/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (token === "그룹" || token === "가수" || token === "멤버") continue;
    variants.add(token);
  }

  // 2. 괄호 앞의 메인 명칭 (예: "서은광 (비투비)" -> "서은광", "NMIXX (그룹)" -> "NMIXX")
  const mainPrefixMatch = trimmed.match(/^(.+?)\s*[(\[]/);
  if (mainPrefixMatch) {
    const prefix = mainPrefixMatch[1].trim();
    if (prefix) variants.add(prefix);
  }

  return Array.from(variants);
}

/**
 * 목표 곡 도달 여부 판정 헬퍼 (동일 곡 다른 앨범 버전 및 ID 불일치 구제)
 * - songId 완전 일치 시 즉시 true
 * - 제목 유니코드 정규화 일치 && 아티스트 정규화 또는 괄호 별칭 교차 일치 판정
 */
export function isMatchingTargetSong(
  song: { id: string; title: string; artist: string },
  target?: { id: string; title: string; artist: string } | null
): boolean {
  if (!song || !target) return false;
  if (song.id === target.id) return true;

  const normTitleA = normalizeString(song.title);
  const normTitleB = normalizeString(target.title);
  if (!normTitleA || normTitleA !== normTitleB) return false;

  const normArtistA = normalizeString(song.artist);
  const normArtistB = normalizeString(target.artist);
  if (normArtistA && normArtistA === normArtistB) return true;

  // 괄호 별칭 교차 검사 (예: "엔하이픈 (ENHYPEN)" vs "ENHYPEN" vs "엔하이픈")
  const variantsA = extractNameVariants(song.artist).map(normalizeString).filter(Boolean);
  const variantsB = extractNameVariants(target.artist).map(normalizeString).filter(Boolean);
  return variantsA.some((va) => variantsB.includes(va));
}

/**
 * 자유 모드 및 연습 모드를 위한 곡/인물 통합 고속 검색
 */
export function searchSongsAndPersons(
  query: string,
  options: { type?: "song" | "person" | "all"; limit?: number } = {
    type: "all",
    limit: 20
  }
): SearchResultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { type = "all", limit = 20 } = options;
  const engine = getGraphEngine();
  const store = engine.getStore();
  const results: SearchResultItem[] = [];

  // 1. 인물/그룹 검색
  if (type === "person" || type === "all") {
    for (const [personId, personTuple] of store.persons.entries()) {
      const name = personTuple[0];
      if (name.toLowerCase().includes(q)) {
        results.push({
          id: personId,
          name,
          type: "person",
          display: personTuple[1] === 1 ? `${name} (그룹)` : name,
          details: {
            isGroup: personTuple[1] === 1
          }
        });
        if (results.length >= limit) return results;
      }
    }
  }

  // 2. 곡 검색
  if (type === "song" || type === "all") {
    const songMatches: SearchResultItem[] = [];
    for (const [songId, songTuple] of store.songs.entries()) {
      const title = songTuple[0];
      const artist = songTuple[1];

      if (title.toLowerCase().includes(q) || artist.toLowerCase().includes(q)) {
        songMatches.push({
          id: songId,
          name: title,
          type: "song",
          display: `${title} - ${artist}`,
          details: {
            artist,
            year: songTuple[3],
            genre: songTuple[4],
            likes: songTuple[5],
            isTitle: songTuple[6] === 1
          }
        });
        if (songMatches.length >= limit * 2) break;
      }
    }

    songMatches.sort((a, b) => (b.details?.likes || 0) - (a.details?.likes || 0));
    for (const sm of songMatches) {
      if (results.length >= limit) break;
      results.push(sm);
    }
  }

  return results;
}

export interface HardcoreMatchResult {
  isMatched: boolean;
  matchedNode: ConnectedPerson | ConnectedSong | null;
  matchedNodes: (ConnectedPerson | ConnectedSong)[];
  isAmbiguous: boolean; // matchedNodes.length > 1
  matchTier?: 1 | 2 | 3;
  matchedVariant?: string;
  matchedType?: "song" | "person";
}

/**
 * 인물 후보의 Tier별 매칭 검사
 * Tier 1: 괄호 제거 본명 또는 전체 원본명 정확 일치
 * Tier 3: 괄호 내부 별칭 일치
 */
function evaluatePersonMatch(person: ConnectedPerson, normInput: string): { tier: 1 | 3; variant: string } | null {
  const rawName = person.name.trim();

  // 1. 괄호 앞 본명 추출
  const mainPrefixMatch = rawName.match(/^(.+?)\s*[(\[]/);
  const baseName = mainPrefixMatch ? mainPrefixMatch[1].trim() : rawName;

  // Tier 1 검사: 본명 또는 전체 원본명 일치
  if (normalizeString(baseName) === normInput) {
    return { tier: 1, variant: baseName };
  }
  if (normalizeString(rawName) === normInput) {
    return { tier: 1, variant: rawName };
  }

  // Tier 3 검사: 괄호 내부 별칭 토큰 검사
  const tokens = rawName.split(/[()\[\]]/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (token === baseName || token === "그룹" || token === "가수" || token === "멤버") continue;
    if (normalizeString(token) === normInput) {
      return { tier: 3, variant: token };
    }
  }

  return null;
}

/**
 * 곡 후보의 Tier별 매칭 검사
 * Tier 1: 괄호 제거 원제목 또는 전체 원제목 정확 일치
 * Tier 2: title + artist 결합 문자열 일치 (동명이곡 구분 지원)
 * Tier 3: 괄호 내부 부제 일치
 */
function evaluateSongMatch(song: ConnectedSong, normInput: string): { tier: 1 | 2 | 3; variant: string } | null {
  const rawTitle = song.title.trim();
  const artist = song.artist.trim();

  // 1. 괄호 앞 메인 제목 및 메인 아티스트
  const mainTitleMatch = rawTitle.match(/^(.+?)\s*[(\[]/);
  const baseTitle = mainTitleMatch ? mainTitleMatch[1].trim() : rawTitle;

  const mainArtistMatch = artist.match(/^(.+?)\s*[(\[]/);
  const baseArtist = mainArtistMatch ? mainArtistMatch[1].trim() : artist;

  // Tier 1: 순수 제목 또는 전체 제목 일치
  if (normalizeString(baseTitle) === normInput) {
    return { tier: 1, variant: baseTitle };
  }
  if (normalizeString(rawTitle) === normInput) {
    return { tier: 1, variant: rawTitle };
  }

  // Tier 2: title + artist 결합 문자열 일치 ("하루 SG워너비", "봄을 꿈꾸다 서은광")
  const combos = [
    normalizeString(`${baseTitle}${baseArtist}`),
    normalizeString(`${baseTitle}${artist}`),
    normalizeString(`${rawTitle}${baseArtist}`),
    normalizeString(`${rawTitle}${artist}`),
    normalizeString(song.display)
  ];
  if (combos.includes(normInput)) {
    return { tier: 2, variant: `${baseTitle} - ${baseArtist}` };
  }

  // Tier 3: 괄호 내부 부제 토큰 검사
  const tokens = rawTitle.split(/[()\[\]]/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (token === baseTitle) continue;
    if (normalizeString(token) === normInput) {
      return { tier: 3, variant: token };
    }
  }

  return null;
}

/**
 * 하드코어 모드 주관식 타이핑 판정기 (우선순위 Tier & 동명이곡/동일그룹 복수 후보 완벽 지원)
 *
 * Tier 1: 괄호 제거 본명/원제목 또는 전체 원본명 일치
 * Tier 2: 곡의 경우 `title + artist` 결합 문자열 일치
 * Tier 3: 괄호 내부 별칭/부제 일치
 */
export function matchHardcoreAnswer(
  currentNodeId: string,
  typedText: string,
  targetType: "song" | "person" = "person"
): HardcoreMatchResult {
  const normInput = normalizeString(typedText);
  if (!normInput) {
    return { isMatched: false, matchedNode: null, matchedNodes: [], isAmbiguous: false };
  }

  const engine = getGraphEngine();
  const store = engine.getStore();

  // (A) 유저가 다음 인물/그룹을 입력한 경우 (targetType === "person" 우선)
  const shouldCheckPerson = targetType === "person" || (targetType !== "song" && store.songs.has(currentNodeId));
  if (shouldCheckPerson) {
    const connectedPersons = engine.getConnectedPersons(currentNodeId);

    const tier1Matches: { node: ConnectedPerson; variant: string }[] = [];
    const tier3Matches: { node: ConnectedPerson; variant: string }[] = [];

    for (const person of connectedPersons) {
      const match = evaluatePersonMatch(person, normInput);
      if (match) {
        if (match.tier === 1) tier1Matches.push({ node: person, variant: match.variant });
        else if (match.tier === 3) tier3Matches.push({ node: person, variant: match.variant });
      }
    }

    // Tier 1 우선 채택, 없을 경우 Tier 3 채택
    if (tier1Matches.length > 0) {
      const matchedNodes = tier1Matches.map((m) => m.node);
      return {
        isMatched: true,
        matchedNode: matchedNodes[0],
        matchedNodes,
        isAmbiguous: matchedNodes.length > 1,
        matchTier: 1,
        matchedVariant: tier1Matches[0].variant,
        matchedType: "person"
      };
    }

    if (tier3Matches.length > 0) {
      const matchedNodes = tier3Matches.map((m) => m.node);
      return {
        isMatched: true,
        matchedNode: matchedNodes[0],
        matchedNodes,
        isAmbiguous: matchedNodes.length > 1,
        matchTier: 3,
        matchedVariant: tier3Matches[0].variant,
        matchedType: "person"
      };
    }
  }

  // (B) 유저가 다음 곡을 입력한 경우 (targetType === "song" 우선)
  const shouldCheckSong = targetType === "song" || (targetType !== "person" && store.persons.has(currentNodeId));
  if (shouldCheckSong) {
    const connectedSongs = engine.getConnectedSongs(currentNodeId, { includeGroupHops: true });

    const tier1Matches: { node: ConnectedSong; variant: string }[] = [];
    const tier2Matches: { node: ConnectedSong; variant: string }[] = [];
    const tier3Matches: { node: ConnectedSong; variant: string }[] = [];

    for (const song of connectedSongs) {
      const match = evaluateSongMatch(song, normInput);
      if (match) {
        if (match.tier === 1) tier1Matches.push({ node: song, variant: match.variant });
        else if (match.tier === 2) tier2Matches.push({ node: song, variant: match.variant });
        else if (match.tier === 3) tier3Matches.push({ node: song, variant: match.variant });
      }
    }

    // Tier 1 > Tier 2 > Tier 3 우선순위 적용
    if (tier1Matches.length > 0) {
      const matchedNodes = tier1Matches.map((m) => m.node);
      return {
        isMatched: true,
        matchedNode: matchedNodes[0],
        matchedNodes,
        isAmbiguous: matchedNodes.length > 1,
        matchTier: 1,
        matchedVariant: tier1Matches[0].variant,
        matchedType: "song"
      };
    }

    if (tier2Matches.length > 0) {
      const matchedNodes = tier2Matches.map((m) => m.node);
      return {
        isMatched: true,
        matchedNode: matchedNodes[0],
        matchedNodes,
        isAmbiguous: matchedNodes.length > 1,
        matchTier: 2,
        matchedVariant: tier2Matches[0].variant,
        matchedType: "song"
      };
    }

    if (tier3Matches.length > 0) {
      const matchedNodes = tier3Matches.map((m) => m.node);
      return {
        isMatched: true,
        matchedNode: matchedNodes[0],
        matchedNodes,
        isAmbiguous: matchedNodes.length > 1,
        matchTier: 3,
        matchedVariant: tier3Matches[0].variant,
        matchedType: "song"
      };
    }
  }

  return { isMatched: false, matchedNode: null, matchedNodes: [], isAmbiguous: false };
}
