# 06 · Licensing

<img src="assets/06-licensing.jpg" alt="" width="100%">

<sub>Apache over MIT, and what the overlap permits.</sub>

> **Project.** Terms. Binding on this repository.


> Not legal advice. This is an engineering document recording what we did and
> why. If ai-os is ever commercialised or contributed to by non-employees, have
> a lawyer read this page.

## The question

Can ai-os be Apache 2.0 if QM is MIT?

**Yes.** Verified at the source rather than assumed:

```
$ curl -s https://api.github.com/repos/yc-software/qm | jq .license.spdx_id
"MIT"

$ head -3 ai-base/LICENSE
MIT License

Copyright (c) 2026 QM contributors
```

The MIT license grants, in its own words, the right *"to deal in the Software
without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, **sublicense**, and/or sell copies"*.

**`sublicense` is the operative word.** It is what permits redistributing a
derivative or combined work under different terms, including Apache 2.0. This is
routine and not a grey area.

## What we may not do

Three limits, because "yes" is not unconditional:

**1. We cannot un-MIT the upstream code.** Relicensing forward does not revoke
anything. Anyone who obtains QM from `yc-software/qm` gets it under MIT no matter
what this repository says. What Apache 2.0 covers is *our* work and the combined
whole — not the upstream's own distribution.

**2. Attribution is mandatory, not courteous.** MIT: *"The above copyright notice
and this permission notice **shall** be included in all copies or substantial
portions of the Software."* Deleting `ai-base/LICENSE`, or shipping a build of
`ai-base` code without that notice, is a license violation. It is the one thing
here that is actually easy to get wrong.

**3. Apache 2.0 grants no trademark rights (§6), and MIT grants none either.**
"QM" is yc-software's name. We do not use it for anything of ours, and we do not
imply endorsement or affiliation — they are YC-affiliated, which makes implied
association worse than merely inaccurate.

## What we did

| Path | License | Why |
|---|---|---|
| `/LICENSE` | Apache 2.0 | The repository and all first-party code |
| `/NOTICE` | — | Apache §4(d) attribution, naming QM and its MIT terms |
| `ai-base/LICENSE` | MIT, **verbatim, unmodified** | The upstream notice, preserved as MIT requires |
| `ai-base/**` (incl. our edits) | MIT | See below |
| `doc/`, `ai-flows/`, `ai-ui/`, `ai-storage/` | Apache 2.0 | First-party |

### Why our modifications inside `ai-base/` stay MIT

We could license our changes to `ai-base` under Apache 2.0 — legally fine, since
they are our work. We deliberately do not, for one practical reason:

**Upstreamability.** A patch we want to send to QM must be contributable under
*their* license. If our `ai-base` edits were Apache 2.0, every upstream
contribution would need a per-patch relicense, and in practice that friction
means the patch never gets sent. Keeping `ai-base/` uniformly MIT keeps the door
open in both directions.

This is also the honest incentive: we benefit from upstream continuing to move.
Making it hard to give back is a bad trade for a fork that intends to pull weekly.

### Why Apache 2.0 for everything else

Three properties MIT does not have:

1. **Patent grant (§3).** Contributors grant a patent license, terminated if they
   sue over the software. MIT is silent on patents. For an OS-level project this
   matters more than usual.
2. **Explicit trademark clause (§6).** Removes ambiguity we would otherwise have
   to answer by hand.
3. **Change notices (§4(b)).** Modified files carry a statement of change, which
   is exactly the discipline a vendored fork needs anyway.

Note the asymmetry: Apache's patent grant covers **our** contributions. It does
**not** retroactively add a patent grant to QM's MIT code. Anyone relying on
`ai-base` relies on MIT's silence there, as they would upstream.

## Practical rules

**For every file added under `ai-base/`:** it is MIT. Add the SPDX header
`// SPDX-License-Identifier: MIT`.

**For every file added elsewhere:** it is Apache 2.0. Add
`// SPDX-License-Identifier: Apache-2.0`.

**For every file modified under `ai-base/`:** add a line to
`ai-base/AI-OS-PATCHES.md` — what, why, upstreamable yes/no. This satisfies
Apache §4(b) in spirit, and more importantly it is the list you need when a
`git subtree pull` conflicts.

**Never:** delete or edit `ai-base/LICENSE`; move MIT-derived code out of
`ai-base/` into an Apache-licensed directory without keeping the MIT notice with
it; name anything "QM"; imply affiliation with yc-software or Y Combinator.

## Dependencies

QM does not vendor its npm dependencies, so no third-party licenses are mixed
into this repository's source. Their licenses matter at *distribution* time, not
for the repository license.

One to be aware of, since it is unusual in this stack: `ai-base/plugins/web-ui`
depends on `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` and
`@earendil-works/pi-web-ui`. If ai-os ever distributes built artifacts rather
than source, **audit the full dependency tree then** — that is the moment the
question becomes real, and it is out of scope until it does.

## If we ever want to stop being a fork

Two exits, recorded now so nobody re-derives them later:

**Become a deployment.** QM's intended extension path: a deployment repository
depending on `@yc-software/qm`, wiring substrates in one file. This is clean
Apache-over-MIT with no vendored code at all. Viable if — and only if — our core
modifications shrink to zero. Tracked in [ADR-0001](adr/0001-fork-vs-dependency.md).

**Upstream the divergence.** If `ai-flows` turns out to belong in QM and they
want it, the fork's reason to exist mostly evaporates. A good outcome, not a
failure.
