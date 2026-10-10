import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { calculatePuzzleProfile, createSession, extendSelection, formatCount, formatDuration, gameReducer, pathsMatch, positionKey, resetSession, GENERATOR_VERSION, type GameSession } from "./app-model.js";
import { playFeedback, startFeedback } from "./feedback.js";
import { clearActiveGame, loadActiveGame, loadColorMode, loadCompletedThemeIds, loadFeedbackEnabled, loadHistory, resetApplicationState, saveActiveGame, saveColorMode, saveCompletion, saveFeedbackEnabled, type ColorMode, type HistoryRecord } from "./persistence.js";
import { getTheme, SELECTION_COLORS, selectRandomTheme, THEMES } from "./themes.js";
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

function Icon({ name }: { readonly name: "history" | "reset" | "moon" | "sun" | "close" | "feedback" | "muted" }) {
  const paths = {
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    feedback: <><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/></>,
    muted: <><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m16 9 5 5M21 9l-5 5"/></>,
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const MENU_COLUMNS = 9;
const MENU_ROWS = 11;
const MENU_LETTERS = [..."PUZZLEGAMESFINDHIDDENLETTERSPLAYWORDSEARCHTOGETHERDISCOVERPATTERNS"];

function StartScreen({ hasProgress, feedbackEnabled, onStart }: {
  readonly hasProgress: boolean;
  readonly feedbackEnabled: boolean;
  readonly onStart: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  const colors = useMemo(() => {
    const firstIndex = Math.floor(Math.random() * SELECTION_COLORS.length);
    const secondOffset = 1 + Math.floor(Math.random() * (SELECTION_COLORS.length - 1));
    return [SELECTION_COLORS[firstIndex]!, SELECTION_COLORS[(firstIndex + secondOffset) % SELECTION_COLORS.length]!] as const;
  }, []);
  const selected = useMemo(() => new Map<number, { readonly letter: string; readonly color: string }>([
    ...[..."WORD"].map((letter, index) => [1 * MENU_COLUMNS + 2 + index, { letter, color: colors[0] }] as const),
    ...[..."SEARCH"].map((letter, index) => [8 * MENU_COLUMNS + 1 + index, { letter, color: colors[1] }] as const),
  ]), [colors]);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    await startFeedback(feedbackEnabled);
    await onStart();
  };

  return <main className="start-screen">
    <header className="start-brand"><p className="eyebrow">Word search</p><h1>Find your flow.</h1></header>
    <div className="menu-grid" aria-hidden="true">
      {Array.from({ length: MENU_COLUMNS * MENU_ROWS }, (_, index) => {
        const x = index % MENU_COLUMNS;
        const y = Math.floor(index / MENU_COLUMNS);
        const isClearance = y >= 4 && y <= 6 && x >= 2 && x <= 6;
        const selection = selected.get(index);
        return <span
          key={index}
          className={`menu-cell${isClearance ? " is-clearance" : ""}${selection === undefined ? "" : " is-selected"}`}
          style={selection === undefined ? undefined : { "--selection-color": selection.color } as CSSProperties}
        >{selection?.letter ?? MENU_LETTERS[index % MENU_LETTERS.length]}</span>;
      })}
    </div>
    <div className="start-action">
      <button className="start-button" onClick={() => void start()} disabled={starting}>{starting ? "Starting…" : hasProgress ? "Continue" : "New Game"}</button>
    </div>
    <p className="start-version">Version {__APP_VERSION__}</p>
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
  return { id: session.id, themeId: session.themeId, themeTitle: getTheme(session.themeId).title, seed: session.seed, elapsedMs: session.elapsedMs, wordCount: session.targetWords.length, lettersSelected: session.lettersSelected, completedAt: session.completedAt, profile: session.profile, generatorVersion: GENERATOR_VERSION };
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

function ResetDialog({ onBoard, onEverything, onClose }: {
  readonly onBoard: () => void; readonly onEverything: () => void; readonly onClose: () => void;
}) {
  return (
    <Modal labelledBy="reset-title" className="reset-dialog" onClose={onClose}>
        <p className="eyebrow">Reset</p><h2 id="reset-title">What would you like to reset?</h2>
        <p className="dialog-copy">Reset this board to replay the same puzzle, or erase everything and start as if you opened the game for the first time.</p>
        <div className="reset-actions">
          <button className="primary-button" onClick={onBoard}>Reset current board</button>
          <button className="secondary-button danger-button" onClick={onEverything}>Reset everything</button>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
        </div>
    </Modal>
  );
}

function Game({ initialSession, colorMode, feedbackEnabled, isFinalPuzzle, completedCount, lifetimeRecords, onColorMode, onFeedbackEnabled, onSession, onComplete, onNext, onReset, onResetEverything, onDebugLoadTheme }: {
  readonly initialSession: GameSession; readonly colorMode: ColorMode; readonly onColorMode: (mode: ColorMode) => void;
  readonly feedbackEnabled: boolean; readonly onFeedbackEnabled: (enabled: boolean) => void;
  readonly isFinalPuzzle: boolean;
  readonly completedCount: number;
  readonly lifetimeRecords: readonly HistoryRecord[];
  readonly onSession: (session: GameSession) => void; readonly onNext: (session: GameSession) => void;
  readonly onComplete: (session: GameSession) => void;
  readonly onReset: (session: GameSession) => void;
  readonly onResetEverything: () => void;
  readonly onDebugLoadTheme: (idOrTitle: string) => string;
}) {
  const [session, dispatch] = useReducer(gameReducer, initialSession);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [hidden, setHidden] = useState(document.hidden);
  const [debugWords, setDebugWords] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const theme = getTheme(session.themeId);
  const colors = useMemo(() => new Map(session.targetWords.map((word, index) => [word, theme.colors[index % theme.colors.length]!])), [session.targetWords, theme.colors]);
  const currentColor = theme.colors[selectionIndex % theme.colors.length]!;
  const { elapsed, getElapsed, pause } = useGameTimer(session, historyOpen || resetOpen || hidden, (value) => dispatch({ type: "set-elapsed", elapsedMs: value }));
  const cellFeedback = useCallback((kind: "cell" | "reject") => playFeedback(kind, feedbackEnabled), [feedbackEnabled]);

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
      playFeedback(session.solvedWords.length + 1 === session.targetWords.length ? "complete" : "word", feedbackEnabled);
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
      <header className="topbar"><div><p className="eyebrow game-label">Word search</p><h1>{theme.title}</h1></div><div className="topbar-actions"><button className="icon-button" onClick={() => setResetOpen(true)} aria-label="Reset progress"><Icon name="reset" /></button><button className="icon-button" onClick={() => { const enabled = !feedbackEnabled; onFeedbackEnabled(enabled); void startFeedback(enabled); }} aria-label={feedbackEnabled ? "Disable sound and haptics" : "Enable sound and haptics"} aria-pressed={feedbackEnabled}><Icon name={feedbackEnabled ? "feedback" : "muted"} /></button><button className="icon-button" onClick={() => onColorMode(colorMode === "dark" ? "light" : "dark")} aria-label="Toggle color mode"><Icon name={colorMode === "dark" ? "sun" : "moon"} /></button><button className="icon-button" onClick={() => void openHistory()} aria-label="Open history"><Icon name="history" /></button></div></header>
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
      {resetOpen && <ResetDialog onBoard={() => onReset(session)} onEverything={onResetEverything} onClose={() => setResetOpen(false)} />}
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
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [started, setStarted] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [completedThemeIds, setCompletedThemeIds] = useState<readonly string[]>([]);
  const [lifetimeRecords, setLifetimeRecords] = useState<readonly HistoryRecord[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!orientation.supported || initialized.current) return;
    initialized.current = true;
    void Promise.all([loadActiveGame(), loadColorMode(), loadFeedbackEnabled(), loadCompletedThemeIds(), loadHistory()]).then(([active, mode, persistedFeedbackEnabled, persistedCompleted, persistedHistory]) => {
      const resolvedMode = mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
      const knownIds = new Set(THEMES.map((theme) => theme.id));
      const completed = persistedCompleted.filter((id) => knownIds.has(id));
      const activeGame = active !== undefined && knownIds.has(active.themeId) ? active : undefined;
      setColorMode(resolvedMode);
      setFeedbackEnabled(persistedFeedbackEnabled);
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
  const updateFeedbackEnabled = (enabled: boolean) => { setFeedbackEnabled(enabled); void saveFeedbackEnabled(enabled); };
  const updateSession = useCallback((next: GameSession) => { setSession(next); void saveActiveGame(next); }, []);
  const resetProgress = useCallback((current: GameSession) => {
    const reset = resetSession(current);
    setSession(reset);
    void clearActiveGame().then(() => saveActiveGame(reset));
  }, []);
  const resetEverything = useCallback(() => {
    void resetApplicationState().then(() => {
      const mode: ColorMode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const fresh = createSession(selectRandomTheme()!, profileForCurrentScreen());
      setColorMode(mode);
      setFeedbackEnabled(true);
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
  if (!started) return <StartScreen hasProgress={hasProgress} feedbackEnabled={feedbackEnabled} onStart={async () => setStarted(true)} />;
  const completedBeforeCurrent = completedThemeIds.filter((id) => id !== session.themeId).length;
  return <Game key={session.id} initialSession={session} colorMode={colorMode} feedbackEnabled={feedbackEnabled} isFinalPuzzle={completedBeforeCurrent === THEMES.length - 1} completedCount={completedThemeIds.length} lifetimeRecords={lifetimeRecords} onColorMode={updateMode} onFeedbackEnabled={updateFeedbackEnabled} onSession={updateSession} onComplete={completePuzzle} onNext={nextPuzzle} onReset={resetProgress} onResetEverything={resetEverything} onDebugLoadTheme={loadDebugTheme}/>;
}
