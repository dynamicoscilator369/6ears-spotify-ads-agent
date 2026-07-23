import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import { createState, pushLog, setInput } from "./state.js";
import { bootstrap, handleCommand } from "./commands.js";

const MAX_VISIBLE = 18;

function levelColor(level) {
  if (level === "ok") return "green";
  if (level === "warn") return "yellow";
  if (level === "err") return "red";
  return "gray";
}

function Header({ state }) {
  const mode = state.mode || "COPILOT";
  const online = state.agentOnline;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          6EARS SPOTIFY ADS MANAGER · COPILOT COCKPIT
        </Text>
        <Text bold color={mode === "COPILOT" ? "green" : "yellow"}>
          {mode}
        </Text>
      </Box>
      <Text>
        agent{" "}
        <Text color={online ? "green" : "red"}>{online ? "ONLINE" : "OFFLINE"}</Text>
        {"  "}
        <Text dimColor>{state.statusLine || "—"}</Text>
      </Text>
      {state.counts ? (
        <Text dimColor>
          artifacts {state.counts.artifacts ?? 0} · proposals {state.counts.proposals ?? 0} ·
          reviews {state.counts.reviews ?? 0} · learnings {state.counts.learnings ?? 0}
        </Text>
      ) : (
        <Text dimColor>metrics — (connect agent for live counts)</Text>
      )}
    </Box>
  );
}

function MissionLog({ log }) {
  const visible = log.slice(-MAX_VISIBLE);
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      minHeight={MAX_VISIBLE + 2}
      flexGrow={1}
    >
      <Text bold color="white">
        MISSION LOG
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>…</Text>
      ) : (
        visible.map((e, i) => (
          <Text key={`${e.ts}-${i}-${e.text.slice(0, 12)}`} wrap="truncate">
            <Text dimColor>{e.ts} </Text>
            <Text color={levelColor(e.level)}>{e.text}</Text>
          </Text>
        ))
      )}
    </Box>
  );
}

function CommandDeck({ value, busy }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
      <Text bold color="green">
        COMMAND DECK
      </Text>
      <Text>
        {busy ? <Text color="yellow">… working </Text> : <Text color="green">› </Text>}
        <Text>{value}</Text>
        {!busy && <Text color="green">▌</Text>}
      </Text>
      <Text dimColor>
        /help /status /search /plan /prepare /packet /actions · free text = knowledge · q quit
      </Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
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

  const submit = useCallback(
    async (line) => {
      const trimmed = line.trim();
      const base = pushLog(
        { ...stateRef.current, input: "", busy: true },
        trimmed ? `› ${trimmed}` : "› /status"
      );
      setState(base);
      try {
        const result = await handleCommand(base, trimmed || "/status");
        if (result.quit) {
          setState({ ...result.state, busy: false, input: "" });
          setTimeout(() => exit(), 100);
          return;
        }
        setState({ ...result.state, busy: false, input: "" });
      } catch (e) {
        setState((s) =>
          pushLog({ ...s, busy: false, input: "" }, e.message || String(e), "err")
        );
      }
    },
    [exit]
  );

  useInput((input, key) => {
    if (stateRef.current.busy) return;

    if (key.return) {
      submit(stateRef.current.input);
      return;
    }

    if (key.escape) {
      setState((s) => setInput(s, ""));
      return;
    }

    if (key.backspace || key.delete) {
      setState((s) => setInput(s, s.input.slice(0, -1)));
      return;
    }

    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (input && !key.ctrl && !key.meta && input.length === 1) {
      const code = input.charCodeAt(0);
      if (code >= 32) {
        setState((s) => setInput(s, s.input + input));
      }
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Header state={state} />
      <Box height={1}>
        <Text> </Text>
      </Box>
      <MissionLog log={state.log} />
      <Box height={1}>
        <Text> </Text>
      </Box>
      <CommandDeck value={state.input} busy={state.busy} />
    </Box>
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

  const instance = render(React.createElement(App));
  await instance.waitUntilExit();
}
