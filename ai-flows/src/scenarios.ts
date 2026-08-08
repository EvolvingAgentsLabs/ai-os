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
