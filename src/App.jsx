import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/* ====================== CONFIG ====================== */
const COIN_ADDRESS = "6xqYUEm22exMyaVJ4TYt931dy4U3sRXVQQQLk2wepump";
const API_BASE =
  import.meta.env.DEV
    ? "http://localhost:3001"
    : (import.meta.env.VITE_API_BASE ?? "").trim() ||
      "https://mcaptek.onrender.com";

// Main headline format (chunky, no decimals)
const formatUSD = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

// Delta formatter (keeps tiny moves visible)
const formatUSDDelta = (n) => {
  const abs = Math.abs(n);
  if (abs === 0) return "0.0000";
  if (abs < 1) return abs.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  if (abs < 1000) return abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
// Percent formatter with adaptive precision
const formatPct = (p) => {
  const ap = Math.abs(p);
  if (!isFinite(ap)) return "0.00";
  if (ap === 0) return "0.00";
  if (ap < 0.01) return ap.toFixed(4);
  if (ap < 1) return ap.toFixed(3);
  return ap.toFixed(2);
};

/* ===== Milestones (cap in USD). ===== */
const MILESTONES = [
  { cap: 50_000,   label: "PAY DEX" },
  { cap: 86_000,   label: "Migration → 10× boosts" }, // migration = 86k
  { cap: 100_000,  label: "25% of creator rewards buy & burn" },
  { cap: 150_000,  label: "10× boosts" },
  { cap: 200_000,  label: "50% of creator rewards buy & burn" },
  { cap: 250_000,  label: "30× boosts" },
  { cap: 400_000,  label: "$1,000 buy & burn" },
  { cap: 500_000,  label: "100% of creator rewards buy & burn" },
  { cap: 650_000,  label: "30× boosts" },
  { cap: 850_000,  label: "100% of creator rewards buy & burn" },
  { cap: 1_000_000, label: "50× boosts + 100% of creator rewards buy & burn" },
];

/* Emoji helper based on label keywords */
const emojiFor = (label) => {
  const e = [];
  if (/boost/i.test(label)) e.push("⚡");
  if (/creator rewards.*buy.*burn/i.test(label)) e.push("🔥");
  if (/\$?\s*1,?000/i.test(label)) e.push("💰");
  return e.join(" ");
};

export default function App() {
  // animated number (value only – container stays fixed)
  const mv = useMotionValue(0);
  const smooth = useSpring(mv, { stiffness: 38, damping: 16, mass: 0.45 });

  const [display, setDisplay] = useState("$0");
  const [diff, setDiff] = useState(0);
  const [pct, setPct] = useState(0);
  const [dir, setDir] = useState(1); // -1 / 1 (sticky)
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  /* PERSISTENT achieved state: once true, never unchecks (saved to localStorage) */
  const [achieved, setAchieved] = useState(() => {
    try {
      const raw = localStorage.getItem("mcap_achieved_v1");
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === MILESTONES.length) return parsed;
    } catch {}
    return MILESTONES.map(() => false);
  });

  // keep previous valid market cap
  const prevMcRef = useRef(null);

  // cursor (your minimal luxury style)
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const trail = useRef(Array.from({ length: 6 }, () => ({ x: 0, y: 0 })));

  // ===== Milestones scroller (seamless marquee) =====
  const msWrapRef = useRef(null);       // scroll container
  const trackARef = useRef(null);       // first track width for wrap
  const firstItemRef = useRef(null);    // measure step width for arrows
  const pausedRef = useRef(false);      // hover pause
  const pauseUntilRef = useRef(0);      // pause after arrow click
  const speedRef = useRef(0.1);         // px/ms

  // helper to render a single milestone pill
  const Pill = ({ m, idx }) => {
    const reached = achieved[idx];
    return (
      <div className="inline-flex items-center">
        <div
          ref={idx === 0 ? firstItemRef : null}
          className="relative mx-1 px-3 py-1 rounded-md text-[11px] sm:text-xs font-mono inline-flex items-center gap-2"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            whiteSpace: "nowrap",
          }}
        >
          {reached && (
            <div
              className="absolute inset-0 rounded-md"
              style={{ background: "rgba(16,185,129,0.22)", boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.55)" }}
            />
          )}
          <span className="opacity-80 relative z-10">{m.cap != null ? `$${formatUSD(m.cap)}` : "Info"}</span>
          <span className="opacity-50 relative z-10">→</span>
          <span className="font-semibold relative z-10">
            {emojiFor(m.label)} {m.label}
          </span>
          {reached && <span className="relative z-10 text-emerald-400 font-bold ml-1">✔</span>}
        </div>
        <div className="h-4 w-px mx-1" style={{ background: "rgba(255,255,255,0.5)" }} />
      </div>
    );
  };

  /* =================== Effects =================== */
  useEffect(() => {
    const onMove = (e) => setCursor({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const arr = trail.current.slice();
      arr.unshift(cursor);
      arr.pop();
      trail.current = arr;
    }, 16);
    return () => clearInterval(id);
  }, [cursor]);

  useEffect(() => {
    const unsub = smooth.on("change", (v) => setDisplay(`$${formatUSD(Math.max(0, v))}`));
    return () => unsub();
  }, [smooth]);

  // 🔒 persist achieved milestones whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("mcap_achieved_v1", JSON.stringify(achieved));
    } catch {}
  }, [achieved]);

  // poll marketcap every 2s
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/marketcap?ts=${Date.now()}`, { cache: "no-store" });
        const json = await res.json();
        const mc = Number(json?.marketCap);
        if (!isFinite(mc) || mc <= 0) return;

        const prev = prevMcRef.current;

        if (prev != null && prev > 0) {
          const d = mc - prev;
          const p = prev !== 0 ? (d / prev) * 100 : 0;
          setDiff(d);
          setPct(p);
          setDir((prevDir) => (d > 0 ? 1 : d < 0 ? -1 : prevDir));
        }

        // mark newly reached milestones (sticky forever; persisted by effect above)
        setAchieved((prevAch) =>
          prevAch.map((ok, i) => ok || (MILESTONES[i].cap != null && mc >= MILESTONES[i].cap))
        );

        mv.set(mc);
        prevMcRef.current = mc;
      } catch (_) {}
    }
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [mv]);

  // measure first track width for seamless wrap
  const measureTrackWidth = () => {
    const el = trackARef.current;
    if (!el) return 0;
    return el.getBoundingClientRect().width || 0;
  };

  // true marquee loop: A + B (duplicate); when scrollLeft >= width(A), subtract width(A)
  useEffect(() => {
    const wrap = msWrapRef.current;
    if (!wrap) return;

    let raf;
    let last = performance.now();

    const tick = (ts) => {
      const dt = Math.min(50, ts - last);
      last = ts;

      const paused = pausedRef.current || performance.now() < pauseUntilRef.current;
      if (!paused) {
        const widthA = measureTrackWidth();
        if (widthA > 0) {
          wrap.scrollLeft += speedRef.current * dt;
          if (wrap.scrollLeft >= widthA) {
            wrap.scrollLeft -= widthA; // seamless wrap
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* =================== UI helpers =================== */
  const shortAddr = useMemo(() => `${COIN_ADDRESS.slice(0, 6)}…${COIN_ADDRESS.slice(-6)}`, []);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(COIN_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  };

  // delta visuals
  const arrowSymbol = dir === 1 ? "▲" : "▼";
  const arrowColor = dir === 1 ? "rgb(52 211 153)" : "rgb(244 63 94)";
  const arrowAnimY = dir === 1 ? [0, -7, 0] : [0, 7, 0];

  // arrows: step one pill; pause 2s; resume marquee from same point
  const firstItemWidth = () => {
    const el = firstItemRef.current;
    if (!el) return 160;
    const rect = el.getBoundingClientRect();
    return rect.width + 16;
  };
  const onArrow = (dirStep) => {
    const wrap = msWrapRef.current;
    if (!wrap) return;
    pauseUntilRef.current = performance.now() + 2000; // pause
    wrap.scrollBy({ left: dirStep * firstItemWidth(), behavior: "smooth" });
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden font-[Inter,ui-sans-serif,system-ui]">
      {/* Background */}
      <motion.div
        className="fixed inset-0 -z-30"
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "radial-gradient(900px 900px at -10% 10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(900px 900px at 110% 90%, rgba(59,130,246,0.14), transparent 60%), linear-gradient(120deg, #07090d, #0b0d10 40%, #0b0d10 60%, #07090d)",
          backgroundSize: "200% 200%",
        }}
      />

      {/* Cursor + faint trail */}
      <motion.div
        className="pointer-events-none fixed z-[9999]"
        animate={{ x: cursor.x, y: cursor.y }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        style={{ translateX: "-50%", translateY: "-50%" }}
      >
        <div
          className="rounded-full backdrop-blur-[3px]"
          style={{
            width: 18,
            height: 18,
            border: "1.5px solid rgba(255,255,255,0.35)",
            boxShadow: "0 0 22px rgba(255,255,255,0.18)",
          }}
        />
      </motion.div>
      {trail.current.map((p, i) => (
        <motion.div
          key={i}
          className="pointer-events-none fixed z-[9998] rounded-full"
          animate={{ x: p.x, y: p.y, opacity: 0.45 - i / (trail.current.length * 1.2) }}
          transition={{ duration: 0.12 + i * 0.02 }}
          style={{
            translateX: "-50%",
            translateY: "-50%",
            width: 4.8 - i * 0.25,
            height: 4.8 - i * 0.25,
            background: "rgba(255,255,255,0.22)",
            filter: "drop-shadow(0 0 8px rgba(16,185,129,0.35))",
          }}
        />
      ))}

      {/* Header */}
      <header className="absolute top-5 left-0 right-0 flex items-center px-4">
        {/* Left side (CA on mobile, centered on larger) */}
        <div className="flex-1 flex justify-start sm:justify-center">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs sm:text-sm bg-white/10 px-3 py-1.5 rounded border border-white/15">
              {shortAddr}
            </span>
            <button
              onClick={copyAddr}
              className="text-xs sm:text-sm px-3 py-1.5 rounded border border-emerald-400/40 hover:border-emerald-300/80 hover:bg-emerald-400/10 transition"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Right side (X + How it works) */}
        <div className="flex gap-2">
          <a
            href="https://x.com/i/communities/1973142343646593494"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs sm:text-sm rounded border border-white/15 hover:border-white/30 hover:bg-white/10 transition"
          >
            X
          </a>
          <button
            className="howwiggle px-3 py-1.5 text-xs sm:text-sm rounded border border-white/15 hover:border-white/30 hover:bg-white/10 transition"
            onClick={() => setHowOpen(true)}
          >
            How it works
          </button>
        </div>
      </header>

      {/* ===== Milestones BAR (absolute; lowered a touch; arrows outside; FADED edges; seamless loop) ===== */}
      <div
        className="absolute z-20 left-1/2 -translate-x-1/2 top-[116px] w-full max-w-4xl"
        onPointerEnter={() => { pausedRef.current = true; }}
        onPointerLeave={() => { pausedRef.current = false; }}
      >
        {/* Faded edges (opacity-only gradients) */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12"
             style={{ background: "linear-gradient(90deg, rgba(7,9,13,0.96), rgba(7,9,13,0))" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12"
             style={{ background: "linear-gradient(270deg, rgba(7,9,13,0.96), rgba(7,9,13,0))" }} />

        {/* Arrows OUTSIDE; pause on hover/click */}
        <button
          onClick={() => onArrow(-1)}
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
          className="absolute -left-7 top-1/2 -translate-y-1/2 z-10 px-2.5 py-1.5 rounded-md border border-white/15 hover:bg-white/10 text-sm"
          aria-label="Previous milestones"
        >
          ←
        </button>
        <button
          onClick={() => onArrow(1)}
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
          className="absolute -right-7 top-1/2 -translate-y-1/2 z-10 px-2.5 py-1.5 rounded-md border border-white/15 hover:bg-white/10 text-sm"
          aria-label="Next milestones"
        >
          →
        </button>

        {/* Seamless marquee: Track A + Track B (duplicate) */}
        <div
          ref={msWrapRef}
          className="no-scrollbar overflow-x-hidden whitespace-nowrap rounded-2xl border border-white/12 bg-white/[0.06] backdrop-blur-md px-8 py-1.5"
        >
          {/* Track A (measure width) */}
          <div ref={trackARef} className="inline-flex items-center align-top">
            {MILESTONES.map((m, idx) => <Pill key={`A-${idx}`} m={m} idx={idx} />)}
          </div>
          {/* Track B (duplicate continuation) */}
          <div className="inline-flex items-center align-top">
            {MILESTONES.map((m, idx) => <Pill key={`B-${idx}`} m={m} idx={idx} />)}
          </div>
        </div>
      </div>
      {/* ===== End Milestones BAR ===== */}

      {/* Main */}
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        {/* Label */}
        <div className="text-xs sm:text-sm tracking-[0.35em] uppercase text-white mb-3">
          MARKET CAP
        </div>

        {/* FIXED-WIDTH, MONOSPACE VALUE (no layout shift) */}
        <div
          className="font-extrabold leading-none text-white select-none font-mono"
          style={{
            fontSize: "clamp(56px, 14vw, 140px)",
            minWidth: "16ch",
            display: "inline-block",
            textAlign: "center",
          }}
        >
          <motion.span
            key={dir}
            animate={{
              textShadow:
                dir === 1
                  ? ["0 0 0 rgba(16,185,129,0)", "0 0 28px rgba(16,185,129,0.55)", "0 0 0 rgba(16,185,129,0)"]
                  : ["0 0 0 rgba(239,68,68,0)", "0 0 28px rgba(239,68,68,0.55)", "0 0 0 rgba(239,68,68,0)"],
            }}
            transition={{ duration: 0.9 }}
          >
            {display}
          </motion.span>
        </div>

        {/* Arrow + delta (sticky direction) */}
        <div className="mt-5 flex items-center justify-center min-h-[28px]">
          <motion.div
            key={dir + String(diff)}
            initial={{ opacity: 0, y: dir === 1 ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2 text-sm sm:text-base font-mono"
            style={{
              minWidth: "28ch",
              justifyContent: "center",
              color: arrowColor,
              textShadow: "0 0 8px currentColor",
            }}
          >
            <motion.span
              animate={{ y: arrowAnimY }}
              transition={{ duration: 0.8, repeat: 1 }}
              className="inline-block font-semibold"
              aria-hidden
            >
              {arrowSymbol}
            </motion.span>
            <span className="font-medium">
              {`${formatUSDDelta(Math.abs(diff))} (${formatPct(Math.abs(pct))}%)`}
            </span>
            <span className="opacity-60 not-italic">since last snapshot</span>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-4 left-0 right-0 text-center text-[11px] sm:text-xs text-white/60">
        Built for the culture • $mCAP • mcaptek
      </footer>

      {/* How it works modal */}
      {howOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setHowOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="relative w=[min(92vw,800px)] w-[min(92vw,800px)] rounded-2xl overflow-hidden border border-white/12 bg-white/[0.06] backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
          >
            <button
              onClick={() => setHowOpen(false)}
              className="absolute top-3 right-3 px-2 py-1 text-xs rounded border border-white/15 hover:bg-white/10"
            >
              Close
            </button>
            <div className="p-6 sm:p-10 text-left">
              <h3 className="text-xl sm:text-2xl font-bold mb-4">How the $mCAP tek works</h3>
              <ul className="space-y-3 text-sm sm:text-base leading-relaxed">
                <li>• Every buy triggers the <strong>Hyper-Quantum Pool Recalibration™</strong>.</li>
                <li>• We ping the <strong>Liquidity Flux Capacitor</strong> (it politely nudges price up).</li>
                <li>• The <strong>Market-Cap Multiplier</strong> performs advanced math: <em>number go higher</em>.</li>
                <li>• The <strong>Auto-Pump Autoscaler</strong> converts vibes → velocity → valuation.</li>
                <li>• Result: <strong>More buys = bigger $mCAP</strong>. That’s the tek.</li>
              </ul>
              <div className="mt-6 text-white/80 text-sm">
                TL;DR: You buy → pools swirl → line goes up → $mCAP does cardio.
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Local styles */}
      <style>{`
        .howwiggle { animation: wiggle 2s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes wiggle {
          0%, 92%, 100% { transform: translateX(0) rotate(0); }
          94% { transform: translateX(-2px) rotate(-1deg); }
          96% { transform: translateX(2px) rotate(1deg); }
          98% { transform: translateX(-1px) rotate(-0.5deg); }
        }
      `}</style>
    </div>
  );
}


