/**
 * Play — the demo, driving itself.
 *
 * A person who opens the desk sees an arrangement and no idea what any of it is
 * for. The gestures that make it worth having — a cube dropped on a document
 * becoming a real step, the digest saying what it stands for, an answer read out
 * of the trace — are all invisible until somebody performs one, and a visitor on
 * a website will not.
 *
 * ## It drives the real client. It does not play a movie.
 *
 * This is the same rule [simulate.ts](simulate.ts) lives under, one level up, and
 * it is the only thing that makes a tour honest: every beat below **dispatches
 * the events a person would** — `pointerdown`, `pointermove`, `pointerup` on the
 * actual cube, `click` on the actual button — and then lets the desk react
 * however it reacts. Nothing here draws a frame, animates a fake, or asserts an
 * outcome.
 *
 * The property that buys: **if the desk breaks, the tour breaks.** A scripted
 * animation of a product is a second implementation of it, and it goes on looking
 * correct for as long as nobody checks. This cannot: drop the cube on a document
 * that no longer accepts one and the step does not appear, visibly.
 *
 * ## It never fights the person watching
 *
 * Any real pointer or key event stops the tour where it is and leaves the desk
 * exactly as the tour left it. A demo that keeps moving things while somebody is
 * trying to click is worse than no demo, and "it will finish in a second" is not
 * a defence — they came to touch it.
 *
 * ## Demo only
 *
 * Injected next to the simulation and only when `simulate` is set, so the product
 * cannot ship a thing that moves the user's documents around. A test asserts the
 * unsimulated page does not contain it.
 */
export const TOUR_JS = String.raw`
(() => {
  const $ = (s) => document.querySelector(s);
  const docs = () => [...document.querySelectorAll('.docnode')];
  const docByTitle = (t) => docs().find((d) => d.innerText.includes(t));
  // By id, not by text: a creature's label now carries what it is doing next to
  // its name, so matching innerText found nothing the moment an agent was busy.
  const cubeNamed = (n) => [...document.querySelectorAll('.acube')].find((c) => c.dataset.id === n);

  const bar = document.createElement('div');
  bar.className = 'tourbar';
  bar.innerHTML =
    '<button id="tourgo">▶ Play</button>' +
    '<span id="tourcap">Watch the desk use itself — every step below is a real gesture, not a recording.</span>';
  document.body.appendChild(bar);

  // A visible pointer. The drag is the one gesture that is incomprehensible
  // without seeing where the hand is.
  const hand = document.createElement('div');
  hand.className = 'tourhand';
  document.body.appendChild(hand);

  let running = false, stop = false;
  // Published because the mascot ([mascot.ts](mascot.ts)) reacts to the same
  // events the tour dispatches, and two voices narrating one gesture is worse
  // than either alone. It stays quiet while this is true.
  window.__TOUR__ = { running: false };
  const cap = (t) => { $('#tourcap').textContent = t; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const halt = () => {
    if (!running) return;
    stop = true;
    hand.style.opacity = '0';
    cap('Stopped — it is yours. Press Play to watch the rest.');
  };
  // A real gesture wins immediately. isTrusted is false for everything the tour
  // dispatches, so this cannot stop itself.
  for (const ev of ['pointerdown', 'keydown', 'wheel'])
    window.addEventListener(ev, (e) => { if (e.isTrusted) halt(); }, true);

  const moveHand = async (x, y, ms) => {
    const r = hand.getBoundingClientRect();
    const x0 = r.left || x, y0 = r.top || y;
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps && !stop; i++) {
      const t = i / steps, e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; // ease
      const cx = x0 + (x - x0) * e, cy = y0 + (y - y0) * e;
      hand.style.left = cx + 'px'; hand.style.top = cy + 'px';
      await sleep(16);
    }
  };

  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };

  const pointAt = async (el, ms) => {
    hand.style.opacity = '1';
    const [x, y] = centre(el);
    await moveHand(x, y, ms || 700);
  };

  /** A real drag: the same three events a hand produces, on the real element. */
  const dragOnto = async (el, target) => {
    const [sx, sy] = centre(el);
    await pointAt(el, 600);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: sx, clientY: sy, pointerId: 1 }));
    const [tx, ty] = centre(target);
    const steps = 26;
    for (let i = 1; i <= steps && !stop; i++) {
      const t = i / steps;
      const cx = sx + (tx - sx) * t, cy = sy + (ty - sy) * t;
      hand.style.left = cx + 'px'; hand.style.top = cy + 'px';
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
      await sleep(22);
    }
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: tx, clientY: ty, pointerId: 1 }));
  };

  const select = async (el) => {
    await pointAt(el, 700);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  };

  const press = async (el) => {
    if (!el) return;
    await pointAt(el, 500);
    el.click();
  };

  const beats = [
    async () => {
      cap('A document is a flow. The cubes on it are the agents that have work in it.');
      const d = docByTitle('Ledger currency rewrite');
      await select(d);
      await sleep(2200);
    },
    async () => {
      cap('The digest says how many attempts it stands for, and over what window — fifteen attempts become one object, never the last one.');
      await sleep(3400);
    },
    async () => {
      cap('The menu is derived from this flow, not fixed. Every entry carries the evidence behind it and says whether pressing it spends.');
      const m = document.querySelector('.menu');
      if (m) await pointAt(m, 800);
      await sleep(3200);
    },
    async () => {
      cap('Ask reads the trace, never the goal. The goal is what somebody meant to happen — it reads like an answer even when the work was never done.');
      const q = document.getElementById('q');
      if (q) {
        q.value = '';
        const text = 'what did this actually produce?';
        await pointAt(q, 600);
        for (const ch of text) {
          if (stop) return;
          q.value += ch;
          q.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(38);
        }
        await press(document.getElementById('qgo'));
      }
      await sleep(2600);
    },
    async () => {
      cap('Now a real write: dropping a cube on a document appends a step — the same instruction composing an agent tree would have written.');
      const cube = cubeNamed('ReviewAgent') || cubeNamed('LedgerLead');
      const target = docByTitle('Duplicate ledger rows');
      if (cube && target) await dragOnto(cube, target);
      await sleep(2400);
    },
    async () => {
      cap('Advancing runs it, and the panel states the cost before the button is pressed.');
      const d = docByTitle('Duplicate ledger rows');
      if (d) await select(d);
      await sleep(1200);
      await press(document.getElementById('adv'));
      await sleep(3600);
    },
    async () => {
      cap('The Trace face answers a different question: not where is this, but what happened — including a step that ran and carried nothing forward.');
      const t = document.getElementById('tab-trace');
      await press(t);
      await sleep(4200);
    },
    async () => {
      // The scope selector navigates -- against a real server that is a fresh
      // read, and the tour is not allowed to fake it. So it really does change
      // the scope, and picks up on the other side.
      cap('One more scope. Memory here is not a store: it is agents, building a knowledge base a small window can navigate. Switching scope reloads, and the tour continues there.');
      const sel = document.getElementById('scope');
      const wanted = [...sel.options].find((o) => o.value.indexOf('memory') >= 0);
      if (!wanted) return;                       // no memory scope: end here
      await pointAt(sel, 700);
      await sleep(1400);
      sel.value = wanted.value;
      resumeAt(MEMORY_BEAT);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(6000);                         // the navigation takes it from here
    },
    // --- the memory lab, after the reload ------------------------------------
    async () => {
      cap('Two flows index the same notes, with the same five agents. Both are green, and one of them is wrong.');
      const d = docByTitle('the index that drifted');
      if (d) await select(d);
      await sleep(3400);
    },
    async () => {
      cap('The digest says a step used nothing it was given — on a flow where every step reported cleanly and every strip is green.');
      await sleep(3600);
    },
    async () => {
      cap('The Trace face names the instrument that caught it: this note claims 663 characters of a passage that is 1,105, so following its range lands on different words.');
      await press(document.getElementById('tab-trace'));
      await sleep(5200);
    },
    async () => {
      cap('It looks exactly like the notes around it — written by a model that got the judgement right and the mechanics wrong. That is why the check is code and not a prompt.');
      hand.style.opacity = '0';
      await sleep(2200);
    },
    async () => {
      cap('That is the desk. Everything you just watched was a real gesture against a real client — drag anything, it is yours now.');
      hand.style.opacity = '0';
      await sleep(1500);
    },
  ];

  /** The index of the first beat that runs after the scope change. */
  const MEMORY_BEAT = beats.length - 5;

  /**
   * Carry the tour across a real navigation.
   *
   * Changing scope reloads the page, because that is what changing scope does
   * against a server -- and a tour that faked it to keep its own state would be
   * the recording this file exists not to be. So the position is left in
   * sessionStorage and picked up on the other side. sessionStorage rather than
   * localStorage: a tour half-finished yesterday must not start playing at somebody
   * tomorrow.
   */
  const RESUME = 'ai-os.tour.resumeAt';
  const resumeAt = (i) => { try { sessionStorage.setItem(RESUME, String(i)); } catch (e) {} };
  const takeResume = () => {
    try {
      const v = sessionStorage.getItem(RESUME);
      sessionStorage.removeItem(RESUME);
      return v === null ? -1 : Number(v);
    } catch (e) { return -1; }
  };

  const play = async (from) => {
    if (running) { halt(); return; }
    running = true; stop = false;
    window.__TOUR__.running = true;
    $('#tourgo').textContent = '■ Stop';
    for (let i = from; i < beats.length; i += 1) {
      if (stop) break;
      const beat = beats[i];
      try { await beat(); } catch (e) { cap('The tour hit something the desk did not expect: ' + e.message); break; }
    }
    running = false; stop = false;
    window.__TOUR__.running = false;
    hand.style.opacity = '0';
    $('#tourgo').textContent = '▶ Play again';
  };

  $('#tourgo').onclick = () => play(0);

  // Landed here mid-tour. The documents have to exist before a beat can point at
  // one, and the desk draws them on its first render.
  const resume = takeResume();
  if (resume >= 0 && resume < beats.length) setTimeout(() => play(resume), 1200);
})();
`;

/**
 * The tour's chrome.
 *
 * Kept beside the script rather than in `DESK_CSS` so that nothing about the
 * product's stylesheet has to know a tour exists.
 */
export const TOUR_CSS = `
/* Above the memory drawer, which is 150px tall: a control that covers the
   thing it is describing is not a control. */
.tourbar{position:fixed;left:14px;bottom:174px;z-index:400;display:flex;align-items:center;gap:10px;
  background:var(--face);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);padding:6px 10px;
  max-width:min(760px,calc(100vw - 40px))}
.tourbar button{font:inherit;font-size:11px;font-weight:700;padding:3px 12px;white-space:nowrap}
.tourbar span{font-size:11px;line-height:1.4;color:#26292d}
/* The hand. A pointer you can follow, because a drag is unreadable without one. */
.tourhand{position:fixed;width:16px;height:16px;z-index:401;opacity:0;pointer-events:none;
  transition:opacity .25s;transform:translate(-2px,-2px);
  background:#16181a;clip-path:polygon(0 0,0 14px,4px 10px,7px 16px,10px 14px,7px 9px,12px 9px)}
@media (prefers-reduced-motion: reduce){ .tourhand{transition:none} }
`;
