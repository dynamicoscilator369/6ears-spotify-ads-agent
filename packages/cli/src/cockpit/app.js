/**
 * Copilot Cockpit — Ink TUI without JSX (Node runs this as plain ESM).
 * Scrollable mission log; multi-line LLM answers as one block.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout, render } from "ink";
import {
  createState,
  pushLog,
  setInput,
  setScrollOffset,
  flattenLogRows,
} from "./state.js";
import { bootstrap, handleCommand } from "./commands.js";

const h = React.createElement;

/** Visible body rows in mission log (terminal-dependent; fixed for layout stability) */
const LOG_VIEWPORT = 16;
const SCROLL_STEP = 3;

/**
 * Normalize terminal paste (incl. bracketed paste) into plain command-deck text.
 * Newlines → spaces so multi-line clipboard still works as one command/ask.
 */
function sanitizePaste(raw) {
  if (!raw) return "";
  let s = String(raw);
  // Bracketed paste markers (CSI 200~ / 201~)
  s = s.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
  // Other stray ESC sequences
  s = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  // Keep printable + tabs; flatten newlines for single-line command deck
  s = [...s]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 9 || c === 10 || c === 13 || c >= 32;
    })
    .join("");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\n+/g, " ").replace(/\t/g, " ");
  // Collapse runs of spaces from multi-line paste
  s = s.replace(/ {2,}/g, " ");
  return s;
}

function levelColor(level) {
  if (level === "ok") return "green";
  if (level === "warn") return "yellow";
  if (level === "err") return "red";
  return "gray";
}

function Header({ state }) {
  const mode = state.mode || "COPILOT";
  const online = state.agentOnline;
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1 },
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { bold: true, color: "cyan" }, "6EARS SPOTIFY ADS MANAGER · COPILOT COCKPIT"),
      h(Text, { bold: true, color: mode === "COPILOT" ? "green" : "yellow" }, mode)
    ),
    h(
      Text,
      null,
      "agent ",
      h(Text, { color: online ? "green" : "red" }, online ? "ONLINE" : "OFFLINE"),
      "  ",
      h(Text, { dimColor: true }, state.statusLine || "—")
    ),
    state.counts
      ? h(
          Text,
          { dimColor: true },
          `artifacts ${state.counts.artifacts ?? 0} · proposals ${state.counts.proposals ?? 0} · reviews ${state.counts.reviews ?? 0} · learnings ${state.counts.learnings ?? 0}`
        )
      : h(Text, { dimColor: true }, "metrics — (connect agent for live counts)")
  );
}

function MissionLog({ log, scrollOffset }) {
  const rows = flattenLogRows(log);
  const total = rows.length;
  const maxOff = Math.max(0, total - LOG_VIEWPORT);
  const off = Math.min(Math.max(0, scrollOffset), maxOff);
  const start = Math.max(0, total - LOG_VIEWPORT - off);
  const end = Math.max(0, total - off);
  const visible = rows.slice(start, end);
  const canUp = off < maxOff;
  const canDown = off > 0;

  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "gray",
      paddingX: 1,
      height: LOG_VIEWPORT + 3,
      overflow: "hidden",
    },
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { bold: true, color: "white" }, "MISSION LOG"),
      h(
        Text,
        { dimColor: true },
        total === 0
          ? ""
          : `${start + 1}-${end} / ${total}` +
              (canUp || canDown ? "  ·  PgUp/PgDn or ↑↓ scroll  ·  End = latest" : "")
      )
    ),
    visible.length === 0
      ? h(Text, { dimColor: true }, "…")
      : visible.map((row, i) => {
          if (row.kind === "sep") {
            return h(Text, { key: `s-${start}-${i}`, dimColor: true }, row.text);
          }
          if (row.kind === "head") {
            return h(
              Text,
              { key: `h-${start}-${i}`, color: "cyan", bold: true, wrap: "wrap" },
              row.text
            );
          }
          if (row.kind === "body") {
            return h(
              Text,
              { key: `b-${start}-${i}`, color: levelColor(row.level), wrap: "wrap" },
              row.text
            );
          }
          return h(
            Text,
            { key: `l-${start}-${i}`, color: levelColor(row.level), wrap: "wrap" },
            row.text
          );
        }),
    canUp ? h(Text, { dimColor: true }, "▲ more above") : null,
    canDown ? h(Text, { dimColor: true }, "▼ more below (newer)") : null
  );
}

function CommandDeck({ value, busy }) {
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 1 },
    h(Text, { bold: true, color: "green" }, "COMMAND DECK"),
    h(
      Text,
      { wrap: "wrap" },
      busy ? h(Text, { color: "yellow" }, "… working ") : h(Text, { color: "green" }, "› "),
      h(Text, { wrap: "wrap" }, value),
      !busy ? h(Text, { color: "green" }, "▌") : null
    ),
    h(
      Text,
      { dimColor: true },
      "/ask · /help · /status · /llm · PgUp/PgDn scroll · q quit"
    )
  );
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState(() => createState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await bootstrap(createState());
      if (!cancelled) {
        setState(next);
        setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!booted) return undefined;
    const t = setInterval(async () => {
      if (stateRef.current.busy) return;
      try {
        const { agentRequest } = await import("../client.js");
        await agentRequest("GET", "/health", { auth: false });
        setState((s) => (s.agentOnline ? s : { ...s, agentOnline: true }));
      } catch {
        setState((s) => (s.agentOnline === false ? s : { ...s, agentOnline: false }));
      }
    }, 20000);
    return () => clearInterval(t);
  }, [booted]);

  const maxScroll = useCallback(() => {
    const rows = flattenLogRows(stateRef.current.log);
    return Math.max(0, rows.length - LOG_VIEWPORT);
  }, []);

  const scrollBy = useCallback(
    (delta) => {
      setState((s) => {
        const rows = flattenLogRows(s.log);
        const maxOff = Math.max(0, rows.length - LOG_VIEWPORT);
        const next = Math.min(maxOff, Math.max(0, (s.scrollOffset || 0) + delta));
        return setScrollOffset(s, next);
      });
    },
    []
  );

  const submit = useCallback(
    async (line) => {
      const trimmed = line.trim();
      const base = pushLog(
        { ...stateRef.current, input: "", busy: true, scrollOffset: 0 },
        trimmed ? `› ${trimmed}` : "› /status"
      );
      setState(base);
      try {
        const result = await handleCommand(base, trimmed || "/status");
        if (result.quit) {
          setState({ ...result.state, busy: false, input: "", scrollOffset: 0 });
          setTimeout(() => exit(), 100);
          return;
        }
        setState({ ...result.state, busy: false, input: "", scrollOffset: 0 });
      } catch (e) {
        setState((s) =>
          pushLog({ ...s, busy: false, input: "", scrollOffset: 0 }, e.message || String(e), "err")
        );
      }
    },
    [exit]
  );

  useInput((input, key) => {
    // Scroll works even while busy (read-only)
    if (key.pageUp) {
      scrollBy(SCROLL_STEP * 3);
      return;
    }
    if (key.pageDown) {
      scrollBy(-(SCROLL_STEP * 3));
      return;
    }
    // Ctrl+U / Ctrl+D style
    if (key.ctrl && input === "u") {
      scrollBy(SCROLL_STEP * 3);
      return;
    }
    if (key.ctrl && input === "d") {
      scrollBy(-(SCROLL_STEP * 3));
      return;
    }
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    // Arrow up/down scroll when input is empty
    if (key.upArrow && !stateRef.current.input) {
      scrollBy(SCROLL_STEP);
      return;
    }
    if (key.downArrow && !stateRef.current.input) {
      scrollBy(-SCROLL_STEP);
      return;
    }
    // End key-ish: empty + Ctrl+E → latest
    if (key.ctrl && input === "e") {
      setState((s) => setScrollOffset(s, 0));
      return;
    }

    if (stateRef.current.busy) return;

    if (key.return) {
      submit(stateRef.current.input);
      return;
    }

    if (key.escape) {
      setState((s) => setInput(s, ""));
      return;
    }

    // Multi-char backspace is rare; handle single
    if (key.backspace || key.delete) {
      setState((s) => setInput(s, s.input.slice(0, -1)));
      return;
    }

    // Paste / multi-char input (Cmd+V often arrives as one long string)
    // Previous bug: only accepted input.length === 1, so paste was dropped.
    if (input && !key.ctrl && !key.meta) {
      const cleaned = sanitizePaste(input);
      if (cleaned.length > 0) {
        setState((s) => setInput(s, s.input + cleaned));
      }
    }
  });

  // silence unused
  void stdout;
  void maxScroll;

  return h(
    Box,
    { flexDirection: "column", width: "100%" },
    h(Header, { state }),
    h(Box, { height: 1 }, h(Text, null, " ")),
    h(MissionLog, { log: state.log, scrollOffset: state.scrollOffset || 0 }),
    h(Box, { height: 1 }, h(Text, null, " ")),
    h(CommandDeck, { value: state.input, busy: state.busy })
  );
}

export async function runCockpit() {
  if (!process.stdin.isTTY) {
    console.error(
      "Copilot Cockpit needs an interactive terminal.\n" +
        "Use subcommands for scripts, e.g. 6ears-spotify-ads doctor"
    );
    process.exitCode = 1;
    return;
  }

  const instance = render(h(App));
  await instance.waitUntilExit();
}
