"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { ExplorationNode, SongInfo, ROLE_LABELS } from "@/lib/graph/types";
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
  width: number;
  height: number;
}

export function ExplorationTreeMap({
  tree,
  currentNodeId,
  targetSong,
  onSelectNode,
  className = ""
}: ExplorationTreeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. 2-Mode 트리 레이아웃 좌표 계산 (Depth별 X좌표 + 형제 분기별 Y좌표)
  const { layoutItems, width, height, edges } = useMemo(() => {
    if (tree.length === 0) {
      return { layoutItems: [], width: 500, height: 260, edges: [] };
    }

    // Depth별 노드 그룹화
    const depthGroups = new Map<number, ExplorationNode[]>();
    tree.forEach((n) => {
      const list = depthGroups.get(n.depth) || [];
      list.push(n);
      depthGroups.set(n.depth, list);
    });

    const maxDepth = Math.max(...Array.from(depthGroups.keys()), 0);

    const SONG_WIDTH = 136;
    const PERSON_WIDTH = 110;
    const X_GAP = 70;
    const Y_GAP = 96;
    const START_X = 36;

    let maxItemsInAnyDepth = 1;
    depthGroups.forEach((group) => {
      if (group.length > maxItemsInAnyDepth) {
        maxItemsInAnyDepth = group.length;
      }
    });

    const canvasHeight = Math.max(260, maxItemsInAnyDepth * Y_GAP + 100);
    // 각 depth별 X 오프셋 누적 계산
    const depthXCoords: number[] = [];
    let currentX = START_X;
    for (let d = 0; d <= maxDepth; d++) {
      depthXCoords[d] = currentX;
      // 홀수 뎁스: person, 짝수 뎁스: song
      const currentWidth = d % 2 === 1 ? PERSON_WIDTH : SONG_WIDTH;
      currentX += currentWidth + X_GAP;
    }

    const canvasWidth = Math.max(540, currentX + 60);

    const items: LayoutItem[] = [];
    const nodeCoords = new Map<string, { x: number; y: number; width: number; height: number }>();

    depthGroups.forEach((group, depth) => {
      const count = group.length;
      const totalGroupHeight = (count - 1) * Y_GAP;
      const startY = (canvasHeight - totalGroupHeight) / 2;

      group.forEach((node, idx) => {
        const isSong = node.nodeType === "song";
        const nodeWidth = isSong ? SONG_WIDTH : PERSON_WIDTH;
        const nodeHeight = isSong ? 56 : 46;

        const x = depthXCoords[depth] ?? START_X + depth * 160;
        const y = count === 1 ? canvasHeight / 2 : startY + idx * Y_GAP;

        const item: LayoutItem = { node, x, y, width: nodeWidth, height: nodeHeight };
        items.push(item);
        nodeCoords.set(node.nodeId, { x, y, width: nodeWidth, height: nodeHeight });
      });
    });

    // 2. 에지 목록 추출 (순수 크레딧 역할만 라벨로 부착)
    const edgeList: {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      roleLabels: string[];
      isCurrentPath: boolean;
      isPending: boolean;
    }[] = [];

    tree.forEach((node) => {
      if (node.parentNodeId) {
        const parentCoord = nodeCoords.get(node.parentNodeId);
        const childCoord = nodeCoords.get(node.nodeId);
        if (parentCoord && childCoord) {
          const roleLabels =
            node.viaRoleLabels && node.viaRoleLabels.length > 0
              ? node.viaRoleLabels
              : node.viaRoleCodes && node.viaRoleCodes.length > 0
              ? node.viaRoleCodes.map((r) => ROLE_LABELS[r] || "크레딧")
              : [];

          edgeList.push({
            fromX: parentCoord.x + parentCoord.width,
            fromY: parentCoord.y,
            toX: childCoord.x,
            toY: childCoord.y,
            roleLabels,
            isCurrentPath: node.isCurrent || node.isPending === true,
            isPending: node.isPending === true
          });
        }
      }
    });

    return {
      layoutItems: items,
      width: canvasWidth,
      height: canvasHeight,
      edges: edgeList
    };
  }, [tree]);

  // 현재 노드로 부드러운 자동 스크롤
  useEffect(() => {
    if (!containerRef.current || !currentNodeId) return;
    const currentItem = layoutItems.find((i) => i.node.nodeId === currentNodeId);
    if (currentItem) {
      containerRef.current.scrollTo({
        left: Math.max(0, currentItem.x - 140),
        behavior: "smooth"
      });
    }
  }, [currentNodeId, layoutItems]);

  return (
    <div
      className={`relative w-full bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 backdrop-blur-md overflow-hidden flex flex-col shadow-inner ${className}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between px-1 pb-3 border-b border-slate-800/80 mb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            2-Mode 이종 탐험 트리
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            (노래 ⟷ 아티스트 교대 네트워크)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            출발곡
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            노래
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-md bg-amber-400" />
            아티스트
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            목표곡
          </span>
        </div>
      </div>

      {/* SVG Canvas Viewport */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto overflow-y-hidden no-scrollbar relative min-h-[220px] max-h-[380px] cursor-grab active:cursor-grabbing select-none"
      >
        <svg
          width={width}
          height={height}
          className="overflow-visible"
          style={{ minWidth: "100%", height: "100%" }}
        >
          <defs>
            {/* Active Glow Gradient */}
            <linearGradient id="activeNeonLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            {/* Dimmed Line Gradient */}
            <linearGradient id="dimmedLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            {/* Pending Pulsing Line */}
            <linearGradient id="pendingLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* 1. 에지 렌더링 (SVG 직선 & 순수 역할 배지) */}
          {edges.map((edge, idx) => {
            const midX = (edge.fromX + edge.toX) / 2;
            const midY = (edge.fromY + edge.toY) / 2;
            const roleText = edge.roleLabels.slice(0, 2).join("·") || "연결";

            return (
              <g key={`edge_${idx}`}>
                <line
                  x1={edge.fromX}
                  y1={edge.fromY}
                  x2={edge.toX}
                  y2={edge.toY}
                  stroke={
                    edge.isPending
                      ? "url(#pendingLine)"
                      : edge.isCurrentPath
                      ? "url(#activeNeonLine)"
                      : "url(#dimmedLine)"
                  }
                  strokeWidth={edge.isCurrentPath || edge.isPending ? 2.5 : 1.5}
                  strokeDasharray={edge.isPending ? "4 3" : edge.isCurrentPath ? "none" : "3 2"}
                  className={edge.isPending ? "animate-pulse" : "transition-all duration-300"}
                />

                {/* 중앙 순수 크레딧 역할 뱃지 */}
                {roleText && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-26"
                      y="-9"
                      width="52"
                      height="18"
                      rx="9"
                      fill="#020617"
                      stroke={edge.isCurrentPath ? "#6366f1" : "#334155"}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill={edge.isCurrentPath ? "#a5b4fc" : "#94a3b8"}
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {roleText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. 2-Mode 노드 렌더링 */}
          {layoutItems.map(({ node, x, y, width: nodeW, height: nodeH }) => {
            const isSong = node.nodeType === "song";
            const isCurrent = node.isCurrent;
            const isPending = node.isPending === true;
            const isStart = node.isStart === true;
            const isTarget = node.isTarget === true;

            // ----------------------------------------------------
            // (A) 🎵 노래 노드: 원형 바이닐(LP) 스타일 앨범 캡슐
            // ----------------------------------------------------
            if (isSong && node.song) {
              return (
                <g
                  key={node.nodeId}
                  transform={`translate(${x}, ${y - nodeH / 2})`}
                  onClick={() => onSelectNode(node)}
                  className="cursor-pointer group"
                >
                  {/* 외곽 네온 글로우 링 (현재 곡 활성화 시) */}
                  {isCurrent && (
                    <rect
                      x="-4"
                      y="-4"
                      width={nodeW + 8}
                      height={nodeH + 8}
                      rx="20"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      className="animate-pulse"
                      filter="drop-shadow(0 0 10px rgba(56, 189, 248, 0.7))"
                    />
                  )}

                  {/* 곡 노드 본체 (바이닐 LP 캡슐) */}
                  <rect
                    x="0"
                    y="0"
                    width={nodeW}
                    height={nodeH}
                    rx="16"
                    fill={isCurrent ? "#0c1e38" : isStart ? "#064e3b" : "#0f172a"}
                    stroke={
                      isCurrent
                        ? "#38bdf8"
                        : isStart
                        ? "#10b981"
                        : isTarget
                        ? "#f59e0b"
                        : "#334155"
                    }
                    strokeWidth={isCurrent || isStart || isTarget ? 1.8 : 1}
                    className="transition-transform duration-200 group-hover:scale-105"
                    opacity={isCurrent || isStart ? 1 : 0.8}
                  />

                  {/* 좌측 LP 바이닐 심볼 */}
                  <g transform="translate(10, 14)">
                    <circle cx="14" cy="14" r="13" fill="#020617" stroke="#334155" strokeWidth="1.5" />
                    <circle cx="14" cy="14" r="7" fill={isCurrent ? "#0284c7" : isStart ? "#059669" : "#1e293b"} />
                    <circle cx="14" cy="14" r="2.5" fill="#ffffff" />
                  </g>

                  {/* 곡명 및 아티스트명 텍스트 */}
                  <g transform="translate(44, 0)">
                    <text
                      x="0"
                      y="20"
                      fill="#ffffff"
                      fontSize="10.5"
                      fontWeight="bold"
                      className="group-hover:fill-sky-300 transition-colors"
                    >
                      {node.song.title.length > 7
                        ? `${node.song.title.slice(0, 6)}…`
                        : node.song.title}
                    </text>
                    <text x="0" y="34" fill="#94a3b8" fontSize="9">
                      {node.song.artist.length > 9
                        ? `${node.song.artist.slice(0, 8)}…`
                        : node.song.artist}
                    </text>
                    <text x="0" y="47" fill={isCurrent ? "#38bdf8" : "#64748b"} fontSize="8" fontWeight="bold">
                      {node.depth === 0 ? "🚩 출발곡" : `${Math.floor(node.depth / 2)}턴 도달`}
                    </text>
                  </g>
                </g>
              );
            }

            // ----------------------------------------------------
            // (B) 👤 아티스트/그룹 노드: 육각형/둥근 캡슐 아바타 스타일
            // ----------------------------------------------------
            const isGroup = node.isGroup === true;
            const personName = node.personName || "아티스트";

            return (
              <g
                key={node.nodeId}
                transform={`translate(${x}, ${y - nodeH / 2})`}
                onClick={() => onSelectNode(node)}
                className="cursor-pointer group"
              >
                {/* 외곽 네온 글로우 (Pending 또는 활성화 시) */}
                {(isPending || isCurrent) && (
                  <rect
                    x="-3"
                    y="-3"
                    width={nodeW + 6}
                    height={nodeH + 6}
                    rx="16"
                    fill="none"
                    stroke={isPending ? "#f59e0b" : isGroup ? "#f43f5e" : "#a855f7"}
                    strokeWidth="2"
                    strokeDasharray={isPending ? "4 3" : "none"}
                    className={isPending ? "animate-pulse" : ""}
                    filter={isPending ? "drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))" : "none"}
                  />
                )}

                {/* 아티스트 캡슐 본체 */}
                <rect
                  x="0"
                  y="0"
                  width={nodeW}
                  height={nodeH}
                  rx="14"
                  fill={isPending ? "#3b1d06" : isGroup ? "#2a0815" : "#1a0b2e"}
                  stroke={
                    isPending
                      ? "#f59e0b"
                      : isGroup
                      ? "#f43f5e"
                      : "#c084fc"
                  }
                  strokeWidth={isPending || isCurrent ? 1.8 : 1}
                  className="transition-transform duration-200 group-hover:scale-105"
                  opacity={isPending || isCurrent ? 1 : 0.85}
                />

                {/* 좌측 아바타 뱃지 */}
                <g transform="translate(10, 13)">
                  <rect
                    x="0"
                    y="0"
                    width="20"
                    height="20"
                    rx="6"
                    fill={isGroup ? "#4c0519" : "#2e1065"}
                    stroke={isGroup ? "#f43f5e" : "#a855f7"}
                    strokeWidth="1"
                  />
                  <text x="10" y="14" textAnchor="middle" fontSize="10">
                    {isGroup ? "👥" : "👤"}
                  </text>
                </g>

                {/* 이름 및 역할 태그 */}
                <g transform="translate(36, 0)">
                  <text
                    x="0"
                    y="19"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="bold"
                    className="group-hover:fill-amber-300 transition-colors"
                  >
                    {personName.length > 6 ? `${personName.slice(0, 5)}…` : personName}
                  </text>
                  <text
                    x="0"
                    y="34"
                    fill={isPending ? "#fbbf24" : isGroup ? "#fb7185" : "#d8b4fe"}
                    fontSize="8.5"
                    fontWeight="bold"
                  >
                    {isPending ? "선택 중 ➔" : isGroup ? "그룹 징검다리" : "크레딧 인물"}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
