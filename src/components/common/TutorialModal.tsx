"use client";

import React, { useState } from "react";
import {
  X,
  Target,
  Filter,
  GitBranch,
  Waves,
  ChevronRight,
  ChevronLeft,
  Check
} from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TUTORIAL_SLIDES = [
  {
    icon: Target,
    badge: "STEP 01 · 기본 룰",
    title: "음악 크레딧으로 꼬리잡기",
    accent: "text-emerald-400 border-emerald-500/40 bg-emerald-500/15",
    description:
      "디비디깅은 주어지는 출발 곡에서 시작해, 함께 작업한 아티스트·작사가·작곡가·편곡자 크레딧을 징검다리 삼아 목표 곡까지 최단 턴으로 도달하는 K-Pop 크레딧 퍼즐입니다.",
    points: [
      "1단계: 현재 곡에 참여한 크레딧 인물 또는 그룹을 선택합니다.",
      "2단계: 그 인물이 참여한 다른 곡을 선택해 다음 위치로 이동합니다.",
      "목표 도착 곡을 선택하면 즉시 퀘스트가 클리어됩니다."
    ]
  },
  {
    icon: Filter,
    badge: "STEP 02 · 크레딧 역할 탭",
    title: "가창뿐 아니라 작사·작곡·편곡까지",
    accent: "text-amber-400 border-amber-500/40 bg-amber-500/15",
    description:
      "모든 곡과 인물 카드 상단에는 크레딧 역할 필터 탭이 제공됩니다. 원하는 역할만 골라 정밀하게 디깅해 보세요.",
    points: [
      "[가창]: 솔로 가수 및 그룹 멤버들의 보컬 트랙 연결",
      "[작사 / 작곡 / 편곡]: K-Pop 히트곡을 탄생시킨 프로듀서 라인 연결",
      "[그룹 / 피처링]: 솔로 멤버와 소속 그룹을 잇는 1-hop 징검다리 연결"
    ]
  },
  {
    icon: GitBranch,
    badge: "STEP 03 · 2-Mode 탐험 네트워크 맵",
    title: "내가 걸어온 길을 한눈에",
    accent: "text-cyan-400 border-cyan-500/40 bg-cyan-500/15",
    description:
      "탐험한 발자취는 화면의 실시간 탐험 맵에 레코드판(곡)과 캡슐(아티스트) 노드로 기록됩니다.",
    points: [
      "새로운 인물과 곡으로 이동할 때마다 실시간으로 연결선이 그려집니다.",
      "이미 방문했던 인물이나 곡을 다시 선택하면 해당 노드로 포커스가 돌아가 새로운 가지(Branch)를 뻗습니다.",
      "맵을 드래그하여 자유롭게 이동하고, 과거 노드를 직접 클릭해 언제든 그 지점으로 되돌아갈 수 있습니다."
    ]
  },
  {
    icon: Waves,
    badge: "STEP 04 · 맞춤 디깅 & 심해 서바이벌",
    title: "원하는 조건으로 무한 디깅",
    accent: "text-sky-400 border-sky-500/40 bg-sky-500/15",
    description:
      "상단 탭에서 맞춤 디깅과 심해 디깅 모드를 선택해 더욱 깊이 있는 음악 탐험을 즐길 수 있습니다.",
    points: [
      "맞춤 디깅: 장르·시대·허용 역할을 직접 설정하고 원하는 문제를 미리 뽑아보고 시작할 수 있습니다.",
      "심해 디깅: 매 턴 주어지는 미션 조건(같은 소속사, 발매연도 등)을 통과하며 한계 수심에 도전합니다.",
      "탐사를 마치고 부상하면 나만의 심해 Melon 플레이리스트가 완성됩니다."
    ]
  }
];

export function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const slide = TUTORIAL_SLIDES[currentSlide];
  const IconComponent = slide.icon;

  const handleClose = () => {
    if (dontShowAgain && typeof window !== "undefined") {
      localStorage.setItem("dbdigging_tutorial_seen", "true");
    }
    onClose();
  };

  const handleNext = () => {
    if (currentSlide < TUTORIAL_SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-[#0D1117] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Icon & Badge */}
        <div className="flex flex-col items-center text-center space-y-2.5 pt-2">
          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${slide.accent}`}>
            <IconComponent className="w-6 h-6" />
          </div>

          <span className="text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded bg-[#141923] text-slate-300 border border-slate-700">
            {slide.badge}
          </span>

          <h3 className="text-lg sm:text-xl font-black text-white break-keep">{slide.title}</h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed px-1 break-keep">
            {slide.description}
          </p>
        </div>

        {/* Point Checklist */}
        <div className="my-5 p-3.5 rounded-xl bg-[#121721] border border-slate-800 space-y-2.5">
          {slide.points.map((pt, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="w-4 h-4 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5" />
              </span>
              <span className="leading-relaxed break-keep">{pt}</span>
            </div>
          ))}
        </div>

        {/* Indicator Dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {TUTORIAL_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === currentSlide ? "w-6 bg-emerald-400" : "w-1.5 bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Bottom Navigation & Checkbox */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2.5">
            <button
              onClick={handlePrev}
              disabled={currentSlide === 0}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-[#161C28] hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs border border-slate-700 transition-colors whitespace-nowrap break-keep"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>이전</span>
            </button>

            <button
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <span>{currentSlide === TUTORIAL_SLIDES.length - 1 ? "디깅 시작하기" : "다음 단계"}</span>
              {currentSlide < TUTORIAL_SLIDES.length - 1 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          <label className="flex items-center justify-center gap-2 cursor-pointer text-[11px] text-slate-400 hover:text-slate-300 select-none pt-1">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span className="break-keep">다음 접속 시 가이드 자동으로 띄우지 않기</span>
          </label>
        </div>
      </div>
    </div>
  );
}
