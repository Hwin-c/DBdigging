import React from 'react';
import spaceNebulaBg from '../assets/space_nebula_bg.webp';

export function LandscapeGuide() {
  return (
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center select-none overflow-hidden"
      style={{
        backgroundImage: `url(${spaceNebulaBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Immersive Dark Cyberpunk Blur Mask */}
      <div className="absolute inset-0 bg-[#020208]/65 backdrop-blur-[6px]" />

      {/* Styled Inline Keyframes for self-contained, flawless premium animation */}
      <style>{`
        @keyframes phoneRotate {
          0%, 15% {
            transform: rotate(0deg);
          }
          45%, 70% {
            transform: rotate(-90deg);
          }
          95%, 100% {
            transform: rotate(0deg);
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.2;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.1);
          }
          50% {
            opacity: 0.6;
            box-shadow: 0 0 35px rgba(0, 255, 255, 0.35);
          }
        }
        @keyframes arcDraw {
          0%, 10% {
            stroke-dashoffset: 80;
            opacity: 0.1;
          }
          40%, 75% {
            stroke-dashoffset: 0;
            opacity: 0.8;
          }
          95%, 100% {
            stroke-dashoffset: -80;
            opacity: 0.1;
          }
        }
        .animate-phone {
          animation: phoneRotate 3.2s cubic-bezier(0.77, 0, 0.175, 1) infinite;
          transform-origin: center center;
        }
        .animate-arc {
          stroke-dasharray: 80;
          animation: arcDraw 3.2s cubic-bezier(0.77, 0, 0.175, 1) infinite;
        }
        .glass-glow-card {
          animation: pulseGlow 4s ease-in-out infinite;
        }
      `}</style>

      {/* Glassmorphism Centered Container Card */}
      <div className="relative z-10 w-[380px] max-w-[90%] bg-[#060615]/75 border border-[#00FFFF]/35 rounded-[28px] p-8 md:p-10 flex flex-col items-center text-center shadow-[0_0_60px_rgba(0,255,255,0.18)] glass-glow-card">
        
        {/* Neon HUD Brackets inside Card Corners */}
        <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-[#00FFFF]/35 rounded-tl-sm" />
        <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-[#00FFFF]/35 rounded-tr-sm" />
        <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-[#00FFFF]/35 rounded-bl-sm" />
        <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-[#00FFFF]/35 rounded-br-sm" />

        {/* Dynamic Graphic Header: SVG Phone Rotation Loop */}
        <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
          {/* Neon Dotted Rotation Path Arc */}
          <svg className="absolute w-28 h-28 text-[#00FFFF]/40" viewBox="0 0 100 100" fill="none">
            <path
              d="M 50 15 A 35 35 0 0 0 15 50"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="4 6"
              className="animate-arc"
            />
            {/* Tiny arrow head */}
            <polygon points="12,50 16,42 20,50" fill="currentColor" className="opacity-70" />
          </svg>

          {/* Animated Glowing Smartphone Model SVG */}
          <div className="animate-phone flex items-center justify-center">
            <svg
              width="44"
              height="78"
              viewBox="0 0 44 78"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-[#00FFFF] filter drop-shadow-[0_0_8px_rgba(0,255,255,0.7)]"
            >
              {/* Outer Phone Case */}
              <rect
                x="1.5"
                y="1.5"
                width="41"
                height="75"
                rx="6.5"
                stroke="currentColor"
                strokeWidth="2.5"
                fill="#020208"
                fillOpacity="0.8"
              />
              {/* Speaker Notch */}
              <line x1="17" y1="6" x2="27" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              {/* Screen Boundary */}
              <rect x="5" y="11" width="34" height="52" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="1 3" strokeOpacity="0.4" />
              {/* Home/Indicator Circle */}
              <circle cx="22" cy="70" r="3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* Text Layout */}
        <h2 className="text-xl md:text-2xl font-bold tracking-wide mb-3 bg-gradient-to-r from-white via-[#00FFFF] to-white bg-clip-text text-transparent">
          화면을 가로로 회전해 주세요
        </h2>
        
        <p className="text-xs md:text-sm text-white/70 leading-relaxed font-sans max-w-[280px] mb-6">
          디깅디깅의 음악 우주를 탐험하려면 가로 화면이 필요합니다.
        </p>

        {/* System HUD Status Bar */}
        <div className="w-full pt-4 border-t border-[#00FFFF]/10 flex justify-between items-center text-[9px] font-mono text-[#00FFFF]/50 tracking-wider">
          <span>ORIENTATION CHECK</span>
          <span className="animate-pulse bg-[#00FFFF]/15 border border-[#00FFFF]/30 px-2 py-0.5 rounded text-[#00FFFF]">
            PORTRAIT_BLOCKED
          </span>
        </div>
      </div>
    </div>
  );
}
