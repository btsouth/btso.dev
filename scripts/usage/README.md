# AI usage stats

`collect.py` builds `src/data/usage.json` for [/stats](https://btso.dev/stats): tokens, API-price
value, models, tools, a weekday-by-hour rhythm and the public apps the work went into.

It reads [Agent Pulse](https://github.com/btsouth/omarchy-usage-dashboard)'s usage ledger, which
already parses and deduplicates the logs of every coding tool on the machine, adds the
devbox's Claude Code and Codex logs over rsync, and values each model call with Agent Pulse's
price list. Only personal accounts count: work accounts, other people's logins and any session
in a work folder are left out. The output is numbers only, and a project is named only when
it's a public app in `src/data/projects.json`.

`publish.sh` runs it in its own clone and pushes the result, which deploys the site. A systemd
user timer runs that every night:

```bash
ln -sf ~/.cache/btso-usage/site/scripts/usage/btso-usage.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now btso-usage.timer
```
