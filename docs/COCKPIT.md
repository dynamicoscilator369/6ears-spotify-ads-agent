# Copilot Cockpit

**6EARS Spotify Ads Manager · Copilot Cockpit** is the interactive terminal session.

## Launch

```bash
6ears-spotify-ads
# or
6ears-spotify-ads cockpit
node packages/cli/bin/6ears-spotify-ads.js
```

Requires an interactive TTY (normal Terminal.app / iTerm / Ghostty).

## Panels

1. **Header** — branding, **COPILOT** mode badge, agent ONLINE/OFFLINE, status line  
2. **Mission log** — scroll of actions and knowledge hits  
3. **Command deck** — type slash commands or free-text search  

## Commands

See `/help` in-session. Headless equivalents remain available (`6ears-spotify-ads status`, etc.).

## Agent optional

Without Wrangler, knowledge + local config still work; status shows OFFLINE.  
With agent:

```bash
cd packages/agent && npx wrangler dev --ip 127.0.0.1 --port 8787
```

## Design rules

- Never claim live spend without gates  
- Packets labeled COPILOT  
- API keys never printed in the log  
