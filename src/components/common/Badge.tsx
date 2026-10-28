"use client";

import React from "react";
import { RoleCode, ROLE_LABELS } from "@/lib/graph/types";

interface RoleBadgeProps {
  role: RoleCode;
  className?: string;
  size?: "sm" | "md";
}

const ROLE_STYLES: Record<RoleCode, string> = {
  1: "bg-cyan-950/60 text-cyan-300 border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.15)]", // 가창
  2: "bg-purple-950/60 text-purple-300 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.15)]", // 피처링
  3: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.15)]", // 작사
  4: "bg-amber-950/60 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.15)]", // 작곡
  5: "bg-rose-950/60 text-rose-300 border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.15)]", // 편곡
  6: "bg-indigo-950/60 text-indigo-300 border-indigo-500/40 shadow-[0_0_8px_rgba(99,102,241,0.15)]" // 그룹소속
};

export function RoleBadge({ role, className = "", size = "sm" }: RoleBadgeProps) {
  const label = ROLE_LABELS[role] ?? `역할${role}`;
  const style = ROLE_STYLES[role] ?? "bg-slate-800 text-slate-300 border-slate-700";
  const sizeClass = size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span
      className={`inline-flex items-center font-medium rounded border ${sizeClass} ${style} ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * 복수 역할 렌더러 (undefined 방어 기본값 ?? [])
 */
export function RoleBadgeList({
  roles = [],
  className = "",
  size = "sm"
}: {
  roles?: RoleCode[];
  className?: string;
  size?: "sm" | "md";
}) {
  const safeRoles = roles ?? [];
  if (safeRoles.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 items-center ${className}`}>
      {safeRoles.map((role) => (
        <RoleBadge key={role} role={role} size={size} />
      ))}
    </div>
  );
}

/**
 * 힌트 모드 전용 '★ 정답 루트' 골드 네온 배지
 */
export function OptimalHintBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded border text-[11px] px-2 py-0.5 bg-amber-500/20 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse ${className}`}
    >
      <span>★</span>
      <span>정답 루트</span>
    </span>
  );
}

/**
 * 타이틀곡 배지
 */
export function TitleTrackBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 ${className}`}
    >
      👑 타이틀
    </span>
  );
}
