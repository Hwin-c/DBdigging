"use client";

import React, { useState } from "react";
import { RoleCode, SongInfo } from "@/lib/graph/types";
import {
  Waves,
  Heart,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
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

  // 다이버 등급 칭호 산정
  const getDiverTitle = (depth: number) => {
    if (depth >= 1300) {
      return {
        title: "🔱 마리아나 트렌치 마스터",
        desc: "심해 1300m 돌파! K-Pop 크레딧 해구의 절대 강자",
        color: "from-cyan-400 via-teal-300 to-emerald-400"
      };
    } else if (depth >= 800) {
      return {
        title: "🌊 심해 탐험가 (Abyss Explorer)",
        desc: "칠흑 같은 K-Pop 계보를 꿰뚫어 본 베테랑 디거",
        color: "from-indigo-400 via-purple-300 to-pink-400"
      };
    } else if (depth >= 400) {
      return {
        title: "🤿 스쿠버 디거 (Scuba Digger)",
        desc: "안정적인 산소 공급으로 심해 중층부를 정복한 다이버",
        color: "from-blue-400 to-cyan-300"
      };
    } else {
      return {
        title: "🫧 스노클링 디거 (Snorkel Digger)",
        desc: "K-Pop 얕은 바다를 유영하며 가볍게 몸을 푼 디깅 입문자",
        color: "from-slate-300 to-teal-300"
      };
    }
  };

  const titleInfo = getDiverTitle(finalDepth);

  // ----------------------------------------------------
  // 바이럴 공유 텍스트 동적 생성
  // ----------------------------------------------------
  const buildShareText = () => {
    const header = `🌊 디비디깅 (DBDIGGING) 심해 디깅 결과!\n수심 ${finalDepth}m 도달 🤿 (${titleInfo.title})\n총 ${diveHistory.length}곡의 심해 플레이리스트 완성!`;

    const playlistSummary = diveHistory
      .slice(0, 5)
      .map((item, idx) => {
        const status = idx === 0 ? "🚩 출발" : item.isValid ? "✅" : "💔";
        return `${idx + 1}. ${item.song.title} - ${item.song.artist} [${status}]`;
      })
      .join("\n");

    const moreText = diveHistory.length > 5 ? `\n...외 ${diveHistory.length - 5}곡` : "";

    return `${header}\n\n[심해 플레이리스트]\n${playlistSummary}${moreText}\n\n너도 K-Pop 심해 어디까지 갈 수 있는지 도전해볼래?\nhttps://db-digging.web.app\n#디비디깅 #심해디깅 #KPOP`;
  };

  const shareText = buildShareText();

  // ① 𝕏 Twitter 공유
  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ② @ Threads 공유
  const handleShareThreads = () => {
    const url = `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ③ 💬 카카오톡 / 모바일 공유 (Web Share API)
  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "디비디깅 심해 디깅 결과!",
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

  // ④ 📋 텍스트 클립보드 복사
  const handleClipboardCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setHasCopied(true);
      onShowToast("클립보드에 복사되었습니다! 커뮤니티에 공유해보세요 📋", "success");
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      onShowToast("복사에 실패했습니다.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-[#0a1628] via-[#071322] to-[#0a1628] border border-cyan-500/40 rounded-3xl max-w-xl w-full p-6 shadow-[0_0_50px_rgba(6,182,212,0.3)] relative my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Header: Depth & Title */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.35)] animate-bounce">
            <Waves className="w-9 h-9" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            다이빙 종료! 최종 수심 <span className="text-cyan-300">{finalDepth}m</span>
          </h2>

          {/* Diver Title Badge */}
          <div className="pt-2">
            <div
              className={`inline-block px-4 py-1.5 rounded-full font-black text-xs text-slate-950 bg-gradient-to-r ${titleInfo.color} shadow-md`}
            >
              {titleInfo.title}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{titleInfo.desc}</p>
          </div>
        </div>

        {/* 2. '🎶 나만의 심해 디깅 플레이리스트' Card */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
              <Music className="w-4 h-4 text-cyan-400" />
              <span>나만의 심해 디깅 플레이리스트 ({diveHistory.length}곡)</span>
            </div>
            <span className="text-[10px] text-slate-400">클릭 시 멜론에서 바로 재생</span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 border border-slate-800/80 bg-slate-950/70 p-2.5 rounded-2xl">
            {diveHistory.map((step, idx) => {
              const isStart = idx === 0;

              return (
                <div
                  key={`${step.song.id}_${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all text-left group"
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
                        {step.song.artist} • {step.song.year}년 • {step.song.agency || "미분류"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isStart
                          ? "bg-slate-800 text-slate-300"
                          : step.isValid
                            ? "bg-cyan-950 text-cyan-300 border border-cyan-500/30"
                            : "bg-rose-950 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {isStart ? "출발" : step.isValid ? "+100m" : "💔 -1"}
                    </span>

                    {/* Melon Deep Link Button */}
                    <a
                      href={step.melonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="멜론 곡 상세정보 열기"
                      className="flex items-center gap-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
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

        {/* 3. 한국형 4대 바이럴 공유 액션 버튼 그룹 */}
        <div className="space-y-2 mb-6">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            내 수심 자랑하기 (4대 바이럴 공유 허브)
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleShareTwitter}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-black hover:bg-neutral-900 text-white font-bold text-xs border border-neutral-800 transition-all active:scale-95"
            >
              <span className="font-serif font-black text-sm">𝕏</span>
              <span>트위터 공유</span>
            </button>

            <button
              onClick={handleShareThreads}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs border border-neutral-700 transition-all active:scale-95"
            >
              <span className="font-bold text-sm">@</span>
              <span>Threads 공유</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#FEE500] hover:bg-[#FADA0A] text-[#191919] font-black text-xs transition-all active:scale-95 shadow-sm"
            >
              <span>💬</span>
              <span>카카오톡 / 모바일</span>
            </button>

            <button
              onClick={handleClipboardCopy}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all active:scale-95 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
            >
              {hasCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{hasCopied ? "복사 완료!" : "텍스트 복사"}</span>
            </button>
          </div>
        </div>

        {/* 4. Bottom Controls: Restart & Close */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onRestartDive}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>새 다이빙 시작</span>
            </button>

            {onOpenStats && (
              <button
                onClick={onOpenStats}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 border border-cyan-500/40 text-xs font-bold transition-all"
              >
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>내 전적 보기</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
