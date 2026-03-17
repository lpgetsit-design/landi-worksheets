import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorksheetSearchResult {
  id: string;
  title: string;
  document_type: string;
  updated_at: string;
}

export function useWorksheetSearch(query: string, enabled: boolean, excludeId?: string) {
  const [data, setData] = useState<WorksheetSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || query.length < 1) {
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
          .ilike("title", `%${query}%`)
          .order("updated_at", { ascending: false })
          .limit(8);

        if (excludeId) {
          q = q.neq("id", excludeId);
        }

        const { data: results, error } = await q;
        if (!cancelled && !error) {
          setData(results as WorksheetSearchResult[]);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, excludeId]);

  return { data, loading };
}
