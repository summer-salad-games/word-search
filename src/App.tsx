import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { calculatePuzzleProfile, createSession, extendSelection, formatDuration, gameReducer, pathsMatch, positionKey, GENERATOR_VERSION, type GameSession } from "./app-model.js";
import { clearActiveGame, loadActiveGame, loadColorMode, loadHistory, saveActiveGame, saveColorMode, saveHistory, type ColorMode, type HistoryRecord } from "./persistence.js";
import { getTheme, THEMES } from "./themes.js";
import type { Position, PuzzleCell } from "./types.js";
import "./styles.css";

function Icon({ name }: { readonly name: "history" | "moon" | "sun" | "close" }) {
  const paths = {
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function useViewport() {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return viewport;
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
  readonly onAttempt: (path: readonly Position[]) => string | undefined;
}

function PuzzleGrid({ session, colors, onAttempt }: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [selection, setSelection] = useState<Position[]>([]);
  const [rejectingCell, setRejectingCell] = useState<string>();
  const [locked, setLocked] = useState(false);
  const activeKeys = useMemo(() => new Set(selection.map(positionKey)), [selection]);
  const solvedCells = useMemo(() => {
    const result = new Map<string, string>();
    for (const entry of session.puzzle.entries) {
      if (!session.solvedWords.includes(entry.word)) continue;
      for (const position of entry.path) result.set(positionKey(position), colors.get(entry.word) ?? "#777");
    }
    return result;
  }, [colors, session.puzzle.entries, session.solvedWords]);

  const addCell = useCallback((position: Position) => {
    if (!locked) setSelection((current) => extendSelection(current, position));
  }, [locked]);

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
        setSelection([]);
        setLocked(false);
        return;
      }
      setRejectingCell(positionKey(last));
      window.setTimeout(() => {
        remaining.pop();
        setSelection([...remaining]);
        window.setTimeout(step, 32);
      }, 58);
    };
    step();
  }, []);

  const finish = () => {
    if (pointerId.current === null || locked) return;
    if (gridRef.current?.hasPointerCapture(pointerId.current)) gridRef.current.releasePointerCapture(pointerId.current);
    pointerId.current = null;
    if (selection.length === 0) return;
    const found = onAttempt(selection);
    if (found === undefined) rollback(selection);
    else {
      setLocked(true);
      window.setTimeout(() => { setSelection([]); setLocked(false); }, 280);
    }
  };

  const gridStyle = {
    "--grid-columns": session.puzzle.size.width,
    "--grid-rows": session.puzzle.size.height,
    "--preferred-cell": `${session.profile.preferredCellSize}px`,
  } as CSSProperties;

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
        if (position === undefined) return;
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelection([position]);
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId || locked) return;
        const position = positionFromPointer(event);
        if (position !== undefined) addCell(position);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {session.puzzle.grid.flatMap((row) => row.map((cell: PuzzleCell) => {
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
            className={`puzzle-cell${cell.isBorder ? " is-border" : ""}${activeKeys.has(key) ? " is-active" : ""}${solvedColor !== undefined ? " is-solved" : ""}${rejectingCell === key ? " is-rejecting" : ""}`}
            style={cellStyle}
          >
            <span>{cell.letter}</span>
          </div>
        );
      }))}
    </div>
  );
}

function HistoryDialog({ records, onClose }: { readonly records: readonly HistoryRecord[]; readonly onClose: () => void }) {
  return (
    <div className="overlay" role="presentation">
      <section className="dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header><div><p className="eyebrow">Your journey</p><h2 id="history-title">History</h2></div><button className="icon-button" onClick={onClose} aria-label="Close history"><Icon name="close" /></button></header>
        {records.length === 0 ? <p className="empty-state">Complete a puzzle and it will appear here.</p> : (
          <ol className="history-list">{records.map((record) => (
            <li key={record.id}>
              <div><strong>{record.themeTitle}</strong><span>{new Date(record.completedAt).toLocaleDateString()}</span></div>
              <dl><div><dt>Time</dt><dd>{formatDuration(record.elapsedMs)}</dd></div><div><dt>Words</dt><dd>{record.wordCount}</dd></div><div><dt>Attempts</dt><dd>{record.attempts}</dd></div></dl>
            </li>
          ))}</ol>
        )}
      </section>
    </div>
  );
}

function WinDialog({ session, onNext }: { readonly session: GameSession; readonly onNext: () => void }) {
  const theme = getTheme(session.themeId);
  return (
    <div className="overlay celebration" role="presentation">
      <section className="dialog win-dialog" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <div className="win-mark">✓</div><p className="eyebrow">Puzzle complete</p><h2 id="win-title">Nicely found.</h2><p className="win-theme">{theme.title}</p>
        <dl className="stats"><div><dt>Time</dt><dd>{formatDuration(session.elapsedMs)}</dd></div><div><dt>Words</dt><dd>{session.targetWords.length}</dd></div><div><dt>Attempts</dt><dd>{session.attempts}</dd></div></dl>
        <button className="primary-button" onClick={onNext}>Next puzzle <span aria-hidden="true">→</span></button>
      </section>
    </div>
  );
}

function Game({ initialSession, colorMode, onColorMode, onSession, onNext }: {
  readonly initialSession: GameSession; readonly colorMode: ColorMode; readonly onColorMode: (mode: ColorMode) => void;
  readonly onSession: (session: GameSession) => void; readonly onNext: (session: GameSession) => void;
}) {
  const [session, dispatch] = useReducer(gameReducer, initialSession);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [hidden, setHidden] = useState(document.hidden);
  const theme = getTheme(session.themeId);
  const colors = useMemo(() => new Map(session.targetWords.map((word, index) => [word, theme.colors[index % theme.colors.length]!])), [session.targetWords, theme.colors]);
  const { elapsed, getElapsed, pause } = useGameTimer(session, historyOpen || hidden, (value) => dispatch({ type: "set-elapsed", elapsedMs: value }));

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
    void saveHistory({ id: session.id, themeId: session.themeId, themeTitle: theme.title, seed: session.seed, elapsedMs: session.elapsedMs, wordCount: session.targetWords.length, attempts: session.attempts, completedAt: session.completedAt, profile: session.profile, generatorVersion: GENERATOR_VERSION });
  }, [session, theme.title]);

  const onAttempt = (path: readonly Position[]) => {
    const match = session.puzzle.entries.find((entry) => !session.solvedWords.includes(entry.word) && pathsMatch(path, entry.path));
    const currentElapsed = getElapsed();
    dispatch({ type: "attempt", elapsedMs: currentElapsed, ...(match === undefined ? {} : { word: match.word }) });
    return match?.word;
  };

  const openHistory = async () => {
    pause();
    try { setHistory(await loadHistory()); }
    catch { setHistory([]); }
    setHistoryOpen(true);
  };

  return (
    <main className="app-shell">
      <header className="topbar"><div><p className="eyebrow">Word search</p><h1>{theme.title}</h1></div><div className="topbar-actions"><span className="timer" aria-label={`Elapsed time ${formatDuration(elapsed)}`}>{formatDuration(elapsed)}</span><button className="icon-button" onClick={() => onColorMode(colorMode === "dark" ? "light" : "dark")} aria-label="Toggle color mode"><Icon name={colorMode === "dark" ? "sun" : "moon"} /></button><button className="icon-button" onClick={() => void openHistory()} aria-label="Open history"><Icon name="history" /></button></div></header>
      <section className="word-list" aria-label="Words to find">{session.targetWords.map((word) => {
        const solved = session.solvedWords.includes(word);
        const style = solved ? { "--selection-color": colors.get(word) } as CSSProperties : undefined;
        return <span key={word} className={`word-chip${solved ? " is-solved" : ""}`} style={style}>{word}<span className="word-check" aria-hidden="true">✓</span></span>;
      })}</section>
      <section className="board-stage"><PuzzleGrid session={session} colors={colors} onAttempt={onAttempt} /></section>
      <footer className="game-footer"><span>{session.solvedWords.length} / {session.targetWords.length} found</span><span>{session.attempts} attempts</span></footer>
      {historyOpen && <HistoryDialog records={history} onClose={() => setHistoryOpen(false)} />}
      {session.status === "completed" && <WinDialog session={session} onNext={() => onNext(session)} />}
    </main>
  );
}

export default function App() {
  const viewport = useViewport();
  const [session, setSession] = useState<GameSession>();
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([loadActiveGame(), loadColorMode()]).then(([active, mode]) => {
      setColorMode(mode);
      try { setSession(active ?? createSession(THEMES[0]!, calculatePuzzleProfile(window.innerWidth, window.innerHeight))); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a puzzle."); }
    }).catch(() => {
      try { setSession(createSession(THEMES[0]!, calculatePuzzleProfile(window.innerWidth, window.innerHeight))); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a puzzle."); }
    });
  }, []);

  useEffect(() => {
    const dark = colorMode === "dark" || (colorMode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [colorMode]);

  const updateMode = (mode: ColorMode) => { setColorMode(mode); void saveColorMode(mode); };
  const updateSession = useCallback((next: GameSession) => { setSession(next); void saveActiveGame(next); }, []);
  const nextPuzzle = useCallback((current: GameSession) => {
    const currentIndex = THEMES.findIndex((theme) => theme.id === current.themeId);
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length]!;
    try {
      const next = createSession(nextTheme, calculatePuzzleProfile(window.innerWidth, window.innerHeight));
      setSession(next); void clearActiveGame().then(() => saveActiveGame(next));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the next puzzle."); }
  }, []);

  const mobileLandscape = viewport.width < 900 && viewport.width > viewport.height;
  if (error !== undefined) return <main className="loading-screen"><p className="eyebrow">Something went wrong</p><h1>{error}</h1><button className="primary-button" onClick={() => location.reload()}>Try again</button></main>;
  if (session === undefined) return <main className="loading-screen"><div className="loader"/><p>Preparing your puzzle…</p></main>;
  return <><Game key={session.id} initialSession={session} colorMode={colorMode} onColorMode={updateMode} onSession={updateSession} onNext={nextPuzzle}/>{mobileLandscape && <div className="orientation-guard"><div className="phone-icon">↻</div><strong>Turn your device</strong><span>This puzzle is designed for portrait play.</span></div>}</>;
}
