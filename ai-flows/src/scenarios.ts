/**
 * A scenario set with a chance of failing.
 *
 * The first evaluation run scored both configurations 3/3 and the harness
 * correctly refused to call it a comparison — `NO-HEADROOM`. The scenarios were
 * easy enough that a plain one-step answer got all of them, so nothing a better
 * arrangement of agents could do would show. This set exists to have room.
 *
 * ## Every answer here was computed, not recalled
 *
 * Each `expect` below was produced by running the computation, and the program
 * that produced them is quoted in the header of each group. Writing a benchmark
 * whose ground truth came out of the same kind of system being tested is how a
 * suite ends up grading a model against its own mistake — and this file exists
 * precisely because that failure mode is the one worth spending effort on.
 *
 * ## Why every answer is a number
 *
 * `evaluation.ts` refuses model judges, so a check has to be a plain function.
 * A prose answer then has to be matched by pattern, and the first attempt at that
 * failed exactly as predicted: `/not a leap year/` scored two correct answers as
 * wrong because the model wrote "is **not** a leap year" and the markdown broke
 * the match. A number either appears or it does not.
 *
 * ## What makes these hard rather than merely long
 *
 * They are all short to state and tedious to do in one pass — the shape where
 * answering from recall is plausible and being right is not. That is the property
 * the comparison needs: a configuration that *computes* should beat one that
 * *remembers*, and if it does not, that is a finding about the configurations
 * rather than about the questions.
 */

export interface NumericScenario {
  id: string;
  goal: string;
  /** Computed, never recalled. See the header. */
  expect: string;
  /** Why this one is expected to be hard for a single recalled answer. */
  why: string;
}

/**
 * Verified with:
 *
 *   fib(47), len(primes(1000)), leap years 1900-2100, digit sum of 2**100,
 *   trailing zeros of 100!, gcd(1071,462), divisor count of 5040, 17**5,
 *   Collatz steps for 27, sum of primes below 100, bin(1000), len(primes(10000))
 */
export const NUMERIC_SCENARIOS: readonly NumericScenario[] = [
  {
    id: "fib-47",
    goal: "compute the 47th Fibonacci number, where F(1)=1 and F(2)=1",
    expect: "2971215073",
    why: "far enough along that the digits are not memorable",
  },
  {
    id: "primes-below-1000",
    goal: "count the prime numbers below 1000",
    expect: "168",
    why: "a commonly quoted figure, so recall may well get it — a control on the easy end",
  },
  {
    id: "primes-below-10000",
    goal: "count the prime numbers below 10000",
    expect: "1229",
    why: "quoted less often than the one below 1000",
  },
  {
    id: "leap-years-1900-2100",
    goal: "count the leap years from 1900 to 2100 inclusive under the Gregorian rules",
    expect: "49",
    why: "two century exceptions at both ends, and 2000 is not one of them",
  },
  {
    id: "digit-sum-2-100",
    goal: "compute the sum of the decimal digits of 2 raised to the power 100",
    expect: "115",
    why: "requires the 31-digit expansion before the sum",
  },
  {
    id: "trailing-zeros-100-factorial",
    goal: "compute how many trailing zeros 100 factorial ends with",
    expect: "24",
    why: "the 25s are the step people drop",
  },
  {
    id: "gcd-1071-462",
    goal: "compute the greatest common divisor of 1071 and 462",
    expect: "21",
    why: "short enough to do by hand, so a genuine control: both arms should get it",
  },
  {
    id: "divisors-5040",
    goal: "count the positive divisors of 5040",
    expect: "60",
    why: "needs the factorisation first",
  },
  {
    id: "seventeen-to-the-fifth",
    goal: "compute 17 to the power of 5",
    expect: "1419857",
    why: "one multiplication too many to be reliable from memory",
  },
  {
    id: "collatz-steps-27",
    goal: "compute how many steps the Collatz sequence starting at 27 takes to reach 1, counting each step",
    expect: "111",
    why: "111 steps with a long excursion — the case that is famous for being longer than it looks",
  },
  {
    id: "sum-primes-below-100",
    goal: "compute the sum of all prime numbers below 100",
    expect: "1060",
    why: "twenty-five terms; a slip anywhere changes the total",
  },
  {
    id: "binary-1000",
    goal: "write the decimal number 1000 in binary",
    expect: "1111101000",
    why: "the one non-decimal answer, still an exact string",
  },
];

/**
 * Present as a standalone number, so `24` does not match inside `1024` or `3.24`
 * — **and does match in "The answer is 24."**
 *
 * That last case is not a detail. The first version excluded `.` from both
 * boundaries to keep `3.24` out, and thereby rejected every correct answer that
 * ended a sentence. It scored `"The answer is 24."` as WRONG.
 *
 * It cost a headline. A review study reported that a reviewer had taken a correct
 * answer and made it wrong — the whole point of the study — and the "damaged"
 * answer was `24.` with a full stop. The reviewer had been right. **The instrument
 * built to catch a bad reviewer produced a bad reviewer.**
 *
 * So the boundaries are asymmetric on purpose: a `.` before the number only
 * disqualifies it when a digit precedes the dot (`3.24`), and a `.` after only
 * when a digit follows it (`24.5`). A trailing full stop is punctuation.
 */
export function statesNumber(produced: string, expected: string): boolean {
  const cleaned = produced.replace(/[,_](?=\d)/g, "");
  return new RegExp(`(?<!\\w)(?<!\\d\\.)${expected}(?!\\w)(?!\\.\\d)`).test(cleaned);
}

/**
 * A second domain, chosen because the first had no headroom.
 *
 * Twelve arithmetic questions were answered 12/12 in a single step, so nothing a
 * better arrangement could do would show. These ask about **this repository's own
 * source**, seeded into the read-only `global/source/` layer by
 * `scripts/seed-source.ts` and readable from any scope's sandbox.
 *
 * The property that matters: **the first answer is contestable.** A model
 * answering from plausibility produces a number that looks right, and only
 * reading the file settles it. That is the shape the g-AMIE study needs and the
 * arithmetic set could not provide.
 *
 * Every `expect` was computed by grepping the tree, never recalled. If the source
 * changes, these go stale — which is the cost of using a live codebase as a
 * benchmark, and is why each names the file it depends on.
 */
export const SOURCE_SCENARIOS: readonly NumericScenario[] = [
  {
    id: "src-min-input-tokens",
    goal: "In the file global/source/contribution.ts, what is the numeric value of the exported constant MIN_INPUT_TOKENS?",
    expect: "12",
    why: "one grep away for a reader, pure invention for a guesser",
  },
  {
    id: "src-numeric-scenarios-count",
    goal: "In global/source/scenarios.ts, how many entries does the exported array NUMERIC_SCENARIOS contain?",
    expect: "12",
    why: "requires counting entries rather than reading a literal",
  },
  {
    id: "src-replay-window-minutes",
    goal: "In global/source/core-client.ts, REPLAY_WINDOW_MS is defined as a number of minutes in milliseconds. How many minutes is it?",
    expect: "5",
    why: "the value is written as an expression, not a plain number",
  },
  {
    id: "src-compose-max-steps",
    goal: "In global/source/compose.ts, what is the default value used for maxSteps when the caller does not supply one?",
    expect: "25",
    why: "a default expressed with ?? inside the function body",
  },
  {
    id: "src-flow-states-count",
    goal: "In global/source/types.ts, how many values are in the FLOW_STATES array?",
    expect: "6",
    why: "counting a const tuple",
  },
  {
    id: "src-step-states-count",
    goal: "In global/source/types.ts, how many values are in the STEP_STATES array?",
    expect: "6",
    why: "the same shape as FLOW_STATES, so a guesser that pattern-matches may still miss",
  },
  {
    id: "src-evaluation-verdicts",
    goal: "In global/source/evaluation.ts, how many distinct values can the EvaluationVerdict type take?",
    expect: "3",
    why: "a union spread over several lines with comments between the members",
  },
  {
    id: "src-membership-shaped-count",
    goal: "In global/source/conformation.ts or wherever it is defined in the seeded source, how many entries are in the MEMBERSHIP_SHAPED list? If the file is not present, answer 0.",
    expect: "0",
    why: "the file is deliberately NOT seeded — the correct answer is that it cannot be read, and a guesser will invent a count",
  },
  {
    id: "src-attempt-states-count",
    goal: "In global/source/types.ts, how many values are in the ATTEMPT_STATES array?",
    expect: "3",
    why: "a shorter tuple in the same file as two six-value ones",
  },
  {
    id: "src-flow-shapes-count",
    goal: "In global/source/types.ts, how many values are in the FLOW_SHAPES array?",
    expect: "1",
    why: "a single-element tuple, which reads as a mistake and invites a guesser to say more",
  },
  {
    id: "src-contribution-verdicts",
    goal: "In global/source/contribution.ts, how many distinct values can the ContributionVerdict type take?",
    expect: "3",
    why: "another commented union",
  },
  {
    id: "src-terminal-run-states",
    goal: "In global/source/core-client.ts, how many entries are in the TERMINAL set of run statuses?",
    expect: "8",
    why: "a Set literal on one long line",
  },
];
