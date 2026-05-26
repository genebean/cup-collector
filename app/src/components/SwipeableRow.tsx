"use client";

import { useRef, useState } from "react";

const ACTION_WIDTH = 96;

interface SwipeableRowProps {
  children: React.ReactNode;
  actionLabel: string;
  actionColor: string; // Tailwind bg-* class
  onAction: () => Promise<void>;
}

export function SwipeableRow({ children, actionLabel, actionColor, onAction }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const offsetRef = useRef(0);
  const touch = useRef<{
    startX: number;
    startY: number;
    baseOffset: number;
    direction: "h" | "v" | null;
    moved: boolean;
  } | null>(null);

  function moveTo(target: number, animate: boolean) {
    offsetRef.current = target;
    setTransitioning(animate);
    setOffset(target);
  }

  return (
    <div
      className="relative overflow-hidden"
      onTouchStart={(e) => {
        touch.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          baseOffset: offsetRef.current,
          direction: null,
          moved: false,
        };
        setTransitioning(false);
      }}
      onTouchMove={(e) => {
        const t = touch.current;
        if (!t) return;
        const dx = e.touches[0].clientX - t.startX;
        const dy = e.touches[0].clientY - t.startY;
        if (!t.direction) {
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
          t.direction = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
        if (t.direction !== "h") return;
        e.preventDefault();
        t.moved = true;
        const newOffset = Math.max(Math.min(t.baseOffset + dx, 0), -ACTION_WIDTH);
        offsetRef.current = newOffset;
        setOffset(newOffset);
      }}
      onTouchEnd={() => {
        const t = touch.current;
        if (!t?.moved) return;
        const target = offsetRef.current < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0;
        moveTo(target, true);
      }}
      onClick={(e) => {
        if (touch.current?.moved) {
          e.preventDefault();
          return;
        }
        if (offsetRef.current !== 0) {
          e.preventDefault();
          moveTo(0, true);
        }
      }}
    >
      {/* Action revealed behind the card */}
      <div
        className={`absolute right-0 inset-y-0 flex items-center justify-center text-white text-sm font-semibold text-center px-2 ${actionColor}`}
        style={{ width: ACTION_WIDTH }}
        onClick={(e) => {
          e.stopPropagation();
          moveTo(0, true);
          void onAction();
        }}
      >
        {actionLabel}
      </div>

      {/* Card slides left to reveal action */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: transitioning ? "transform 0.2s ease-out" : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
