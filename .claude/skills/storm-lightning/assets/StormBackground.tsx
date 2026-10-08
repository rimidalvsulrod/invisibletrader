"use client";

// Storm background for React / Next.js. Put lightning.js in /public, then render <StormBackground /> once.
import { useEffect } from "react";

type StormOptions = Record<string, unknown>;
type Storm = { destroy(): void; set(o: StormOptions): void; strike(o?: StormOptions): unknown };
declare global {
  interface Window { Lightning?: { create(o?: StormOptions): Storm }; storm?: Storm }
}

let loading: Promise<void> | null = null;
function loadEngine(src: string) {
  if (window.Lightning) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("lightning.js failed to load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export default function StormBackground({ src = "/lightning.js", ...options }: StormOptions & { src?: string }) {
  const key = JSON.stringify(options);
  useEffect(() => {
    let storm: Storm | undefined;
    let cancelled = false;
    loadEngine(src).then(() => {
      if (cancelled || !window.Lightning) return;
      storm = window.Lightning.create(JSON.parse(key));
      window.storm = storm; // handy for data-strike buttons and debugging
    });
    return () => { cancelled = true; storm?.destroy(); };
  }, [src, key]);
  return null;
}
