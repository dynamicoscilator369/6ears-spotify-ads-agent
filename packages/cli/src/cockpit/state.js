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
  };
}

export function pushLog(state, line, level = "info") {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const entry = { ts, level, text: String(line) };
  const next = [...state.log, entry];
  // ring buffer
  const log = next.length > 400 ? next.slice(-400) : next;
  return { ...state, log };
}

export function setInput(state, input) {
  return { ...state, input };
}
