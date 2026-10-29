"use client";

import React, { useState } from "react";
import { RoleCode, SongInfo } from "@/lib/graph/types";
import {
  Waves,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Music,
  X,
  Share2,
  BarChart3
} from "lucide-react";

export interface DiveHistoryStep {
  song: SongInfo;
  viaPerson?: {
    id: string;
    name: string;
    roles: RoleCode[];
    roleLabels: string[];
  };
  isValid: boolean;
  depthAtStep: number;
  melonUrl: string;
  reason?: string;
}

interface DeepSeaResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  finalDepth: number;
  diveHistory: DiveHistoryStep[];
  onRestartDive: () => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
  onOpenStats?: () => void;
}

export function DeepSeaResultModal({
  isOpen,
  onClose,
  finalDepth,
  diveHistory,
  onRestartDive,
  onShowToast,
  onOpenStats
}: DeepSeaResultModalProps) {
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  const getDiverTitle = (depth: number) => {
    if (depth >= 1300) {
      return {
        title: "MARIANA MASTER (마리아나 마스터)",
        desc: "심해 1300m 돌파! K-Pop 크레딧 해구의 최고봉에 도달했습니다.",
        style: "bg-cyan-400 text-slate-950"
      };
    } else if (depth >= 800) {
      return {
        title: "ABYSS EXPLORER (심해 탐험가)",
        desc: "깊은 K-Pop 계보를 꿰뚫어 본 베테랑 다이버입니다.",
        style: "bg-emerald-400 text-slate-950"
      };
    } else if (depth >= 400) {
      return {
        title: "SCUBA DIVER (스쿠버 다이버)",
        desc: "안정적인 산소 관리로 심해 중층부를 정복했습니다.",
        style: "bg-amber-400 text-slate-950"
      };
    } else {
      return {
        title: "SNORKEL DIVER (스노클링 다이버)",
        desc: "K-Pop 바다를 유영하며 가볍게 몸을 푼 다이빙 기록입니다.",
        style: "bg-slate-200 text-slate-950"
      };
    }
  };

  const titleInfo = getDiverTitle(finalDepth);

  const buildShareText = () => {
    const header = `[디비디깅 (DBDIGGING) 심해 디깅 결과]\n수심 ${finalDepth}m 도달 (${titleInfo.title})\n총 ${diveHistory.length}곡의 심해 플레이리스트 완성`;

    const playlistSummary = diveHistory
      .slice(0, 5)
      .map((item, idx) => {
        const status = idx === 0 ? "START" : item.isValid ? "+100m" : "MISS";
        return `${idx + 1}. ${item.song.title} - ${item.song.artist} [${status}]`;
      })
      .join("\n");

    const moreText = diveHistory.length > 5 ? `\n...외 ${diveHistory.length - 5}곡` : "";

    return `${header}\n\n[심해 플레이리스트]\n${playlistSummary}${moreText}\n\nhttps://db-digging.web.app\n#디비디깅 #심해디깅 #KPOP`;
  };

  const shareText = buildShareText();

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareThreads = () => {
    const url = `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "디비디깅 심해 디깅 결과",
          text: shareText,
          url: "https://db-digging.web.app"
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          handleClipboardCopy();
        }
      }
    } else {
      handleClipboardCopy();
    }
  };

  const handleClipboardCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setHasCopied(true);
      onShowToast("클립보드에 복사되었습니다.", "success");
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      onShowToast("복사에 실패했습니다.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-cyan-500/30 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Header: Depth & Title */}
        <div className="text-center space-y-2 mb-5">
          <div className="inline-flex p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-400">
            <Waves className="w-8 h-8" />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight break-keep">
            다이빙 종료 — 최종 수심 <span className="text-cyan-400">{finalDepth}m</span>
          </h2>

          <div className="pt-1.5">
            <div className={`inline-block px-3.5 py-1 rounded-md font-black text-xs ${titleInfo.style}`}>
              {titleInfo.title}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 break-keep">{titleInfo.desc}</p>
          </div>
        </div>

        {/* 2. 심해 디깅 플레이리스트 */}
        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 break-keep">
              <Music className="w-3.5 h-3.5 text-cyan-400" />
              <span>심해 디깅 플레이리스트 ({diveHistory.length}곡)</span>
            </div>
            <span className="text-[10px] text-slate-400">Melon 바로가기 지원</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-slate-800 bg-[#090C12] p-2 rounded-xl">
            {diveHistory.map((step, idx) => {
              const isStart = idx === 0;

              return (
                <div
                  key={`${step.song.id}_${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#121721] border border-slate-800/90 hover:border-cyan-500/40 transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="text-xs font-bold text-slate-500 w-5 text-right shrink-0">
                      {idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white group-hover:text-cyan-300 truncate">
                        {step.song.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {step.song.artist} · {step.song.year}년 · {step.song.agency || "미분류"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                        isStart
                          ? "bg-slate-800 text-slate-300"
                          : step.isValid
                          ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                          : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {isStart ? "START" : step.isValid ? "+100m" : "산소 -1"}
                    </span>

                    <a
                      href={step.melonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="멜론 곡 상세정보 열기"
                      className="flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
                    >
                      <span>Melon</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 공유 액션 버튼 그룹 */}
        <div className="space-y-2 mb-5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            다이빙 기록 공유하기
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleShareTwitter}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#141923] hover:bg-slate-800 text-white font-bold text-xs border border-slate-700 transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-300" />
              <span>X (Twitter) 공유</span>
            </button>

            <button
              onClick={handleShareThreads}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#141923] hover:bg-slate-800 text-white font-bold text-xs border border-slate-700 transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-300" />
              <span>Threads 공유</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>모바일 공유</span>
            </button>

            <button
              onClick={handleClipboardCopy}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              {hasCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{hasCopied ? "복사 완료" : "텍스트 복사"}</span>
            </button>
          </div>
        </div>

        {/* 4. Bottom Controls */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onRestartDive}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>새 다이빙 시작</span>
            </button>

            {onOpenStats && (
              <button
                onClick={onOpenStats}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#161C28] hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition-all whitespace-nowrap break-keep"
              >
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>내 전적 보기</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all whitespace-nowrap break-keep"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
