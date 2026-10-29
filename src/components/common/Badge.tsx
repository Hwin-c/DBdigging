"use client";

import React from "react";
import { RoleCode, ROLE_LABELS } from "@/lib/graph/types";
import { Sparkles, Disc3 } from "lucide-react";

interface RoleBadgeProps {
  role: RoleCode;
  className?: string;
  size?: "sm" | "md";
}

const ROLE_STYLES: Record<RoleCode, string> = {
  1: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", // 가창
  2: "bg-sky-500/10 text-sky-400 border-sky-500/30", // 피처링
  3: "bg-amber-500/10 text-amber-400 border-amber-500/30", // 작사
  4: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", // 작곡
  5: "bg-rose-500/10 text-rose-400 border-rose-500/30", // 편곡
  6: "bg-slate-800 text-slate-200 border-slate-600" // 그룹소속
};

export function RoleBadge({ role, className = "", size = "sm" }: RoleBadgeProps) {
  const label = ROLE_LABELS[role] ?? `역할${role}`;
  const style = ROLE_STYLES[role] ?? "bg-slate-800 text-slate-300 border-slate-700";
  const sizeClass =
    size === "sm" ? "text-[10px] px-1.5 py-0.5 leading-none" : "text-xs px-2 py-0.5 leading-tight";

  return (
    <span
      className={`inline-flex items-center font-semibold tracking-tight rounded border whitespace-nowrap break-keep ${sizeClass} ${style} ${className}`}
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
 * 힌트 모드 전용 정답 루트 앰버 배지 (유니코드 이모지 제거)
 */
export function OptimalHintBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded border text-[10px] px-2 py-0.5 bg-amber-500/15 text-amber-300 border-amber-400/60 whitespace-nowrap break-keep ${className}`}
    >
      <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
      <span>정답 루트</span>
    </span>
  );
}

/**
 * 타이틀곡 배지 (유니코드 이모지 제거)
 */
export function TitleTrackBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 whitespace-nowrap break-keep ${className}`}
    >
      <Disc3 className="w-2.5 h-2.5 shrink-0" />
      <span>TITLE</span>
    </span>
  );
}
