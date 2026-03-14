import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BullhornEntity {
  entityType: string;
  id: number;
  [key: string]: unknown;
}

export function useBullhornSearch(query: string, enabled: boolean) {
  const [data, setData] = useState<BullhornEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !query || query.length < 2) {
      setData([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const { data: result, error: fnError } = await supabase.functions.invoke(
          "bullhorn-proxy",
          {
            body: { action: "fastfind", query, countPerEntity: 5 },
          }
        );

        if (controller.signal.aborted) return;

        if (fnError) {
          setError(fnError.message || "Search failed");
          setData([]);
        } else {
          setData(result?.data || []);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          setError(e.message || "Search failed");
          setData([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { data, loading, error };
}
