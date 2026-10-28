import {
  RawGraphBundle,
  RawSongTuple,
  RawPersonTuple,
  SongInfo,
  PersonInfo,
  RoleCode
} from "./types";

/**
 * 피처링 괄호 정제 과정에서 남겨진 짝 없는 잔류 닫는 괄호 ), ] 및 앞 공백 제거
 */
export function cleanSongTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  while (true) {
    let changed = false;
    const openP = (title.match(/\(/g) || []).length;
    const closeP = (title.match(/\)/g) || []).length;
    if (closeP > openP && /\s*\)+$/.test(title)) {
      title = title.replace(/\s*\)+$/, "").trim();
      changed = true;
    }
    const openB = (title.match(/\[/g) || []).length;
    const closeB = (title.match(/\]/g) || []).length;
    if (closeB > openB && /\s*\]+$/.test(title)) {
      title = title.replace(/\s*\]+$/, "").trim();
      changed = true;
    }
    if (!changed) break;
  }
  return title;
}

/**
 * 브라우저 인메모리 양방향 그래프 데이터 저장소
 */
export class GraphStore {
  public version: string = "";
  public includedGroups: string[] = [];
  public roleCodes: Record<string, string> = {};

  // 원본 데이터 인덱스
  public songs: Map<string, RawSongTuple> = new Map();
  public persons: Map<string, RawPersonTuple> = new Map();

  // song_id -> [[person_id, role_codes], ...]
  public songEdges: Map<string, Array<[string, RoleCode[]]>> = new Map();

  // person_id -> [[song_id, role_codes], ...] (역방향 인덱스)
  public personToSongs: Map<string, Array<[string, RoleCode[]]>> = new Map();

  // group_edges 인덱스
  public memberToGroups: Map<string, string[]> = new Map();
  public groupToMembers: Map<string, string[]> = new Map();

  // 초고속 unweighted BFS 탐색을 위한 타입 격리 인접 리스트 (s:${songId}, p:${personId})
  // 곡과 인물의 756건 숫자 ID 충돌을 원천 차단하여 유령 웜홀 이동 방지
  public adj: Map<string, string[]> = new Map();

  // O(1) 엣지 역할 조회 인덱스 ("${songId}_${personId}" -> RoleCode[])
  public songPersonRoles: Map<string, RoleCode[]> = new Map();

  // 번들 로딩 및 파싱 시간 기록 (ms)
  public loadDurationMs: number = 0;
  public totalEdgesCount: number = 0;
  public cleanedTitleCount: number = 0;

  constructor() {}

  private addAdjEdge(u: string, v: string) {
    let listU = this.adj.get(u);
    if (!listU) {
      listU = [];
      this.adj.set(u, listU);
    }
    listU.push(v);

    let listV = this.adj.get(v);
    if (!listV) {
      listV = [];
      this.adj.set(v, listV);
    }
    listV.push(u);
  }

  public populate(bundle: RawGraphBundle, startTime: number = Date.now()): void {
    this.version = bundle.version;
    this.includedGroups = bundle.included_groups;
    this.roleCodes = bundle.role_codes;

    // 1. 곡(Songs) 인덱싱 & 잔류 닫는 괄호 ) 제거 정제
    let cleanedCount = 0;
    for (const songId of Object.keys(bundle.songs)) {
      const tuple = bundle.songs[songId];
      const cleaned = cleanSongTitle(tuple[0]);
      if (cleaned !== tuple[0]) {
        tuple[0] = cleaned;
        cleanedCount++;
      }
      this.songs.set(songId, tuple);
    }
    this.cleanedTitleCount = cleanedCount;

    // 2. 인물(Persons) 인덱싱
    for (const personId of Object.keys(bundle.persons)) {
      this.persons.set(personId, bundle.persons[personId]);
    }

    // 3. 그룹 엣지(group_edges) 인덱싱 및 adj 추가 (p:${memberId} <-> p:${groupId})
    for (const [memberId, groupId] of bundle.group_edges) {
      let gList = this.memberToGroups.get(memberId);
      if (!gList) {
        gList = [];
        this.memberToGroups.set(memberId, gList);
      }
      gList.push(groupId);

      let mList = this.groupToMembers.get(groupId);
      if (!mList) {
        mList = [];
        this.groupToMembers.set(groupId, mList);
      }
      mList.push(memberId);

      this.addAdjEdge(`p:${memberId}`, `p:${groupId}`);
    }

    // 4. 곡 엣지(song_edges) 및 역방향 인덱스(personToSongs) 구축 및 adj 추가 (s:${songId} <-> p:${personId})
    let edgeCount = 0;
    for (const [songId, edges] of Object.entries(bundle.song_edges)) {
      this.songEdges.set(songId, edges);
      edgeCount += edges.length;

      for (const [personId, roles] of edges) {
        let pSongs = this.personToSongs.get(personId);
        if (!pSongs) {
          pSongs = [];
          this.personToSongs.set(personId, pSongs);
        }
        pSongs.push([songId, roles]);

        this.songPersonRoles.set(`${songId}_${personId}`, roles);
        this.addAdjEdge(`s:${songId}`, `p:${personId}`);
      }
    }

    this.totalEdgesCount = edgeCount + bundle.group_edges.length;
    this.loadDurationMs = Date.now() - startTime;
  }

  /**
   * Song ID로 정제된 SongInfo 객체 반환
   */
  public getSong(songId: string): SongInfo | null {
    const tuple = this.songs.get(songId);
    if (!tuple) return null;
    return {
      id: songId,
      title: tuple[0],
      artist: tuple[1],
      display: `${tuple[0]} - ${tuple[1]}`,
      agency: tuple[2],
      year: tuple[3],
      genre: tuple[4],
      likes: tuple[5],
      isTitle: tuple[6] === 1,
      inGiant: tuple[7] === 1
    };
  }

  /**
   * Person ID로 정제된 PersonInfo 객체 반환
   */
  public getPerson(personId: string): PersonInfo | null {
    const tuple = this.persons.get(personId);
    if (!tuple) return null;
    return {
      id: personId,
      name: tuple[0],
      isGroup: tuple[1] === 1
    };
  }
}

// Next.js 개발 모드(HMR) 및 클라이언트 싱글톤 캐싱
declare global {
  // eslint-disable-next-line no-var
  var __dbdigging_graph_singleton__: GraphStore | undefined;
  // eslint-disable-next-line no-var
  var __dbdigging_graph_load_promise__: Promise<GraphStore> | undefined;
}

/**
 * Manifest 기반 캐시 무효화(Cache-Busting) 비동기 GraphStore 로더
 */
export async function getGraphStoreAsync(): Promise<GraphStore> {
  if (globalThis.__dbdigging_graph_singleton__) {
    return globalThis.__dbdigging_graph_singleton__;
  }
  if (globalThis.__dbdigging_graph_load_promise__) {
    return globalThis.__dbdigging_graph_load_promise__;
  }

  globalThis.__dbdigging_graph_load_promise__ = (async () => {
    const startTime = Date.now();
    let versionQuery = "";

    // 1. 1KB 미만의 dataset_manifest.json을 no-store로 fetch하여 최신 build_timestamp_kst 확인
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
      console.warn("[getGraphStoreAsync] Failed to fetch manifest, proceeding unversioned:", err);
    }

    // 2. 버전 쿼리스트링 기반 본체 번들 로드 (브라우저 디스크 캐시 활용)
    const bundleRes = await fetch(`/data/firebase_graph_bundle.json${versionQuery}`);
    if (!bundleRes.ok) {
      throw new Error(`[getGraphStoreAsync] Failed to fetch graph bundle: ${bundleRes.status}`);
    }

    const bundle: RawGraphBundle = await bundleRes.json();
    const store = new GraphStore();
    store.populate(bundle, startTime);

    globalThis.__dbdigging_graph_singleton__ = store;
    return store;
  })();

  return globalThis.__dbdigging_graph_load_promise__;
}

/**
 * 동기 GraphStore 획득 함수 (비동기 초기화 완료 후 사용)
 */
export function getGraphStore(): GraphStore {
  if (!globalThis.__dbdigging_graph_singleton__) {
    throw new Error("[getGraphStore] GraphStore is not initialized yet. Await getGraphStoreAsync() first.");
  }
  return globalThis.__dbdigging_graph_singleton__;
}
