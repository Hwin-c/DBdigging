"use client";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useMemo, useState } from "react";
import { findCover } from "@/lib/preview";

/** Deezer(ISRC) 앨범 이미지 주소 메모리 캐시. 미리듣기 주소는 담지 않는다 */
const deezerCovers = new Map<string, Promise<string | null>>();

function deezerCover(isrc: string): Promise<string | null> {
  let p = deezerCovers.get(isrc);
  if (!p) {
    p = findCover(isrc);
    deezerCovers.set(isrc, p);
  }
  return p;
}

const LOOKUP = "deezer:lookup";

/**
 * 앨범 커버. 후보를 차례로 시도한다.
 * - 기본: 이미 아는 주소(미리듣기의 Deezer 커버) → Cover Art Archive → Deezer(ISRC) 조회
 * - preferDeezer: 이미 아는 주소 → Deezer(ISRC) 조회 → Cover Art Archive (시작 화면처럼 빨리 보여야 할 때)
 * 모두 실패하면 제목 글자 판(quiet면 비워 둠).
 */
export function Cover({
  releaseGroupId,
  isrc,
  fallback,
  title,
  artist,
  size = 250,
  className,
  quiet = false,
  preferDeezer = false,
}: {
  releaseGroupId?: string;
  isrc?: string;
  /** 이미 알고 있는 커버 주소 (예: 미리듣기 결과의 Deezer 커버) */
  fallback?: string;
  title: string;
  artist: string;
  size?: 250 | 500;
  className?: string;
  /** 불러오기 전·실패 시 아무것도 보이지 않게 (작은 커버·떠 있는 커버용) */
  quiet?: boolean;
  preferDeezer?: boolean;
}) {
  void artist;
  const caa = releaseGroupId ? `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}` : null;
  const order = useMemo(() => {
    const lookup = isrc ? LOOKUP : null;
    const list = preferDeezer ? [fallback, lookup, caa] : [fallback, caa, lookup];
    return list.filter((x): x is string => !!x);
  }, [fallback, caa, isrc, preferDeezer]);

  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 후보 목록이 바뀌면 처음부터 (이미 보이는 커버는 유지해 깜빡임 방지)
  useEffect(() => {
    if (!loaded) setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  useEffect(() => {
    let live = true;
    const cur = order[idx];
    if (!cur) {
      setSrc(null);
      return;
    }
    if (cur !== LOOKUP) {
      setSrc(cur);
      return;
    }
    setSrc(null);
    void deezerCover(isrc!).then((u) => {
      if (!live) return;
      if (u) setSrc(u);
      else setIdx((i) => i + 1);
    });
    return () => {
      live = false;
    };
  }, [order, idx, isrc]);

  const failed = idx >= order.length;
  const onError = () => {
    setLoaded(false);
    setIdx((i) => i + 1);
  };

  return (
    <div
      className={twMerge(
        clsx(
          "relative overflow-hidden [container-type:inline-size]",
          quiet ? (loaded ? "" : "invisible") : "bg-[#EDEDED]",
        ),
        className,
      )}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={onError}
          onLoad={() => setLoaded(true)}
          className={clsx(
            "absolute inset-0 h-full w-full select-none object-cover motion-safe:transition-opacity motion-safe:duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : quiet ? null : (
        <div className="absolute inset-0 flex items-end p-[8%]">
          <span className="line-clamp-3 break-words text-[clamp(14px,9cqw,40px)] font-bold leading-[1.05] tracking-[-0.03em] text-[#6E6E73]">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
