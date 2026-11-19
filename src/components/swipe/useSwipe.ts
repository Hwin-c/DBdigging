"use client";
import { useCallback, useRef, useState } from "react";

/** 스와이프 판정 기준 (px, px/ms) */
export const SWIPE = {
  /** 좌우로 이만큼 끌면 넘기기·담기 */
  X: 96,
  /** 이보다 적게 움직이면 탭 */
  TAP: 8,
  /** 빠르게 튕기면 거리가 짧아도 인정 (속도, 최소 거리) */
  FLICK_VELOCITY: 0.55,
  FLICK_MIN: 36,
  /** 끄는 동안 카드 회전 (deg/px) */
  ROTATE: 0.05,
} as const;

export type SwipeDir = "left" | "right";

export interface DragState {
  x: number;
  y: number;
  active: boolean;
}

/** 끄는 중인 방향 (힌트 표시용) */
export function dragIntent(d: DragState): SwipeDir | null {
  if (Math.abs(d.x) > SWIPE.X * 0.4 && Math.abs(d.x) > Math.abs(d.y)) return d.x > 0 ? "right" : "left";
  return null;
}

/**
 * Pointer Events 스와이프. onSwipe·onTap은 pointerup 처리 안에서 바로 불린다
 * (그 안에서 audio.play()를 불러 모바일 자동재생 제한을 피한다).
 */
export function useSwipe(opts: {
  onSwipe: (dir: SwipeDir) => void;
  onTap: () => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<DragState>({ x: 0, y: 0, active: false });
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const { onSwipe, onTap, disabled } = opts;

  const reset = useCallback(() => {
    start.current = null;
    setDrag({ x: 0, y: 0, active: false });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      // 카드 안의 링크·버튼은 그대로 동작
      if ((e.target as HTMLElement).closest("a,button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      setDrag({ x: 0, y: 0, active: true });
    },
    [disabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDrag({ x: e.clientX - s.x, y: e.clientY - s.y, active: true });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = Math.max(1, performance.now() - s.t);
      reset();
      if (Math.abs(dx) < SWIPE.TAP && Math.abs(dy) < SWIPE.TAP) {
        onTap();
        return;
      }
      const flickX = Math.abs(dx) / dt > SWIPE.FLICK_VELOCITY && Math.abs(dx) > SWIPE.FLICK_MIN;
      // 좌우만: 세로로 더 많이 움직였으면 무시
      if (Math.abs(dx) >= Math.abs(dy) && (Math.abs(dx) > SWIPE.X || flickX)) onSwipe(dx > 0 ? "right" : "left");
    },
    [onSwipe, onTap, reset],
  );

  return {
    drag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset },
  };
}
