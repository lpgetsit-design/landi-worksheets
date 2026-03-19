import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TourStep {
  /** CSS selector or 'center' for a floating card */
  target: string;
  title: string;
  content: string;
  /** Position of tooltip relative to target */
  placement?: "top" | "bottom" | "left" | "right";
}

interface TourOverlayProps {
  steps: TourStep[];
  step: number;
  active: boolean;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;

const TourOverlay = ({ steps, step, active, onNext, onPrev, onEnd }: TourOverlayProps) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  const measureTarget = useCallback(() => {
    if (!currentStep || !active) return;

    if (currentStep.target === "center") {
      setRect(null);
      setTooltipPos({
        top: window.innerHeight / 2 - 120,
        left: window.innerWidth / 2 - 200,
      });
      return;
    }

    const el = document.querySelector(currentStep.target);
    if (!el) {
      setRect(null);
      setTooltipPos({
        top: window.innerHeight / 2 - 120,
        left: window.innerWidth / 2 - 200,
      });
      return;
    }

    const r = el.getBoundingClientRect();
    setRect(r);

    // Calculate tooltip position
    const placement = currentStep.placement || "bottom";
    const tooltipW = 340;
    const tooltipH = 180;

    let top = 0;
    let left = 0;

    switch (placement) {
      case "bottom":
        top = r.bottom + TOOLTIP_GAP;
        left = r.left + r.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = r.top - TOOLTIP_GAP - tooltipH;
        left = r.left + r.width / 2 - tooltipW / 2;
        break;
      case "right":
        top = r.top + r.height / 2 - tooltipH / 2;
        left = r.right + TOOLTIP_GAP;
        break;
      case "left":
        top = r.top + r.height / 2 - tooltipH / 2;
        left = r.left - TOOLTIP_GAP - tooltipW;
        break;
    }

    // Keep within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16));

    setTooltipPos({ top, left });
  }, [currentStep, active]);

  useEffect(() => {
    if (!active) return;
    measureTarget();

    const handleResize = () => measureTarget();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [active, step, measureTarget]);

  // Handle keyboard
  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLast) onEnd();
        else onNext();
      }
      if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, isLast, onEnd, onNext, onPrev]);

  if (!active || !currentStep) return null;

  // Build clip path for spotlight
  const clipPath = rect
    ? `polygon(
        0% 0%, 0% 100%, 
        ${rect.left - PADDING}px 100%, 
        ${rect.left - PADDING}px ${rect.top - PADDING}px, 
        ${rect.right + PADDING}px ${rect.top - PADDING}px, 
        ${rect.right + PADDING}px ${rect.bottom + PADDING}px, 
        ${rect.left - PADDING}px ${rect.bottom + PADDING}px, 
        ${rect.left - PADDING}px 100%, 
        100% 100%, 100% 0%
      )`
    : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={onEnd}>
      {/* Overlay with spotlight cutout */}
      <div
        className="absolute inset-0 bg-black/60 transition-all duration-300"
        style={clipPath ? { clipPath } : undefined}
      />

      {/* Spotlight border glow */}
      {rect && (
        <div
          className="absolute rounded-md ring-2 ring-primary/50 transition-all duration-300 pointer-events-none"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute z-10 w-[340px] rounded-lg border border-border bg-card p-4 shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onEnd}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <h3 className="text-sm font-semibold text-foreground leading-tight pr-4">
            {currentStep.title}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          {currentStep.content}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {step + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onPrev}>
                <ChevronLeft className="h-3 w-3" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={isLast ? onEnd : onNext}
            >
              {isLast ? "Got it!" : "Next"}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1 mt-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all",
                i === step ? "w-4 bg-primary" : "w-1 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TourOverlay;
