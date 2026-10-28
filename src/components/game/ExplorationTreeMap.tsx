"use client";

import React, { useRef, useEffect } from "react";
import { RoleCode, SongInfo } from "@/lib/graph/types";
import { Disc3, Flag, Target, Sparkles, CornerDownRight } from "lucide-react";

export interface ExplorationNode {
  nodeId: string;
  songId: string;
  song: SongInfo;
  depth: number;
  parentNodeId?: string;
  viaPerson?: {
    id: string;
    name: string;
    roles: RoleCode[];
    roleLabels: string[];
  };
  childrenNodeIds: string[];
  isCurrent: boolean;
  isStart: boolean;
  isTarget?: boolean;
}

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

  // 1. 트리 레이아웃 좌표 계산 (Depth별 X좌표 + 형제 분기별 Y좌표 배치)
  const { layoutItems, width, height, edges } = React.useMemo(() => {
    if (tree.length === 0) {
      return { layoutItems: [], width: 400, height: 200, edges: [] };
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

    const NODE_WIDTH = 130;
    const X_GAP = 90;
    const Y_GAP = 95;
    const START_X = 40;
    const START_Y = 50;

    // 각 depth 그룹 내에서 Y좌표 분배
    const items: LayoutItem[] = [];
    const nodeCoords = new Map<string, { x: number; y: number }>();

    let maxItemsInAnyDepth = 1;
    depthGroups.forEach((group) => {
      if (group.length > maxItemsInAnyDepth) {
        maxItemsInAnyDepth = group.length;
      }
    });

    const canvasHeight = Math.max(220, maxItemsInAnyDepth * Y_GAP + 100);
    const canvasWidth = Math.max(460, (maxDepth + 2) * (NODE_WIDTH + X_GAP) + 100);

    depthGroups.forEach((group, depth) => {
      const count = group.length;
      const totalGroupHeight = (count - 1) * Y_GAP;
      const startY = (canvasHeight - totalGroupHeight) / 2;

      group.forEach((node, idx) => {
        const x = START_X + depth * (NODE_WIDTH + X_GAP);
        const y = count === 1 ? canvasHeight / 2 : startY + idx * Y_GAP;

        items.push({ node, x, y });
        nodeCoords.set(node.nodeId, { x, y });
      });
    });

    // 에지 목록 추출
    const edgeList: {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      viaPerson?: ExplorationNode["viaPerson"];
      isCurrentPath: boolean;
    }[] = [];

    tree.forEach((node) => {
      if (node.parentNodeId) {
        const parentCoord = nodeCoords.get(node.parentNodeId);
        const childCoord = nodeCoords.get(node.nodeId);
        if (parentCoord && childCoord) {
          edgeList.push({
            fromX: parentCoord.x + NODE_WIDTH,
            fromY: parentCoord.y,
            toX: childCoord.x,
            toY: childCoord.y,
            viaPerson: node.viaPerson,
            isCurrentPath: node.isCurrent
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

  // 현재 노드로 자동 스크롤
  useEffect(() => {
    if (!containerRef.current || !currentNodeId) return;
    const currentItem = layoutItems.find((i) => i.node.nodeId === currentNodeId);
    if (currentItem) {
      containerRef.current.scrollTo({
        left: Math.max(0, currentItem.x - 120),
        behavior: "smooth"
      });
    }
  }, [currentNodeId, layoutItems]);

  return (
    <div
      className={`relative w-full bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3 backdrop-blur-md overflow-hidden flex flex-col shadow-inner ${className}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800/80 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            실시간 미지 탐험 트리
          </span>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            • 노드 클릭 시 해당 지점으로 되돌아갑니다
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            출발
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            현재
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            목표
          </span>
        </div>
      </div>

      {/* SVG Tree Canvas Viewport */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto overflow-y-hidden no-scrollbar relative min-h-[180px] max-h-[260px] cursor-grab active:cursor-grabbing select-none"
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
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            {/* Dimmed Line Gradient */}
            <linearGradient id="dimmedLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>

          {/* 1. 에지 렌더링 (SVG 직선 & 징검다리 인물 뱃지) */}
          {edges.map((edge, idx) => {
            const midX = (edge.fromX + edge.toX) / 2;
            const midY = (edge.fromY + edge.toY) / 2;

            return (
              <g key={`edge_${idx}`}>
                {/* 직선 연결 에지 */}
                <line
                  x1={edge.fromX}
                  y1={edge.fromY}
                  x2={edge.toX}
                  y2={edge.toY}
                  stroke={edge.isCurrentPath ? "url(#activeNeonLine)" : "url(#dimmedLine)"}
                  strokeWidth={edge.isCurrentPath ? 2.5 : 1.5}
                  strokeDasharray={edge.isCurrentPath ? "none" : "4 2"}
                  className="transition-all duration-500"
                />

                {/* 징검다리 인물명 뱃지 */}
                {edge.viaPerson && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-38"
                      y="-10"
                      width="76"
                      height="20"
                      rx="10"
                      fill="#0f172a"
                      stroke={edge.isCurrentPath ? "#6366f1" : "#334155"}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill={edge.isCurrentPath ? "#c7d2fe" : "#94a3b8"}
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {edge.viaPerson.name.length > 5
                        ? `${edge.viaPerson.name.slice(0, 4)}…`
                        : edge.viaPerson.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. 곡 노드 렌더링 */}
          {layoutItems.map(({ node, x, y }) => {
            const isCurrent = node.isCurrent;
            const isStart = node.isStart;
            const isTarget = node.isTarget;

            return (
              <g
                key={node.nodeId}
                transform={`translate(${x}, ${y - 28})`}
                onClick={() => onSelectNode(node)}
                className="cursor-pointer group"
              >
                {/* 외곽 네온 글로우 링 (현재 노드) */}
                {isCurrent && (
                  <rect
                    x="-4"
                    y="-4"
                    width="138"
                    height="64"
                    rx="16"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2"
                    className="animate-pulse"
                    filter="drop-shadow(0 0 8px rgba(129, 140, 248, 0.6))"
                  />
                )}

                {/* 노드 카드 본체 */}
                <rect
                  x="0"
                  y="0"
                  width="130"
                  height="56"
                  rx="12"
                  fill={isCurrent ? "#1e1b4b" : isStart ? "#064e3b" : "#0f172a"}
                  stroke={
                    isCurrent
                      ? "#a5b4fc"
                      : isStart
                      ? "#10b981"
                      : isTarget
                      ? "#c084fc"
                      : "#334155"
                  }
                  strokeWidth={isCurrent || isStart ? 1.5 : 1}
                  className="transition-transform duration-200 group-hover:scale-105"
                  opacity={isCurrent || isStart ? 1 : 0.75}
                />

                {/* 상태 뱃지 아이콘 */}
                <g transform="translate(8, 8)">
                  {isStart ? (
                    <Flag className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isCurrent ? (
                    <Disc3 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  ) : isTarget ? (
                    <Target className="w-3.5 h-3.5 text-purple-400" />
                  ) : (
                    <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </g>

                {/* 곡명 (외자/영문/한글 축약) */}
                <text
                  x="26"
                  y="18"
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  className="group-hover:fill-indigo-300 transition-colors"
                >
                  {node.song.title.length > 8
                    ? `${node.song.title.slice(0, 7)}…`
                    : node.song.title}
                </text>

                {/* 아티스트명 */}
                <text x="10" y="34" fill="#94a3b8" fontSize="9.5">
                  {node.song.artist.length > 12
                    ? `${node.song.artist.slice(0, 11)}…`
                    : node.song.artist}
                </text>

                {/* 턴 뎁스 태그 */}
                <text x="10" y="47" fill={isCurrent ? "#a5b4fc" : "#64748b"} fontSize="8.5">
                  {node.depth === 0 ? "출발" : `${node.depth}턴 지점`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
