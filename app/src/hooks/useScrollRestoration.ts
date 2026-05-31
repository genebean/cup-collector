"use client";

import { useRef, useEffect, type RefObject } from "react";

/**
 * Saves and restores scroll position in sessionStorage.
 *
 * Element scroll (browse, search): pass a `ref` to the scrollable element.
 * The returned `onScroll` handler must be wired to the element's onScroll prop.
 *
 * Window scroll (stats): omit `ref`. The hook sets up a passive window scroll
 * listener automatically and restores via window.scrollTo with requestAnimationFrame.
 *
 * Restoration happens once, the first time `ready` is true (i.e. data has loaded).
 */
export function useScrollRestoration(
  key: string,
  ready: boolean,
  ref?: RefObject<HTMLElement | null>
): { onScroll: () => void } {
  const didRestore = useRef(false);
  const isWindow = !ref;

  // Window-scroll variant: attach a passive listener to save position
  useEffect(() => {
    if (!isWindow) return;
    const save = () => {
      try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch {}
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [key, isWindow]);

  // Restore once when ready
  useEffect(() => {
    if (didRestore.current || !ready) return;
    if (isWindow) {
      // requestAnimationFrame ensures the page has laid out before scrolling
      requestAnimationFrame(() => {
        try {
          const pos = Number(sessionStorage.getItem(key) ?? 0);
          if (pos > 0) window.scrollTo(0, pos);
        } catch {}
      });
    } else {
      if (!ref?.current) return;
      try {
        const pos = Number(sessionStorage.getItem(key) ?? 0);
        if (pos > 0) ref.current.scrollTop = pos;
      } catch {}
    }
    didRestore.current = true;
  }, [key, ready, ref, isWindow]);

  // Element-scroll variant: caller wires this to the element's onScroll prop
  function onScroll() {
    if (!isWindow && ref?.current) {
      try { sessionStorage.setItem(key, String(ref.current.scrollTop)); } catch {}
    }
  }

  return { onScroll };
}
