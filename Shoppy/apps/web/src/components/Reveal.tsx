"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveal editorial: visible por defecto (sin JS siempre se ve),
 * anima una sola vez al entrar en viewport. Un único observer
 * compartido; se desconecta cada elemento al completarse.
 */
let shared: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!shared) {
    shared = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-up");
            shared?.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
  }
  return shared;
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: 0 | 80 | 160 }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const observer = getObserver();
    if (!el || !observer) return;
    // Solo se observa bajo el pliegue: sobre el pliegue entra con el hero (CSS).
    if (el.getBoundingClientRect().top > window.innerHeight) {
      observer.observe(el);
    } else {
      el.classList.add("animate-fade-up");
    }
    return () => observer.unobserve(el);
  }, []);

  return (
    <div ref={ref} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
