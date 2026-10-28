"use client";

import React, { useState, useEffect } from "react";
import { RoleCode, SongInfo } from "@/lib/graph/types";
import { getGraphEngine } from "@/lib/graph/engine";
import { getMelonSongUrl, ROLE_LABELS } from "@/lib/graph/types";
import { RoleBadgeList } from "@/components/common/Badge";
import {
  Flag,
  Target,
  ExternalLink,
  RotateCcw,
  Sparkles,
  X,
  AlertTriangle,
  ArrowDown
} from "lucide-react";

interface GiveUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  startSong: SongInfo;
  targetSong: SongInfo;
  onRestart?: () => void;
  onSwitchToPractice?: () => void;
}

interface PathNodeItem {
  type: "song" | "person";
  id: string;
  name: string;
  subText?: string;
  roles?: RoleCode[];
  isGroup?: boolean;
  melonUrl?: string;
}

export function GiveUpModal({
  isOpen,
  onClose,
  startSong,
  targetSong,
  onRestart,
  onSwitchToPractice
}: GiveUpModalProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [pathItems, setPathItems] = useState<PathNodeItem[]>([]);
  const [optimalTurns, setOptimalTurns] = useState<number>(0);

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setIsRevealed(false);
      setPathItems([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 정답 공개 핸들러 (typedPath 접두사 기반 756개 ID 충돌 100% 방어)
  const handleRevealSolution = () => {
    const engine = getGraphEngine();
    const result = engine.findShortestPath(startSong.id, targetSong.id);

    if (!result.found || !result.typedPath) {
      setIsRevealed(true);
      return;
    }

    setOptimalTurns(result.turns);

    const items: PathNodeItem[] = [];
    const typed = result.typedPath;

    for (let i = 0; i < typed.length; i++) {
      const entry = typed[i];
      const isSong = entry.startsWith("s:");
      const id = entry.slice(2);

      if (isSong) {
        const s = engine.getSong(id);
        items.push({
          type: "song",
          id,
          name: s?.title || "곡",
          subText: s?.artist || "",
          melonUrl: getMelonSongUrl(id)
        });
      } else {
        const p = engine.getPerson(id);
        const prevEntry = i > 0 ? typed[i - 1] : undefined;
        let roles: RoleCode[] = [];

        // 직전 노드가 곡인 경우 역할 조회
        if (prevEntry && prevEntry.startsWith("s:")) {
          roles = engine.getRolesBetween(prevEntry.slice(2), id);
        } else if (prevEntry && prevEntry.startsWith("p:")) {
          roles = [6]; // 그룹 소속
        }

        items.push({
          type: "person",
          id,
          name: p?.name || "인물",
          subText: p?.isGroup ? "그룹" : "개인",
          isGroup: p?.isGroup,
          roles
        });
      }
    }

    setPathItems(items);
    setIsRevealed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0b0f17] border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {!isRevealed ? (
          /* Step 1: Warning Confirm */
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-white">정말 포기하시겠습니까?</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm">
                정답을 확인하면 이번 퀘스트의 최적 최단 경로가 즉시 공개되며, 오늘의 도전은 미클리어로 마감됩니다.
              </p>
            </div>

            {/* Mission summary */}
            <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 text-xs flex items-center justify-between">
              <div className="text-left">
                <span className="text-[10px] text-emerald-400 font-bold block">출발</span>
                <span className="text-white font-bold">{startSong.title}</span>
              </div>
              <span className="text-slate-600 font-bold">➔</span>
              <div className="text-right">
                <span className="text-[10px] text-purple-400 font-bold block">도착</span>
                <span className="text-white font-bold">{targetSong.title}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-all shadow-sm"
              >
                계속 풀어보기
              </button>
              <button
                onClick={handleRevealSolution}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg active:scale-95"
              >
                🏳️ 정답 공개
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Optimal Path Chain Display */
          <div className="flex flex-col h-full overflow-hidden space-y-4 py-2">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>최단 경로 정답 ({optimalTurns}턴)</span>
              </div>
              <h3 className="text-lg font-black text-white">최적 꼬리잡기 징검다리</h3>
            </div>

            {/* Path Items Scroll View */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1 max-h-[50vh]">
              {pathItems.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === pathItems.length - 1;

                if (item.type === "song") {
                  return (
                    <div key={`path_song_${idx}`} className="space-y-2">
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          isFirst
                            ? "bg-emerald-950/40 border-emerald-500/50"
                            : isLast
                            ? "bg-purple-950/40 border-purple-500/50"
                            : "bg-slate-900/60 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isFirst
                                ? "bg-emerald-500/20 text-emerald-400"
                                : isLast
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {isFirst ? "출발" : isLast ? "도착" : "곡"}
                          </div>
                          <div>
                            <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                              {item.name}
                            </h4>
                            <p className="text-[11px] text-slate-400 line-clamp-1">{item.subText}</p>
                          </div>
                        </div>

                        {item.melonUrl && (
                          <a
                            href={item.melonUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                            title="멜론에서 듣기"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Down Arrow between steps */}
                      {!isLast && (
                        <div className="flex justify-center text-slate-600">
                          <ArrowDown className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // Person / Group step
                  return (
                    <div key={`path_person_${idx}`} className="space-y-2">
                      <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between mx-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {item.isGroup ? "그룹" : "인물"}
                          </span>
                          <span className="text-xs font-bold text-indigo-200">{item.name}</span>
                        </div>
                        {item.roles && item.roles.length > 0 && (
                          <RoleBadgeList roles={item.roles} size="sm" />
                        )}
                      </div>

                      <div className="flex justify-center text-slate-600">
                        <ArrowDown className="w-4 h-4" />
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* Bottom Controls */}
            <div className="pt-2 flex items-center gap-3">
              {onSwitchToPractice && (
                <button
                  onClick={() => {
                    onClose();
                    onSwitchToPractice();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors shadow-sm"
                >
                  자유 연습으로 전환
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
