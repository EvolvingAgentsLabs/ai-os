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

total_of() {
  ( cd "$1" && npm test 2>&1 | grep -oE '(^|[^a-z])tests [0-9]+$' | grep -oE '[0-9]+' )
}

flows=$(total_of ai-flows)
ui=$(total_of ai-ui)
actual=$((flows + ui))

# ## It scans every document, not the two READMEs
#
# The first version checked `README.md` and `README.es.md`. On 2026-08-23 doc 18
# was found carrying **605** while both READMEs carried 626 -- a claim in a file
# nobody had listed, which is the same failure this script exists to prevent,
# one directory over. So the file list is now discovered rather than written
# down: any markdown file that states a test count is checked, and a file that
# states one is never invisible to this check again.
#
# The phrasings are the ones the documents actually use, in both languages.
# Adding a fourth way to say it is fine; adding it without adding it here is how
# the count drifts.
pattern='[0-9,\.]+ tests (of our own|of their own|propios)'

fail=0
found=0
while IFS= read -r f; do
  # `|| true`: `set -e` plus `pipefail` would abort on the first document
  # that simply does not mention a test count, which is most of them.
  claimed=$(grep -ohE "$pattern" "$f" | grep -oE '^[0-9,\.]+' | tr -d ',.' | sort -u || true)
  [ -n "$claimed" ] || continue
  found=$((found + 1))
  for c in $claimed; do
    if [ "$c" != "$actual" ]; then
      echo "FAIL  $f says $c; the suites report $actual (ai-flows $flows + ai-ui $ui)"
      fail=1
    else
      echo "ok    $f — $actual"
    fi
  done
done < <(git ls-files '*.md' ':!:ai-base/*')

for f in README.md README.es.md; do
  if ! grep -qE "$pattern" "$f"; then
    echo "FAIL  $f states no test count, and the front page has to"
    fail=1
  fi
done

if [ "$found" -eq 0 ]; then
  echo "FAIL  no document states a test count at all"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "Update the number above, and the copy in the website repository:"
  echo "  evolvingagentslabs.github.io/index.html"
  exit 1
fi
