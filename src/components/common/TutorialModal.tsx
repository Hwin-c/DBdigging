"use client";

import React, { useState } from "react";
import {
  HelpCircle,
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
    badge: "1단계: 기본 룰",
    title: "음악 크레딧으로 꼬리잡기!",
    color: "from-indigo-500 to-purple-600",
    description:
      "디비디깅은 매일 자정 주어지는 '출발 곡'에서 시작해, 함께 작업한 아티스트·작사가·작곡가·편곡자 크레딧을 징검다리 삼아 '도착 곡'까지 최단 턴으로 도달하는 K-Pop 크레딧 퍼즐입니다.",
    points: [
      "1단계: 현재 곡에 참여한 크레딧 인물/그룹을 선택합니다.",
      "2단계: 그 인물이 참여한 다른 곡을 선택해 다음 위치로 이동합니다.",
      "목표 도착 곡을 선택하면 즉시 퀘스트가 클리어됩니다!"
    ]
  },
  {
    icon: Filter,
    badge: "2단계: 크레딧 역할 탭",
    title: "가창뿐 아니라 작사·작곡·편곡까지!",
    color: "from-purple-500 to-pink-600",
    description:
      "모든 곡과 인물 카드 상단에는 6대 크레딧 역할 필터 탭이 제공됩니다. 원하는 역할만 쏙쏙 골라 디깅해 보세요.",
    points: [
      "🎤 가창: 솔로 가수 및 그룹 멤버들의 목소리 연결",
      "✍️ 작사 / 🎼 작곡 / 🎹 편곡: K-Pop 히트곡을 탄생시킨 프로듀서 연결",
      "👥 그룹/피처링: 솔로 멤버와 소속 그룹을 잇는 1-hop 징검다리 연결"
    ]
  },
  {
    icon: GitBranch,
    badge: "3단계: 탐험 트리 맵",
    title: "내가 걸어온 길을 한눈에!",
    color: "from-sky-500 to-indigo-600",
    description:
      "내가 탐험한 발자취는 화면의 '실시간 미지 탐험 트리'에 네온 라인으로 기록됩니다.",
    points: [
      "새로운 곡으로 이동할 때마다 실시간 네온 직선 에지가 연결됩니다.",
      "뒤로가기로 돌아가 다른 곡을 선택하면 기존 가지를 지우지 않고 새로운 갈림길(Branch)로 뻗어갑니다.",
      "트리 맵 상의 과거 노드를 직접 클릭하여 언제든 그 지점으로 즉시 롤백할 수 있습니다."
    ]
  },
  {
    icon: Waves,
    badge: "4단계: 심해 디깅 모드",
    title: "끝없이 잠수하는 서바이벌!",
    color: "from-cyan-500 to-blue-600",
    description:
      "상단 탭에서 '심해 디깅'을 선택하면 목적지 없이 미션 조건(같은 소속사, 발매연도 등)을 통과하며 한계 수심에 도전할 수 있습니다.",
    points: [
      "산소 하트 3개로 시작하며, 매 턴마다 새로운 미션 조건이 발급됩니다.",
      "조건에 일치하는 곡으로 이동하면 수심이 100m씩 깊어집니다.",
      "탐사를 마치고 부상하면 나만의 심해 멜론 플레이리스트를 선물로 받습니다!"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0b0f17] border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Icon & Badge */}
        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${slide.color} p-0.5 flex items-center justify-center shadow-lg`}
          >
            <div className="w-full h-full bg-[#0b0f17] rounded-[14px] flex items-center justify-center">
              <IconComponent className="w-7 h-7 text-white" />
            </div>
          </div>

          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {slide.badge}
          </span>

          <h3 className="text-xl font-black text-white">{slide.title}</h3>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed px-2">
            {slide.description}
          </p>
        </div>

        {/* Point Checklist */}
        <div className="my-5 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          {slide.points.map((pt, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                ✓
              </span>
              <span className="leading-snug">{pt}</span>
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
                i === currentSlide ? "w-6 bg-indigo-500" : "w-1.5 bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Bottom Navigation & Checkbox */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handlePrev}
              disabled={currentSlide === 0}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>이전</span>
            </button>

            <button
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
            >
              <span>{currentSlide === TUTORIAL_SLIDES.length - 1 ? "게임 시작하기!" : "다음"}</span>
              {currentSlide < TUTORIAL_SLIDES.length - 1 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          <label className="flex items-center justify-center gap-2 cursor-pointer text-[11px] text-slate-500 hover:text-slate-400 select-none pt-1">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>다음 접속 시 가이드 자동으로 띄우지 않기</span>
          </label>
        </div>
      </div>
    </div>
  );
}
