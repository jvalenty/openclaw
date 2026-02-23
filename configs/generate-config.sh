#!/usr/bin/env bash
# Generate an agent's openclaw.json from the shared template + agent config.
# Usage: ./configs/generate-config.sh <bella|stella> [--apply]
#
# --apply: write directly to the agent's ~/.openclaw/openclaw.json (requires confirmation)
# Without --apply: outputs to stdout for review

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_FILE="$SCRIPT_DIR/agents.json"
TEMPLATE_FILE="$SCRIPT_DIR/template.json5"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <bella|stella> [--apply]"
  echo "Agents: $(jq -r 'keys | join(", ")' "$AGENTS_FILE")"
  exit 1
fi

AGENT="$1"
APPLY="${2:-}"

# Validate agent exists
if ! jq -e ".[\"$AGENT\"]" "$AGENTS_FILE" > /dev/null 2>&1; then
  echo "Error: Unknown agent '$AGENT'"
  echo "Available: $(jq -r 'keys | join(", ")' "$AGENTS_FILE")"
  exit 1
fi

# Use node to parse JSON5 and substitute variables
PRETTY=$(node -e "
const fs = require('fs');
const agents = JSON.parse(fs.readFileSync('$AGENTS_FILE', 'utf-8'));
const agent = agents['$AGENT'];

// Strip JSON5 comments and parse
let tmpl = fs.readFileSync('$TEMPLATE_FILE', 'utf-8');
// Remove single-line comments (but not inside strings)
tmpl = tmpl.replace(/^(\s*)\/\/.*$/gm, '');
// Remove trailing commas
tmpl = tmpl.replace(/,(\s*[}\]])/g, '\$1');

let config = JSON.parse(tmpl);

// Deep substitute \${VAR} patterns in all string values
function substitute(obj, vars) {
  if (typeof obj === 'string') {
    return obj.replace(/\\\${([^}]+)}/g, (_, key) => {
      return vars[key] !== undefined ? vars[key] : '\${' + key + '}';
    });
  }
  if (Array.isArray(obj)) return obj.map(v => substitute(v, vars));
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k] = substitute(v, vars);
    return result;
  }
  return obj;
}

const vars = {
  AGENT_ID: agent.agentId,
  AGENT_NAME: agent.name,
  AGENT_DISPLAY_NAME: agent.displayName,
  AGENT_EMOJI: agent.emoji,
  AGENT_WORKSPACE: agent.workspace,
  AGENT_MODEL: agent.model,
};

// Override numeric fields from agent config
if (agent.gatewayPort) config.gateway.port = parseInt(agent.gatewayPort);

config = substitute(config, vars);

// Fix fallbacks placeholder
if (config.agents?.list?.[0]?.model?.fallbacks?.[0] === 'AGENT_FALLBACKS_PLACEHOLDER') {
  config.agents.list[0].model.fallbacks = agent.fallbacks;
}

console.log(JSON.stringify(config, null, 2));
")

if [[ -z "$PRETTY" ]]; then
  echo "Error: Config generation failed"
  exit 1
fi

if [[ "$APPLY" == "--apply" ]]; then
  # Determine target path
  if [[ "$AGENT" == "bella" ]]; then
    TARGET="/Users/bella/.openclaw/openclaw.json"
  elif [[ "$AGENT" == "stella" ]]; then
    TARGET="/Users/stella/.openclaw/openclaw.json"
  else
    echo "Error: Don't know where to write config for '$AGENT'"
    exit 1
  fi
  
  # Backup and write
  if [[ -f "$TARGET" ]]; then
    cp "$TARGET" "${TARGET}.bak"
    echo "Backed up existing config to ${TARGET}.bak"
  fi
  
  echo "$PRETTY" > "$TARGET"
  echo "Config written to $TARGET"
  echo "Run 'openclaw gateway restart' to apply."
else
  echo "$PRETTY"
fi
