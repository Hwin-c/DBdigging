"use client";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";
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

/**
 * 앨범 커버. Cover Art Archive(release-group) → 실패하면 Deezer(ISRC) → 둘 다 없으면 제목 글자 판.
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
}: {
  releaseGroupId?: string;
  isrc?: string;
  /** 이미 알고 있는 커버 주소 (예: 미리듣기 결과의 Deezer 커버) */
  fallback?: string;
  title: string;
  artist: string;
  size?: 250 | 500;
  className?: string;
  /** 불러오기 전·실패 시 아무것도 보이지 않게 (시작 화면에 떠 있는 커버용) */
  quiet?: boolean;
}) {
  const caa = releaseGroupId ? `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}` : null;
  // Deezer CDN이 Cover Art Archive(archive.org 경유)보다 빨라서, 알고 있으면 먼저 쓴다
  const [src, setSrc] = useState<string | null>(fallback ?? caa ?? null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    // 이미 보이는 커버는 바꾸지 않는다 (깜빡임 방지)
    setLoaded((wasLoaded) => {
      if (!wasLoaded) setSrc(fallback ?? caa ?? null);
      return wasLoaded;
    });
  }, [caa, fallback]);

  useEffect(() => {
    let live = true;
    if (!src && isrc && !failed) {
      void deezerCover(isrc).then((u) => {
        if (!live) return;
        if (u) setSrc(u);
        else setFailed(true);
      });
    }
    return () => {
      live = false;
    };
  }, [src, isrc, failed]);

  const onError = () => {
    if (src && src === fallback && caa) setSrc(caa);
    else if (src && isrc && !src.includes("dzcdn")) setSrc(null);
    else setFailed(true);
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
