import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import packageMetadata from "../package.json";
import { calculatePuzzleProfile, createSession, extendSelection, formatCount, formatDuration, gameReducer, pathsMatch, positionKey, type GameSession } from "./app-model.js";
import { DEFAULT_FEEDBACK_SETTINGS, playFeedback, startFeedback, type FeedbackSettings } from "./feedback.js";
import { clearActiveGame, loadActiveGame, loadColorMode, loadCompletedThemeIds, loadFeedbackSettings, loadHistory, resetApplicationState, saveActiveGame, saveColorMode, saveCompletion, saveFeedbackSettings, type ColorMode, type HistoryRecord } from "./persistence.js";
import { getTheme, SELECTION_COLORS, selectRandomTheme, THEMES } from "./themes.js";
import { changeStartMenuLetters, createStartMenuGrid } from "./start-menu.js";
import type { Position, PuzzleCell } from "./types.js";
import "./styles.css";

interface WordSearchDebugApi {
  highlightWords(): void;
  hideWords(): void;
  toggleWords(): void;
  loadTheme(idOrTitle: string): string;
}

declare global {
  interface Window { wordSearchDebug?: WordSearchDebugApi }
}

function Icon({ name }: { readonly name: "history" | "menu" | "moon" | "sun" | "close" }) {
  const paths = {
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    menu: <><path d="M5 7h14M5 12h14M5 17h14"/></>,
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function StartScreen({ hasProgress, feedbackSettings, onStart }: {
  readonly hasProgress: boolean;
  readonly feedbackSettings: FeedbackSettings;
  readonly onStart: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  const grid = useMemo(() => createStartMenuGrid(window.innerWidth, window.innerHeight, SELECTION_COLORS), []);
  const baseLetters = useMemo(() => new Map(grid.cells.map((cell) => [`${cell.x},${cell.y}`, cell.letter])), [grid.cells]);
  const [letterState, setLetterState] = useState<{
    readonly letters: ReadonlyMap<string, string>;
    readonly transitions: ReadonlyMap<string, { readonly previous: string; readonly current: string; readonly revision: number }>;
  }>(() => ({ letters: new Map(), transitions: new Map() }));

  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const randomValue = () => {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      return value[0]!;
    };
    const schedule = () => {
      if (reducedMotion.matches) return;
      timer = window.setTimeout(() => {
        if (!document.hidden) setLetterState((current) => {
          const letters = changeStartMenuLetters(grid.cells, current.letters, 2 + randomValue() % 2);
          const transitions = new Map(current.transitions);
          for (const [key, letter] of letters) {
            const previous = current.letters.get(key) ?? baseLetters.get(key)!;
            if (previous === letter) continue;
            transitions.set(key, { previous, current: letter, revision: (transitions.get(key)?.revision ?? 0) + 1 });
          }
          return { letters, transitions };
        });
        schedule();
      }, 700 + randomValue() % 301);
    };
    const update = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      schedule();
    };
    reducedMotion.addEventListener("change", update);
    schedule();
    return () => {
      reducedMotion.removeEventListener("change", update);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [baseLetters, grid.cells]);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    await startFeedback(feedbackSettings);
    playFeedback("start", feedbackSettings);
    await onStart();
  };

  const gridStyle = { "--menu-columns": grid.columns, "--menu-rows": grid.rows } as CSSProperties;
  return <main className="start-screen" style={gridStyle}>
    {grid.cells.map((cell) => {
      const key = `${cell.x},${cell.y}`;
      const transition = letterState.transitions.get(key);
      const letter = letterState.letters.get(key) ?? cell.letter;
      return <span
      key={key}
      className={`menu-cell${cell.color === undefined ? "" : " is-selected"}${transition === undefined ? "" : " is-changing"}`}
      style={{
        gridColumn: cell.x + 1,
        gridRow: cell.y + 1,
        ...(cell.color === undefined ? {} : { "--selection-color": cell.color }),
      } as CSSProperties}
      data-menu-cell="true"
      data-selected={cell.color === undefined ? undefined : "true"}
      aria-hidden="true"
    >{transition === undefined
      ? <span>{letter}</span>
      : <><span key={`previous-${transition.revision}`} className="menu-letter-previous">{transition.previous}</span><span key={`current-${transition.revision}`} className="menu-letter-current">{transition.current}</span></>
    }</span>;
    })}
    <button
      className="start-button"
      style={{ gridColumn: `${grid.actionColumn + 1} / span ${grid.actionSpan}`, gridRow: grid.actionRow + 1 }}
      onClick={() => void start()}
      disabled={starting}
    >{starting ? "Starting…" : hasProgress ? "Continue" : "New Game"}</button>
  </main>;
}

function Modal({ labelledBy, className, onClose, children }: {
  readonly labelledBy: string;
  readonly className: string;
  readonly onClose?: () => void;
  readonly children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    (firstFocusable ?? dialog)?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && onClose !== undefined) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="overlay" role="presentation">
    <section ref={dialogRef} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} onKeyDown={handleKeyDown}>
      {children}
    </section>
  </div>;
}

function profileForCurrentScreen() {
  const width = Math.min(window.screen.width, window.innerWidth);
  const height = window.visualViewport?.height ?? window.innerHeight;
  return calculatePuzzleProfile(width, height);
}

interface OrientationPolicy {
  readonly supported: boolean;
  readonly requiredOrientation?: "portrait" | "landscape";
}

function useOrientationPolicy(): OrientationPolicy {
  const coarsePointer = matchMedia("(pointer: coarse)");
  const landscape = matchMedia("(orientation: landscape)");
  const read = (): OrientationPolicy => {
    if (!coarsePointer.matches) return { supported: true };
    const tablet = Math.min(window.screen.width, window.screen.height) >= 600;
    const requiredOrientation = tablet ? "landscape" : "portrait";
    return { supported: landscape.matches === tablet, requiredOrientation };
  };
  const [policy, setPolicy] = useState(read);
  useEffect(() => {
    const update = () => setPolicy(read());
    landscape.addEventListener("change", update);
    coarsePointer.addEventListener("change", update);
    return () => {
      landscape.removeEventListener("change", update);
      coarsePointer.removeEventListener("change", update);
    };
  }, []);
  return policy;
}

function useGameTimer(session: GameSession, paused: boolean, onElapsed: (value: number) => void) {
  const accumulated = useRef(session.elapsedMs);
  const startedAt = useRef<number | null>(session.status === "playing" && !paused ? performance.now() : null);
  const [display, setDisplay] = useState(session.elapsedMs);
  const callback = useRef(onElapsed);
  callback.current = onElapsed;

  const current = useCallback(() => accumulated.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current), []);
  const commit = useCallback((continueRunning = false) => {
    const wasRunning = startedAt.current !== null;
    const value = current();
    accumulated.current = value;
    startedAt.current = continueRunning && wasRunning ? performance.now() : null;
    setDisplay(value);
    callback.current(value);
    return value;
  }, [current]);

  useEffect(() => {
    const shouldRun = session.status === "playing" && !paused;
    if (shouldRun && startedAt.current === null) startedAt.current = performance.now();
    if (!shouldRun && startedAt.current !== null) commit(false);
    if (!shouldRun) return;
    const timer = window.setInterval(() => setDisplay(current()), 250);
    return () => window.clearInterval(timer);
  }, [commit, current, paused, session.status]);

  useEffect(() => {
    if (session.status !== "playing" || paused) return;
    const timer = window.setInterval(() => commit(true), 5_000);
    return () => window.clearInterval(timer);
  }, [commit, paused, session.status]);

  return { elapsed: display, getElapsed: current, pause: () => commit(false) };
}

interface GridProps {
  readonly session: GameSession;
  readonly colors: ReadonlyMap<string, string>;
  readonly onSelection: (path: readonly Position[]) => string | undefined;
  readonly currentColor: string;
  readonly debugWords: boolean;
  readonly onCellFeedback: (kind: "cell" | "reject") => void;
}

function PuzzleGrid({ session, colors, onSelection, currentColor, debugWords, onCellFeedback }: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const selectionRef = useRef<Position[]>([]);
  const [selection, setSelection] = useState<Position[]>([]);
  const [selectionColor, setSelectionColor] = useState<string>();
  const [rejectingCell, setRejectingCell] = useState<string>();
  const [locked, setLocked] = useState(false);
  const activeKeys = useMemo(() => new Set(selection.map(positionKey)), [selection]);
  const debugKeys = useMemo(() => new Set(session.puzzle.entries.flatMap((entry) => entry.path.map(positionKey))), [session.puzzle.entries]);
  const solvedCells = useMemo(() => {
    const result = new Map<string, string>();
    for (const entry of session.puzzle.entries) {
      if (!session.solvedWords.includes(entry.word)) continue;
      for (const position of entry.path) result.set(positionKey(position), session.solvedColors[entry.word] ?? colors.get(entry.word) ?? "#777");
    }
    return result;
  }, [colors, session.puzzle.entries, session.solvedColors, session.solvedWords]);

  const addCell = useCallback((position: Position) => {
    if (locked || solvedCells.has(positionKey(position))) return;
    const current = selectionRef.current;
    const next = extendSelection(current, position);
    if (next.length !== current.length) onCellFeedback("cell");
    selectionRef.current = next;
    setSelection(next);
  }, [locked, onCellFeedback, solvedCells]);

  const positionFromPointer = (event: PointerEvent<HTMLDivElement>): Position | undefined => {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-cell]");
    if (element === null || element === undefined) return undefined;
    const x = Number(element.dataset.x);
    const y = Number(element.dataset.y);
    return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : undefined;
  };

  const rollback = useCallback((path: readonly Position[]) => {
    setLocked(true);
    const remaining = [...path];
    const step = () => {
      const last = remaining[remaining.length - 1];
      if (last === undefined) {
        setRejectingCell(undefined);
        selectionRef.current = [];
        setSelection([]);
        setSelectionColor(undefined);
        setLocked(false);
        return;
      }
      onCellFeedback("reject");
      setRejectingCell(positionKey(last));
      window.setTimeout(() => {
        remaining.pop();
        selectionRef.current = remaining;
        setSelection([...remaining]);
        window.setTimeout(step, 20);
      }, 42);
    };
    step();
  }, [onCellFeedback]);

  const finish = () => {
    if (pointerId.current === null || locked) return;
    if (gridRef.current?.hasPointerCapture(pointerId.current)) gridRef.current.releasePointerCapture(pointerId.current);
    pointerId.current = null;
    const path = selectionRef.current;
    if (path.length === 0) return;
    const found = onSelection(path);
    if (found === undefined) rollback(path);
    else {
      setLocked(true);
      window.setTimeout(() => { selectionRef.current = []; setSelection([]); setSelectionColor(undefined); setLocked(false); }, 280);
    }
  };

  const gridStyle = {
    "--grid-columns": session.puzzle.size.width,
    "--grid-rows": session.puzzle.size.height,
    "--preferred-cell": `${session.profile.preferredCellSize}px`,
    "--preferred-grid-width": `${session.puzzle.size.width * session.profile.preferredCellSize + (session.puzzle.size.width - 1) * 4}px`,
    "--active-color": selectionColor ?? currentColor,
  } as CSSProperties;

  const rowBandSize = Math.ceil(session.puzzle.size.height / 6);
  const rowBands = Array.from(
    { length: Math.ceil(session.puzzle.size.height / rowBandSize) },
    (_, bandIndex) => session.puzzle.grid.slice(bandIndex * rowBandSize, (bandIndex + 1) * rowBandSize),
  );

  return (
    <div
      ref={gridRef}
      className={`puzzle-grid${locked ? " is-locked" : ""}`}
      style={gridStyle}
      role="grid"
      aria-label={`${session.puzzle.size.width} by ${session.puzzle.size.height} word search`}
      onPointerDown={(event) => {
        if (locked || session.status !== "playing") return;
        const position = positionFromPointer(event);
        if (position === undefined || solvedCells.has(positionKey(position))) return;
        event.preventDefault();
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectionColor(currentColor);
        selectionRef.current = [position];
        setSelection(selectionRef.current);
        onCellFeedback("cell");
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId || locked) return;
        const position = positionFromPointer(event);
        if (position !== undefined) addCell(position);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {rowBands.map((band, bandIndex) => (
        <div
          key={bandIndex}
          className="puzzle-band"
          role="rowgroup"
          style={{
            "--band-delay": `${bandIndex * 70}ms`,
            "--band-rows": band.length,
          } as CSSProperties}
        >
          {band.flatMap((row) => row.map((cell: PuzzleCell) => {
            const key = positionKey(cell.position);
            const solvedColor = solvedCells.get(key);
            const cellStyle = solvedColor === undefined ? undefined : { "--selection-color": solvedColor } as CSSProperties;
            return (
              <div
                key={key}
                role="gridcell"
                data-cell="true"
                data-x={cell.position.x}
                data-y={cell.position.y}
                aria-label={`Row ${cell.position.y + 1}, column ${cell.position.x + 1}, ${cell.letter || "empty"}`}
                className={`puzzle-cell${cell.isBorder ? " is-border" : ""}${activeKeys.has(key) ? " is-active" : ""}${solvedColor !== undefined ? " is-solved" : ""}${rejectingCell === key ? " is-rejecting" : ""}${debugWords && debugKeys.has(key) ? " is-debug" : ""}`}
                style={cellStyle}
              >
                <span>{cell.letter}</span>
              </div>
            );
          }))}
        </div>
      ))}
    </div>
  );
}

function summarizeHistory(records: readonly HistoryRecord[]) {
  return records.reduce((result, record) => ({
    elapsedMs: result.elapsedMs + record.elapsedMs,
    words: result.words + record.wordCount,
    lettersSelected: result.lettersSelected + record.lettersSelected,
  }), { elapsedMs: 0, words: 0, lettersSelected: 0 });
}

function historyRecordFor(session: GameSession): HistoryRecord {
  if (session.completedAt === undefined) throw new Error("Cannot create history for an unfinished puzzle.");
  return { id: session.id, themeId: session.themeId, themeTitle: getTheme(session.themeId).title, seed: session.seed, elapsedMs: session.elapsedMs, wordCount: session.targetWords.length, lettersSelected: session.lettersSelected, completedAt: session.completedAt, profile: session.profile };
}

function HistoryDialog({ records, completedCount, onClose }: { readonly records: readonly HistoryRecord[]; readonly completedCount: number; readonly onClose: () => void }) {
  const totals = summarizeHistory(records);
  return (
    <Modal labelledBy="history-title" className="history-dialog" onClose={onClose}>
        <header><div><p className="eyebrow">Your journey</p><h2 id="history-title">History</h2></div><button className="icon-button" onClick={onClose} aria-label="Close history"><Icon name="close" /></button></header>
        <section className="history-summary" aria-label="Global progress">
          <p className="eyebrow">Global progress</p>
          <dl>
            <div><dt>Progress</dt><dd>{completedCount} / {THEMES.length}</dd></div>
            <div><dt>Total time</dt><dd>{formatDuration(totals.elapsedMs)}</dd></div>
            <div><dt>Words found</dt><dd>{formatCount(totals.words)}</dd></div>
            <div><dt>Letters</dt><dd>{formatCount(totals.lettersSelected)}</dd></div>
          </dl>
        </section>
        {records.length === 0 ? <p className="empty-state">Complete a puzzle and it will appear here.</p> : (
          <ol className="history-list">{records.map((record) => (
            <li key={record.id}>
              <div><strong>{record.themeTitle}</strong><span>{new Date(record.completedAt).toLocaleDateString()}</span></div>
              <dl><div><dt>Time</dt><dd>{formatDuration(record.elapsedMs)}</dd></div><div><dt>Words</dt><dd>{record.wordCount}</dd></div><div><dt>Letters</dt><dd>{record.lettersSelected}</dd></div></dl>
            </li>
          ))}</ol>
        )}
    </Modal>
  );
}

function WinDialog({ session, onNext }: { readonly session: GameSession; readonly onNext: () => void }) {
  const theme = getTheme(session.themeId);
  return (
    <Modal labelledBy="win-title" className="win-dialog">
        <div className="win-mark">✓</div><p className="eyebrow">Puzzle complete</p><h2 id="win-title">Nicely found.</h2><p className="win-theme">{theme.title}</p>
        <dl className="stats"><div><dt>Time</dt><dd>{formatDuration(session.elapsedMs)}</dd></div><div><dt>Words</dt><dd>{session.targetWords.length}</dd></div><div><dt>Letters</dt><dd>{session.lettersSelected}</dd></div></dl>
        <button className="primary-button" onClick={onNext}>Next puzzle <span aria-hidden="true">→</span></button>
    </Modal>
  );
}

function CollectionCompleteDialog({ session, records, onReset }: { readonly session: GameSession; readonly records: readonly HistoryRecord[]; readonly onReset: () => void }) {
  const completeRecords = records.some(({ id }) => id === session.id) ? records : [historyRecordFor(session), ...records];
  const totals = summarizeHistory(completeRecords);
  return (
    <Modal labelledBy="collection-title" className="win-dialog">
        <div className="win-mark">★</div><p className="eyebrow">Every puzzle complete</p><h2 id="collection-title">You found them all!</h2>
        <p className="dialog-copy">Congratulations — you completed all {THEMES.length} word-search grids.</p>
        <section className="history-summary lifetime-summary" aria-label="Lifetime summary">
          <p className="eyebrow">Lifetime summary</p>
          <dl>
            <div><dt>Puzzles</dt><dd>{completeRecords.length}</dd></div>
            <div><dt>Total time</dt><dd>{formatDuration(totals.elapsedMs)}</dd></div>
            <div><dt>Words found</dt><dd>{formatCount(totals.words)}</dd></div>
            <div><dt>Letters</dt><dd>{formatCount(totals.lettersSelected)}</dd></div>
          </dl>
        </section>
        <p className="dialog-copy">Reset everything to clear this summary, your history, preferences, and all progress before starting over.</p>
        <button className="primary-button" onClick={onReset}>Reset everything <span aria-hidden="true">↻</span></button>
    </Modal>
  );
}

function SettingsDialog({ settings, colorMode, onSettings, onColorMode, onReset, onClose }: {
  readonly settings: FeedbackSettings;
  readonly colorMode: ColorMode;
  readonly onSettings: (settings: FeedbackSettings) => void;
  readonly onColorMode: (mode: ColorMode) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}) {
  const updateSettings = (next: FeedbackSettings) => {
    onSettings(next);
    void startFeedback(next);
  };
  return (
    <Modal labelledBy="settings-title" className="settings-dialog" onClose={onClose}>
      <header><div><p className="eyebrow">Game menu</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close menu"><Icon name="close" /></button></header>
      <div className="settings-list">
        <label className="volume-setting" htmlFor="volume"><span><strong>Volume</strong><output htmlFor="volume">{Math.round(settings.volume * 100)}%</output></span><input id="volume" aria-label="Volume" type="range" min="0" max="100" step="1" value={Math.round(settings.volume * 100)} onChange={(event) => updateSettings({ ...settings, volume: Number(event.currentTarget.value) / 100 })} /></label>
        <label className="check-setting"><span><strong>Vibration</strong><small>Where supported</small></span><input type="checkbox" checked={settings.vibrationEnabled} onChange={(event) => updateSettings({ ...settings, vibrationEnabled: event.currentTarget.checked })} /></label>
        <div className="theme-setting"><strong>Appearance</strong><div className="theme-toggle" role="group" aria-label="Color mode"><button type="button" aria-label="Use light mode" aria-pressed={colorMode === "light"} onClick={() => onColorMode("light")}><Icon name="sun" /></button><button type="button" aria-label="Use dark mode" aria-pressed={colorMode === "dark"} onClick={() => onColorMode("dark")}><Icon name="moon" /></button></div></div>
      </div>
      <button className="reset-all-button" onClick={onReset}>Reset all progress</button>
      <p className="settings-version">Version {packageMetadata.version}</p>
    </Modal>
  );
}

function ResetEverythingDialog({ onConfirm, onClose }: { readonly onConfirm: () => void; readonly onClose: () => void }) {
  return <Modal labelledBy="reset-title" className="reset-dialog" onClose={onClose}>
    <p className="eyebrow">Reset everything</p><h2 id="reset-title">Erase all progress?</h2>
    <p className="dialog-copy">This permanently removes the current puzzle, history, settings, and lifetime progress.</p>
    <div className="reset-actions"><button className="secondary-button danger-button" onClick={onConfirm}>Reset everything</button><button className="secondary-button" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function Game({ initialSession, colorMode, feedbackSettings, isFinalPuzzle, completedCount, lifetimeRecords, onColorMode, onFeedbackSettings, onSession, onComplete, onNext, onResetEverything, onDebugLoadTheme }: {
  readonly initialSession: GameSession; readonly colorMode: ColorMode; readonly onColorMode: (mode: ColorMode) => void;
  readonly feedbackSettings: FeedbackSettings; readonly onFeedbackSettings: (settings: FeedbackSettings) => void;
  readonly isFinalPuzzle: boolean;
  readonly completedCount: number;
  readonly lifetimeRecords: readonly HistoryRecord[];
  readonly onSession: (session: GameSession) => void; readonly onNext: (session: GameSession) => void;
  readonly onComplete: (session: GameSession) => void;
  readonly onResetEverything: () => void;
  readonly onDebugLoadTheme: (idOrTitle: string) => string;
}) {
  const [session, dispatch] = useReducer(gameReducer, initialSession);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [hidden, setHidden] = useState(document.hidden);
  const [debugWords, setDebugWords] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const theme = getTheme(session.themeId);
  const colors = useMemo(() => new Map(session.targetWords.map((word, index) => [word, theme.colors[index % theme.colors.length]!])), [session.targetWords, theme.colors]);
  const currentColor = theme.colors[selectionIndex % theme.colors.length]!;
  const { elapsed, getElapsed, pause } = useGameTimer(session, historyOpen || menuOpen || resetOpen || hidden, (value) => dispatch({ type: "set-elapsed", elapsedMs: value }));
  const cellFeedback = useCallback((kind: "cell" | "reject") => playFeedback(kind, feedbackSettings), [feedbackSettings]);

  useEffect(() => onSession(session), [onSession, session]);
  useEffect(() => {
    const save = () => { void saveActiveGame({ ...session, elapsedMs: getElapsed() }); };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [getElapsed, session]);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (session.status !== "completed" || session.completedAt === undefined) return;
    onComplete(session);
  }, [onComplete, session]);
  useEffect(() => {
    const api: WordSearchDebugApi = {
      highlightWords: () => setDebugWords(true),
      hideWords: () => setDebugWords(false),
      toggleWords: () => setDebugWords((current) => !current),
      loadTheme: onDebugLoadTheme,
    };
    window.wordSearchDebug = api;
    return () => { if (window.wordSearchDebug === api) delete window.wordSearchDebug; };
  }, [onDebugLoadTheme]);

  const onSelection = (path: readonly Position[]) => {
    const match = session.puzzle.entries.find((entry) => !session.solvedWords.includes(entry.word) && pathsMatch(path, entry.path));
    const currentElapsed = getElapsed();
    dispatch({ type: "selection", elapsedMs: currentElapsed, color: currentColor, letterCount: path.length, ...(match === undefined ? {} : { word: match.word }) });
    if (match !== undefined) {
      playFeedback(session.solvedWords.length + 1 === session.targetWords.length ? "complete" : "word", feedbackSettings);
    }
    setSelectionIndex((current) => current + 1);
    return match?.word;
  };

  const openHistory = async () => {
    pause();
    try { setHistory(await loadHistory()); }
    catch { setHistory([]); }
    setHistoryOpen(true);
  };

  return (
    <main className={`app-shell${session.profile.columns < 8 ? " mobile-layout" : ""}`}>
      <header className="topbar"><h1>{theme.title}</h1><div className="topbar-actions"><button className="icon-button" onClick={() => void openHistory()} aria-label="Open history"><Icon name="history" /></button><button className="icon-button" onClick={() => { pause(); setMenuOpen(true); }} aria-label="Open menu"><Icon name="menu" /></button></div></header>
      <div className="puzzle-content">
        <section className="word-list" aria-label="Words to find">{session.targetWords.map((word) => {
          const solved = session.solvedWords.includes(word);
          const style = solved ? { "--selection-color": session.solvedColors[word] ?? colors.get(word) } as CSSProperties : undefined;
          return <span key={word} className={`word-chip${solved ? " is-solved" : ""}`} style={style}>{word}</span>;
        })}</section>
        <section className="board-stage"><PuzzleGrid session={session} colors={colors} onSelection={onSelection} currentColor={currentColor} debugWords={debugWords} onCellFeedback={cellFeedback} /></section>
      </div>
      <footer className="game-footer"><span>{session.solvedWords.length} / {session.targetWords.length} found</span><span className="timer" aria-label={`Elapsed time ${formatDuration(elapsed)}`}>{formatDuration(elapsed)}</span></footer>
      {historyOpen && <HistoryDialog records={history} completedCount={completedCount} onClose={() => setHistoryOpen(false)} />}
      {menuOpen && <SettingsDialog settings={feedbackSettings} colorMode={colorMode} onSettings={onFeedbackSettings} onColorMode={onColorMode} onReset={() => { setMenuOpen(false); setResetOpen(true); }} onClose={() => setMenuOpen(false)} />}
      {resetOpen && <ResetEverythingDialog onConfirm={onResetEverything} onClose={() => setResetOpen(false)} />}
      {session.status === "completed" && (isFinalPuzzle
        ? <CollectionCompleteDialog session={session} records={lifetimeRecords} onReset={onResetEverything} />
        : <WinDialog session={session} onNext={() => onNext(session)} />)}
    </main>
  );
}

export default function App() {
  const orientation = useOrientationPolicy();
  const initialized = useRef(false);
  const [session, setSession] = useState<GameSession>();
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [feedbackSettings, setFeedbackSettings] = useState<FeedbackSettings>(DEFAULT_FEEDBACK_SETTINGS);
  const [started, setStarted] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [completedThemeIds, setCompletedThemeIds] = useState<readonly string[]>([]);
  const [lifetimeRecords, setLifetimeRecords] = useState<readonly HistoryRecord[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!orientation.supported || initialized.current) return;
    initialized.current = true;
    void Promise.all([loadActiveGame(), loadColorMode(), loadFeedbackSettings(), loadCompletedThemeIds(), loadHistory()]).then(([active, mode, persistedFeedbackSettings, persistedCompleted, persistedHistory]) => {
      const resolvedMode = mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
      const knownIds = new Set(THEMES.map((theme) => theme.id));
      const completed = persistedCompleted.filter((id) => knownIds.has(id));
      const activeGame = active !== undefined && knownIds.has(active.themeId) ? active : undefined;
      setColorMode(resolvedMode);
      setFeedbackSettings(persistedFeedbackSettings);
      setHasProgress(activeGame !== undefined || completed.length > 0 || persistedHistory.length > 0);
      setCompletedThemeIds(completed);
      setLifetimeRecords(persistedHistory);
      try {
        const theme = activeGame === undefined ? selectRandomTheme(new Set(completed)) : undefined;
        setSession(activeGame ?? createSession(theme ?? selectRandomTheme()!, profileForCurrentScreen()));
      }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a puzzle."); }
    }).catch(() => {
      setHasProgress(false);
      try { setSession(createSession(selectRandomTheme()!, profileForCurrentScreen())); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a puzzle."); }
    });
  }, [orientation.supported]);

  useEffect(() => {
    const dark = colorMode === "dark" || (colorMode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [colorMode]);

  const updateMode = (mode: ColorMode) => { setColorMode(mode); void saveColorMode(mode); };
  const updateFeedbackSettings = (settings: FeedbackSettings) => { setFeedbackSettings(settings); void saveFeedbackSettings(settings); };
  const updateSession = useCallback((next: GameSession) => { setSession(next); void saveActiveGame(next); }, []);
  const resetEverything = useCallback(() => {
    void resetApplicationState().then(() => {
      const mode: ColorMode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const fresh = createSession(selectRandomTheme()!, profileForCurrentScreen());
      setColorMode(mode);
      setFeedbackSettings(DEFAULT_FEEDBACK_SETTINGS);
      setCompletedThemeIds([]);
      setLifetimeRecords([]);
      setSession(fresh);
      setHasProgress(false);
      setStarted(false);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not reset the application."));
  }, []);
  const completePuzzle = useCallback((completed: GameSession) => {
    if (completed.completedAt === undefined) return;
    setCompletedThemeIds((current) => current.includes(completed.themeId) ? current : [...current, completed.themeId]);
    const record = historyRecordFor(completed);
    setLifetimeRecords((current) => current.some(({ id }) => id === record.id) ? current : [record, ...current]);
    void saveCompletion(record)
      .then(setCompletedThemeIds)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not save puzzle completion."));
  }, []);
  const nextPuzzle = useCallback((current: GameSession) => {
    const completed = new Set([...completedThemeIds, current.themeId]);
    const nextTheme = selectRandomTheme(completed);
    try {
      if (nextTheme === undefined) throw new Error("All puzzles have already been completed.");
      const next = createSession(nextTheme, profileForCurrentScreen());
      setSession(next); void clearActiveGame().then(() => saveActiveGame(next));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the next puzzle."); }
  }, [completedThemeIds]);
  const loadDebugTheme = useCallback((idOrTitle: string) => {
    if (typeof idOrTitle !== "string" || idOrTitle.trim() === "") throw new Error("Provide a theme ID or title.");
    const query = idOrTitle.trim().toLocaleLowerCase("und");
    const exactId = THEMES.find((theme) => theme.id.toLocaleLowerCase("und") === query);
    const titleMatches = THEMES.filter((theme) => theme.title.toLocaleLowerCase("und") === query);
    if (exactId === undefined && titleMatches.length > 1) {
      throw new Error(`Theme title “${idOrTitle}” is ambiguous. Use one of: ${titleMatches.map(({ id }) => id).join(", ")}`);
    }
    const theme = exactId ?? titleMatches[0];
    if (theme === undefined) throw new Error(`Unknown theme: ${idOrTitle}`);
    const loaded = createSession(theme, profileForCurrentScreen());
    setError(undefined);
    setSession(loaded);
    void clearActiveGame().then(() => saveActiveGame(loaded));
    return theme.id;
  }, []);

  if (!orientation.supported) return <div className="orientation-guard"><div className="phone-icon">↻</div><strong>Turn your device</strong><span>This puzzle is designed for {orientation.requiredOrientation} play.</span></div>;
  if (error !== undefined) return <main className="loading-screen"><p className="eyebrow">Something went wrong</p><h1>{error}</h1><button className="primary-button" onClick={() => location.reload()}>Try again</button></main>;
  if (session === undefined) return <main className="loading-screen"><div className="loader"/><p>Preparing your puzzle…</p></main>;
  if (!started) return <StartScreen hasProgress={hasProgress} feedbackSettings={feedbackSettings} onStart={async () => setStarted(true)} />;
  const completedBeforeCurrent = completedThemeIds.filter((id) => id !== session.themeId).length;
  return <Game key={session.id} initialSession={session} colorMode={colorMode} feedbackSettings={feedbackSettings} isFinalPuzzle={completedBeforeCurrent === THEMES.length - 1} completedCount={completedThemeIds.length} lifetimeRecords={lifetimeRecords} onColorMode={updateMode} onFeedbackSettings={updateFeedbackSettings} onSession={updateSession} onComplete={completePuzzle} onNext={nextPuzzle} onResetEverything={resetEverything} onDebugLoadTheme={loadDebugTheme}/>;
}
