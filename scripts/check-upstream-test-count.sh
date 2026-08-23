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

# ## The summary line, and the locale it was matched in
#
# `node --test` writes its totals as `\u2139 tests 3768`. Matching that with
# `^. tests` -- which is what this repository did first -- works only where the
# shell's locale is UTF-8, because in the C locale `.` matches one *byte* and the
# information glyph is three. GitHub's runners set a UTF-8 locale, so the check
# passed there and returned nothing at all in a plain container: the count came
# back empty, bash arithmetic read the empty string as zero, and every claim
# failed against a total of 0.
#
# It fails closed, which is the only reason this was cheap to find. The pattern
# below anchors on the end of the line instead of on a glyph, so it does not care
# what locale it is read in.

# The suite's output is captured rather than piped, so a red suite is reported as
# a red suite. Piping it into `grep` under `pipefail` makes the script die on the
# npm exit code with the reason swallowed, which is a confusing way to learn that
# somebody's tests are failing.
log=$(mktemp)
trap 'rm -f "$log"' EXIT

echo "running ai-base's suite unsharded; this is minutes, not seconds"
if ! ( cd ai-base && npm test ) > "$log" 2>&1; then
  echo "FAIL  ai-base's suite did not pass, so the published count is not a count"
  echo "      of a green suite. Totals it did report:"
  grep -oE '(^|[^a-z])(tests|pass|fail) [0-9]+$' "$log" | sed 's/^[^a-z]*/      /' || true
  exit 1
fi

actual=$( grep -oE '(^|[^a-z])tests [0-9]+$' "$log" | grep -oE '[0-9]+' )
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
