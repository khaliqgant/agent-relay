#!/bin/bash
# Development startup script - runs everything needed for local development

set -e

echo "🚀 Agent Relay Development Mode"
echo "================================"

# Check for tmux
if ! command -v tmux &> /dev/null; then
    echo "❌ tmux is required but not installed."
    echo "   macOS: brew install tmux"
    echo "   Linux: sudo apt-get install tmux"
    exit 1
fi

# Build TypeScript (daemon, CLI, etc.)
echo "📦 Building TypeScript..."
npm run clean
tsc

# Make CLI executable
chmod +x dist/cli/index.js

echo ""
echo "✅ Build complete!"
echo ""
echo "Starting services in tmux session 'agent-relay-dev'..."
echo ""

# Kill existing session if it exists
tmux kill-session -t agent-relay-dev 2>/dev/null || true

# Create new tmux session with daemon
tmux new-session -d -s agent-relay-dev -n daemon

# Start daemon in first window
tmux send-keys -t agent-relay-dev:daemon "node dist/cli/index.js up --no-dashboard" Enter

# Create window for Next.js dashboard (dev mode)
tmux new-window -t agent-relay-dev -n dashboard
tmux send-keys -t agent-relay-dev:dashboard "cd src/dashboard && npm run dev" Enter

# Create window for running agents
tmux new-window -t agent-relay-dev -n agents
tmux send-keys -t agent-relay-dev:agents "echo '🤖 Agent window ready. Run: node dist/cli/index.js -n Alice claude'" Enter

echo ""
echo "================================"
echo "✅ Development environment ready!"
echo ""
echo "📍 URLs:"
echo "   Landing Page:  http://localhost:3888"
echo "   Pricing:       http://localhost:3888/pricing"
echo "   Dashboard:     http://localhost:3888/app"
echo ""
echo "📺 Attach to tmux session:"
echo "   tmux attach -t agent-relay-dev"
echo ""
echo "🛑 Stop everything:"
echo "   tmux kill-session -t agent-relay-dev"
echo ""
