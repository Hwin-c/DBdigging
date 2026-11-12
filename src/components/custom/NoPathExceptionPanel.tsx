"use client";

import React from "react";
import { QuestFailureDiagnostics, SongInfo } from "@/lib/graph/types";
import {
  AlertTriangle,
  Unlink,
  Layers,
  Target,
  ArrowRightLeft,
  Unlock,
  Check,
  Disc3
} from "lucide-react";

interface NoPathExceptionPanelProps {
  diagnostics: QuestFailureDiagnostics;
  onReplaceTargetSong: (newTargetSong: SongInfo) => void;
  onReplaceStartSong: (newStartSong: SongInfo) => void;
  onEnableAllRoles: () => void;
  onApplyActualDistance: (diagnostics: QuestFailureDiagnostics) => void;
}

/**
 * [Step 13-3 Layer 2] 맞춤 디깅 '경로 없음' 3단계 예외 처리 및 원클릭 해결 패널
 * - REASON_A: 서로 다른 컴포넌트 ➔ 양방향 유사 대체 곡 3곡 추천 및 원클릭 교체
 * - REASON_B: 역할 필터 제한 ➔ 최단 경로 상 꺼진 역할 칩 표시 및 [모두 켜기] 원클릭 액션
 * - REASON_C: 거리 조건 불충족 ➔ actualTurns > maxTurns / actualTurns < minTurns 구분 안내 및 [실제 최단 거리(N턴)로 설정 변경] 원클릭 액션
 */
export function NoPathExceptionPanel({
  diagnostics,
  onReplaceTargetSong,
  onReplaceStartSong,
  onEnableAllRoles,
  onApplyActualDistance
}: NoPathExceptionPanelProps) {
  const { reason, startSong, targetSong } = diagnostics;

  // =========================================================================
  // REASON_A: 서로 다른 컴포넌트 (네트워크 단절)
  // =========================================================================
  if (reason === "REASON_A") {
    const altTargets = diagnostics.alternativeTargetsInStartComp || [];
    const altStarts = diagnostics.alternativeStartsInTargetComp || [];

    return (
      <div
        data-testid="exception-panel-reason-a"
        className="p-3.5 rounded-2xl bg-[#090A0F] border border-rose-500/40 space-y-3 animate-in fade-in duration-150"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <Unlink className="w-3 h-3 text-rose-400" />
              <span>
                {startSong.id === targetSong.id
                  ? "REASON_A • 동일 곡 중복 선택"
                  : "REASON_A • 서로 다른 네트워크 컴포넌트"}
              </span>
            </div>
            <div className="text-xs font-extrabold text-white">
              {startSong.id === targetSong.id
                ? "출발 곡과 도착 곡이 동일합니다. 서로 다른 곡을 선택해 주세요."
                : "선택한 두 곡 사이에 연결된 크레딧 경로가 존재하지 않습니다."}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {startSong.id === targetSong.id
                ? `현재 선택된 '${startSong.title}'(컴포넌트 #${diagnostics.startComponentId ?? "-"}, ${diagnostics.startComponentSize.toLocaleString()}곡)과 동일한 컴포넌트 내 유사 대체 곡으로 즉시 교체할 수 있습니다.`
                : `출발 곡(컴포넌트 #${diagnostics.startComponentId ?? "-"}, ${diagnostics.startComponentSize.toLocaleString()}곡)과 도착 곡(컴포넌트 #${diagnostics.targetComponentId ?? "-"}, ${diagnostics.targetComponentSize.toLocaleString()}곡)이 서로 분리된 섬에 위치합니다. 아래의 유사 대체 곡으로 즉시 교체할 수 있습니다.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[210px] overflow-y-auto pr-1">
          {/* 방향 1: 출발 곡 컴포넌트 내 대체 도착 곡 3곡 추천 */}
          <div className="p-2.5 rounded-xl bg-[#0D1117] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                <Disc3 className="w-3.5 h-3.5 text-amber-400" />
                <span>대체 도착 곡 추천 (출발 컴포넌트 내)</span>
              </span>
              <span className="text-[10px] text-slate-500">{altTargets.length}곡</span>
            </div>

            {altTargets.length > 0 ? (
              <div className="space-y-1.5">
                {altTargets.map((rec) => (
                  <div
                    key={`alt-target-${rec.song.id}`}
                    className="p-2 rounded-lg bg-[#090A0F] border border-slate-800/90 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-white truncate">
                        {rec.song.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {rec.song.artist} • {rec.song.year}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rec.matchReasons.slice(0, 2).map((r, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => onReplaceTargetSong(rec.song)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] shrink-0 transition-colors flex items-center gap-1"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>교체</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 py-2">
                출발 곡이 단독 고립 섬(1곡)이어서 동일 컴포넌트 내 다른 곡이 없습니다.
              </div>
            )}
          </div>

          {/* 방향 2: 도착 곡 컴포넌트 내 대체 출발 곡 3곡 추천 */}
          <div className="p-2.5 rounded-xl bg-[#0D1117] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                <Disc3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>대체 출발 곡 추천 (도착 컴포넌트 내)</span>
              </span>
              <span className="text-[10px] text-slate-500">{altStarts.length}곡</span>
            </div>

            {altStarts.length > 0 ? (
              <div className="space-y-1.5">
                {altStarts.map((rec) => (
                  <div
                    key={`alt-start-${rec.song.id}`}
                    className="p-2 rounded-lg bg-[#090A0F] border border-slate-800/90 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-white truncate">
                        {rec.song.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {rec.song.artist} • {rec.song.year}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rec.matchReasons.slice(0, 2).map((r, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => onReplaceStartSong(rec.song)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] shrink-0 transition-colors flex items-center gap-1"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>교체</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 py-2">
                도착 곡이 단독 고립 섬(1곡)이어서 동일 컴포넌트 내 다른 곡이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // REASON_B: 역할 필터 제한으로 인한 경로 차단
  // =========================================================================
  if (reason === "REASON_B") {
    const missingLabels = diagnostics.missingRoleLabels || [];

    return (
      <div
        data-testid="exception-panel-reason-b"
        className="p-3.5 rounded-2xl bg-[#090A0F] border border-amber-500/40 space-y-3 animate-in fade-in duration-150"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Layers className="w-3 h-3 text-amber-400" />
            <span>REASON_B • 허용 크레딧 역할 제한</span>
          </div>
          <div className="text-xs font-extrabold text-white">
            전체 역할 허용 시 최단 {diagnostics.unrestrictedTurns}턴으로 연결되지만, 현재 역할 필터에 의해 차단되었습니다.
          </div>
          <p className="text-[11px] text-slate-400">
            최단 경로를 통과하려면 아래의 꺼져 있는 크레딧 역할 제한을 해제해야 합니다.
          </p>
        </div>

        {/* 해제 필요 역할 칩 안내 */}
        <div className="p-2.5 rounded-xl bg-[#0D1117] border border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-300 mr-1">해제 필요 역할:</span>
            {missingLabels.map((label, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-amber-500/20 text-amber-200 border border-amber-400/40"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{label}</span>
              </span>
            ))}
          </div>

          <button
            onClick={onEnableAllRoles}
            className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-all flex items-center gap-1.5 shrink-0"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>모두 켜기</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // REASON_C: 목표 턴 거리 조건 불충족 (actualTurns > maxTurns vs actualTurns < minTurns)
  // =========================================================================
  const actualTurns = diagnostics.actualTurns ?? 0;
  const minTurns = diagnostics.requestedMinTurns ?? 1;
  const maxTurns = diagnostics.requestedMaxTurns ?? 6;
  const isTooLong = diagnostics.distanceMismatchDirection === "TOO_LONG";

  return (
    <div
      data-testid="exception-panel-reason-c"
      className="p-3.5 rounded-2xl bg-[#090A0F] border border-sky-500/40 space-y-3 animate-in fade-in duration-150"
    >
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">
          <Target className="w-3 h-3 text-sky-400" />
          <span>
            REASON_C • 목표 거리 조건 불충족 (
            {isTooLong ? "actualTurns > maxTurns" : "actualTurns < minTurns"})
          </span>
        </div>
        <div className="text-xs font-extrabold text-white">
          {isTooLong
            ? `실제 최단 거리(${actualTurns}턴)가 설정한 목표 범위(${minTurns}~${maxTurns}턴)보다 깁니다.`
            : `실제 최단 거리(${actualTurns}턴)가 설정한 목표 범위(${minTurns}~${maxTurns}턴)보다 짧습니다.`}
        </div>
        <p className="text-[11px] text-slate-400">
          ‘{startSong.title}’에서 ‘{targetSong.title}’까지의 실제 최단 경로는{" "}
          <strong className="text-sky-300">{actualTurns}턴</strong>입니다. 아래 버튼을 눌러 실제 최단 거리로 설정을 즉시 변경할 수 있습니다.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={() => onApplyActualDistance(diagnostics)}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
        >
          <Check className="w-4 h-4" />
          <span>실제 최단 거리({actualTurns}턴)로 설정 변경</span>
        </button>
      </div>
    </div>
  );
}
