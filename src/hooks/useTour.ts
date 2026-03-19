import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const TOUR_SEEN_KEY = "worksheets_tour_completed";

export const useTour = (tourId: string) => {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [dbLoaded, setDbLoaded] = useState(false);
  const { user } = useAuth();
  const loadedRef = useRef(false);

  const markSeenLocal = useCallback((id: string) => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      seen[id] = true;
      localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(seen));
    } catch {}
  }, []);

  const hasSeenLocal = useCallback(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      return !!seen[tourId];
    } catch {
      return false;
    }
  }, [tourId]);

  // Load from DB and sync — DB is source of truth for logged-in users
  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tour_completed")
        .eq("user_id", user.id)
        .single();

      const dbSeen = (data?.tour_completed as Record<string, boolean>) || {};

      // Overwrite localStorage with DB truth
      localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(dbSeen));
      setDbLoaded(true);

      if (!dbSeen[tourId]) {
        setTimeout(() => start(), 800);
      }
    })();
  }, [user, tourId]);

  // Fallback for non-logged-in users (shouldn't normally happen)
  useEffect(() => {
    if (!user && !hasSeenLocal()) {
      const timer = setTimeout(() => start(), 800);
      return () => clearTimeout(timer);
    }
  }, [user]);

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
