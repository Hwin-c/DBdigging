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
   * 특정 곡이 속한 연결 컴포넌트 ID를 O(1)로 반환
   */
  public getComponentId(songId: string): number | null {
    return this.store.getComponentId(songId);
  }

  /**
   * 가상 인물 ID 여부 판별 (singer_, name_, feat_, group_, artist_ 5종 전수 커버)
   */
  public isVirtualPersonId(id: string): boolean {
    return /^(singer_|name_|feat_|group_|artist_)/.test(id);
  }

  /**
   * 비인물 메타데이터 노드('name_미상', 'name_작자미상', ID '611339' 등) 차단 판별 헬퍼
   */
  public isBlockedNonPersonId(personId: string): boolean {
    return this.store.isBlockedPersonId(personId);
  }

  /**
   * 특정 인물 ID와 안전하게 결합 가능한 동일 이름 가상 ID 목록 반환
   * (서로 다른 숫자 ID를 가진 동명이인은 절대 섞이지 않도록 5종 가상 ID만 결합)
   */
  public getSafeMergedPersonIds(personId: string): string[] {
    if (this.isBlockedNonPersonId(personId)) return [];
    const personTuple = this.store.persons.get(personId);
    if (!personTuple) return [personId];

    const rawName = personTuple[0].trim();
    const candidates = [
      personId,
      `singer_${rawName}`,
      `name_${rawName}`,
      `feat_${rawName}`,
      `group_${rawName}`,
      `artist_${rawName}`
    ];

    const uniqueIds = new Set<string>();
    for (const cid of candidates) {
      if (this.isBlockedNonPersonId(cid)) continue;
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
   * (동일 곡 내 정식 숫자 ID와 동일 이름의 가상 ID 중복 카드를 1개로 안전 병합 및 비인물 차단)
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
      if (this.isBlockedNonPersonId(personId)) continue;

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
        if (gIds) {
          gIds.forEach((gid) => {
            if (!this.isBlockedNonPersonId(gid)) existing.groupIdSet.add(gid);
          });
        }
        const mIds = this.store.groupToMembers.get(personId);
        if (mIds) {
          mIds.forEach((mid) => {
            if (!this.isBlockedNonPersonId(mid)) existing.memberIdSet.add(mid);
          });
        }
      } else {
        const roleSet = new Set<RoleCode>(roles);
        const groupIdSet = new Set<string>(
          (this.store.memberToGroups.get(personId) || []).filter(
            (gid) => !this.isBlockedNonPersonId(gid)
          )
        );
        const memberIdSet = new Set<string>(
          (this.store.groupToMembers.get(personId) || []).filter(
            (mid) => !this.isBlockedNonPersonId(mid)
          )
        );

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
        if (gIds) {
          gIds.forEach((gid) => {
            if (!this.isBlockedNonPersonId(gid)) entry.groupIdSet.add(gid);
          });
        }
        const mIds = this.store.groupToMembers.get(sid);
        if (mIds) {
          mIds.forEach((mid) => {
            if (!this.isBlockedNonPersonId(mid)) entry.memberIdSet.add(mid);
          });
        }
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
    if (this.isBlockedNonPersonId(personId)) return [];

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
        this.store.memberToGroups.get(pid)?.forEach((gid) => {
          if (!this.isBlockedNonPersonId(gid)) allGroupIds.add(gid);
        });
        this.store.groupToMembers.get(pid)?.forEach((mid) => {
          if (!this.isBlockedNonPersonId(mid)) allMemberIds.add(mid);
        });
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
    if (this.isBlockedNonPersonId(personId)) return [];
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
  public isEdgeAllowed(curr: string, next: string, allowedRolesSet: Set<RoleCode>): boolean {
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
   * [Step 13-2 후보 2] 정식 멜론 숫자 ID 우선 경유 가중치 최단 경로 탐색 엔진
   * - 곡 's:' / 인물 'p:' 접두사 기반 타입 격리 (756건 숫자 ID 충돌 웜홀 차단)
   * - 비인물 허브('name_미상', 'name_작자미상', ID '611339' 등) 탐색 전면 차단
   * - 가상 ID(singer_, name_, feat_, group_, artist_) 진입 시 페널티 가중치(+2 엣지 비용 = +1턴 상당)를 부여하는
   *   Dial's Bucket 우선순위 큐(Dijkstra)를 적용하여 동일 조건에서 항상 정식 숫자 ID 경로를 우선 채택
   * - optimal_turns 계산식: Math.floor((optimal_path.length - 1) / 2)
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

    // 만약 allowedRoles가 빈 배열([])로 명시된 경우 이동 가능한 엣지가 없으므로 즉시 실패 반환
    if (options?.allowedRoles !== undefined && options.allowedRoles.length === 0) {
      return {
        startSongId,
        targetSongId,
        path: [],
        typedPath: [],
        turns: -1,
        found: false
      };
    }

    // O(1) 컴포넌트 비교로 연결 불가능 쌍을 즉시 단락(Short-Circuit)
    const startComp = this.store.getComponentId(startSongId);
    const targetComp = this.store.getComponentId(targetSongId);
    if (startComp !== null && targetComp !== null && startComp !== targetComp) {
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
    const startIdx = this.store.nodeToIndex.get(startKey);
    const targetIdx = this.store.nodeToIndex.get(targetKey);
    if (startIdx === undefined || targetIdx === undefined) {
      return {
        startSongId,
        targetSongId,
        path: [],
        typedPath: [],
        turns: -1,
        found: false
      };
    }

    const allowedRolesSet =
      options?.allowedRoles && options.allowedRoles.length > 0 && options.allowedRoles.length < 6
        ? new Set(options.allowedRoles)
        : null;

    // Dial's Bucket Queue (정수 인덱스 TypedArray 기반 다익스트라 우선순위 큐)
    // 일반 엣지 비용 = 1, 가상 인물 노드 진입 시 = 3 (기본 1 + 페널티 2 = +1턴 가중치)
    const totalNodes = this.store.indexToNode.length;
    const INF = 0x3fffffff;
    const costDist = new Int32Array(totalNodes).fill(INF);
    const virtDist = new Int32Array(totalNodes).fill(INF);
    const parent = new Int32Array(totalNodes).fill(-1);
    const settled = new Uint8Array(totalNodes);

    const adjIndices = this.store.adjIndices;
    const nodeIsBlocked = this.store.nodeIsBlocked;
    const nodeIsVirtual = this.store.nodeIsVirtual;
    const indexToNode = this.store.indexToNode;

    costDist[startIdx] = 0;
    virtDist[startIdx] = 0;

    const buckets: number[][] = [[startIdx]];
    let currentCost = 0;
    let remaining = 1;
    let foundTarget = false;

    while (remaining > 0) {
      while (!buckets[currentCost] || buckets[currentCost].length === 0) {
        currentCost++;
      }
      const currIdx = buckets[currentCost].pop()!;
      remaining--;

      if (settled[currIdx]) continue;
      if (currentCost > costDist[currIdx]) continue;
      settled[currIdx] = 1;

      if (currIdx === targetIdx) {
        foundTarget = true;
        break;
      }

      const currVirt = virtDist[currIdx];
      const neighbors = adjIndices[currIdx];
      const currNodeStr = allowedRolesSet ? indexToNode[currIdx] : "";

      for (let i = 0, len = neighbors.length; i < len; i++) {
        const nextIdx = neighbors[i];
        if (settled[nextIdx] || nodeIsBlocked[nextIdx]) continue;

        if (allowedRolesSet && !this.isEdgeAllowed(currNodeStr, indexToNode[nextIdx], allowedRolesSet)) {
          continue;
        }

        const isNextVirtual = nodeIsVirtual[nextIdx];
        const nextCost = currentCost + (isNextVirtual ? 3 : 1);
        const nextVirt = currVirt + isNextVirtual;
        const prevCost = costDist[nextIdx];

        if (
          nextCost < prevCost ||
          (nextCost === prevCost && nextVirt < virtDist[nextIdx])
        ) {
          costDist[nextIdx] = nextCost;
          virtDist[nextIdx] = nextVirt;
          parent[nextIdx] = currIdx;
          let b = buckets[nextCost];
          if (!b) {
            b = [];
            buckets[nextCost] = b;
          }
          b.push(nextIdx);
          remaining++;
        }
      }
    }

    if (!foundTarget && costDist[targetIdx] === INF) {
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
    const idxPath: number[] = [];
    let curr = targetIdx;
    while (curr !== -1) {
      idxPath.push(curr);
      curr = parent[curr];
    }
    idxPath.reverse();

    const typedPath = idxPath.map((idx) => indexToNode[idx]);
    const path = idxPath.map((idx) => this.store.indexToRawId[idx]);
    const turns = Math.floor((path.length - 1) / 2);

    return {
      startSongId,
      targetSongId,
      path,
      typedPath,
      turns,
      found: true
    };
  }

  /**
   * 단일 출발점(sourceSongId) 가중치 탐색을 통해 목표 턴 범위(minTurns~maxTurns) 내 후보 곡들을
   * 단 1회의 탐색으로 수집 (맞춤 디깅 랜덤 퀘스트 생성 시 다중 BFS 호출로 인한 지연 원천 제거)
   */
  public findCandidatesFromSource(
    sourceSongId: string,
    minTurns: number,
    maxTurns: number,
    options?: {
      allowedRoles?: RoleCode[];
      filterFn?: (songId: string) => boolean;
      maxStrictCollect?: number;
    }
  ): {
    strictMatches: string[];
    relaxedMatches: string[];
    closestTurnSongId: string | null;
    firstReachableSongId: string | null;
  } {
    const emptyRes = {
      strictMatches: [] as string[],
      relaxedMatches: [] as string[],
      closestTurnSongId: null as string | null,
      firstReachableSongId: null as string | null
    };

    if (!this.store.songs.has(sourceSongId)) return emptyRes;
    if (options?.allowedRoles !== undefined && options.allowedRoles.length === 0) {
      return emptyRes;
    }

    const startIdx = this.store.nodeToIndex.get(`s:${sourceSongId}`);
    if (startIdx === undefined) return emptyRes;

    const allowedRolesSet =
      options?.allowedRoles && options.allowedRoles.length > 0 && options.allowedRoles.length < 6
        ? new Set(options.allowedRoles)
        : null;
    const filterFn = options?.filterFn;
    const maxStrictCollect = options?.maxStrictCollect ?? 80;

    const totalNodes = this.store.indexToNode.length;
    const INF = 0x3fffffff;
    const costDist = new Int32Array(totalNodes).fill(INF);
    const virtDist = new Int32Array(totalNodes).fill(INF);
    const edgeDist = new Int32Array(totalNodes).fill(INF);
    const settled = new Uint8Array(totalNodes);

    const adjIndices = this.store.adjIndices;
    const nodeIsBlocked = this.store.nodeIsBlocked;
    const nodeIsVirtual = this.store.nodeIsVirtual;
    const nodeIsSong = this.store.nodeIsSong;
    const indexToNode = this.store.indexToNode;
    const indexToRawId = this.store.indexToRawId;

    costDist[startIdx] = 0;
    virtDist[startIdx] = 0;
    edgeDist[startIdx] = 0;

    const buckets: number[][] = [[startIdx]];
    let currentCost = 0;
    let remaining = 1;

    const strictMatches: string[] = [];
    const relaxedMatches: string[] = [];
    let firstReachableSongId: string | null = null;
    let closestTurnSongId: string | null = null;
    let bestTurnDiff = INF;

    while (remaining > 0) {
      while (!buckets[currentCost] || buckets[currentCost].length === 0) {
        currentCost++;
      }
      const currIdx = buckets[currentCost].pop()!;
      remaining--;

      if (settled[currIdx]) continue;
      if (currentCost > costDist[currIdx]) continue;
      settled[currIdx] = 1;

      const currEdges = edgeDist[currIdx];

      if (currIdx !== startIdx && nodeIsSong[currIdx]) {
        const candSongId = indexToRawId[currIdx];
        const turns = currEdges >> 1;

        if (!firstReachableSongId) {
          firstReachableSongId = candSongId;
        }

        const diff =
          turns < minTurns ? minTurns - turns : turns > maxTurns ? turns - maxTurns : 0;
        if (diff < bestTurnDiff) {
          bestTurnDiff = diff;
          closestTurnSongId = candSongId;
        }

        if (turns >= minTurns && turns <= maxTurns) {
          if (!filterFn || filterFn(candSongId)) {
            strictMatches.push(candSongId);
            if (strictMatches.length >= maxStrictCollect) {
              break;
            }
          } else if (relaxedMatches.length < maxStrictCollect) {
            relaxedMatches.push(candSongId);
          }
        }
      }

      // 만약 이미 strictMatches가 존재하고 현재 최소 엣지 비용으로도 maxTurns를 초과했다면 조기 종료
      if (
        (strictMatches.length > 0 || relaxedMatches.length >= maxStrictCollect) &&
        currentCost > maxTurns * 6 + 2
      ) {
        break;
      }

      const currVirt = virtDist[currIdx];
      const neighbors = adjIndices[currIdx];
      const currNodeStr = allowedRolesSet ? indexToNode[currIdx] : "";

      for (let i = 0, len = neighbors.length; i < len; i++) {
        const nextIdx = neighbors[i];
        if (settled[nextIdx] || nodeIsBlocked[nextIdx]) continue;

        if (allowedRolesSet && !this.isEdgeAllowed(currNodeStr, indexToNode[nextIdx], allowedRolesSet)) {
          continue;
        }

        const isNextVirtual = nodeIsVirtual[nextIdx];
        const nextCost = currentCost + (isNextVirtual ? 3 : 1);
        const nextVirt = currVirt + isNextVirtual;
        const nextEdges = currEdges + 1;
        const prevCost = costDist[nextIdx];

        if (
          nextCost < prevCost ||
          (nextCost === prevCost && nextVirt < virtDist[nextIdx])
        ) {
          costDist[nextIdx] = nextCost;
          virtDist[nextIdx] = nextVirt;
          edgeDist[nextIdx] = nextEdges;
          let b = buckets[nextCost];
          if (!b) {
            b = [];
            buckets[nextCost] = b;
          }
          b.push(nextIdx);
          remaining++;
        }
      }
    }

    return {
      strictMatches,
      relaxedMatches,
      closestTurnSongId,
      firstReachableSongId
    };
  }

  /**
   * 단일 역방향 가중치 탐색: targetSongId에서 출발하여 candidateSongIds 중 가장 가까운 곡을 탐색
   * 비인물 노드 차단 및 후보 2 가상 ID 페널티 가중치 동일 적용
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

    if (options?.allowedRoles !== undefined && options.allowedRoles.length === 0) {
      return null;
    }

    const targetIdx = this.store.nodeToIndex.get(targetKey);
    if (targetIdx === undefined) return null;

    const allowedRolesSet =
      options?.allowedRoles && options.allowedRoles.length > 0 && options.allowedRoles.length < 6
        ? new Set(options.allowedRoles)
        : null;

    const totalNodes = this.store.indexToNode.length;
    const INF = 0x3fffffff;
    const costDist = new Int32Array(totalNodes).fill(INF);
    const virtDist = new Int32Array(totalNodes).fill(INF);
    const parent = new Int32Array(totalNodes).fill(-1);
    const settled = new Uint8Array(totalNodes);

    const adjIndices = this.store.adjIndices;
    const nodeIsBlocked = this.store.nodeIsBlocked;
    const nodeIsVirtual = this.store.nodeIsVirtual;
    const nodeIsSong = this.store.nodeIsSong;
    const indexToNode = this.store.indexToNode;
    const indexToRawId = this.store.indexToRawId;

    costDist[targetIdx] = 0;
    virtDist[targetIdx] = 0;

    const buckets: number[][] = [[targetIdx]];
    let currentCost = 0;
    let remaining = 1;
    let foundIdx = -1;

    while (remaining > 0) {
      while (!buckets[currentCost] || buckets[currentCost].length === 0) {
        currentCost++;
      }
      const currIdx = buckets[currentCost].pop()!;
      remaining--;

      if (settled[currIdx]) continue;
      if (currentCost > costDist[currIdx]) continue;
      settled[currIdx] = 1;

      if (currIdx !== targetIdx && nodeIsSong[currIdx]) {
        const candId = indexToRawId[currIdx];
        if (candidateSongIds.has(candId)) {
          foundIdx = currIdx;
          break;
        }
      }

      const currVirt = virtDist[currIdx];
      const neighbors = adjIndices[currIdx];
      const currNodeStr = allowedRolesSet ? indexToNode[currIdx] : "";

      for (let i = 0, len = neighbors.length; i < len; i++) {
        const nextIdx = neighbors[i];
        if (settled[nextIdx] || nodeIsBlocked[nextIdx]) continue;

        if (allowedRolesSet && !this.isEdgeAllowed(currNodeStr, indexToNode[nextIdx], allowedRolesSet)) {
          continue;
        }

        const isNextVirtual = nodeIsVirtual[nextIdx];
        const nextCost = currentCost + (isNextVirtual ? 3 : 1);
        const nextVirt = currVirt + isNextVirtual;
        const prevCost = costDist[nextIdx];

        if (
          nextCost < prevCost ||
          (nextCost === prevCost && nextVirt < virtDist[nextIdx])
        ) {
          costDist[nextIdx] = nextCost;
          virtDist[nextIdx] = nextVirt;
          parent[nextIdx] = currIdx;
          let b = buckets[nextCost];
          if (!b) {
            b = [];
            buckets[nextCost] = b;
          }
          b.push(nextIdx);
          remaining++;
        }
      }
    }

    if (foundIdx === -1) return null;

    // 경로 역추적: foundIdx (candidate song) -> ... -> targetIdx (target song)
    const idxPath: number[] = [];
    let curr = foundIdx;
    while (curr !== -1) {
      idxPath.push(curr);
      curr = parent[curr];
    }

    const typedPath = idxPath.map((idx) => indexToNode[idx]);
    const path = idxPath.map((idx) => indexToRawId[idx]);
    const turns = Math.floor((path.length - 1) / 2);

    return {
      songId: indexToRawId[foundIdx],
      turns,
      path,
      typedPath
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
