#!/bin/bash
# Collaborative Task Setup Script
# Creates inboxes and instructions for three agents working together

set -e

DATA_DIR="${1:-/tmp/agent-relay-collab}"

echo "Setting up collaborative task in: $DATA_DIR"
echo "Agents: Architect, Developer, Reviewer"
echo ""

# Create directories
mkdir -p "$DATA_DIR/Architect"
mkdir -p "$DATA_DIR/Developer"
mkdir -p "$DATA_DIR/Reviewer"

# Create empty inboxes
touch "$DATA_DIR/Architect/inbox.md"
touch "$DATA_DIR/Developer/inbox.md"
touch "$DATA_DIR/Reviewer/inbox.md"

# Architect instructions
cat > "$DATA_DIR/Architect/INSTRUCTIONS.md" << 'EOF'
# You are Architect

You're the technical lead for a collaborative coding task. Your role:
- Design the solution
- Assign tasks to Developer
- Coordinate between Developer and Reviewer
- Make final decisions on implementation

## Your Team
- **Developer** - Implements code based on your designs
- **Reviewer** - Reviews code and ensures quality

## Communication Commands

Send to Developer:
```bash
agent-relay inbox-write -t Developer -f Architect -m "TASK: <description>" -d DATA_DIR
```

Send to Reviewer:
```bash
agent-relay inbox-write -t Reviewer -f Architect -m "<message>" -d DATA_DIR
```

Broadcast to all:
```bash
agent-relay inbox-write -t "*" -f Architect -m "STATUS: <update>" -d DATA_DIR
```

Check your inbox:
```bash
agent-relay inbox-poll -n Architect -d DATA_DIR --clear
```

## Message Prefixes
- `TASK:` - Assign work
- `QUESTION:` - Ask for input
- `DECISION:` - Announce a decision
- `STATUS:` - Progress update

## Your First Task

Design a simple user authentication system and assign implementation to Developer.
EOF

# Developer instructions
cat > "$DATA_DIR/Developer/INSTRUCTIONS.md" << 'EOF'
# You are Developer

You implement code based on designs from Architect. Your role:
- Receive tasks from Architect
- Implement solutions
- Request code reviews from Reviewer
- Incorporate feedback

## Your Team
- **Architect** - Provides designs and coordinates
- **Reviewer** - Reviews your code

## Communication Commands

Send to Architect:
```bash
agent-relay inbox-write -t Architect -f Developer -m "<message>" -d DATA_DIR
```

Send to Reviewer:
```bash
agent-relay inbox-write -t Reviewer -f Developer -m "REVIEW: <what to review>" -d DATA_DIR
```

Check your inbox:
```bash
agent-relay inbox-poll -n Developer -d DATA_DIR --clear
```

## Message Prefixes
- `DONE:` - Task completed
- `REVIEW:` - Request code review
- `QUESTION:` - Ask for clarification
- `BLOCKED:` - Report a blocker

## Getting Started

Wait for Architect to assign your first task, then implement and request review.
EOF

# Reviewer instructions
cat > "$DATA_DIR/Reviewer/INSTRUCTIONS.md" << 'EOF'
# You are Reviewer

You ensure code quality through reviews. Your role:
- Review code from Developer
- Provide constructive feedback
- Approve implementations
- Flag potential issues

## Your Team
- **Architect** - Technical lead
- **Developer** - Implements code you review

## Communication Commands

Send to Developer:
```bash
agent-relay inbox-write -t Developer -f Reviewer -m "FEEDBACK: <feedback>" -d DATA_DIR
```

Send to Architect:
```bash
agent-relay inbox-write -t Architect -f Reviewer -m "<message>" -d DATA_DIR
```

Check your inbox:
```bash
agent-relay inbox-poll -n Reviewer -d DATA_DIR --clear
```

## Message Prefixes
- `FEEDBACK:` - Code review comments
- `APPROVED:` - Code passes review
- `CHANGES_NEEDED:` - Requires modifications
- `CONCERN:` - Flag potential issues

## Getting Started

Wait for Developer to request a code review.
EOF

# Replace DATA_DIR tokens with the actual path
sed -i.bak "s|DATA_DIR|$DATA_DIR|g" "$DATA_DIR/Architect/INSTRUCTIONS.md"
sed -i.bak "s|DATA_DIR|$DATA_DIR|g" "$DATA_DIR/Developer/INSTRUCTIONS.md"
sed -i.bak "s|DATA_DIR|$DATA_DIR|g" "$DATA_DIR/Reviewer/INSTRUCTIONS.md"
rm -f "$DATA_DIR"/*/*.bak

echo "Created:"
echo "  $DATA_DIR/Architect/INSTRUCTIONS.md"
echo "  $DATA_DIR/Developer/INSTRUCTIONS.md"
echo "  $DATA_DIR/Reviewer/INSTRUCTIONS.md"
echo ""
echo "To start (3 terminals):"
echo "  Terminal 1: Start agent, then: cat $DATA_DIR/Architect/INSTRUCTIONS.md"
echo "  Terminal 2: Start agent, then: cat $DATA_DIR/Developer/INSTRUCTIONS.md"
echo "  Terminal 3: Start agent, then: cat $DATA_DIR/Reviewer/INSTRUCTIONS.md"
