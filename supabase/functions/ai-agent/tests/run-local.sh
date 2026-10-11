#!/bin/sh
# Runs every ai-agent test, including the ones that need a database, against
# the LOCAL Supabase stack (`supabase start`). Never against a hosted project:
# tests/local.ts refuses any URL that isn't 127.0.0.1 or localhost.
#
#   sh supabase/functions/ai-agent/tests/run-local.sh
#
# Without the local stack, `npm run test:ai` runs the tests that need no database.
set -eu
cd "$(dirname "$0")/.."

env_output="$(supabase status -o env 2>/dev/null)" || {
  echo "The local Supabase stack isn't running. Start it with: supabase start" >&2
  exit 1
}
value() { printf '%s\n' "$env_output" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }

AI_TEST_SUPABASE_URL="$(value API_URL)" \
AI_TEST_ANON_KEY="$(value ANON_KEY)" \
AI_TEST_SERVICE_ROLE_KEY="$(value SERVICE_ROLE_KEY)" \
  deno test --allow-env --allow-net --allow-read tests/ "$@"
