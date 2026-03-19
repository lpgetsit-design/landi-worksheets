import { useState, useCallback, useEffect } from "react";

const TOUR_SEEN_KEY = "worksheets_tour_completed";

export const useTour = (tourId: string) => {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const hasSeen = useCallback(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      return !!seen[tourId];
    } catch {
      return false;
    }
  }, [tourId]);

  const markSeen = useCallback(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(TOUR_SEEN_KEY) || "{}");
      seen[tourId] = true;
      localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(seen));
    } catch {}
  }, [tourId]);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => setStep((s) => s + 1), []);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const end = useCallback(() => {
    setActive(false);
    setStep(0);
    markSeen();
  }, [markSeen]);

  // Auto-start on first visit
  useEffect(() => {
    if (!hasSeen()) {
      const timer = setTimeout(() => start(), 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeen, start]);

  return { active, step, start, next, prev, end, hasSeen };
};
