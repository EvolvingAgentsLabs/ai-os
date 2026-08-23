#!/usr/bin/env bash
# The upstream test count, checked against the suite that produces it.
#
# `check-test-count.sh` guards the 626 tests this repository wrote.  The number
# beside it on the front page -- the tests `ai-base` carries from upstream -- had
# nothing watching it at all, and it is the number in this repository most
# certain to rot: `ai-base` is `git subtree pull`ed weekly from a repository that
# moves daily, so every pull can change it and nothing would say so.
#
# ## Why this is a separate script and a separate job
#
# `ci.yml` already runs these suites, but it shards them five ways for wall-clock
# and each shard reports only its own total.  Summing across matrix jobs needs
# artifacts passed between them, which is more machinery than the number is
# worth.  Running the suite unsharded once, nightly, is cheaper in every sense --
# and this claim only has to be true daily, not per-commit.
#
# It runs the suite rather than counting `it(`, for the reason
# `check-test-count.sh` gives at length: a static count measures a different
# quantity from the published figure, and a check that measures the wrong
# quantity is worse than no check.
#
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
cd "$(dirname "$0")/.."

# Both phrasings, and both wrap across a line break in the READMEs -- so the
# documents are read with newlines flattened.  A claim invisible to its own
# check is how doc 18 kept saying 605.
pattern='[0-9,\.]+ (`ai-base` carries from upstream|que `ai-base` trae de upstream)'

echo "running ai-base's suite unsharded; this is minutes, not seconds"
actual=$( cd ai-base && npm test 2>&1 | grep -E '^. tests [0-9]+' | grep -oE '[0-9]+' )

if [ -z "$actual" ]; then
  echo "FAIL  ai-base's suite reported no total; it did not run"
  exit 1
fi
echo "suite    $actual tests"

fail=0
found=0
while IFS= read -r f; do
  claimed=$(tr '\n' ' ' < "$f" | grep -ohE "$pattern" | grep -oE '^[0-9,\.]+' | tr -d ',.' | sort -u || true)
  [ -n "$claimed" ] || continue
  found=$((found + 1))
  for c in $claimed; do
    if [ "$c" != "$actual" ]; then
      echo "FAIL  $f says $c; the suite reports $actual"
      fail=1
    else
      echo "ok    $f — $actual"
    fi
  done
done < <(git ls-files '*.md' ':!:ai-base/*')

if [ "$found" -eq 0 ]; then
  echo "FAIL  no document states the upstream test count, and README.md has to"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "A weekly \`git subtree pull\` changes this number. Update it, and the copy"
  echo "in the website repository: evolvingagentslabs.github.io/index.html"
  exit 1
fi
