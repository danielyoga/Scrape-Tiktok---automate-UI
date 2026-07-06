#!/usr/bin/env bash
# Setup script for TikTok UI Automation.
# Checks prerequisites, installs dependencies, and gets the project ready to run.

set -uo pipefail

# ---- output helpers ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}==>${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✘${NC} $1"; }

MIN_NODE_MAJOR=18
ERRORS=0

# ---- detect OS ----
detect_os() {
  case "$(uname -s)" in
    Darwin) OS="macOS" ;;
    Linux)  OS="Linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="Windows (Git Bash/MSYS)" ;;
    *) OS="Unknown" ;;
  esac
  info "Detected OS: $OS"
}

# ---- helpers to suggest install commands per OS ----
suggest_install() {
  local tool="$1"
  case "$OS" in
    macOS)
      echo "  Install with Homebrew: brew install $tool"
      echo "  (No Homebrew? Get it from https://brew.sh)"
      ;;
    Linux)
      echo "  Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y $tool"
      echo "  Fedora:        sudo dnf install -y $tool"
      echo "  Arch:          sudo pacman -S $tool"
      ;;
    *)
      echo "  Please install '$tool' manually for your platform."
      ;;
  esac
}

# ---- checks ----
check_git() {
  info "Checking for git..."
  if command -v git >/dev/null 2>&1; then
    ok "git found: $(git --version)"
  else
    fail "git is not installed."
    suggest_install "git"
    ERRORS=$((ERRORS + 1))
  fi
}

check_node() {
  info "Checking for Node.js..."
  if command -v node >/dev/null 2>&1; then
    local node_version major
    node_version="$(node --version)"
    major="$(echo "$node_version" | sed 's/^v//' | cut -d. -f1)"
    if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      ok "Node.js found: $node_version"
    else
      fail "Node.js $node_version is too old (need >= v$MIN_NODE_MAJOR)."
      echo "  Install a newer version from https://nodejs.org or via nvm: https://github.com/nvm-sh/nvm"
      ERRORS=$((ERRORS + 1))
    fi
  else
    fail "Node.js is not installed (need >= v$MIN_NODE_MAJOR)."
    echo "  Download from https://nodejs.org or use nvm: https://github.com/nvm-sh/nvm"
    if [ "$OS" = "macOS" ]; then
      echo "  Or: brew install node"
    fi
    ERRORS=$((ERRORS + 1))
  fi
}

check_npm() {
  info "Checking for npm..."
  if command -v npm >/dev/null 2>&1; then
    ok "npm found: $(npm --version)"
  else
    fail "npm is not installed (it normally ships with Node.js)."
    ERRORS=$((ERRORS + 1))
  fi
}

# ---- run checks ----
detect_os
check_git
check_node
check_npm

if [ "$ERRORS" -gt 0 ]; then
  echo
  fail "Missing $ERRORS required tool(s). Please install them and re-run this script."
  exit 1
fi

echo
ok "All prerequisites are installed."

# ---- install project dependencies ----
info "Installing npm dependencies..."
if npm install; then
  ok "npm dependencies installed."
else
  fail "npm install failed. Check the errors above."
  exit 1
fi

info "Installing Playwright's Chromium browser..."
if npx playwright install chromium; then
  ok "Chromium installed for Playwright."
else
  fail "Playwright Chromium install failed. Check the errors above."
  exit 1
fi

# ---- credentials reminder ----
echo
if [ -f "credentials.json" ]; then
  ok "credentials.json already present."
else
  warn "credentials.json not found."
  echo "  You still need a Google Cloud service account key saved as credentials.json"
  echo "  in the project root. See README.md 'Setup' section for step-by-step instructions."
fi

echo
ok "Setup complete!"
echo "Next steps:"
echo "  1. Make sure credentials.json is in place (see README.md)."
echo "  2. Configure src/config.ts with your sheet ID and scrape range."
echo "  3. Run: npm run scrape   (quick smoke test)"
echo "     or:  npm run scrape-range   (full scrape)"
