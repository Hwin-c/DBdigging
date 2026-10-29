"use client";

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { ExplorationNode, SongInfo, ROLE_LABELS } from "@/lib/graph/types";
import { isMatchingTargetSong } from "@/lib/game/search";
import { ZoomIn, ZoomOut, Maximize2, ChevronDown, Compass } from "lucide-react";

export type { ExplorationNode };

interface ExplorationTreeMapProps {
  tree: ExplorationNode[];
  currentNodeId?: string;
  targetSong?: SongInfo;
  onSelectNode: (node: ExplorationNode) => void;
  className?: string;
}

interface LayoutItem {
  node: ExplorationNode;
  x: number;
  y: number;
}

export function ExplorationTreeMap({
  tree,
  currentNodeId,
  targetSong,
  onSelectNode,
  className = ""
}: ExplorationTreeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 모바일 뷰포트 높이 3단계 토글 ("fold" | "default" | "expand")
  const [mobileHeightMode, setMobileHeightMode] = useState<"fold" | "default" | "expand">("default");

  // 줌 및 드래그 패닝 상태
  const [zoom, setZoom] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });
  const hasDraggedRef = useRef<boolean>(false);

  // ----------------------------------------------------
  // 2-Mode Bipartite Network 상하 2계층 분리 레이아웃 계산
  // - 상단 층: ARTIST / CREATOR LAYER (y = 120 고정)
  // - 하단 층: SONG / TRACK LAYER (y = 320 고정)
  // - Y축 어긋남 0% 보장 및 X축 슬롯 간격 배치로 노드 겹침 0%
  // ----------------------------------------------------
  const ARTIST_LAYER_Y = 120;
  const SONG_LAYER_Y = 320;
  const CANVAS_HEIGHT = 450;
  const MIN_GAP_SONG = 175; // 노래 노드 간 최소 X 간격 (LP 디스크 52px + 네임플레이트 112px 여유)
  const MIN_GAP_ARTIST = 155; // 인물 캡슐 노드 간 최소 X 간격 (캡슐 92px 여유)
  const START_X = 185; // 좌측 레이어 라벨(142px) 영역 여유 확보

  const { layoutItems, width, height, edges } = useMemo(() => {
    if (tree.length === 0) {
      return { layoutItems: [], width: 760, height: CANVAS_HEIGHT, edges: [] };
    }

    const nodeMap = new Map<string, ExplorationNode>();
    tree.forEach((n) => nodeMap.set(n.nodeId, n));

    // Depth별 노드 그룹화
    const depthGroups = new Map<number, ExplorationNode[]>();
    tree.forEach((n) => {
      const list = depthGroups.get(n.depth) || [];
      list.push(n);
      depthGroups.set(n.depth, list);
    });

    const maxDepth = Math.max(...Array.from(depthGroups.keys()), 0);

    const items: LayoutItem[] = [];
    const nodeCoords = new Map<string, { x: number; y: number }>();

    let lastArtistX = START_X - MIN_GAP_ARTIST;
    let lastSongX = START_X - MIN_GAP_SONG;

    // Depth 0부터 maxDepth까지 순서대로 엄격한 Bipartite 수평 레일 배치
    for (let d = 0; d <= maxDepth; d++) {
      const group = depthGroups.get(d) || [];
      if (group.length === 0) continue;

      // 같은 깊이 내에서 부모 노드의 X좌표 순으로 정렬하여 에지 교차 방지
      group.sort((a, b) => {
        const pA = a.parentNodeId ? nodeCoords.get(a.parentNodeId)?.x ?? 0 : 0;
        const pB = b.parentNodeId ? nodeCoords.get(b.parentNodeId)?.x ?? 0 : 0;
        return pA - pB;
      });

      // 부모별 자식 클러스터 분할
      const parentToChildren = new Map<string, ExplorationNode[]>();
      group.forEach((node) => {
        const pId = node.parentNodeId || "__root__";
        const list = parentToChildren.get(pId) || [];
        list.push(node);
        parentToChildren.set(pId, list);
      });

      parentToChildren.forEach((children, pId) => {
        const pCoord = nodeCoords.get(pId);
        const childCount = children.length;

        children.forEach((child, idx) => {
          const isArtist = child.nodeType === "person";
          const y = isArtist ? ARTIST_LAYER_Y : SONG_LAYER_Y;
          const minGap = isArtist ? MIN_GAP_ARTIST : MIN_GAP_SONG;
          const lastPlaced = isArtist ? lastArtistX : lastSongX;

          let targetX: number;
          if (pCoord) {
            // 부모 X좌표 기준 다중 자식 분기 (ㅅ자 또는 V자 대칭 배치)
            const clusterWidth = (childCount - 1) * minGap;
            const clusterStartX = pCoord.x - clusterWidth / 2;
            const proposedX = clusterStartX + idx * minGap;
            targetX = Math.max(lastPlaced + minGap, proposedX);
          } else {
            // 루트 노드 (출발곡)
            targetX = Math.max(START_X, lastPlaced + minGap);
          }

          items.push({ node: child, x: targetX, y });
          nodeCoords.set(child.nodeId, { x: targetX, y });

          if (isArtist) {
            lastArtistX = targetX;
          } else {
            lastSongX = targetX;
          }
        });
      });
    }

    const maxCanvasX = Math.max(lastSongX, lastArtistX, START_X + 420);
    const canvasWidth = Math.max(760, maxCanvasX + 180);

    // 2. 에지 목록 추출 (상하 레이어 간 크로스 레이어 사선 에지)
    const edgeKeySet = new Set<string>();
    const edgeList: {
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      roleLabels: string[];
      isCurrentPath: boolean;
      isPending: boolean;
      isSameLayer: boolean;
    }[] = [];

    const addEdge = (parentNode: ExplorationNode, childNode: ExplorationNode) => {
      const edgeKey = `${parentNode.nodeId}->${childNode.nodeId}`;
      if (edgeKeySet.has(edgeKey)) return;
      edgeKeySet.add(edgeKey);

      const parentCoord = nodeCoords.get(parentNode.nodeId);
      const childCoord = nodeCoords.get(childNode.nodeId);
      if (!parentCoord || !childCoord) return;

      const rawRoles =
        childNode.nodeType === "person"
          ? childNode.viaRoleLabels && childNode.viaRoleLabels.length > 0
            ? childNode.viaRoleLabels
            : childNode.viaRoleCodes?.map((r) => ROLE_LABELS[r] || "크레딧") || []
          : childNode.viaPerson?.roleLabels && childNode.viaPerson.roleLabels.length > 0
          ? childNode.viaPerson.roleLabels
          : parentNode.viaRoleLabels || [];

      // 노드 경계면 접점 오프셋 계산 (상하 레일 방향에 맞춘 수직/대각선 진출입)
      const isSameLayer = parentNode.nodeType === childNode.nodeType;
      const fromOffsetY = parentNode.nodeType === "song"
        ? (childCoord.y < parentCoord.y ? -26 : 26) // 노래(하단) ➔ 인물(상단)으로 상향 진출
        : (childCoord.y > parentCoord.y ? 18 : -18); // 인물(상단) ➔ 노래(하단)으로 하향 진출

      const toOffsetY = childNode.nodeType === "song"
        ? (parentCoord.y < childCoord.y ? -26 : 26) // 인물(상단) ➔ 노래(하단)으로 상단면 진입
        : (parentCoord.y > childCoord.y ? 18 : -18);

      edgeList.push({
        id: edgeKey,
        fromX: parentCoord.x,
        fromY: parentCoord.y + fromOffsetY,
        toX: childCoord.x,
        toY: childCoord.y + toOffsetY,
        roleLabels: rawRoles,
        isCurrentPath: childNode.isCurrent || childNode.isPending === true,
        isPending: childNode.isPending === true,
        isSameLayer
      });
    };

    tree.forEach((node) => {
      if (node.parentNodeId) {
        const pNode = nodeMap.get(node.parentNodeId);
        if (pNode) addEdge(pNode, node);
      }
      node.childrenNodeIds.forEach((cid) => {
        const cNode = nodeMap.get(cid);
        if (cNode) addEdge(node, cNode);
      });
    });

    return {
      layoutItems: items,
      width: canvasWidth,
      height: CANVAS_HEIGHT,
      edges: edgeList
    };
  }, [tree]);

  // 현재 활성 노드로 자동 포커스 스크롤
  const centerOnActiveNode = useCallback(
    (smooth = true) => {
      if (!containerRef.current || layoutItems.length === 0) return;
      const activeItem =
        layoutItems.find((item) => item.node.nodeId === currentNodeId) ||
        layoutItems.find((item) => item.node.isCurrent) ||
        layoutItems[layoutItems.length - 1];

      if (activeItem) {
        const container = containerRef.current;
        const targetLeft = Math.max(0, activeItem.x * zoom - container.clientWidth / 2);
        const targetTop = Math.max(0, activeItem.y * zoom - container.clientHeight / 2);
        container.scrollTo({
          left: targetLeft,
          top: targetTop,
          behavior: smooth ? "smooth" : "auto"
        });
      }
    },
    [layoutItems, currentNodeId, zoom]
  );

  useEffect(() => {
    centerOnActiveNode(true);
  }, [currentNodeId, tree.length, centerOnActiveNode]);

  // 마우스 드래그 패닝 (Grab & Pan) 핸들러
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasDraggedRef.current = true;
    }
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleNodeClick = (node: ExplorationNode) => {
    if (hasDraggedRef.current) return;
    onSelectNode(node);
  };

  // 모바일 높이 클래스 계산
  const mobileViewportClass =
    mobileHeightMode === "fold"
      ? "h-0 overflow-hidden border-0 py-0"
      : mobileHeightMode === "expand"
      ? "h-[380px]"
      : "h-[220px]";

  return (
    <div
      className={`w-full bg-[#090A0F] border border-slate-800 rounded-xl flex flex-col overflow-hidden ${className}`}
    >
      {/* 1. 상단 컨트롤 & 2-Mode Bipartite Network 헤더 */}
      <div className="px-3.5 py-2.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 bg-[#0D1117]">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-black text-white tracking-tight whitespace-nowrap break-keep">
            2-Mode Bipartite Network
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline whitespace-nowrap break-keep">
            (노래 ⟷ 인물·그룹 이원 그래프)
          </span>
        </div>

        {/* 모바일 전용 맵 높이 3단계 토글 */}
        <div className="flex lg:hidden items-center bg-[#141923] border border-slate-800 rounded-md p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setMobileHeightMode("fold")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "fold" ? "bg-emerald-500 text-slate-950" : "text-slate-400"
            }`}
          >
            접기
          </button>
          <button
            type="button"
            onClick={() => setMobileHeightMode("default")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "default" ? "bg-emerald-500 text-slate-950" : "text-slate-400"
            }`}
          >
            기본
          </button>
          <button
            type="button"
            onClick={() => setMobileHeightMode("expand")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "expand" ? "bg-emerald-500 text-slate-950" : "text-slate-400"
            }`}
          >
            크게
          </button>
        </div>

        {/* 범례 */}
        <div className="hidden sm:flex items-center gap-2.5 text-[10px] text-slate-400 shrink-0">
          <span className="inline-flex items-center gap-1 whitespace-nowrap break-keep">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            출발곡
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap break-keep">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            곡 (LP)
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap break-keep">
            <span className="w-3 h-2 rounded-sm bg-amber-400 inline-block" />
            아티스트
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap break-keep">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            목표곡
          </span>
        </div>
      </div>

      {/* 2. 양방향 패닝 & 줌 지원 SVG 캔버스 뷰포트 (PC 세로 620px) */}
      <div className={`relative w-full transition-all duration-200 ${mobileViewportClass} lg:h-[620px]`}>
        {/* 우측 상단 플로팅 줌/포커스 컨트롤 */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-[#0D1117]/90 border border-slate-800 rounded-lg p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            title="축소"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="100% 배율 초기화"
            className="px-1.5 py-0.5 text-[10px] font-bold text-slate-300 hover:text-white rounded"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
            title="확대"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => centerOnActiveNode(true)}
            title="현재 노드로 포커스 이동"
            className="p-1 text-emerald-400 hover:bg-slate-800 rounded transition-colors border-l border-slate-800 ml-0.5 pl-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 스크롤 및 드래그 패닝 컨테이너 */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`w-full h-full overflow-auto select-none ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{
            backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
        >
          <div
            style={{
              width: `${width * zoom}px`,
              height: `${height * zoom}px`,
              minWidth: "100%",
              minHeight: "100%"
            }}
            className="flex items-center justify-start"
          >
            <svg
              width={width * zoom}
              height={height * zoom}
              viewBox={`0 0 ${width} ${height}`}
              className="block"
            >
              {/* ---------------------------------------------------- */}
              {/* 1. 2-Mode Bipartite 수평 레일 가이드선 & 레이어 배지     */}
              {/* ---------------------------------------------------- */}
              <g className="bipartite-rails opacity-75 pointer-events-none">
                {/* (A) 상단 ARTIST LAYER 레일 */}
                <line
                  x1="12"
                  y1={ARTIST_LAYER_Y}
                  x2={width - 12}
                  y2={ARTIST_LAYER_Y}
                  stroke="#065f46"
                  strokeWidth="1.2"
                  strokeDasharray="6 4"
                />
                <rect
                  x="12"
                  y={ARTIST_LAYER_Y - 12}
                  width="146"
                  height="24"
                  rx="5"
                  fill="#064e3b"
                  fillOpacity="0.5"
                  stroke="#059669"
                  strokeWidth="1"
                />
                <text
                  x="20"
                  y={ARTIST_LAYER_Y + 4}
                  fill="#34d399"
                  fontSize="9"
                  fontWeight="900"
                  letterSpacing="0.4"
                >
                  ARTIST LAYER (65.6K)
                </text>

                {/* (B) 하단 SONG LAYER 레일 */}
                <line
                  x1="12"
                  y1={SONG_LAYER_Y}
                  x2={width - 12}
                  y2={SONG_LAYER_Y}
                  stroke="#312e81"
                  strokeWidth="1.2"
                  strokeDasharray="6 4"
                />
                <rect
                  x="12"
                  y={SONG_LAYER_Y - 12}
                  width="138"
                  height="24"
                  rx="5"
                  fill="#1e1b4b"
                  fillOpacity="0.5"
                  stroke="#6366f1"
                  strokeWidth="1"
                />
                <text
                  x="20"
                  y={SONG_LAYER_Y + 4}
                  fill="#a5b4fc"
                  fontSize="9"
                  fontWeight="900"
                  letterSpacing="0.4"
                >
                  SONG LAYER (202.4K)
                </text>
              </g>

              {/* ---------------------------------------------------- */}
              {/* 2. 크로스 레이어 교차 에지 및 순수 역할 태그 렌더링       */}
              {/* ---------------------------------------------------- */}
              {edges.map((edge) => {
                let pathData: string;
                if (edge.isSameLayer) {
                  // 그룹 ⟷ 멤버 간 동일 층 아크
                  const arcH = 32;
                  pathData = `M ${edge.fromX} ${edge.fromY} Q ${(edge.fromX + edge.toX) / 2} ${
                    edge.fromY - arcH
                  } ${edge.toX} ${edge.toY}`;
                } else {
                  // 상하 교차 사선 베지어 (V자 또는 ㅅ자 다중 에지)
                  const dy = (edge.toY - edge.fromY) * 0.45;
                  pathData = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${
                    edge.fromY + dy
                  }, ${edge.toX} ${edge.toY - dy}, ${edge.toX} ${edge.toY}`;
                }

                const midX = (edge.fromX + edge.toX) / 2;
                const midY = (edge.fromY + edge.toY) / 2;
                const roleText = edge.roleLabels.slice(0, 2).join("·");

                return (
                  <g key={edge.id}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={
                        edge.isPending
                          ? "#f59e0b"
                          : edge.isCurrentPath
                          ? "#10b981"
                          : "#334155"
                      }
                      strokeWidth={edge.isCurrentPath ? 2.2 : 1.5}
                      strokeDasharray={edge.isPending ? "5 4" : undefined}
                    />

                    {roleText && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x="-24"
                          y="-8"
                          width="48"
                          height="16"
                          rx="4"
                          fill="#090A0F"
                          stroke={
                            edge.isPending
                              ? "#f59e0b"
                              : edge.isCurrentPath
                              ? "#10b981"
                              : "#334155"
                          }
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fill={
                            edge.isPending
                              ? "#fcd34d"
                              : edge.isCurrentPath
                              ? "#6ee7b7"
                              : "#94a3b8"
                          }
                          fontSize="8.5"
                          fontWeight="bold"
                        >
                          {roleText}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ---------------------------------------------------- */}
              {/* 3. 2-Mode 이종 기하학 노드 렌더링                       */}
              {/* ---------------------------------------------------- */}
              {layoutItems.map(({ node, x, y }) => {
                const isSong = node.nodeType === "song";
                const isCurrent = node.isCurrent || node.nodeId === currentNodeId;
                const isPending = node.isPending === true;
                const isStart = node.isStart === true;
                const isTarget =
                  node.isTarget === true ||
                  (targetSong && node.song && isMatchingTargetSong(node.song, targetSong)) ||
                  (targetSong && node.songId === targetSong.id);

                // ====================================================
                // (A) 노래 노드: 정원형 바이닐 레코드판 (LP Disc) + 하단 네임플레이트
                // ====================================================
                if (isSong && node.song) {
                  const labelColor = isStart
                    ? "#10b981"
                    : isTarget
                    ? "#f59e0b"
                    : isCurrent
                    ? "#06b6d4"
                    : "#475569";

                  const rimColor = isCurrent
                    ? "#22d3ee"
                    : isStart
                    ? "#10b981"
                    : isTarget
                    ? "#f59e0b"
                    : "#334155";

                  const titleShort =
                    node.song.title.length > 10
                      ? `${node.song.title.slice(0, 9)}…`
                      : node.song.title;
                  const artistShort =
                    node.song.artist.length > 11
                      ? `${node.song.artist.slice(0, 10)}…`
                      : node.song.artist;

                  return (
                    <g
                      key={node.nodeId}
                      transform={`translate(${x}, ${y})`}
                      onClick={() => handleNodeClick(node)}
                      className="cursor-pointer group"
                    >
                      {/* 활성 곡 외곽 포커스 링 */}
                      {isCurrent && (
                        <circle
                          cx="0"
                          cy="0"
                          r="32"
                          fill="none"
                          stroke={isStart ? "#10b981" : "#22d3ee"}
                          strokeWidth="1.8"
                          strokeDasharray="4 3"
                        />
                      )}

                      {/* 정원형 바이닐 LP 디스크 (현재 위치 곡일 때 부드럽게 회전) */}
                      <g
                        className={isCurrent ? "animate-[spin_8s_linear_infinite]" : ""}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }}
                      >
                        {/* LP 외곽 검은 비닐 바디 */}
                        <circle
                          cx="0"
                          cy="0"
                          r="26"
                          fill="#0B0E14"
                          stroke={rimColor}
                          strokeWidth={isCurrent || isStart || isTarget ? "2.2" : "1.5"}
                        />
                        {/* LP 동심원 트랙 그루브 디테일 */}
                        <circle
                          cx="0"
                          cy="0"
                          r="21"
                          fill="none"
                          stroke="#1E293B"
                          strokeWidth="0.9"
                          strokeDasharray="10 4"
                        />
                        <circle
                          cx="0"
                          cy="0"
                          r="16"
                          fill="none"
                          stroke="#1E293B"
                          strokeWidth="0.9"
                          strokeDasharray="6 3"
                        />
                        {/* LP 센터 컬러 스티커 라벨 */}
                        <circle cx="0" cy="0" r="10" fill={labelColor} />
                        {/* LP 센터 스핀들 홀 */}
                        <circle cx="0" cy="0" r="3" fill="#090A0F" />
                      </g>

                      {/* START / TARGET 상단 미니 태그 */}
                      {(isStart || isTarget) && (
                        <g transform="translate(0, -36)">
                          <rect
                            x="-22"
                            y="-7"
                            width="44"
                            height="13"
                            rx="3"
                            fill={isStart ? "#10b981" : "#f59e0b"}
                          />
                          <text
                            x="0"
                            y="2"
                            textAnchor="middle"
                            fill="#090A0F"
                            fontSize="7.5"
                            fontWeight="900"
                          >
                            {isStart ? "START" : "TARGET"}
                          </text>
                        </g>
                      )}

                      {/* 하단 네임플레이트 (곡 제목 & 아티스트) */}
                      <g transform="translate(0, 38)">
                        <rect
                          x="-56"
                          y="-10"
                          width="112"
                          height="28"
                          rx="5"
                          fill="#0D1117"
                          stroke={isCurrent ? rimColor : "#1E293B"}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="1"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9.5"
                          fontWeight="bold"
                        >
                          {titleShort}
                        </text>
                        <text x="0" y="12" textAnchor="middle" fill="#94A3B8" fontSize="8">
                          {artistShort}
                        </text>
                      </g>
                    </g>
                  );
                }

                // ====================================================
                // (B) 아티스트/그룹 노드: 컴팩트 육각/슬림 캡슐 (노래 LP와 기하학적 완전 차별화)
                // ====================================================
                const isGroup = node.isGroup === true;
                const personName = node.personName || "아티스트";
                const nameShort =
                  personName.length > 8 ? `${personName.slice(0, 7)}…` : personName;

                const strokeColor = isPending
                  ? "#f59e0b"
                  : isCurrent
                  ? "#fbbf24"
                  : isGroup
                  ? "#38bdf8"
                  : "#cbd5e1";

                return (
                  <g
                    key={node.nodeId}
                    transform={`translate(${x}, ${y})`}
                    onClick={() => handleNodeClick(node)}
                    className="cursor-pointer group"
                  >
                    {/* 육각형/슬림 다이아몬드 캡슐 바디 */}
                    <polygon
                      points="-46,0 -36,-17 36,-17 46,0 36,17 -36,17"
                      fill={isPending || isCurrent ? "#1C160B" : "#121722"}
                      stroke={strokeColor}
                      strokeWidth={isPending || isCurrent ? "2" : "1.3"}
                      strokeDasharray={isPending ? "4 2" : undefined}
                    />

                    <text
                      x="0"
                      y="-2"
                      textAnchor="middle"
                      fill={isPending || isCurrent ? "#FDE68A" : "#F8FAFC"}
                      fontSize="9.5"
                      fontWeight="bold"
                    >
                      {nameShort}
                    </text>

                    <text
                      x="0"
                      y="10"
                      textAnchor="middle"
                      fill={isPending ? "#F59E0B" : isGroup ? "#38BDF8" : "#94A3B8"}
                      fontSize="7.5"
                      fontWeight="bold"
                    >
                      {isPending ? "곡 선택 대기" : isGroup ? "GROUP" : "ARTIST"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* 모바일 접기 상태일 때 안내 바 */}
      {mobileHeightMode === "fold" && (
        <button
          type="button"
          onClick={() => setMobileHeightMode("default")}
          className="lg:hidden w-full py-2 px-3 bg-[#0D1117] text-[11px] font-bold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 border-t border-slate-800/80"
        >
          <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>탐험 맵 펼치기 (현재 노드 {tree.length}개 기록됨)</span>
        </button>
      )}
    </div>
  );
}
