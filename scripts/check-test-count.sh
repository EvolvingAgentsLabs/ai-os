#!/usr/bin/env bash
# The published test count, checked against the suites that produce it.
#
# The number drifted three times in one week: the README and the website are
# edited by hand, the suites grow in a different commit, and nothing fails. A
# claim nobody verifies is a claim that rots -- the rule this repository applies
# to every other kind of claim, turned on its own front page.
#
# ## It runs the suites rather than counting `it(`
#
# The first version counted occurrences of `it(` in the test files and reported
# 307 where the runner reports 333. Both numbers are defensible and they are not
# the same number: `flow-store.test.ts` runs its block once per backend, so a
# static count measures something the published figure does not. A check that
# measures a different quantity from the claim it guards is worse than no check,
# because it will be silenced rather than believed.
#
# So it runs them, and it refuses to answer without a database rather than
# reporting the smaller number that a missing Postgres would produce.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "SKIP  DATABASE_URL is unset, so ai-flows would skip its postgres backend"
  echo "      and this check would compare the claim against a smaller suite."
  echo "      Set DATABASE_URL to verify."
  exit 0
fi

total_of() {
  ( cd "$1" && npm test 2>&1 | grep -E '^. tests [0-9]+' | grep -oE '[0-9]+' )
}

flows=$(total_of ai-flows)
ui=$(total_of ai-ui)
actual=$((flows + ui))

fail=0
for f in README.md README.es.md; do
  claimed=$(grep -oE '[0-9,\.]+ tests (of our own|propios)' "$f" | grep -oE '^[0-9,\.]+' | tr -d ',.' || true)
  if [ -z "$claimed" ]; then
    echo "FAIL  $f states no test count"
    fail=1
  elif [ "$claimed" != "$actual" ]; then
    echo "FAIL  $f says $claimed; the suites report $actual (ai-flows $flows + ai-ui $ui)"
    fail=1
  else
    echo "ok    $f — $actual"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "Update the number above, and the copy in the website repository:"
  echo "  evolvingagentslabs.github.io/index.html"
  exit 1
fi
