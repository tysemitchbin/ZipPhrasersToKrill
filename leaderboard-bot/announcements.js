// Chaotic announcement templates, in the spirit of the mascot NAMES list.
//
// Every Discord announcement = one random INTRO (mascot-signed) + one random
// body line for the event type. ~30 of each × 30 intros ≈ 900+ distinct
// messages per type. Add more lines to any array freely - `npm test` checks
// that every template's placeholders resolve.
//
// Placeholders:
//   {mascot}                              - today's mascot name
//   milestone: {player} {total} {flavor} {bonus}
//   streak:    {player} {days} {bonus}
//   roulette:  {player} {prize} {amount}   ({amount} is signed, e.g. "+7")
//   sweep:     {players} {count} {bonus}   ({players} already bold + joined)

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

const MILESTONE = [
  '🎯 **{player}** just landed dead-on **{total}** — {flavor} +{bonus} points, no take-backs.',
  '📈 **{player}** hit **{total}** total. {flavor} the universe grants +{bonus}.',
  '🏅 **{total}** points, exactly, for **{player}**. {flavor} enjoy the +{bonus}.',
  "**{player}** rolled up to **{total}** on the nose. {flavor} +{bonus}, chef's kiss.",
  'somebody get **{player}** a plaque — **{total}** total. {flavor} +{bonus}.',
  '**{player}** has achieved the sacred number **{total}**. {flavor} +{bonus} tribute.',
  'alert: **{player}** is now sitting pretty on **{total}**. {flavor} +{bonus}.',
  '**{player}** parked it perfectly at **{total}**. {flavor} take +{bonus} and go.',
  'the odometer clicked to **{total}** for **{player}**. {flavor} +{bonus}.',
  '**{player}** threaded the needle at **{total}**. {flavor} +{bonus} for the craftsmanship.',
  'witnessed: **{player}** at **{total}** exactly. {flavor} +{bonus} hush money.',
  '**{player}** hit **{total}** and the room went quiet. {flavor} +{bonus}.',
  "**{total}**. **{player}**. {flavor} +{bonus}, don't spend it all in one place.",
  '**{player}** stuck the landing on **{total}**. {flavor} +{bonus} from the judges.',
  'breaking: **{player}** reaches **{total}**. {flavor} +{bonus} awarded, begrudgingly.',
  '**{player}** just tapped **{total}** like a bus stop. {flavor} +{bonus}.',
  'the prophecy said **{total}**. **{player}** fulfilled it. {flavor} +{bonus}.',
  '**{player}** is now precisely **{total}** points of person. {flavor} +{bonus}.',
  'ding! **{player}** at **{total}**. {flavor} collect your +{bonus}.',
  '**{player}** hit **{total}** and I felt that. {flavor} +{bonus}.',
  'for landing exactly on **{total}**, **{player}** receives +{bonus} and my respect. {flavor}',
  '**{player}** = **{total}** now. {flavor} the +{bonus} is non-negotiable.',
  'mark the calendar: **{player}** touched **{total}**. {flavor} +{bonus}.',
  '**{player}** rolled a natural **{total}**. {flavor} +{bonus} loot.',
  '**{total}** total points for **{player}**, not a decimal more. {flavor} +{bonus}.',
  '**{player}** has been assigned the number **{total}**. {flavor} +{bonus} severance.',
  'it had to be **{player}**, and it had to be **{total}**. {flavor} +{bonus}.',
  '**{player}** speedran to exactly **{total}**. {flavor} +{bonus}, any%.',
  'the leaderboard shivers: **{player}** at **{total}**. {flavor} +{bonus}.',
  '**{player}** achieved perfect alignment at **{total}**. {flavor} +{bonus} cosmic reward.',
  '**{player}** knocked on **{total}** and it answered. {flavor} +{bonus}.',
];

const STREAK = [
  "🔥 **{player}** has shown up **{days}** days straight. that's a lifestyle now. +{bonus}.",
  '**{player}** is on a **{days}**-day streak and cannot be stopped, only contained. +{bonus}.',
  '**{days}** consecutive days of **{player}** refusing to skip. +{bonus} for the obsession.',
  'streak check: **{player}**, **{days}** days. touch grass (afterward). +{bonus}.',
  "**{player}** hasn't missed in **{days}** days. the games fear them. +{bonus}.",
  '**{days}** days, no gaps, all **{player}**. +{bonus} and a small trophy made of lint.',
  '**{player}** logged in **{days}** days running. discipline! or something like it. +{bonus}.',
  "the **{player}** streak reaches **{days}**. we're all a little scared. +{bonus}.",
  '**{days}**-day streak unlocked by **{player}**. +{bonus}. please hydrate.',
  '**{player}** has played every one of the last **{days}** days. +{bonus} for the bit.',
  'nobody tell **{player}** they can stop — **{days}** days, +{bonus}.',
  '**{player}** is **{days}** days deep. no notes. +{bonus}.',
  'consistency award goes to **{player}**: **{days}** days. +{bonus} and our concern.',
  '**{days}** days in a row?? **{player}**?? incredible. worrying. +{bonus}.',
  '**{player}** has a **{days}**-day streak and a look in their eye. +{bonus}.',
  'the calendar has been fully colonized by **{player}** — **{days}** days. +{bonus}.',
  '**{player}** shows up like the tide: **{days}** days and counting. +{bonus}.',
  '**{days}** for **{player}**. the streak is now load-bearing. +{bonus}.',
  '**{player}** cleared **{days}** straight days. +{bonus}. impressive. worrying. both.',
  'streak of **{days}** for **{player}**. +{bonus} and a firm handshake.',
  "**{player}** just won't quit — **{days}** days, +{bonus}.",
  '**{days}** consecutive appearances by **{player}**. +{bonus} appearance fee.',
  '**{player}** is speedrunning "never miss a day." **{days}** in. +{bonus}.',
  'the **{days}**-day club has one member and it is **{player}**. +{bonus} dues refund.',
  '**{player}**: **{days}** days. the streak has its own gravity now. +{bonus}.',
  '**{days}** days without a single skip, courtesy of **{player}**. +{bonus}.',
  '**{player}** has attended **{days}** days in a row. attendance prize: +{bonus}.',
  'logging **{days}** straight, **{player}** achieves minor legend status. +{bonus}.',
  '**{player}** kept the flame lit for **{days}** days. +{bonus} kindling.',
  '**{days}**-day heater from **{player}**. +{bonus}. do not approach.',
];

const ROULETTE = [
  '🎰 **{player}** had the worst day, spun the wheel, got {prize} ({amount}).',
  'the wheel pitied **{player}** and coughed up {prize} ({amount}).',
  "**{player}** finished last and the prize goblin handed them {prize} ({amount}).",
  'rock bottom has perks: **{player}** spun {prize} ({amount}).',
  '**{player}** ate dirt today, so the wheel gave them {prize} ({amount}).',
  'consolation from the void for **{player}**: {prize} ({amount}).',
  "**{player}** drew {prize} from the loser's tombola ({amount}).",
  'the mercy wheel turns for **{player}**: {prize} ({amount}).',
  "**{player}** was in the basement, so here's {prize} ({amount}).",
  'for services to coming last, **{player}** receives {prize} ({amount}).',
  '**{player}** spun the wheel of "at least you showed up" and won {prize} ({amount}).',
  'pity applause for **{player}**, plus {prize} ({amount}).',
  '**{player}** hit the bottom of the barrel and found {prize} ({amount}).',
  "the wheel looked at **{player}**'s day and sighed, then produced {prize} ({amount}).",
  '**{player}** gets the underdog bag: {prize} ({amount}).',
  'last place, first dibs on the wheel — **{player}** grabbed {prize} ({amount}).',
  '**{player}** spun {prize} ({amount}). the comeback starts... probably not today.',
  'karma rebate for **{player}**: {prize} ({amount}).',
  '**{player}** was today’s designated disaster, so: {prize} ({amount}).',
  'the leaderboard felt bad for **{player}** and expensed {prize} ({amount}).',
  '**{player}** reached in blind and pulled {prize} ({amount}).',
  'wheel says **{player}** gets {prize} ({amount}). wheel does not explain itself.',
  '**{player}** cashed in their last-place ticket for {prize} ({amount}).',
  'a soft landing for **{player}**: {prize} ({amount}).',
  '**{player}** spun and the machine went {prize} ({amount}). nobody knows how it works.',
  '**{player}** got dragged, then got {prize} ({amount}).',
  'the rubber band snaps back for **{player}**: {prize} ({amount}).',
  '**{player}** loses the day, wins {prize} ({amount}). balance.',
  'for **{player}**, the wheel produced {prize} ({amount}) and a faint whirring sound.',
  '**{player}** spun {prize} ({amount}). the deep sea provides.',
];

// appended to a roulette line when the day's single worst player spins twice
const DOUBLE_SPIN = [
  ' — and again, because dead last spins twice',
  ' ×2, since somebody had to be the absolute worst',
  ' (two spins for the day’s biggest disaster)',
  ' — double dip, last-place privileges',
  ' ×2 for finishing last of the last',
  ' (the wheel span twice; they earned that)',
  ' — bonus spin for spectacular failure',
  ' ×2. rock bottom comes with a punch card.',
];

const SWEEP = [
  '✅ full sweep, all {count} games: {players}. +{bonus} each for having no life today.',
  '🧹 {players} played everything ({count} games). +{bonus} apiece.',
  '{players} did the whole slate, {count} for {count}. +{bonus} each.',
  'completionists assemble: {players}. +{bonus} for the full {count}.',
  '{players} left no game unplayed today. +{bonus} each.',
  '100% clear by {players} — all {count} games. +{bonus}.',
  '{players} ran the table ({count} games). +{bonus} each, you maniacs.',
  'nothing skipped by {players}. +{bonus} for the perfect attendance.',
  "{players} touched every game today. wash your hands. +{bonus} each.",
  'the full {count}-game sweep goes to {players}. +{bonus}.',
  '{players} said "yes" to all {count} games. +{bonus} each.',
  'grand slam by {players}. +{bonus} apiece for the {count}-game clean sweep.',
  "{players} cleared the board. +{bonus} each. touch something that isn't a screen.",
  'every game, every one of them: {players}. +{bonus}.',
  '{players} went {count} for {count}. +{bonus} each. terrifying commitment.',
  'sweep club today: {players}. dues paid in full. +{bonus}.',
  '{players} did all {count}. the games are exhausted. +{bonus} each.',
  'full house for {players} — {count}/{count}. +{bonus}.',
  '{players} played the entire menu. +{bonus} each, tip included.',
  'no crumbs left by {players}. all {count} games. +{bonus}.',
  "{players} pulled off the full sweep. +{bonus}. we're impressed, and a little mad.",
  '{count}-for-{count} today: {players}. +{bonus} each.',
  '{players} refused to skip a single game. +{bonus} for the stubbornness.',
  'clean sweep, no notes: {players}. +{bonus} each.',
  "{players} completed today's entire circuit. +{bonus}. hydrate, legends.",
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
  milestone: (vars) => compose(MILESTONE, vars),
  streak: (vars) => compose(STREAK, vars),
  intro: (vars) => fill(pick(INTROS), vars),
  sweepLine: (vars) => fill(pick(SWEEP), vars),
  rouletteLine: (vars, twice) =>
    fill(pick(ROULETTE), vars) + (twice ? pick(DOUBLE_SPIN) : ''),
};

module.exports = { say, fill, pick, INTROS, MILESTONE, STREAK, ROULETTE, SWEEP, DOUBLE_SPIN };
