"use client";

import React from "react";
import { ConnectivityBadgeInfo } from "@/lib/graph/types";
import { CheckCircle2, Unlink, Zap } from "lucide-react";

interface ConnectivityBadgeProps {
  info: ConnectivityBadgeInfo | null;
  isLoading?: boolean;
}

/**
 * [Step 13-3 Layer 1] 실시간 연결성 뱃지 컴포넌트
 * - 무거운 BFS(413ms) 대신 store.getComponentId(songId) O(1) 비교 결과를 즉시 표시
 * - 유니코드 이모지 미사용 (lucide-react 아이콘 및 타이포그래피 뱃지 준수)
 */
export function ConnectivityBadge({ info, isLoading }: ConnectivityBadgeProps) {
  if (isLoading) {
    return (
      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>네트워크 컴포넌트 연결성 확인 중...</span>
      </div>
    );
  }

  if (!info) return null;

  if (info.isConnected) {
    const isGiant = info.startComponentId === 1;
    return (
      <div
        data-testid="connectivity-badge-connected"
        className="p-3 rounded-2xl bg-emerald-950/35 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>연결 가능</span>
          </span>
          <span className="text-xs font-bold text-emerald-100 truncate">
            {isGiant
              ? `메인 대륙 컴포넌트 (#1 • ${info.startComponentSize.toLocaleString()}곡)`
              : `동일 독립 섬 컴포넌트 (#${info.startComponentId} • ${info.startComponentSize.toLocaleString()}곡)`}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300/80 shrink-0">
          <Zap className="w-3 h-3 text-emerald-400" />
          <span>O(1) 컴포넌트 검증 완료</span>
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="connectivity-badge-disconnected"
      className="p-3 rounded-2xl bg-rose-950/35 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
          <Unlink className="w-3.5 h-3.5 text-rose-400" />
          <span>연결 불가</span>
        </span>
        <span className="text-xs font-bold text-rose-100 truncate">
          서로 다른 컴포넌트 (출발 #{info.startComponentId ?? "-"} •{" "}
          {info.startComponentSize.toLocaleString()}곡 / 도착 #{info.targetComponentId ?? "-"} •{" "}
          {info.targetComponentSize.toLocaleString()}곡)
        </span>
      </div>

      <span className="text-[10px] font-semibold text-rose-300/80 shrink-0">
        퀘스트 생성 시 대체 곡 추천 제공
      </span>
    </div>
  );
}
