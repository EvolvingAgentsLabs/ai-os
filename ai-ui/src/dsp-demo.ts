/**
 * A signal chain on the desk — the second scope in the demo.
 *
 * ## Why a signal chain, of all things
 *
 * The desk's whole claim is that **green is not correct**: a step can run,
 * settle, report, and have carried nothing forward. On a flow of prose that
 * claim is real and hard to feel, because the reader has to take the
 * instrument's word for it. On a signal chain it is a picture. A waveform goes
 * in, a fixed-point conversion with the scale entered wrong truncates every
 * sample to zero, and each downstream stage runs happily on nothing and reports
 * success. The flow ends green, with a confident answer — bin 0, magnitude 0.00
 * — and the evidence is a flatline anybody can see.
 *
 * Two flows, the same six agents, the same six steps, both entirely green. One
 * found the tone at 5 Hz; the other lost it at step 2 and never noticed.
 * **Nothing in the desk knows what a Fourier transform is**: the same digest,
 * the same trace, the same mascot and the same "carried nothing forward" flag do
 * all of the work. That is the argument — the instruments are not about text.
 *
 * ## Everything here is computed, not written
 *
 * The numbers below come out of an actual notch filter and an actual radix-2
 * FFT, run at build time so the page stays byte-identical per build. Writing
 * plausible arrays by hand would have made this a drawing of an argument
 * instead of the argument.
 *
 * And the verdict on each handoff is **measured, not inferred**: every stage is
 * re-run with a perturbed input and the change in its output is compared to the
 * change in its input. A stage whose output does not move is flagged through the
 * same `contribution` field a real core would use ([trace.ts](trace.ts)).
 *
 * Prose overlap — the desk's usual instrument — would have passed the broken
 * stage without hesitating, and that is the point rather than a caveat. The two
 * reports differ by one number: "converted 64 samples to fixed point at 32767
 * counts per unit" against "…at 0.5 counts per unit". Every distinctive word
 * carries. It is the signal that is missing, not the vocabulary.
 */

/** 64 samples at 64 Hz: one second, and a power of two for the radix-2 stages. */
const N = 64;
const RATE = 64;

/**
 * The signal: a 5 Hz tone worth finding, a 23 Hz hum worth removing, and a
 * little noise. Deterministic — a seeded ripple rather than `Math.random`, so
 * the built page does not change when nothing changed.
 */
function sensorTrace(): number[] {
  const xs: number[] = [];
  for (let n = 0; n < N; n += 1) {
    const tone = Math.sin((2 * Math.PI * 5 * n) / N);
    const hum = 0.45 * Math.sin((2 * Math.PI * 23 * n) / N);
    const noise = 0.05 * Math.sin(n * 12.9898) * Math.cos(n * 4.1414);
    xs.push(tone + hum + noise);
  }
  return xs;
}

/** A notch, as a two-pole biquad. Identical in both chains: it is not the bug. */
function notch(xs: number[], hz: number, r: number): number[] {
  const w = (2 * Math.PI * hz) / RATE;
  const b0 = 1, b1 = -2 * Math.cos(w), b2 = 1;
  const a1 = -2 * r * Math.cos(w), a2 = r * r;
  const out: number[] = [];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (const x of xs) {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out.push(y);
  }
  return out;
}

/**
 * Fixed point, with the scale as a parameter — and the scale is the bug.
 *
 * `counts` is how many integer counts one unit of signal is worth. At 32767 this
 * is an ordinary Q15 conversion and loses nothing that matters. At 0.5 every
 * sample of a signal that never leaves ±1.3 truncates to **zero**, and the stage
 * still returns 64 valid numbers, in range, with no clipping to report.
 *
 * This is the defect the whole scope exists to show, and it was chosen because
 * the two reports are nearly the same sentence — "converted 64 samples to fixed
 * point, range respected, no clipping" — differing in one number. Prose overlap,
 * the desk's usual instrument for "did this step carry anything", would pass it
 * without hesitating. Only the numbers know.
 */
function quantise(xs: number[], counts: number): number[] {
  return xs.map((x) => Math.trunc(x * counts) / counts);
}

/** Hann. Trades leakage for a wider main lobe, as it always has. */
function hann(xs: number[]): number[] {
  return xs.map((x, n) => x * 0.5 * (1 - Math.cos((2 * Math.PI * n) / (xs.length - 1))));
}

/** Radix-2 decimation in time, iterative. Returns [re, im]. */
function fft(xs: number[]): [number[], number[]] {
  const n = xs.length;
  const re = xs.slice(), im = new Array(n).fill(0);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k]!, ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
  return [re, im];
}

/** Magnitudes of the first half — the only half that means anything for real input. */
function spectrum(xs: number[]): number[] {
  const [re, im] = fft(xs);
  const out: number[] = [];
  for (let k = 0; k < xs.length / 2; k += 1)
    out.push((2 / xs.length) * Math.hypot(re[k]!, im[k]!));
  return out;
}

const peak = (mags: number[]) => {
  let best = 0;
  for (let k = 1; k < mags.length; k += 1) if (mags[k]! > mags[best]!) best = k;
  return { bin: best, hz: (best * RATE) / N, mag: mags[best]! };
};

const energy = (xs: number[]) => Math.sqrt(xs.reduce((s, v) => s + v * v, 0));
const round3 = (xs: number[]) => xs.map((v) => Math.round(v * 1000) / 1000);

/**
 * Does this stage's output move when its input does?
 *
 * One percent onto a single sample, the stage re-run, and the change in the
 * output measured against the change in the input. Zero means the stage is not
 * listening — which is a different and much worse thing than a stage producing
 * a small output, and no amount of reading its report would tell them apart.
 */
function sensitivity(stage: (xs: number[]) => number[], input: number[]) {
  // Across every sample rather than one of them: nudging a single sample at the
  // edge of a Hann window measures the window's taper, not the stage, and read
  // as 0.02 for a stage that was working perfectly. A measurement that depends
  // on where you poke is measuring the poke.
  const scale = Math.max(...input.map((v) => Math.abs(v)), 1);
  const bump = 0.01 * scale;
  const nudged = input.map((v) => v + bump);
  const base = stage(input);
  const dOut = energy(stage(nudged).map((v, i) => v - base[i]!));
  const dIn = energy(nudged.map((v, i) => v - input[i]!));
  const ratio = dIn ? dOut / dIn : 0;
  return Math.round(ratio * 10000) / 10000;
}

interface DspStep {
  index: number;
  state: string;
  agent: string;
  intent: string;
  result: string | null;
  attempts: Array<Record<string, unknown>>;
  series?: number[];
  contribution?: { carried: number; inputTokens: number; note?: string };
}

/**
 * One chain, built by running it.
 *
 * `counts` is the whole difference between the two flows on the desk: 32767 is
 * an ordinary Q15 conversion, 0.5 truncates the signal to zero. Every sentence,
 * number and picture below is produced by the same code from that one parameter
 * — the broken flow is not written to look broken, it is run broken.
 */
function chain(
  id: string,
  title: string,
  counts: number,
  updatedAt: number,
  lastStepPending: boolean,
) {
  const raw = sensorTrace();
  const filtered = notch(raw, 23, 0.97);
  const fixed = quantise(filtered, counts);
  const windowed = hann(fixed);
  const mags = spectrum(windowed);
  const p = peak(mags);
  const fmt = (v: number) => v.toFixed(2);

  const stages: Array<{
    agent: string;
    said: string;
    series: number[];
    fn: (xs: number[]) => number[];
    input: number[];
  }> = [
    {
      agent: "SampleAgent",
      said: `Read ${N} samples at ${RATE} Hz off sensor-7. Peak amplitude ${fmt(Math.max(...raw.map(Math.abs)))}.`,
      series: raw,
      fn: (xs) => xs,
      input: raw,
    },
    {
      agent: "NotchAgent",
      said: `Notched the 23 Hz mains hum. Two poles at r=0.97; ${N} samples returned.`,
      series: filtered,
      fn: (xs) => notch(xs, 23, 0.97),
      input: raw,
    },
    {
      agent: "QuantiseAgent",
      said: `Converted ${N} samples to fixed point at ${counts} counts per unit. Range respected, nothing clipped.`,
      series: fixed,
      fn: (xs) => quantise(xs, counts),
      input: filtered,
    },
    {
      agent: "WindowAgent",
      said: `Hann window applied across ${N} samples. Leakage traded for a wider main lobe.`,
      series: windowed,
      fn: hann,
      input: fixed,
    },
    {
      agent: "Radix2Agent",
      said: `Radix-2 transform, ${N} points: bit-reversal, 6 stages, 192 butterflies.`,
      series: mags,
      fn: spectrum,
      input: windowed,
    },
    {
      agent: "PeakAgent",
      said: `Strongest component: bin ${p.bin} (${p.hz.toFixed(1)} Hz), magnitude ${fmt(p.mag)}.`,
      series: mags,
      fn: spectrum,
      input: windowed,
    },
  ];

  const steps: DspStep[] = stages.map((st, index) => {
    const pending = lastStepPending && index === stages.length - 1;
    const carried = sensitivity(st.fn, st.input);
    return {
      index,
      state: pending ? "pending" : "done",
      agent: st.agent,
      intent: `Call your \`delegate\` tool with agent="${st.agent}". The task: find the 5 Hz component hidden under the mains hum`,
      result: pending ? null : st.said,
      attempts: pending
        ? []
        : [
            {
              n: 1,
              state: "done",
              runId: `run-${id}-${index}`,
              error: null,
              // A fingerprint of the numbers, so the observability instrument
              // reads movement in the signal rather than in the prose.
              digest: `s${Math.abs(Math.round(energy(st.series) * 1000)) % 100000}`,
              source: "run.reply",
            },
          ],
      series: pending ? undefined : round3(st.series),
      contribution: pending
        ? undefined
        : {
            carried,
            inputTokens: N,
            note:
              carried === 0
                ? `its output does not move when its input does — Δout/Δin = 0.0000 across ${N} samples`
                : `output moved ${carried.toFixed(3)}× its input across ${N} samples`,
          },
    };
  });

  const done = steps.filter((s) => s.state === "done").length;
  return {
    id,
    title,
    goal: "find the 5 Hz component hidden under the mains hum",
    state: "waiting",
    updatedAt,
    done,
    total: steps.length,
    steps,
  };
}

/** The agents of the signal lab. Same shapes the desk already draws. */
export function dspAgents() {
  return [
    {
      name: "ChainLead",
      description: "Owns the measurement chain. Splits it and routes each stage.",
      tools: ["read", "write", "execute"],
      child: false,
      missing: false,
    },
    {
      name: "SampleAgent",
      description: "Pulls a window of samples off the sensor.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "NotchAgent",
      description: "Removes mains hum with a two-pole notch.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "WindowAgent",
      description: "Applies the window function before the transform.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "QuantiseAgent",
      description: "Converts the window to fixed point for the DSP core.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "Radix2Agent",
      description: "Runs the radix-2 transform over the windowed samples.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "PeakAgent",
      description: "Reports the strongest component and its bin.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "CalibrationAgent",
      description: "Declared in a subagents list. No file behind it.",
      tools: [],
      child: true,
      missing: true,
    },
  ];
}

/**
 * The two flows.
 *
 * Yesterday's chain found the tone. Tonight's did not, and says it did. Both are
 * green, both are 6 steps, and the only visible difference before you open
 * anything is the shape of the numbers each step carried.
 */
export function dspFlows(at: number) {
  return [
    chain(
      "flow-tone-yesterday",
      "Tone hunt — yesterday's chain",
      32767,
      at - 26 * 3600_000,
      false,
    ),
    chain(
      "flow-tone-tonight",
      "Tone hunt — tonight's chain",
      0.5,
      at - 40 * 60_000,
      true,
    ),
  ];
}
