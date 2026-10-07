# Make the scroll live, and decide who else is holding it

Take Long Scroll to a strong answer to crit 9,
[All at once](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/):
a stroke one person adds appears in every other open tab within about a second,
with no reload, and one decision about how the scroll behaves with several
people on it is made, written down and defended.

Nobody will answer questions while you run. Read `README.md`, the harness in
`CLAUDE.md` below the rule, `spec/` and `agent/now.md` first. Where this prompt
and the README disagree, the README's argument wins; change the argument first
if you have to, and say so in the commit.

## 1. First, stop publishing everyone's hand

`GET /api/marks` sends every stroke's `hand`, the anonymous identity cookie, to
every visitor. Anyone can copy a hand from the response into their own cookie
and add strokes as that person, or see someone else's strokes marked "— yours".
Live updates would broadcast it even further, so fix this before anything else:

- No response or live message ever contains a hand other than the viewer's own.
  The server works out "yours" for each viewer (or each live connection) and
  sends a boolean, never the hand.
- Add a rule to the harness in `CLAUDE.md` ("never send a hand to anyone but
  its owner") and a spec test that fails if any other visitor's hand appears in
  `/api/marks` or in the live stream.

## 2. Make it live

- Use server-sent events from the existing `node:http` server. That suits a
  no-build, one-small-machine app, and the browser's `EventSource` reconnects on
  its own when Fly stops and restarts the machine.
- A new stroke reaches every open tab within about a second and goes into the
  scroll in arrival order, exactly as it would after a reload.
- On reconnect, a tab asks only for strokes after the last id it already has: no
  duplicates, no gaps. Use the event id or a `?after=` query.
- The scroll must still be readable with JavaScript off. Live updates are an
  addition, not a requirement for reading.

## 3. The decision: anonymous presence

Show, quietly, how many hands have the scroll open right now: "3 hands holding
the scroll", or faint unnamed marks at the scroll's edge. Never a name, never a
list of who.

Write it up as `docs/adr/0001-presence.md` (context, options, decision, costs),
weighing at least:

- live strokes only, no presence
- an anonymous presence count (chosen)
- presence with identities or names
- highlighting the strokes added since you last visited, instead of presence

Argue the choice from the README: a person is only a browser, the scroll
accumulates hands, and the capstone showcase will put a room of people on it at
once. Count distinct hands, not tabs, and say what that costs (two tabs are one
hand; a phone and a laptop are two). Say what happens to the count when the
machine sleeps.

## 4. Checks

Add spec tests for the promises above, against the running app:

- a stroke posted by one client arrives on another client's open event stream
  within a second
- no response or event leaks another visitor's hand
- reconnecting with a last id returns only the strokes that were missed
- with two hands connected, presence reports two; when one disconnects, one

Keep `spec/invariants.test.ts` green. Update the agent's own tests where the
live layer changes what they assert, but never weaken append-only, the six-colour
palette, the 140-character cap or the Origin check.

## Leave alone

Append-only strokes, the palette, the note cap, no accounts and no names, the
same-origin and header hardening, and the scroll's look. Don't add features
beyond this prompt, and don't add rate limiting in this run.

## Done means

- `pnpm check` is green and `main` is deployed, with two real browsers seeing
  each other's strokes and the presence count within a second
- the ADR is in the repo, and the README's "Multi-user, for now" and enforced
  list describe what's actually built
- commits are small and say why, and `prompt.md` is deleted in the last one
