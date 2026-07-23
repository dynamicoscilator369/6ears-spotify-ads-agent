/** Session state for Copilot Cockpit */

export function createState() {
  return {
    log: [],
    input: "",
    statusLine: "boot",
    agentOnline: false,
    mode: "COPILOT",
    artist: null,
    counts: null,
    lastProposal: null,
    busy: false,
    error: null,
    /** rows scrolled up from the bottom (0 = stick to latest) */
    scrollOffset: 0,
  };
}

/**
 * Single short log line (system / command echo).
 */
export function pushLog(state, line, level = "info") {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const entry = { kind: "line", ts, level, text: String(line) };
  const next = [...state.log, entry];
  const log = next.length > 200 ? next.slice(-200) : next;
  // New output pins view to bottom
  return { ...state, log, scrollOffset: 0 };
}

/**
 * One multi-line answer / packet as a single message (one timestamp).
 */
export function pushBlock(state, text, level = "info", title = null) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const entry = {
    kind: "block",
    ts,
    level,
    title: title || null,
    text: String(text).replace(/\r\n/g, "\n").trimEnd(),
  };
  const next = [...state.log, entry];
  const log = next.length > 200 ? next.slice(-200) : next;
  return { ...state, log, scrollOffset: 0 };
}

export function setInput(state, input) {
  return { ...state, input };
}

export function setScrollOffset(state, offset) {
  return { ...state, scrollOffset: Math.max(0, offset) };
}

/**
 * Flatten log entries into display rows for scrolling.
 */
export function flattenLogRows(log) {
  const rows = [];
  for (const e of log) {
    if (e.kind === "block") {
      const head = e.title ? `${e.ts} · ${e.title}` : `${e.ts} · answer`;
      rows.push({ kind: "head", level: e.level, text: head });
      const body = e.text || "";
      for (const line of body.split("\n")) {
        rows.push({ kind: "body", level: e.level, text: line.length ? line : " " });
      }
      rows.push({ kind: "sep", level: "info", text: "─".repeat(40) });
    } else {
      rows.push({ kind: "line", level: e.level, text: `${e.ts} ${e.text}` });
    }
  }
  return rows;
}
