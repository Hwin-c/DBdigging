"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/** deps가 바뀌면 fn을 다시 실행. 늦게 끝난 이전 요청 결과는 버린다. fn이 null이면 실행하지 않음 */
export function useAsync<T>(fn: (() => Promise<T>) | null, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(fn != null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setData(undefined);
    setError(undefined);
    if (!fn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fn().then(
      (v) => {
        if (seq.current === id) {
          setData(v);
          setLoading(false);
        }
      },
      (e: unknown) => {
        if (seq.current === id) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
