import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 5;

export interface WorksheetSearchResult {
  id: string;
  title: string;
  document_type: string;
  updated_at: string;
}

export function useWorksheetSearch(query: string, enabled: boolean, excludeId?: string) {
  const [data, setData] = useState<WorksheetSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const queryRef = useRef(query);

  // Reset when query changes
  useEffect(() => {
    queryRef.current = query;
    pageRef.current = 0;
    setHasMore(true);
  }, [query]);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("worksheets")
          .select("id, title, document_type, updated_at")
          .order("updated_at", { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (query.length > 0) {
          q = q.ilike("title", `%${query}%`);
        }

        if (excludeId) {
          q = q.neq("id", excludeId);
        }

        const { data: results, error } = await q;
        if (!cancelled && !error) {
          const items = results as WorksheetSearchResult[];
          setData(items);
          setHasMore(items.length >= PAGE_SIZE);
          pageRef.current = 1;
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, query.length > 0 ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, excludeId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !enabled) return;
    setLoading(true);
    try {
      const from = pageRef.current * PAGE_SIZE;
      let q = supabase
        .from("worksheets")
        .select("id, title, document_type, updated_at")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (queryRef.current.length > 0) {
        q = q.ilike("title", `%${queryRef.current}%`);
      }

      if (excludeId) {
        q = q.neq("id", excludeId);
      }

      const { data: results, error } = await q;
      if (!error) {
        const items = results as WorksheetSearchResult[];
        setData((prev) => [...prev, ...items]);
        setHasMore(items.length >= PAGE_SIZE);
        pageRef.current += 1;
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, enabled, excludeId]);

  return { data, loading, hasMore, loadMore };
}
