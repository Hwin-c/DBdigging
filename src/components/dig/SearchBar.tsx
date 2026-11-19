"use client";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

export function SearchBar({
  value,
  loading,
  onSearch,
}: {
  value: string;
  loading: boolean;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState(value);
  useEffect(() => setQ(value), [value]);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) onSearch(q.trim());
      }}
      className="flex gap-2"
    >
      <label className="sr-only" htmlFor="q">
        곡 검색
      </label>
      <input
        id="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="곡 제목과 가수 (예: Flutter Hearts2Hearts)"
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-[15px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        검색
      </button>
    </form>
  );
}
