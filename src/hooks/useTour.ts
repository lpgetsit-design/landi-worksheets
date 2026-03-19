import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const TOUR_SEEN_KEY = "worksheets_tour_completed";

export const useTour = (tourId: string) => {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  const loadedRef = useRef(false);

  // Read from localStorage as fast fallback
  const hasSeenLocal = useCallback(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      return !!seen[tourId];
    } catch {
      return false;
    }
  }, [tourId]);

  const markSeenLocal = useCallback((id: string) => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      seen[id] = true;
      localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(seen));
    } catch {}
  }, []);

  // Sync from DB on mount
  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tour_completed")
        .eq("user_id", user.id)
        .single();

      if (data?.tour_completed) {
        const dbSeen = data.tour_completed as Record<string, boolean>;
        // Merge DB state into localStorage
        const local = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
        const merged = { ...local, ...dbSeen };
        localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(merged));

        if (!dbSeen[tourId] && !local[tourId]) {
          const timer = setTimeout(() => start(), 800);
          return () => clearTimeout(timer);
        }
      } else if (!hasSeenLocal()) {
        const timer = setTimeout(() => start(), 800);
        return () => clearTimeout(timer);
      }
    };
    load();
  }, [user, tourId]);

  // Fallback auto-start if no user (shouldn't happen but safe)
  useEffect(() => {
    if (!user && !hasSeenLocal()) {
      const timer = setTimeout(() => start(), 800);
      return () => clearTimeout(timer);
    }
  }, [user, hasSeenLocal]);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => setStep((s) => s + 1), []);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const end = useCallback(() => {
    setActive(false);
    setStep(0);
    markSeenLocal(tourId);

    // Persist to DB
    if (user) {
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("tour_completed")
          .eq("user_id", user.id)
          .single();

        const current = (data?.tour_completed as Record<string, boolean>) || {};
        current[tourId] = true;

        await supabase
          .from("profiles")
          .update({ tour_completed: current } as any)
          .eq("user_id", user.id);
      })();
    }
  }, [user, tourId, markSeenLocal]);

  const hasSeen = hasSeenLocal;

  return { active, step, start, next, prev, end, hasSeen };
};
