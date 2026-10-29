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
   * 가상 인물 ID 여부 판별 (singer_, name_, feat_, group_)
   */
  private isVirtualPersonId(id: string): boolean {
    return /^(singer_|name_|feat_|group_)/.test(id);
  }

  /**
   * 특정 인물 ID와 안전하게 결합 가능한 동일 이름 가상 ID 목록 반환
   * (서로 다른 숫자 ID를 가진 동명이인은 절대 섞이지 않도록 가상 ID만 결합)
   */
  public getSafeMergedPersonIds(personId: string): string[] {
    const personTuple = this.store.persons.get(personId);
    if (!personTuple) return [personId];

    const rawName = personTuple[0].trim();
    const candidates = [
      personId,
      `singer_${rawName}`,
      `name_${rawName}`,
      `feat_${rawName}`,
      `group_${rawName}`
    ];

    const uniqueIds = new Set<string>();
    for (const cid of candidates) {
      if (cid === personId) {
        uniqueIds.add(cid);
      } else {
        const tuple = this.store.persons.get(cid);
        if (tuple && tuple[0].trim() === rawName) {
          uniqueIds.add(cid);
        }
      }
    }
    return Array.from(uniqueIds);
  }

  /**
   * 특정 곡에 참여한 모든 인물/그룹 목록 및 역할 배지 조회
   * (동일 곡 내 정식 숫자 ID와 동일 이름의 가상 ID 중복 카드를 1개로 안전 병합)
   */
  public getConnectedPersons(songId: string): ConnectedPerson[] {
    const edges = this.store.songEdges.get(songId);
    if (!edges) return [];

    interface MergedPersonEntry {
      id: string;
      name: string;
      isGroup: boolean;
      roleSet: Set<RoleCode>;
      groupIdSet: Set<string>;
      memberIdSet: Set<string>;
    }

    const mergedList: MergedPersonEntry[] = [];

    for (const [personId, roles] of edges) {
      const personTuple = this.store.persons.get(personId);
      const name = (personTuple ? personTuple[0] : `ID:${personId}`).trim();
      const isGroup = personTuple ? personTuple[1] === 1 : false;
      const isVirtual = this.isVirtualPersonId(personId);

      // 병합 대상 탐색:
      // 1) 이미 동일한 personId가 있거나
      // 2) 이름이 같고 (기존 항목이 가상 ID이거나 현재 항목이 가상 ID인 경우) -> 동명이인(서로 다른 숫자 ID)은 분리 유지
      const existing = mergedList.find(
        (item) =>
          item.id === personId ||
          (item.name === name && (this.isVirtualPersonId(item.id) || isVirtual))
      );

      if (existing) {
        // 정식 숫자 ID 우선 채택
        if (this.isVirtualPersonId(existing.id) && !isVirtual) {
          existing.id = personId;
        }
        if (isGroup) {
          existing.isGroup = true;
        }
        for (const r of roles) {
          existing.roleSet.add(r);
        }
        const gIds = this.store.memberToGroups.get(personId);
        if (gIds) gIds.forEach((gid) => existing.groupIdSet.add(gid));
        const mIds = this.store.groupToMembers.get(personId);
        if (mIds) mIds.forEach((mid) => existing.memberIdSet.add(mid));
      } else {
        const roleSet = new Set<RoleCode>(roles);
        const groupIdSet = new Set<string>(this.store.memberToGroups.get(personId) || []);
        const memberIdSet = new Set<string>(this.store.groupToMembers.get(personId) || []);

        mergedList.push({
          id: personId,
          name,
          isGroup,
          roleSet,
          groupIdSet,
          memberIdSet
        });
      }
    }

    return mergedList.map((entry) => {
      // 이 인물의 가상 ID들에 연결된 그룹/멤버 정보도 안전하게 보강
      const safeIds = this.getSafeMergedPersonIds(entry.id);
      for (const sid of safeIds) {
        const gIds = this.store.memberToGroups.get(sid);
        if (gIds) gIds.forEach((gid) => entry.groupIdSet.add(gid));
        const mIds = this.store.groupToMembers.get(sid);
        if (mIds) mIds.forEach((mid) => entry.memberIdSet.add(mid));
      }

      const roles = Array.from(entry.roleSet).sort((a, b) => a - b);
      const roleLabels = roles.map((r) => ROLE_LABELS[r] || "기타");

      const affiliatedGroups =
        entry.groupIdSet.size > 0
          ? Array.from(entry.groupIdSet)
              .map((gid) => this.store.getPerson(gid))
              .filter((p): p is PersonInfo => p !== null)
          : undefined;

      const affiliatedMembers =
        entry.memberIdSet.size > 0
          ? Array.from(entry.memberIdSet)
              .map((mid) => this.store.getPerson(mid))
              .filter((p): p is PersonInfo => p !== null)
          : undefined;

      return {
        id: entry.id,
        name: entry.name,
        isGroup: entry.isGroup,
        roles,
        roleLabels,
        affiliatedGroups,
        affiliatedMembers
      };
    });
  }

  /**
   * 특정 인물/그룹이 참여한 모든 곡 조회
   * (정식 숫자 ID와 동일 이름의 가상 ID 참여곡을 안전하게 통합 조회)
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

    const targetPersonIds = this.getSafeMergedPersonIds(personId);

    // 1. 직접 참여한 곡 조회 (Direct Connections - 정식 ID + 동일 이름 가상 ID 병합)
    for (const pid of targetPersonIds) {
      const directSongs = this.store.personToSongs.get(pid);
      if (!directSongs) continue;

      for (const [songId, roles] of directSongs) {
        const songInfo = this.store.getSong(songId);
        if (!songInfo) continue;

        const existing = songMap.get(songId);
        if (existing) {
          for (const r of roles) {
            if (!existing.roles.includes(r)) {
              existing.roles.push(r);
              existing.roleLabels.push(ROLE_LABELS[r] || "기타");
            }
          }
        } else {
          songMap.set(songId, {
            ...songInfo,
            roles: [...roles],
            roleLabels: roles.map((r) => ROLE_LABELS[r] || "기타"),
            isViaGroupHop: false
          });
        }
      }
    }

    // 2. 1-hop 그룹/멤버 계보 곡 확장 탐색 (Stepping Stone)
    if (includeGroupHops) {
      const allGroupIds = new Set<string>();
      const allMemberIds = new Set<string>();
      for (const pid of targetPersonIds) {
        this.store.memberToGroups.get(pid)?.forEach((gid) => allGroupIds.add(gid));
        this.store.groupToMembers.get(pid)?.forEach((mid) => allMemberIds.add(mid));
      }

      // (A) 만약 personId가 특정 그룹의 멤버인 경우 ➔ 소속 그룹의 곡들 추가
      for (const groupId of allGroupIds) {
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

      // (B) 만약 personId가 그룹인 경우 ➔ 소속 멤버들의 곡들 추가
      for (const memberId of allMemberIds) {
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
    const safeIds = new Set(this.getSafeMergedPersonIds(personId));
    const roleSet = new Set<RoleCode>();
    for (const [pId, roles] of edges) {
      if (safeIds.has(pId)) {
        roles.forEach((r) => roleSet.add(r));
      }
    }
    return Array.from(roleSet);
  }

  /**
   * 엣지의 역할 코드가 allowedRolesSet에 부합하는지 O(1) 검사
   */
  private isEdgeAllowed(curr: string, next: string, allowedRolesSet: Set<RoleCode>): boolean {
    // 1) s: <-> p: 전이
    if (curr.startsWith("s:") && next.startsWith("p:")) {
      const sId = curr.slice(2);
      const pId = next.slice(2);
      const roles = this.store.songPersonRoles.get(`${sId}_${pId}`);
      return roles ? roles.some((r) => allowedRolesSet.has(r)) : false;
    }
    if (curr.startsWith("p:") && next.startsWith("s:")) {
      const pId = curr.slice(2);
      const sId = next.slice(2);
      const roles = this.store.songPersonRoles.get(`${sId}_${pId}`);
      return roles ? roles.some((r) => allowedRolesSet.has(r)) : false;
    }
    // 2) p: <-> p: (그룹 <-> 멤버 징검다리, 역할 코드 6: 그룹소속)
    if (curr.startsWith("p:") && next.startsWith("p:")) {
      return allowedRolesSet.has(6);
    }
    return true;
  }

  /**
   * unweighted BFS 최단 경로 탐색 엔진 (곡 's:' / 인물 'p:' 접두사 기반 타입 격리)
   * 756건의 숫자 ID 충돌에 의한 비정상 웜홀 경로를 원천 차단하고
   * 유저가 실제 클릭 가능한 전이(Song <-> Person <-> Group <-> Song)만 탐색
   * optimal_turns 계산식: Math.floor((optimal_path.length - 1) / 2)
   */
  public findShortestPath(
    startSongId: string,
    targetSongId: string,
    options?: { allowedRoles?: RoleCode[] }
  ): ShortestPathResult {
    if (startSongId === targetSongId) {
      return {
        startSongId,
        targetSongId,
        path: [startSongId],
        typedPath: [`s:${startSongId}`],
        turns: 0,
        found: true
      };
    }

    if (!this.store.songs.has(startSongId) || !this.store.songs.has(targetSongId)) {
      return {
        startSongId,
        targetSongId,
        path: [],
        typedPath: [],
        turns: -1,
        found: false
      };
    }

    const startKey = `s:${startSongId}`;
    const targetKey = `s:${targetSongId}`;
    const allowedRolesSet =
      options?.allowedRoles && options.allowedRoles.length > 0
        ? new Set(options.allowedRoles)
        : null;

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

        // 허용 역할 제약 조건 O(1) 검사
        if (allowedRolesSet && !this.isEdgeAllowed(curr, next, allowedRolesSet)) {
          continue;
        }

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
        typedPath: [],
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
      typedPath: rawPath,
      turns,
      found: true
    };
  }

  /**
   * 단일 역방향 BFS: targetSongId에서 출발하여 candidateSongIds 중 가장 가까운 곡을 탐색
   * 수백 개 후보 곡을 개별 BFS로 순회하지 않고 단 1회의 역방향 BFS(10~30ms)로 브라우저 프리징 0% 보장
   */
  public findClosestCandidateSong(
    candidateSongIds: Set<string>,
    targetSongId: string,
    options?: { allowedRoles?: RoleCode[] }
  ): { songId: string; turns: number; path: string[]; typedPath: string[] } | null {
    if (candidateSongIds.size === 0 || !this.store.songs.has(targetSongId)) {
      return null;
    }

    const targetKey = `s:${targetSongId}`;

    // 만약 candidateSongIds에 targetSongId 자체가 포함되어 있다면 즉시 반환
    if (candidateSongIds.has(targetSongId)) {
      return {
        songId: targetSongId,
        turns: 0,
        path: [targetSongId],
        typedPath: [targetKey]
      };
    }

    const allowedRolesSet =
      options?.allowedRoles && options.allowedRoles.length > 0
        ? new Set(options.allowedRoles)
        : null;

    // Queue 포인터 방식 역방향 BFS (targetKey -> candidate song keys)
    const queue: string[] = [targetKey];
    let head = 0;

    const visited = new Set<string>([targetKey]);
    const parent = new Map<string, string>();
    let foundKey: string | null = null;

    while (head < queue.length) {
      const curr = queue[head++];
      const neighbors = this.store.adj.get(curr);
      if (!neighbors) continue;

      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];

        // 허용 역할 제약 조건 O(1) 검사
        if (allowedRolesSet && !this.isEdgeAllowed(curr, next, allowedRolesSet)) {
          continue;
        }

        if (!visited.has(next)) {
          visited.add(next);
          parent.set(next, curr);

          // 만약 곡 노드('s:')이고 candidateSongIds에 포함되어 있다면 즉시 종료!
          if (next.startsWith("s:")) {
            const candId = next.slice(2);
            if (candidateSongIds.has(candId)) {
              foundKey = next;
              break;
            }
          }
          queue.push(next);
        }
      }

      if (foundKey) break;
    }

    if (!foundKey) return null;

    // 경로 역추적: foundKey (candidate song) -> ... -> targetKey (target song)
    const rawPath: string[] = [];
    let currNode: string | undefined = foundKey;
    while (currNode !== undefined) {
      rawPath.push(currNode);
      currNode = parent.get(currNode);
    }

    const path = rawPath.map((k) => k.slice(2));
    const turns = Math.floor((path.length - 1) / 2);

    return {
      songId: foundKey.slice(2),
      turns,
      path,
      typedPath: rawPath
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
