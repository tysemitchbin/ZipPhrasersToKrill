// Chaotic announcement templates, in the spirit of the mascot NAMES list.
//
// Every Discord announcement = one random INTRO (mascot-signed) + one random
// body line for the event type. ~30 of each × 30 intros ≈ 900+ distinct
// messages per type. Add more lines to any array freely - `npm test` checks
// that every template's placeholders resolve.
//
// Placeholders:
//   {mascot}                              - today's mascot name
//   streak:    {player} {days}
//   sweep:     {players} {count}          ({players} already bold + joined)
//   raffle:    {player} {creature} {rarity} {tickets}
//   recap:     {topPlayer} {topPoints} {playerCount} {gameCount}

const INTROS = [
  '🎲 **{mascot}** has entered the chat 🎲',
  '🎲 **{mascot}** kicks the door off its hinges 🎲',
  '📣 a wild **{mascot}** appears',
  '🎲 **{mascot}** stumbles in, uninvited 🎲',
  '🚨 **{mascot}** is here and has opinions',
  '🎪 ladies and gentlemen, **{mascot}**',
  '🎲 **{mascot}** has crawled out of the vents 🎲',
  '📯 hear ye, hear ye — **{mascot}** speaks',
  '🌊 something surfaces. it is **{mascot}**.',
  '🎲 **{mascot}** clocks in for bonus duty 🎲',
  '⚡ **{mascot}** has been released from its enclosure',
  '🎲 by the power vested in **{mascot}** 🎲',
  '🫧 **{mascot}** bubbles up from the deep',
  '🎲 **{mascot}** would like a word 🎲',
  '📢 incoming transmission from **{mascot}**',
  '🎲 **{mascot}** is legally required to announce the following 🎲',
  '🥁 drumroll, please, for **{mascot}**',
  '🎲 **{mascot}** materializes, smelling faintly of pennies 🎲',
  '👀 **{mascot}** has been watching. **{mascot}** has notes.',
  '🎲 **{mascot}** interrupts your regularly scheduled programming 🎲',
  "🎲 it's **{mascot}** o'clock 🎲",
  '🔔 **{mascot}** rings the bonus bell',
  '🎲 **{mascot}** rises from the sea foam like a discount Venus 🎲',
  "📬 **{mascot}** has mail for you. it's points.",
  '🎲 **{mascot}** did not ask to be here either 🎲',
  '🎺 a fanfare, poorly played, for **{mascot}**',
  '🎲 **{mascot}** slaps a fresh sticker on the leaderboard 🎲',
  "🧾 **{mascot}** presents today's ledger",
  '🎲 **{mascot}** is contractually obligated to say this 🎲',
  '🌀 reality warps slightly. **{mascot}** steps through.',
  '🎲 **{mascot}** has kicked in the skylight 🎲',
  '📸 **{mascot}** would like everyone to look natural',
];

const STREAK = [
  "🔥 **{player}** has shown up **{days}** days straight. that's a lifestyle now.",
  '**{player}** is on a **{days}**-day streak and cannot be stopped, only contained.',
  '**{days}** consecutive days of **{player}** refusing to skip. respect for the obsession.',
  'streak check: **{player}**, **{days}** days. touch grass (afterward).',
  "**{player}** hasn't missed in **{days}** days. the games fear them.",
  '**{days}** days, no gaps, all **{player}**.',
  '**{player}** logged in **{days}** days running. discipline! or something like it.',
  "the **{player}** streak reaches **{days}**. we're all a little scared.",
  '**{days}**-day streak unlocked by **{player}**. please hydrate.',
  '**{player}** has played every one of the last **{days}** days.',
  'nobody tell **{player}** they can stop — **{days}** days and counting.',
  '**{player}** is **{days}** days deep. no notes.',
  'consistency award goes to **{player}**: **{days}** days.',
  '**{days}** days in a row?? **{player}**?? incredible. worrying.',
  '**{player}** has a **{days}**-day streak and a look in their eye.',
  'the calendar has been fully colonized by **{player}** — **{days}** days.',
  '**{player}** shows up like the tide: **{days}** days and counting.',
  '**{days}** for **{player}**. the streak is now load-bearing.',
  '**{player}** cleared **{days}** straight days. impressive. worrying. both.',
  'streak of **{days}** for **{player}**. a firm handshake is owed.',
  "**{player}** just won't quit — **{days}** days.",
  '**{days}** consecutive appearances by **{player}**.',
  '**{player}** is speedrunning "never miss a day." **{days}** in.',
  'the **{days}**-day club has one member and it is **{player}**.',
  '**{player}**: **{days}** days. the streak has its own gravity now.',
  '**{days}** days without a single skip, courtesy of **{player}**.',
  '**{player}** has attended **{days}** days in a row.',
  'logging **{days}** straight, **{player}** achieves minor legend status.',
  '**{player}** kept the flame lit for **{days}** days.',
  '**{days}**-day heater from **{player}**. do not approach.',
];

// Daily creature raffle - one ticket per game played today, one winner
// drawn from the combined pool, one creature from the weighted CREATURES
// list in index.js. {tickets} is however many games the winner played.
const RAFFLE = [
  '🎟️ **{player}** held the winning ticket ({tickets} in the drum) and takes home {creature} ({rarity})!',
  'the raffle drum stops on **{player}** — {creature} ({rarity}) trots into their barn.',
  '**{player}** cashed in {tickets} tickets for one very confused {creature} ({rarity}).',
  "today's barn addition goes to **{player}**: {creature} ({rarity}).",
  '**{player}** wins the daily draw and adopts a {creature} ({rarity}).',
  'out of the whole ticket pool, **{player}**\'s name came up — {creature} ({rarity}) is theirs now.',
  '🎪 step right up, **{player}** — you\'ve won a {creature} ({rarity})!',
  'the raffle gods smiled on **{player}**: {creature} ({rarity}), delivered to the barn.',
  '**{player}** played their way to {tickets} tickets and walked away with {creature} ({rarity}).',
  'a {creature} ({rarity}) has imprinted on **{player}**. the barn grows.',
  "**{player}**'s barn just got a new resident: {creature} ({rarity}).",
  'ticket **{player}** wins! {creature} ({rarity}) reports for barn duty.',
  '🐾 {creature} ({rarity}) wanders into **{player}**\'s barn, apparently on purpose.',
  '**{player}** rolled {tickets} tickets deep and it paid off — {creature} ({rarity}).',
  'the mythical creature registry has a new owner: **{player}**, proud keeper of a {creature} ({rarity}).',
  'somewhere, a {creature} ({rarity}) just got adopted by **{player}**. congratulations to both parties.',
  '**{player}** beat the odds (or didn\'t, it\'s a raffle) and won {creature} ({rarity}).',
  'the drum spins, the ticket lands on **{player}** — {creature} ({rarity}) joins the barn.',
  '🎫 winning ticket held by **{player}**: redeemable for one {creature} ({rarity}).',
  '**{player}** put in {tickets} tickets and the universe delivered a {creature} ({rarity}).',
];

const SWEEP = [
  '✅ full sweep, all {count} games: {players}. no life today, in the best way.',
  '🧹 {players} played everything ({count} games).',
  '{players} did the whole slate, {count} for {count}.',
  'completionists assemble: {players} cleared the full {count}.',
  '{players} left no game unplayed today.',
  '100% clear by {players} — all {count} games.',
  '{players} ran the table ({count} games), you maniacs.',
  'nothing skipped by {players}. perfect attendance.',
  "{players} touched every game today. wash your hands.",
  'the full {count}-game sweep goes to {players}.',
  '{players} said "yes" to all {count} games.',
  'grand slam by {players} for the {count}-game clean sweep.',
  "{players} cleared the board. touch something that isn't a screen.",
  'every game, every one of them: {players}.',
  '{players} went {count} for {count}. terrifying commitment.',
  'sweep club today: {players}. dues paid in full.',
  '{players} did all {count}. the games are exhausted.',
  'full house for {players} — {count}/{count}.',
  '{players} played the entire menu, tip included.',
  'no crumbs left by {players}. all {count} games.',
  "{players} pulled off the full sweep. we're impressed, and a little mad.",
  '{count}-for-{count} today: {players}.',
  '{players} refused to skip a single game. the stubbornness is noted.',
  'clean sweep, no notes: {players}.',
  "{players} completed today's entire circuit. hydrate, legends.",
];

// End-of-day recap, sent once at the 20:00 close after everything else
// (skill points + all of today's bonuses) has settled - the day's actual
// final word, not just a bonus-by-bonus rundown.
const RECAP = [
  "📊 that's a wrap on today: **{playerCount}** players, **{gameCount}** games counted. **{topPlayer}** took the day with **{topPoints}**.",
  "🔒 today's locked in — **{topPlayer}** leads the pack with **{topPoints}** points out of **{playerCount}** players across **{gameCount}** games.",
  "the day is closed, the books are cooked: **{topPlayer}** on top with **{topPoints}**. **{playerCount}** showed up for **{gameCount}** games.",
  "final tally: **{topPlayer}** wins the day, **{topPoints}** points. **{playerCount}** players, **{gameCount}** games, no refunds.",
  "🌙 lights out on today. **{topPlayer}** takes it with **{topPoints}**. **{gameCount}** games, **{playerCount}** competitors, one champion.",
  "the sea has spoken: **{topPlayer}**, **{topPoints}** points, best of **{playerCount}** across **{gameCount}** games today.",
  "today's verdict is in — **{topPlayer}** on top with **{topPoints}**. everyone else, there's always tomorrow. (**{playerCount}** players, **{gameCount}** games.)",
  "closing the ledger: **{topPlayer}** leads today at **{topPoints}** points, out of **{playerCount}** players in **{gameCount}** games.",
  "🧾 receipt for today: **{playerCount}** players, **{gameCount}** games, and **{topPlayer}** walking away with **{topPoints}** points.",
  "the votes are counted and it wasn't close: **{topPlayer}**, **{topPoints}** points, top of **{playerCount}**.",
  "today's champion is **{topPlayer}** with **{topPoints}** points. **{gameCount}** games got counted, **{playerCount}** people showed up.",
  "and that's today, folks — **{topPlayer}** finishes on **{topPoints}**, best of **{playerCount}** across **{gameCount}** games.",
  "the sun sets on another day of this. **{topPlayer}** wins it with **{topPoints}**. (**{playerCount}** players, **{gameCount}** games.)",
  "🏆 top of today's heap: **{topPlayer}**, **{topPoints}** points. **{playerCount}** players fought over **{gameCount}** games for the privilege of losing to them.",
  "today, summarized: **{playerCount}** players, **{gameCount}** games, and **{topPlayer}** standing on top with **{topPoints}**.",
  "the day's final boss was **{topPlayer}**, clearing it with **{topPoints}** points across **{gameCount}** games and **{playerCount}** challengers.",
  "case closed on today: **{topPlayer}** leads with **{topPoints}**, ahead of **{playerCount}** players over **{gameCount}** games.",
  "today's high-water mark belongs to **{topPlayer}** — **{topPoints}** points, **{playerCount}** players, **{gameCount}** games in the books.",
  "the numbers are in and they're brutal for everyone except **{topPlayer}**, who takes today with **{topPoints}** points.",
  "🎬 that's a wrap: **{topPlayer}** stars in today's episode with **{topPoints}** points. **{playerCount}** players, **{gameCount}** games, credits roll.",
  "🐚 today's clamshell goes to **{topPlayer}** with **{topPoints}** points, out of **{playerCount}** across **{gameCount}** games.",
  "final whistle: **{topPlayer}** on **{topPoints}**, best of **{playerCount}** players over **{gameCount}** games today.",
  "the tide goes out and leaves **{topPlayer}** standing tallest at **{topPoints}** points.",
  "today's dispatch: **{playerCount}** players, **{gameCount}** games, **{topPlayer}** on top with **{topPoints}**.",
  "curtain call for today — **{topPlayer}** takes the bow with **{topPoints}** points.",
  "the box score is in: **{topPlayer}**, **{topPoints}** points, best of **{playerCount}** for the day.",
  "today's bulletin: **{topPlayer}** leads at **{topPoints}**, **{gameCount}** games counted, **{playerCount}** in the field.",
  "somebody had to win today and it was **{topPlayer}**, with **{topPoints}** points to show for it.",
  "the reckoning has arrived: **{topPlayer}** tops today's **{playerCount}** with **{topPoints}** points.",
  "🦑 ink cleared, results in: **{topPlayer}** wins the day with **{topPoints}**, out of **{playerCount}** players.",
  "the day's roundup: **{gameCount}** games, **{playerCount}** players, and **{topPlayer}** on top with **{topPoints}**.",
  "today concludes with **{topPlayer}** in first, **{topPoints}** points, ahead of **{playerCount}** others.",
  "the scoreboard has spoken, and it said **{topPlayer}**, **{topPoints}** points.",
  "nightfall report: **{topPlayer}** finishes atop **{playerCount}** players with **{topPoints}** points.",
  "today's crown goes to **{topPlayer}** — **{topPoints}** points across **{gameCount}** games.",
  "the deep sea has ranked you all, and **{topPlayer}** floats to the top with **{topPoints}**.",
  "today's final standings, briefly: **{topPlayer}** first with **{topPoints}**, **{playerCount}** total players.",
  "🎣 hook, line, and today's win goes to **{topPlayer}** with **{topPoints}** points.",
  "the gavel comes down: **{topPlayer}** wins today with **{topPoints}** points, **{gameCount}** games on the docket.",
  "today, in one sentence: **{topPlayer}** led **{playerCount}** players with **{topPoints}** points across **{gameCount}** games.",
  "closing bell for today — **{topPlayer}** rings it in at **{topPoints}** points.",
  "the results are final and unappealable: **{topPlayer}**, **{topPoints}** points, top of **{playerCount}**.",
  "today's headline: '**{topPlayer}** wins with **{topPoints}** points,' more at 11.",
  "the sun has set on **{gameCount}** games and **{playerCount}** players; **{topPlayer}** stands tallest at **{topPoints}**.",
  "one for the record books: **{topPlayer}**, **{topPoints}** points, today's best of **{playerCount}**.",
  "the final buzzer sounds and **{topPlayer}** is on top with **{topPoints}** points.",
  "🌊 the wave crests and **{topPlayer}** rides it to **{topPoints}** points, best of **{playerCount}**.",
  "today's postmortem: **{playerCount}** players, **{gameCount}** games, one clear winner — **{topPlayer}** with **{topPoints}**.",
  "the day is officially in the books, cover to cover: **{topPlayer}** wins with **{topPoints}** points.",
  "somebody call it: **{topPlayer}** takes today, **{topPoints}** points, **{playerCount}** players in the mix.",
  "today's MVP: **{topPlayer}**, **{topPoints}** points, out of **{gameCount}** games played by **{playerCount}** people.",
  "the numbers don't lie: **{topPlayer}** on **{topPoints}**, best of the day.",
  "and just like that, today's done — **{topPlayer}** leads with **{topPoints}** points.",
  "the final scroll unfurls: **{topPlayer}**, **{topPoints}** points, champion of today's **{playerCount}**.",
  "📯 hear this: **{topPlayer}** finishes today on **{topPoints}** points, ahead of **{playerCount}** others.",
  "the day's last word belongs to **{topPlayer}**: **{topPoints}** points, **{gameCount}** games counted.",
  "consider this today's obituary: **{playerCount}** players tried, **{topPlayer}** succeeded, **{topPoints}** points.",
  "the ink has dried on today's results: **{topPlayer}** on top with **{topPoints}** points.",
  "today, distilled: one winner (**{topPlayer}**, **{topPoints}** points), **{playerCount}** players, **{gameCount}** games.",
  "🐙 the kraken has tallied the votes: **{topPlayer}** wins with **{topPoints}** points.",
  "the final gavel: **{topPlayer}**, **{topPoints}** points, best of **{playerCount}** across **{gameCount}** games today.",
  "today's chapter closes with **{topPlayer}** on top, **{topPoints}** points to their name.",
  "the day has been weighed, measured, and won by **{topPlayer}** with **{topPoints}** points.",
  "last call on today's results: **{topPlayer}** leads with **{topPoints}**, **{playerCount}** players total.",
  "today's final standing, no appeals: **{topPlayer}** first, **{topPoints}** points.",
  "the sea has settled and **{topPlayer}** is left holding **{topPoints}** points, tops for the day.",
  "the day's ledger balances in favor of **{topPlayer}**: **{topPoints}** points.",
  "here lies today, survived by **{playerCount}** players and won by **{topPlayer}** with **{topPoints}** points.",
  "🎯 bullseye of the day goes to **{topPlayer}**, **{topPoints}** points across **{gameCount}** games.",
  "today's final transmission: **{topPlayer}** wins, **{topPoints}** points, signing off.",
  "the votes are tallied, the day is done: **{topPlayer}** on top with **{topPoints}** points.",
  "today's epilogue: **{topPlayer}**, **{topPoints}** points, out ahead of **{playerCount}** players.",
  "the day's finish line was crossed first by **{topPlayer}**, **{topPoints}** points.",
  "so ends today's saga, with **{topPlayer}** crowned at **{topPoints}** points.",
  "the day's trophy, such as it is, goes to **{topPlayer}** — **{topPoints}** points.",
  "today's parting shot: **{topPlayer}** finishes first with **{topPoints}** points, **{gameCount}** games counted.",
  "the results have been notarized: **{topPlayer}**, **{topPoints}** points, best of today.",
  "today's final score is in the mail, and it says **{topPlayer}**, **{topPoints}** points.",
  "the day wraps with **{topPlayer}** on top of **{playerCount}** players, **{topPoints}** points.",
  "🦀 the crab has scuttled off with today's win: **{topPlayer}**, **{topPoints}** points.",
  "today's summary, unabridged: **{topPlayer}** won with **{topPoints}** points.",
  "the day's final act belongs to **{topPlayer}**, taking **{topPoints}** points.",
  "today's numbers are locked, and **{topPlayer}** owns the top with **{topPoints}** points.",
  "the last light of today falls on **{topPlayer}**, **{topPoints}** points strong.",
  "today's closing argument: **{topPlayer}**, **{topPoints}** points, rests its case.",
  "the day has been adjudicated in favor of **{topPlayer}**, **{topPoints}** points.",
  "today's final frame: **{topPlayer}** on top with **{topPoints}** points, **{playerCount}** players total.",
  "the sun sets on **{playerCount}** hopefuls; **{topPlayer}** remains standing at **{topPoints}** points.",
  "today's last laugh belongs to **{topPlayer}**, **{topPoints}** points and counting.",
  "the day's final receipt: **{topPlayer}**, **{topPoints}** points, thank you for playing.",
  "🫧 the bubbles have cleared and **{topPlayer}** is visible on top with **{topPoints}** points.",
  "today's postgame: **{topPlayer}** takes MVP honors with **{topPoints}** points.",
  "the day's final tally has been notarized, stamped, and awarded to **{topPlayer}** — **{topPoints}** points.",
  "today, in closing: **{topPlayer}** wins with **{topPoints}** points out of **{playerCount}** players.",
  "the last word on today goes to **{topPlayer}**, **{topPoints}** points and no complaints filed.",
  "today's finale: **{topPlayer}** takes the crown, **{topPoints}** points, **{gameCount}** games in the books.",
  "the day is signed, sealed, and delivered to **{topPlayer}** — **{topPoints}** points.",
  "today's last stand was won by **{topPlayer}**, **{topPoints}** points, **{playerCount}** players fought for it.",
  "the curtain falls on today with **{topPlayer}** in the spotlight, **{topPoints}** points.",
  "and that's a full stop on today — **{topPlayer}** finishes first with **{topPoints}** points.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// one random intro + one random body, filled
function compose(bodies, vars) {
  return `${fill(pick(INTROS), vars)}\n${fill(pick(bodies), vars)}`;
}

const say = {
  streak: (vars) => compose(STREAK, vars),
  intro: (vars) => fill(pick(INTROS), vars),
  sweepLine: (vars) => fill(pick(SWEEP), vars),
  raffle: (vars) => fill(pick(RAFFLE), vars),
  recap: (vars) => compose(RECAP, vars),
};

module.exports = { say, fill, pick, INTROS, STREAK, SWEEP, RAFFLE, RECAP };
