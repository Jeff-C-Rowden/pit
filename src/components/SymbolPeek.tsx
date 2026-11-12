"use client";

/**
 * S2 symbol paytable peek + game-info sheet.
 * Presentation only: amounts come from src/lib/symbolPeek.ts (the server paytables).
 * Does not start a spin. Disabled while reels are spinning so tap-to-stop is untouched.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { SandboxChip } from "@/components/SandboxChip";
import { shouldSwallowClick } from "@/lib/tapGuard";
import {
  LONG_PRESS_MS,
  PEEK_WIDTH,
  gameInfo,
  peekAmountText,
  placePeek,
  symbolPeek,
  type PeekBet,
  type PeekGame,
  type PeekPlacement,
  type SymbolPeek as PeekData,
} from "@/lib/symbolPeek";

const MOVE_CANCEL_PX = 10;

type OpenPeek = {
  symbol: string;
  label: string;
  mode: "hold" | "hover" | "pin";
  anchor: DOMRect;
  tile: HTMLElement;
};

function isFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function tileFrom(target: EventTarget | null, root: HTMLElement | null): HTMLElement | null {
  if (!root || !(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-peek-symbol]");
  if (!el || !root.contains(el)) return null;
  return el;
}

export function SymbolPeekLayer({
  game,
  bet,
  active,
  rootRef,
}: {
  game: PeekGame;
  bet: PeekBet;
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState<OpenPeek | null>(null);
  const [pos, setPos] = useState<PeekPlacement | null>(null);
  const [boxH, setBoxH] = useState(200);
  const boxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<OpenPeek | null>(null);
  openRef.current = open;
  const pressRef = useRef<{
    pointerId: number;
    tile: HTMLElement;
    x: number;
    y: number;
    timer: number;
    startedAt: number;
  } | null>(null);
  const lastHoldAt = useRef(0);
  const swallowHoldClick = useRef(false);
  const hoverTimer = useRef(0);

  const close = useCallback((restore = false) => {
    const tile = openRef.current?.tile;
    const mode = openRef.current?.mode;
    if (pressRef.current) {
      window.clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setOpen(null);
    setPos(null);
    if (restore && mode === "pin" && tile && document.contains(tile)) tile.focus();
  }, []);

  const show = useCallback((tile: HTMLElement, mode: OpenPeek["mode"]) => {
    const symbol = tile.dataset.peekSymbol;
    if (!symbol) return;
    const label = tile.dataset.peekLabel || symbol;
    const next: OpenPeek = { symbol, label, mode, anchor: tile.getBoundingClientRect(), tile };
    setOpen(next);
  }, []);

  // Dismiss on the next spin (active flips false) or unmount.
  useEffect(() => {
    if (!active) close();
  }, [active, close]);

  // Keep the box inside the viewport as the tile or window moves.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (!openRef.current) return;
      const r = openRef.current.tile.getBoundingClientRect();
      const size = { width: Math.min(PEEK_WIDTH, Math.max(160, window.innerWidth - 16)), height: boxH };
      setPos(placePeek({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, size));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, boxH]);

  useEffect(() => {
    if (!open || !boxRef.current) return;
    const h = Math.ceil(boxRef.current.getBoundingClientRect().height);
    if (h && h !== boxH) setBoxH(h);
  }, [open, boxH, bet, game]);

  // Root-level pointer / keyboard listeners. Only act while the cabinet is idle.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;

    const clearPress = () => {
      if (pressRef.current) {
        window.clearTimeout(pressRef.current.timer);
        pressRef.current = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const tile = tileFrom(e.target, root);
      if (!tile) return;
      // A click/press on a spinning reel never reaches here (active is false).
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        clearPress();
        const pointerId = e.pointerId;
        const timer = window.setTimeout(() => {
          const p = pressRef.current;
          if (!p || p.pointerId !== pointerId) return;
          lastHoldAt.current = Date.now();
          swallowHoldClick.current = true;
          show(p.tile, "hold");
        }, LONG_PRESS_MS);
        pressRef.current = { pointerId, tile, x: e.clientX, y: e.clientY, timer, startedAt: Date.now() };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p || p.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_CANCEL_PX) clearPress();
    };

    const onPointerUp = (e: PointerEvent) => {
      const p = pressRef.current;
      const held = openRef.current?.mode === "hold";
      clearPress();
      if (held && (e.pointerType === "touch" || e.pointerType === "pen")) close();
    };

    const onClickCapture = (e: MouseEvent) => {
      const now = Date.now();
      if (shouldSwallowClick(swallowHoldClick.current, lastHoldAt.current, now)) {
        swallowHoldClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      swallowHoldClick.current = false;
      if (!isFinePointer()) return;
      const tile = tileFrom(e.target, root);
      if (!tile) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = openRef.current;
      if (cur && cur.mode === "pin" && cur.tile === tile) close(true);
      else show(tile, "pin");
    };

    const onPointerOver = (e: PointerEvent) => {
      if (!isFinePointer() || e.pointerType !== "mouse") return;
      const tile = tileFrom(e.target, root);
      if (!tile) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (openRef.current?.mode === "pin") return;
      show(tile, "hover");
    };

    const onPointerOut = (e: PointerEvent) => {
      if (!isFinePointer() || e.pointerType !== "mouse") return;
      const cur = openRef.current;
      if (!cur || cur.mode !== "hover") return;
      const next = e.relatedTarget;
      if (next instanceof Node && (cur.tile.contains(next) || boxRef.current?.contains(next))) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        if (openRef.current?.mode === "hover") close();
      }, 120);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        e.preventDefault();
        close(true);
        return;
      }
      const tile = tileFrom(e.target, root);
      if (!tile) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        const cur = openRef.current;
        if (cur && cur.mode === "pin" && cur.tile === tile) close(true);
        else show(tile, "pin");
      }
    };

    const onContextMenu = (e: Event) => {
      if (openRef.current?.mode === "hold" || Date.now() - lastHoldAt.current < 800) {
        e.preventDefault();
      }
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    root.addEventListener("click", onClickCapture, true);
    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("contextmenu", onContextMenu);
    return () => {
      clearPress();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("click", onClickCapture, true);
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, rootRef, show, close]);

  // Tap elsewhere dismisses a pinned peek; hover over the popover keeps a hover peek open.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const cur = openRef.current;
      if (!cur) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (cur.tile.contains(t) || boxRef.current?.contains(t)) return;
      if (cur.mode === "pin" || cur.mode === "hover") close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Move focus into a pinned dialog; restore on close (handled in close()).
  useEffect(() => {
    if (open?.mode !== "pin") return;
    const opener = open.tile;
    const focusables = () =>
      Array.from(boxRef.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])") ?? []);
    boxRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (document.contains(opener) && openRef.current?.tile !== opener) {
        // focus restored by close()
      }
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const data = symbolPeek(game, open.symbol, bet);
  if (!data) return null;
  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top, width: Math.min(PEEK_WIDTH, Math.max(160, (typeof window !== "undefined" ? window.innerWidth : 390) - 16)) }
    : { visibility: "hidden", left: 0, top: 0, width: PEEK_WIDTH };

  const node = (
    <div
      ref={boxRef}
      className={`sym-peek${pos ? ` ${pos.placement}` : ""}`}
      role="dialog"
      aria-modal={open.mode === "pin" ? true : undefined}
      aria-label={`${data.title} pays`}
      data-testid="symbol-peek"
      data-peek-kind={data.kind}
      data-peek-symbol={data.symbol}
      data-peek-mode={open.mode}
      style={style}
      onPointerEnter={() => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }}
    >
      <div className="sym-peek-head">
        <strong className="sym-peek-title">{data.title}</strong>
        {open.mode === "pin" && (
          <button type="button" className="sym-peek-x" onClick={() => close(true)} aria-label="Close paytable peek">
            Close
          </button>
        )}
      </div>
      <p className="sym-peek-unit">{data.unit}</p>
      {data.rows.length > 0 && (
        <dl className="sym-peek-rows">
          {data.rows.map((r) => (
            <div key={r.label} className="sym-peek-row">
              <dt>{r.label}</dt>
              <dd>
                <span>{peekAmountText(r.amountCents)}</span>
                {r.extra && <small>{r.extra}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {data.note && <p className="sym-peek-note">{data.note}</p>}
    </div>
  );
  return createPortal(node, document.body);
}

export function GameInfoSheet({ game, onClose }: { game: PeekGame; onClose: () => void }) {
  const info = gameInfo(game);
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCb = useRef(onClose);
  closeCb.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCb.current();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="vault-sheet-backdrop pot-sheet-backdrop game-info-backdrop" onClick={onClose} role="presentation">
      <div
        ref={boxRef}
        className="vault-sheet panel pot-sheet game-info-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="game-info-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pot-sheet-head">
          <h3 id={titleId}>{info.title}</h3>
          <SandboxChip className="pot-sheet-sandbox" />
        </div>
        <p className="game-info-rtp">{info.rtpLine}</p>
        <p className="pot-sheet-note">{info.line}</p>
        <p className="game-info-feature">{info.feature}</p>
        <p className="pot-sheet-note">{info.sandbox}</p>
        <p className="pot-sheet-note">Long-press a symbol on the stopped reels (hover or click on a computer) to see what it pays at your current bet.</p>
        <button ref={closeRef} type="button" className="pot-sheet-close" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}

export function GameInfoButton({ game }: { game: PeekGame }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="cab-pill cab-info-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Info
      </button>
      {open && <GameInfoSheet game={game} onClose={() => setOpen(false)} />}
    </>
  );
}
