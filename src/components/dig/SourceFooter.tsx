export function SourceFooter() {
  return (
    <footer className="mt-10 border-t border-slate-800 pb-8 pt-4 text-center text-[11px] leading-relaxed text-slate-500">
      Data:{" "}
      <a className="underline hover:text-slate-300" href="https://musicbrainz.org" target="_blank" rel="noreferrer">
        MusicBrainz
      </a>{" "}
      (CC0) · Audio features:{" "}
      <a className="underline hover:text-slate-300" href="https://reccobeats.com" target="_blank" rel="noreferrer">
        ReccoBeats
      </a>{" "}
      · Preview: Deezer / Apple Music · 비상업 프로젝트
    </footer>
  );
}
