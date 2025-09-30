import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/* ====================== CONFIG ====================== */
const COIN_ADDRESS = "...pump";
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

  // keep the previous valid market cap in a ref (prevents race w/ setState)
  const prevMcRef = useRef(null);

  // minimal luxury cursor (subtle ring)
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const trail = useRef(Array.from({ length: 6 }, () => ({ x: 0, y: 0 })));

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

  // keep formatted number (monospace) from spring
  useEffect(() => {
    const unsub = smooth.on("change", (v) => setDisplay(`$${formatUSD(Math.max(0, v))}`));
    return () => unsub();
  }, [smooth]);

  // poll marketcap every 2s
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/marketcap?ts=${Date.now()}`, { cache: "no-store" });
        const json = await res.json();
        const mc = Number(json?.marketCap);
        if (!isFinite(mc) || mc <= 0) return; // ignore bad data

        const prev = prevMcRef.current;

        if (prev != null && prev > 0) {
          const d = mc - prev;
          // safe percent: if prev extremely small, fall back to 0
          const p = prev !== 0 ? (d / prev) * 100 : 0;

          setDiff(d);
          setPct(p);
          // STICKY DIRECTION: if no change, keep previous direction
          setDir((prevDir) => (d > 0 ? 1 : d < 0 ? -1 : prevDir));
        }

        // update springs and prev after computing deltas
        mv.set(mc);
        prevMcRef.current = mc;
      } catch (_) {
        // keep prior snapshot/diff
      }
    }
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [mv]);

  const shortAddr = useMemo(() => `${COIN_ADDRESS.slice(0, 6)}…${COIN_ADDRESS.slice(-6)}`, []);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(COIN_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  };

  // === Arrow helpers (ALWAYS visible) ===
  const arrowSymbol = dir === 1 ? "▲" : "▼";
  const arrowColor = dir === 1 ? "rgb(52 211 153)" : "rgb(244 63 94)";
  const arrowAnimY = dir === 1 ? [0, -7, 0] : [0, 7, 0];

  // Signed strings using precise formatters
  const signedAmount = `${dir === 1 ? "+" : "-"}${formatUSDDelta(diff)}`;
  const signedPct = `${dir === 1 ? "+" : "-"}${formatPct(pct)}%`;

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

      {/* Subtle cursor */}
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
          {/* animate glow only (no scale/position) */}
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

        {/* Arrow + delta (ALWAYS visible, sticky direction, monospaced, fixed width) */}
        <div className="mt-5 flex items-center justify-center min-h-[28px]">
          <motion.div
            key={dir + String(diff)} // retrigger slight motion on each refresh
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
              {`${signedAmount} (${signedPct})`}
            </span>
            <span className="opacity-60 not-italic">since last snapshot</span>
          </motion.div>
        </div>
      </main>

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


