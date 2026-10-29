"use client";

import React, { useState, useEffect } from "react";
import { RoleCode, SongInfo } from "@/lib/graph/types";
import { getGraphEngine } from "@/lib/graph/engine";
import { getMelonSongUrl } from "@/lib/graph/types";
import { RoleBadgeList } from "@/components/common/Badge";
import {
  ExternalLink,
  Sparkles,
  X,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  HelpCircle
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
  onSwitchToPractice
}: GiveUpModalProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [pathItems, setPathItems] = useState<PathNodeItem[]>([]);
  const [optimalTurns, setOptimalTurns] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setIsRevealed(false);
      setPathItems([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRevealSolution = () => {
    const engine = getGraphEngine();
    const res = engine.findShortestPath(startSong.id, targetSong.id);
    if (!res.found) {
      setIsRevealed(true);
      return;
    }

    setOptimalTurns(res.turns);
    const items: PathNodeItem[] = [];

    for (let i = 0; i < res.typedPath.length; i++) {
      const typedKey = res.typedPath[i];
      const prefix = typedKey.slice(0, 2);
      const id = typedKey.slice(2);

      if (prefix === "s:") {
        const s = engine.getSong(id);
        items.push({
          type: "song",
          id,
          name: s ? s.title : `Song (${id})`,
          subText: s ? `${s.artist} · ${s.year}년 · ${s.genre}` : undefined,
          melonUrl: getMelonSongUrl(id)
        });
      } else if (prefix === "p:") {
        const p = engine.getPerson(id);
        let roles: RoleCode[] = [];
        const prevKey = i > 0 ? res.typedPath[i - 1] : null;
        const nextKey = i < res.typedPath.length - 1 ? res.typedPath[i + 1] : null;

        if (prevKey && prevKey.startsWith("s:")) {
          roles = engine.getRolesBetween(prevKey.slice(2), id);
        } else if (nextKey && nextKey.startsWith("s:")) {
          roles = engine.getRolesBetween(nextKey.slice(2), id);
        } else {
          roles = [6];
        }

        items.push({
          type: "person",
          id,
          name: p?.name || "아티스트",
          subText: p?.isGroup ? "GROUP" : "ARTIST",
          isGroup: p?.isGroup,
          roles
        });
      }
    }

    setPathItems(items);
    setIsRevealed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-[#0D1117] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {!isRevealed ? (
          <div className="flex flex-col items-center text-center space-y-4 py-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-black text-white break-keep">
                최단 정답 경로를 확인하시겠습니까?
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm break-keep">
                정답을 확인하면 이번 퀘스트의 최적 최단 경로가 즉시 공개됩니다.
              </p>
            </div>

            <div className="w-full bg-[#121721] border border-slate-800 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2">
              <div className="text-left min-w-0 flex-1">
                <span className="text-[9px] text-emerald-400 font-black tracking-wider block">
                  START
                </span>
                <span className="text-white font-bold truncate block">{startSong.title}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
              <div className="text-right min-w-0 flex-1">
                <span className="text-[9px] text-amber-400 font-black tracking-wider block">
                  TARGET
                </span>
                <span className="text-white font-bold truncate block">{targetSong.title}</span>
              </div>
            </div>

            <div className="w-full flex items-center gap-2.5 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#161C28] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm border border-slate-700 transition-all break-keep"
              >
                계속 풀어보기
              </button>
              <button
                onClick={handleRevealSolution}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm transition-all active:scale-95 break-keep"
              >
                <HelpCircle className="w-4 h-4" />
                <span>정답 공개</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden space-y-4 py-1">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>최단 경로 정답 ({optimalTurns}턴)</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white break-keep">
                최적 크레딧 징검다리 경로
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[50vh]">
              {pathItems.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === pathItems.length - 1;

                if (item.type === "song") {
                  return (
                    <div key={`path_song_${idx}`} className="space-y-1.5">
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                          isFirst
                            ? "bg-emerald-500/10 border-emerald-500/40"
                            : isLast
                            ? "bg-amber-500/10 border-amber-500/40"
                            : "bg-[#121721] border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`px-2 py-1 rounded-md font-black text-[10px] shrink-0 ${
                              isFirst
                                ? "bg-emerald-500 text-slate-950"
                                : isLast
                                ? "bg-amber-400 text-slate-950"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {isFirst ? "START" : isLast ? "TARGET" : "TRACK"}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                              {item.name}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">{item.subText}</p>
                          </div>
                        </div>

                        {item.melonUrl && (
                          <a
                            href={item.melonUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                            title="멜론에서 듣기"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {!isLast && (
                        <div className="flex justify-center text-slate-600">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                } else {
                  return (
                    <div key={`path_person_${idx}`} className="space-y-1.5">
                      <div className="p-2.5 rounded-lg bg-[#161C28] border border-slate-700 flex items-center justify-between mx-4 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                            {item.isGroup ? "GROUP" : "ARTIST"}
                          </span>
                          <span className="text-xs font-bold text-white truncate">{item.name}</span>
                        </div>
                        {item.roles && item.roles.length > 0 && (
                          <RoleBadgeList roles={item.roles} size="sm" />
                        )}
                      </div>

                      <div className="flex justify-center text-slate-600">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            <div className="pt-2 flex items-center gap-2.5">
              {onSwitchToPractice && (
                <button
                  onClick={() => {
                    onClose();
                    onSwitchToPractice();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-[#161C28] hover:bg-slate-800 text-white font-bold text-xs border border-slate-700 transition-colors break-keep"
                >
                  맞춤 디깅으로 전환
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all break-keep"
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
