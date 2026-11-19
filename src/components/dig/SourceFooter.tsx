import clsx from "clsx";

export function SourceFooter({ light = false }: { light?: boolean }) {
  const link = clsx("underline", light ? "hover:text-black" : "hover:text-slate-300");
  return (
    <footer
      className={clsx(
        "mt-10 border-t pb-8 pt-4 text-center text-[11px] leading-relaxed",
        light ? "border-[#EFEFEF] text-[#8A8A8E]" : "border-slate-800 text-slate-500",
      )}
    >
      Data:{" "}
      <a className={link} href="https://musicbrainz.org" target="_blank" rel="noreferrer">
        MusicBrainz
      </a>{" "}
      (CC0) · Audio features:{" "}
      <a className={link} href="https://reccobeats.com" target="_blank" rel="noreferrer">
        ReccoBeats
      </a>{" "}
      · Preview: Deezer / Apple Music · Cover:{" "}
      <a className={link} href="https://coverartarchive.org" target="_blank" rel="noreferrer">
        Cover Art Archive
      </a>{" "}
      · 비상업 프로젝트
    </footer>
  );
}
