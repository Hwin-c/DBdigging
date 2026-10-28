"use client";

import React, { useState } from "react";
import { HistoryStep, SongInfo, ROLE_LABELS } from "@/lib/graph/types";
import { RoleBadgeList } from "@/components/common/Badge";
import {
  Trophy,
  Share2,
  Copy,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Shield,
  Flame,
  Check,
  Compass,
  X,
  BarChart3
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
  onPlayAgain,
  onSwitchToPractice,
  onShowToast,
  onOpenStats
}: ClearModalProps) {
  const [isSpoilerProtected, setIsSpoilerProtected] = useState(true);
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  // 턴 평가 등급 계산
  const turnDiff = turnCount - optimalTurns;
  const ratingBadge =
    turnDiff <= 0
      ? { title: "🏆 최단 경로 마스터", desc: "이론상 최단 턴으로 도달한 완벽한 뇌지컬!", color: "from-amber-400 to-yellow-500" }
      : turnDiff <= 2
        ? { title: "✨ 훌륭한 디깅", desc: "최적 경로에 근접한 훌륭한 크레딧 탐색!", color: "from-emerald-400 to-teal-500" }
        : { title: "🧭 끈기 있는 디거", desc: "넓은 K-Pop 바다를 유영하며 목표에 성공적으로 도착!", color: "from-indigo-400 to-purple-500" };

  // ----------------------------------------------------
  // 동적 바이럴 공유 텍스트 빌더
  // ----------------------------------------------------
  const buildShareText = () => {
    const isDaily = !questId.startsWith("random_");
    const titleTag = isDaily
      ? `🎯 디비디깅 (DBDIGGING) #${questId}`
      : `🎯 디비디깅 (DBDIGGING) 자유 모드`;

    let pathString = "";

    if (isSpoilerProtected) {
      // (1) 스포일러 방지 모드: 중간 경유 노드 이모지 마스킹
      const intermediateSteps: string[] = [];
      for (let i = 1; i < historyStack.length; i++) {
        if (historyStack[i].viaPerson) {
          intermediateSteps.push("👤");
        }
        if (i < historyStack.length - 1) {
          intermediateSteps.push("🎵");
        }
      }
      pathString = `🚩 ${startSong.title} ➔ ${intermediateSteps.join(" ➔ ")} ➔ 🏁 ${targetSong.title}`;
    } else {
      // (2) 전체 경로 Flex 모드: 실명 및 역할 배지 노출
      const fullSteps: string[] = [startSong.title];
      for (let i = 1; i < historyStack.length; i++) {
        const step = historyStack[i];
        if (step.viaPerson) {
          const safeRoles = step.viaPerson.roles ?? [];
          const roleText = safeRoles.length > 0 ? `[${safeRoles.map((r) => ROLE_LABELS[r] || r).join("/")}] ` : "";
          fullSteps.push(`${roleText}${step.viaPerson.name}`);
        }
        fullSteps.push(step.song.title);
      }
      pathString = fullSteps.join(" ➔ ");
    }

    const turnsMsg =
      turnDiff <= 0
        ? `⚡ ${turnCount}턴 클리어! (최적 최단 경로 ${optimalTurns}턴 달성 🏆)`
        : `⚡ ${turnCount}턴 클리어! (최적 최단 경로: ${optimalTurns}턴)`;

    return `${titleTag} ${!isSpoilerProtected ? "🔥 Flex!" : ""}\n${pathString}\n${turnsMsg}\n\n너도 K-Pop 인맥 꼬리잡기 디깅해볼래?\nhttps://db-digging.web.app\n#디비디깅 #DBDIGGING #KPOP`;
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
          title: "디비디깅 클리어!",
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-[#0d1424] to-slate-900 border border-indigo-500/40 rounded-3xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(99,102,241,0.25)] relative my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Header Trophy & Title */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 border border-amber-400/40 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-bounce">
            <Trophy className="w-9 h-9" />
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">
            디깅 미션 클리어!
          </h2>
          <p className="text-xs text-indigo-300">
            {startSong.title} ➔ {targetSong.title} 연결 완료
          </p>

          {/* Rating Badge */}
          <div className="pt-2">
            <div
              className={`inline-block px-4 py-1.5 rounded-full font-black text-xs text-slate-950 bg-gradient-to-r ${ratingBadge.color} shadow-md`}
            >
              {ratingBadge.title}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{ratingBadge.desc}</p>
          </div>
        </div>

        {/* 2. Turn Statistics */}
        <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <div className="text-center">
            <div className="text-[11px] text-slate-400 font-semibold">내 도달 턴 수</div>
            <div className="text-2xl font-black text-indigo-400 mt-0.5">{turnCount}턴</div>
          </div>
          <div className="text-center border-l border-slate-800">
            <div className="text-[11px] text-slate-400 font-semibold">최적 최단 경로</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{optimalTurns}턴</div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. 스포일러 방지 vs 전체 경로 Flex 토글 스위치               */}
        {/* ======================================================== */}
        <div className="mb-4 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSpoilerProtected ? (
              <Shield className="w-4 h-4 text-emerald-400" />
            ) : (
              <Flame className="w-4 h-4 text-rose-400" />
            )}
            <div>
              <div className="text-xs font-bold text-white">
                {isSpoilerProtected ? "🔒 스포일러 방지 모드" : "🔥 전체 경로 Flex 모드"}
              </div>
              <div className="text-[10px] text-slate-400">
                {isSpoilerProtected
                  ? "경유 노드를 이모지로 가려 친구들의 재미를 보호합니다"
                  : "거쳐온 모든 실명과 역할을 온전히 과시합니다"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSpoilerProtected(!isSpoilerProtected)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isSpoilerProtected
                ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                : "bg-rose-950 text-rose-300 border border-rose-500/40"
            }`}
          >
            {isSpoilerProtected ? "Flex 전환" : "스포방지 전환"}
          </button>
        </div>

        {/* 4. Preview Text Box */}
        <div className="mb-5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-left">
          <div className="text-[10px] font-bold text-slate-400 mb-1">공유 텍스트 미리보기:</div>
          <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all select-all leading-relaxed">
            {shareText}
          </pre>
        </div>

        {/* ======================================================== */}
        {/* 5. 한국형 4대 바이럴 공유 액션 버튼 그룹                     */}
        {/* ======================================================== */}
        <div className="space-y-2 mb-6">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            친구들에게 자랑하기 (4대 공유 허브)
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* 𝕏 Twitter */}
            <button
              onClick={handleShareTwitter}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-black hover:bg-neutral-900 text-white font-bold text-xs border border-neutral-800 transition-all active:scale-95"
            >
              <span className="font-serif font-black text-sm">𝕏</span>
              <span>트위터 공유</span>
            </button>

            {/* @ Threads */}
            <button
              onClick={handleShareThreads}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs border border-neutral-700 transition-all active:scale-95"
            >
              <span className="font-bold text-sm">@</span>
              <span>Threads 공유</span>
            </button>

            {/* 💬 카카오톡 / 모바일 Web Share */}
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#FEE500] hover:bg-[#FADA0A] text-[#191919] font-black text-xs transition-all active:scale-95 shadow-sm"
            >
              <span>💬</span>
              <span>카카오톡 / 모바일</span>
            </button>

            {/* 📋 텍스트 복사 (더쿠/에타/커뮤니티) */}
            <button
              onClick={handleClipboardCopy}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all active:scale-95 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
            >
              {hasCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{hasCopied ? "복사 완료!" : "텍스트 복사"}</span>
            </button>
          </div>
        </div>

        {/* 6. Bottom Navigation Buttons */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onSwitchToPractice && (
              <button
                onClick={onSwitchToPractice}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border border-purple-500/40 text-xs font-bold transition-all"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>자유 연습 더 하기</span>
              </button>
            )}

            {onOpenStats && (
              <button
                onClick={onOpenStats}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 text-amber-200 border border-amber-500/40 text-xs font-bold transition-all"
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                <span>내 전적 보기</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-auto px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
