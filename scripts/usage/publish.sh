#!/usr/bin/env bash
# Nightly: rebuild src/data/usage.json from my local logs and push it to btso.dev,
# which deploys the site. Runs from its own clone so it never touches a working checkout.
set -euo pipefail
clone="${BTSO_USAGE_CLONE:-$HOME/.cache/btso-usage/site}"
if [ ! -d "$clone/.git" ]; then
  git clone -q --depth 50 git@github.com:btsouth/btso.dev.git "$clone"
fi
cd "$clone"
git fetch -q origin main
git reset -q --hard origin/main
python3 scripts/usage/collect.py
if git diff --quiet -- src/data/usage.json; then
  echo "No change."
  exit 0
fi
git add src/data/usage.json
# Vercel only deploys commits authored by the account owner.
git -c user.name="Tyler South" -c user.email="tsouth2@gmail.com" commit -qm "Refresh AI usage stats"
git push -q origin HEAD:main
