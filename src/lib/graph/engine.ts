import { GraphStore, getGraphStore } from "./loader";
import {
  ConnectedPerson,
  ConnectedSong,
  PersonInfo,
  RoleCode,
  ROLE_LABELS,
  ShortestPathResult,
  SongInfo
} from "./types";

export class GraphEngine {
  private store: GraphStore;

  constructor(store?: GraphStore) {
    this.store = store || getGraphStore();
  }

  /**
   * 기본 GraphStore 참조 반환
   */
  public getStore(): GraphStore {
    return this.store;
  }

  /**
   * 단일 곡 상세 메타데이터 조회
   */
  public getSong(songId: string): SongInfo | null {
    return this.store.getSong(songId);
  }

  /**
   * 단일 인물/그룹 상세 메타데이터 조회
   */
  public getPerson(personId: string): PersonInfo | null {
    return this.store.getPerson(personId);
  }

  /**
   * 특정 곡에 참여한 모든 인물/그룹 목록 및 역할 배지 조회
   */
  public getConnectedPersons(songId: string): ConnectedPerson[] {
    const edges = this.store.songEdges.get(songId);
    if (!edges) return [];

    return edges.map(([personId, roles]) => {
      const personTuple = this.store.persons.get(personId);
      const name = personTuple ? personTuple[0] : `ID:${personId}`;
      const isGroup = personTuple ? personTuple[1] === 1 : false;

      const roleLabels = roles.map((r) => ROLE_LABELS[r] || "기타");

      // 소속 그룹 또는 소속 멤버 정보 추가
      let affiliatedGroups: PersonInfo[] | undefined;
      let affiliatedMembers: PersonInfo[] | undefined;

      const groupIds = this.store.memberToGroups.get(personId);
      if (groupIds && groupIds.length > 0) {
        affiliatedGroups = groupIds
          .map((gid) => this.store.getPerson(gid))
          .filter((p): p is PersonInfo => p !== null);
      }

      const memberIds = this.store.groupToMembers.get(personId);
      if (memberIds && memberIds.length > 0) {
        affiliatedMembers = memberIds
          .map((mid) => this.store.getPerson(mid))
          .filter((p): p is PersonInfo => p !== null);
      }

      return {
        id: personId,
        name,
        isGroup,
        roles,
        roleLabels,
        affiliatedGroups,
        affiliatedMembers
      };
    });
  }

  /**
   * 특정 인물/그룹이 참여한 모든 곡 조회
   * @param personId 인물 또는 그룹 ID
   * @param options.includeGroupHops 1-hop 그룹/멤버 계보를 통한 확장 탐색 여부 (기본값: true)
   * @param options.sortByLikes 좋아요 순 내림차순 정렬 여부 (기본값: true)
   */
  public getConnectedSongs(
    personId: string,
    options: { includeGroupHops?: boolean; sortByLikes?: boolean } = {
      includeGroupHops: true,
      sortByLikes: true
    }
  ): ConnectedSong[] {
    const { includeGroupHops = true, sortByLikes = true } = options;
    const songMap = new Map<string, ConnectedSong>();

    // 1. 직접 참여한 곡 조회 (Direct Connections)
    const directSongs = this.store.personToSongs.get(personId);
    if (directSongs) {
      for (const [songId, roles] of directSongs) {
        const songInfo = this.store.getSong(songId);
        if (!songInfo) continue;

        songMap.set(songId, {
          ...songInfo,
          roles: [...roles],
          roleLabels: roles.map((r) => ROLE_LABELS[r] || "기타"),
          isViaGroupHop: false
        });
      }
    }

    // 2. 1-hop 그룹/멤버 계보 곡 확장 탐색 (Stepping Stone)
    if (includeGroupHops) {
      // (A) 만약 personId가 특정 그룹의 멤버인 경우 ➔ 소속 그룹의 곡들 추가
      const groupIds = this.store.memberToGroups.get(personId);
      if (groupIds) {
        for (const groupId of groupIds) {
          const groupInfo = this.store.getPerson(groupId);
          const groupSongs = this.store.personToSongs.get(groupId);
          if (groupSongs) {
            for (const [songId, gRoles] of groupSongs) {
              const existing = songMap.get(songId);
              if (existing) {
                if (!existing.roles.includes(6)) {
                  existing.roles.push(6);
                  existing.roleLabels.push(ROLE_LABELS[6]);
                }
              } else {
                const songInfo = this.store.getSong(songId);
                if (!songInfo) continue;
                songMap.set(songId, {
                  ...songInfo,
                  roles: [6, ...gRoles],
                  roleLabels: [ROLE_LABELS[6], ...gRoles.map((r) => ROLE_LABELS[r] || "기타")],
                  isViaGroupHop: true,
                  hopSourcePersonId: groupId,
                  hopSourcePersonName: groupInfo?.name || "소속 그룹"
                });
              }
            }
          }
        }
      }

      // (B) 만약 personId가 그룹인 경우 ➔ 소속 멤버들의 곡들 추가
      const memberIds = this.store.groupToMembers.get(personId);
      if (memberIds) {
        for (const memberId of memberIds) {
          const memberInfo = this.store.getPerson(memberId);
          const memberSongs = this.store.personToSongs.get(memberId);
          if (memberSongs) {
            for (const [songId, mRoles] of memberSongs) {
              const existing = songMap.get(songId);
              if (existing) {
                if (!existing.roles.includes(6)) {
                  existing.roles.push(6);
                  existing.roleLabels.push(ROLE_LABELS[6]);
                }
              } else {
                const songInfo = this.store.getSong(songId);
                if (!songInfo) continue;
                songMap.set(songId, {
                  ...songInfo,
                  roles: [6, ...mRoles],
                  roleLabels: [ROLE_LABELS[6], ...mRoles.map((r) => ROLE_LABELS[r] || "기타")],
                  isViaGroupHop: true,
                  hopSourcePersonId: memberId,
                  hopSourcePersonName: memberInfo?.name || "소속 멤버"
                });
              }
            }
          }
        }
      }
    }

    const results = Array.from(songMap.values());

    if (sortByLikes) {
      results.sort((a, b) => b.likes - a.likes);
    }

    return results;
  }

  /**
   * 특정 곡과 특정 인물 사이의 역할 코드 배열 반환
   */
  public getRolesBetween(songId: string, personId: string): RoleCode[] {
    const edges = this.store.songEdges.get(songId);
    if (!edges) return [];
    const match = edges.find(([pId]) => pId === personId);
    return match ? match[1] : [];
  }

  /**
   * unweighted BFS 최단 경로 탐색 엔진 (곡 's:' / 인물 'p:' 접두사 기반 타입 격리)
   * 756건의 숫자 ID 충돌에 의한 비정상 웜홀 경로를 원천 차단하고
   * 유저가 실제 클릭 가능한 전이(Song <-> Person <-> Group <-> Song)만 탐색
   * optimal_turns 계산식: Math.floor((optimal_path.length - 1) / 2)
   */
  public findShortestPath(
    startSongId: string,
    targetSongId: string
  ): ShortestPathResult {
    if (startSongId === targetSongId) {
      return {
        startSongId,
        targetSongId,
        path: [startSongId],
        turns: 0,
        found: true
      };
    }

    if (!this.store.songs.has(startSongId) || !this.store.songs.has(targetSongId)) {
      return {
        startSongId,
        targetSongId,
        path: [],
        turns: -1,
        found: false
      };
    }

    const startKey = `s:${startSongId}`;
    const targetKey = `s:${targetSongId}`;

    // Queue 포인터 방식 unweighted BFS
    const queue: string[] = [startKey];
    let head = 0;

    const visited = new Set<string>([startKey]);
    const parent = new Map<string, string>();
    let foundTarget = false;

    while (head < queue.length) {
      const curr = queue[head++];
      if (curr === targetKey) {
        foundTarget = true;
        break;
      }

      const neighbors = this.store.adj.get(curr);
      if (!neighbors) continue;

      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        if (!visited.has(next)) {
          visited.add(next);
          parent.set(next, curr);

          if (next === targetKey) {
            foundTarget = true;
            break;
          }
          queue.push(next);
        }
      }

      if (foundTarget) break;
    }

    if (!foundTarget && !visited.has(targetKey)) {
      return {
        startSongId,
        targetSongId,
        path: [],
        turns: -1,
        found: false
      };
    }

    // 최단 경로 역추적 ('s:', 'p:' 접두사 제거하여 순수 노드 ID 배열로 복원)
    const rawPath: string[] = [];
    let currNode: string | undefined = targetKey;
    while (currNode !== undefined) {
      rawPath.push(currNode);
      currNode = parent.get(currNode);
    }
    rawPath.reverse();

    const path = rawPath.map((k) => k.slice(2));
    const turns = Math.floor((path.length - 1) / 2);

    return {
      startSongId,
      targetSongId,
      path,
      turns,
      found: true
    };
  }
}

// 전역 싱글톤 GraphEngine 획득 함수
declare global {
  // eslint-disable-next-line no-var
  var __dbdigging_engine_singleton__: GraphEngine | undefined;
}

export function getGraphEngine(store?: GraphStore): GraphEngine {
  if (!globalThis.__dbdigging_engine_singleton__) {
    globalThis.__dbdigging_engine_singleton__ = new GraphEngine(store);
  }
  return globalThis.__dbdigging_engine_singleton__;
}
