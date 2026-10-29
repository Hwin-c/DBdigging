"use client";

import React, { useState } from "react";
import { HistoryStep, SongInfo, ROLE_LABELS } from "@/lib/graph/types";
import {
  Trophy,
  Share2,
  Copy,
  Shield,
  Flame,
  Check,
  Compass,
  X,
  BarChart3,
  ArrowRight
} from "lucide-react";

interface ClearModalProps {
  isOpen: boolean;
  onClose: () => void;
  questId: string;
  startSong: SongInfo;
  targetSong: SongInfo;
  turnCount: number;
  optimalTurns: number;
  historyStack: HistoryStep[];
  onPlayAgain?: () => void;
  onSwitchToPractice?: () => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
  onOpenStats?: () => void;
}

export function ClearModal({
  isOpen,
  onClose,
  questId,
  startSong,
  targetSong,
  turnCount,
  optimalTurns,
  historyStack,
  onSwitchToPractice,
  onShowToast,
  onOpenStats
}: ClearModalProps) {
  const [isSpoilerProtected, setIsSpoilerProtected] = useState(true);
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  const turnDiff = turnCount - optimalTurns;
  const ratingBadge =
    turnDiff <= 0
      ? {
          title: "MASTER (최단 경로 달성)",
          desc: "이론상 최단 턴으로 도달한 완벽한 크레딧 감각입니다.",
          style: "bg-amber-400 text-slate-950"
        }
      : turnDiff <= 2
      ? {
          title: "EXCELLENT (최적 경로 근접)",
          desc: "최적 경로에 근접한 훌륭한 크레딧 탐색입니다.",
          style: "bg-emerald-400 text-slate-950"
        }
      : {
          title: "EXPLORER (목표 도달 완료)",
          desc: "넓은 K-Pop 네트워크를 유영하며 목표에 성공적으로 도착했습니다.",
          style: "bg-cyan-400 text-slate-950"
        };

  const buildShareText = () => {
    const isDaily = !questId.startsWith("random_");
    const titleTag = isDaily
      ? `[디비디깅 (DBDIGGING) #${questId}]`
      : `[디비디깅 (DBDIGGING) 맞춤 모드]`;

    let pathString = "";

    if (isSpoilerProtected) {
      const intermediateSteps: string[] = [];
      for (let i = 1; i < historyStack.length; i++) {
        if (historyStack[i].viaPerson) {
          intermediateSteps.push("[ARTIST]");
        }
        if (i < historyStack.length - 1) {
          intermediateSteps.push("[TRACK]");
        }
      }
      pathString = `[START] ${startSong.title} -> ${intermediateSteps.join(" -> ")} -> [TARGET] ${targetSong.title}`;
    } else {
      const fullSteps: string[] = [startSong.title];
      for (let i = 1; i < historyStack.length; i++) {
        const step = historyStack[i];
        if (step.viaPerson) {
          const safeRoles = step.viaPerson.roles ?? [];
          const roleText =
            safeRoles.length > 0 ? `[${safeRoles.map((r) => ROLE_LABELS[r] || r).join("/")}] ` : "";
          fullSteps.push(`${roleText}${step.viaPerson.name}`);
        }
        fullSteps.push(step.song.title);
      }
      pathString = fullSteps.join(" -> ");
    }

    const turnsMsg =
      turnDiff <= 0
        ? `결과: ${turnCount}턴 클리어 (최단 경로 ${optimalTurns}턴 달성)`
        : `결과: ${turnCount}턴 클리어 (최단 경로: ${optimalTurns}턴)`;

    return `${titleTag}\n${pathString}\n${turnsMsg}\n\nhttps://db-digging.web.app\n#디비디깅 #DBDIGGING #KPOP`;
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
          title: "디비디깅 클리어",
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
      <div className="bg-[#0D1117] border border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Header Trophy & Title */}
        <div className="text-center space-y-2 mb-5">
          <div className="inline-flex p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
            <Trophy className="w-8 h-8" />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight break-keep">
            디깅 미션 클리어
          </h2>
          <p className="text-xs text-slate-300 flex items-center justify-center gap-1.5 flex-wrap break-keep">
            <span>{startSong.title}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-amber-300 font-bold">{targetSong.title}</span>
          </p>

          <div className="pt-1.5">
            <div className={`inline-block px-3.5 py-1 rounded-md font-black text-xs ${ratingBadge.style}`}>
              {ratingBadge.title}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 break-keep">{ratingBadge.desc}</p>
          </div>
        </div>

        {/* 2. Turn Statistics */}
        <div className="grid grid-cols-2 gap-3 mb-5 bg-[#121721] p-3.5 rounded-xl border border-slate-800">
          <div className="text-center">
            <div className="text-[11px] text-slate-400 font-semibold break-keep">내 도달 턴 수</div>
            <div className="text-2xl font-black text-white mt-0.5">{turnCount}턴</div>
          </div>
          <div className="text-center border-l border-slate-800">
            <div className="text-[11px] text-slate-400 font-semibold break-keep">최적 최단 경로</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{optimalTurns}턴</div>
          </div>
        </div>

        {/* 3. 스포일러 방지 vs 전체 경로 공개 토글 */}
        <div className="mb-4 bg-[#121721] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {isSpoilerProtected ? (
              <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white break-keep">
                {isSpoilerProtected ? "스포일러 방지 모드" : "전체 경로 공개 모드"}
              </div>
              <div className="text-[10px] text-slate-400 break-keep">
                {isSpoilerProtected
                  ? "경유 노드를 가려 다른 플레이어의 재미를 보호합니다"
                  : "거쳐온 모든 아티스트와 곡 실명을 그대로 표시합니다"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSpoilerProtected(!isSpoilerProtected)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap break-keep shrink-0 ${
              isSpoilerProtected
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                : "bg-amber-500/15 text-amber-300 border border-amber-500/40"
            }`}
          >
            {isSpoilerProtected ? "실명 공개 전환" : "스포 방지 전환"}
          </button>
        </div>

        {/* 4. Preview Text Box */}
        <div className="mb-5 bg-[#090C12] border border-slate-800 rounded-xl p-3 text-left">
          <div className="text-[10px] font-bold text-slate-400 mb-1">공유 텍스트 미리보기</div>
          <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all select-all leading-relaxed">
            {shareText}
          </pre>
        </div>

        {/* 5. 공유 액션 버튼 그룹 */}
        <div className="space-y-2 mb-5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            결과 공유하기
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
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              {hasCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{hasCopied ? "복사 완료" : "텍스트 복사"}</span>
            </button>
          </div>
        </div>

        {/* 6. Bottom Navigation Buttons */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onSwitchToPractice && (
              <button
                onClick={onSwitchToPractice}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all whitespace-nowrap break-keep"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>맞춤 디깅하기</span>
              </button>
            )}

            {onOpenStats && (
              <button
                onClick={onOpenStats}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#161C28] hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition-all whitespace-nowrap break-keep"
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
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
