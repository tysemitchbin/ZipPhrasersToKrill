// Chaotic announcement templates, in the spirit of the mascot NAMES list.
//
// One message goes out per day, at the 20:00 close: one random INTRO
// (mascot-signed), then one random PODIUM line, one random RAFFLE line,
// and zero or more random STREAK_MILESTONE lines (one per milestone hit
// that day) stacked underneath. `npm test` checks that every template's
// placeholders resolve.
//
// Placeholders:
//   {mascot}                          - today's mascot name
//   podium:            {podium}       (already bold + joined, see buildPodiumText in index.js)
//   raffle:            {player} {creature} {rarity} {tickets}
//   streakMilestone:   {player} {game} {days}

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
  '🎲 **{mascot}** clocks in for the evening report 🎲',
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
  '🔔 **{mascot}** rings the closing bell',
  '🎲 **{mascot}** rises from the sea foam like a discount Venus 🎲',
  '🎲 **{mascot}** did not ask to be here either 🎲',
  '🎺 a fanfare, poorly played, for **{mascot}**',
  '🎲 **{mascot}** slaps a fresh sticker on the leaderboard 🎲',
  "🧾 **{mascot}** presents today's ledger",
  '🎲 **{mascot}** is contractually obligated to say this 🎲',
  '🌀 reality warps slightly. **{mascot}** steps through.',
  '🎲 **{mascot}** has kicked in the skylight 🎲',
  '📸 **{mascot}** would like everyone to look natural',
];

// The 20:00 podium line - {podium} is a pre-built string (see
// buildPodiumText in index.js) that already reads naturally whether it's
// one, two, or three names, so these templates just need to wrap it.
const PODIUM = [
  "🔒 today's locked in — the podium reads {podium}. everyone else, there's always tomorrow.",
  "the day is closed, the books are cooked: {podium} on top.",
  "🌙 lights out on today. {podium} takes it.",
  "the sea has spoken: {podium}, best of the day.",
  "today's verdict is in — {podium}. everyone else, there's always tomorrow.",
  "closing the ledger: {podium} leads today.",
  "🏆 top of today's heap: {podium}.",
  "case closed on today: {podium}.",
  "the numbers are in and they're brutal for everyone except {podium}.",
  "🐚 today's clamshell goes to {podium}.",
  "the tide goes out and leaves {podium} standing tallest.",
  "curtain call for today — {podium} takes the bow.",
  "🦑 ink cleared, results in: {podium} wins the day.",
  "the scoreboard has spoken, and it said {podium}.",
  "the deep sea has ranked you all, and {podium} floats to the top.",
  "🎣 hook, line, and today's win goes to {podium}.",
  "the gavel comes down: {podium} wins today.",
  "closing bell for today — {podium} rings it in.",
  "the results are final and unappealable: {podium}.",
  "🌊 the wave crests and {podium} rides it to the top.",
  "the day is officially in the books, cover to cover: {podium} wins.",
  "🐙 the kraken has tallied the votes: {podium} wins.",
  "today's chapter closes with {podium} on top.",
  "the day has been weighed, measured, and won by {podium}.",
  "🎯 bullseye of the day goes to {podium}.",
  "the votes are tallied, the day is done: {podium} on top.",
  "so ends today's saga, with {podium} crowned.",
  "🫧 the bubbles have cleared and {podium} is visible on top.",
  "the day is signed, sealed, and delivered to {podium}.",
  "and that's a full stop on today — {podium} finishes first.",
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

// Per-game streak milestones - only the big ones (see STREAK_MILESTONES in
// index.js), not every 7 days like the old bonus-tier system. No points -
// bonuses are gone, this is a pure shout-out. One line per milestone hit
// that day, stacked under the podium/raffle lines in the single 20:00 post.
const STREAK_MILESTONE = [
  '🔥 **{player}** just hit **{days} days** on {game}. the streak has opinions now.',
  "🔥 **{player}**'s {game} streak hits **{days}**. nice.",
  '🔥 **{player}** has been doing {game} for **{days} days straight**. we regret to inform you this is now a personality trait.',
  "🔥 **{player}**'s {game} streak reaches **{days}**. blaze it, one puzzle at a time.",
  '🔥 **{days}** days of {game}, courtesy of **{player}**. the games fear them.',
  '🔥 **{player}** is **{days}** days deep into {game}. no notes.',
  "🔥 the {game} streak reaches **{days}** for **{player}**. we're all a little scared.",
  '🔥 **{days}**-day {game} streak unlocked by **{player}**. please hydrate.',
  '🔥 **{player}** has played {game} every day for **{days} days**. the calendar has been colonized.',
  '🔥 **{days}** days of {game}, no gaps, all **{player}**.',
  '🔥 **{player}** just cleared **{days}** straight days of {game}. impressive. worrying. both.',
  '🔥 the **{days}**-day {game} club has one member and it is **{player}**.',
  '🔥 **{player}**: **{days}** days of {game}. the streak has its own gravity now.',
  '🔥 **{days}** days without a single skipped {game}, courtesy of **{player}**.',
  '🔥 **{player}** kept the {game} flame lit for **{days}** days.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const say = {
  intro: (vars) => fill(pick(INTROS), vars),
  podium: (vars) => fill(pick(PODIUM), vars),
  raffle: (vars) => fill(pick(RAFFLE), vars),
  streakMilestone: (vars) => fill(pick(STREAK_MILESTONE), vars),
};

module.exports = { say, fill, pick, INTROS, PODIUM, RAFFLE, STREAK_MILESTONE };
