// Chaotic announcement templates, in the spirit of the mascot NAMES list.
//
// Two messages go out per day. At noon (PREVIEW_HOUR): one random INTRO
// (mascot-signed) + one random PREVIEW line naming the 5 creatures the
// raffle will draw from tonight. At the 20:00 close: a random INTRO or CLOSE_INTRO,
// then one random PODIUM_INTRO line followed by a plain medal line per
// top-3 player (built directly in index.js, not a template - "🥇 **Name**"
// etc.), then one random RAFFLE line plus that creature's flavor
// description, and zero or more random STREAK_MILESTONE lines (one per
// milestone hit that day) stacked underneath. `npm test` checks that every
// template's placeholders resolve.
//
// Placeholders:
//   {mascot}                          - today's mascot name
//   preview:           {creatures}    (pre-joined "emoji Name (rarity), ..." string)
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
  '🎲 **{mascot}** rises from the sea foam like a discount Venus 🎲',
  '🎲 **{mascot}** did not ask to be here either 🎲',
  '🎺 a fanfare, poorly played, for **{mascot}**',
  '🎲 **{mascot}** is contractually obligated to say this 🎲',
  '🌀 reality warps slightly. **{mascot}** steps through.',
  '🎲 **{mascot}** has kicked in the skylight 🎲',
  '📸 **{mascot}** would like everyone to look natural',
];

// Evening-only intros - these reference the close/results, so they'd read
// wrong at noon. The 20:00 post draws from INTROS + these; the noon post
// uses INTROS only, so keep everything in INTROS time-neutral.
const CLOSE_INTROS = [
  '🔔 **{mascot}** rings the closing bell',
  '🎲 **{mascot}** clocks in for the evening report 🎲',
  '🎲 **{mascot}** slaps a fresh sticker on the leaderboard 🎲',
  "🧾 **{mascot}** presents today's ledger",
];

// Noon preview - the 5 creatures tonight's raffle draws from (weighted pick,
// no repeats, see pickCreaturePool() in index.js), so people know what's
// actually on the table before they decide whether to play today. Tonight's
// winner is a flat 1-in-5 among these 5, not re-weighted by rarity - the
// rarity weighting already happened in choosing which 5 showed up at all.
// {creatures} is a pre-joined "emoji Name (rarity), ..." string.
const PREVIEW = [
  '🌤️ spotted wandering nearby today: {creatures}. play a game for a shot at whichever one gets drawn tonight.',
  "👣 tracks in the grass lead to: {creatures}. today's raffle prize is somewhere in there.",
  "🔭 today's sightings: {creatures}. one of them goes home with someone tonight.",
  '🌾 rustling in the underbrush reveals: {creatures}. get your tickets in.',
  "🐾 today's wildlife report: {creatures}. tonight, one lucky winner takes one home.",
  "🌤️ the barn's scouts spotted: {creatures}. today's raffle draws from this exact list.",
  '🍃 out and about today: {creatures}. play today, one of these could be yours tonight.',
  "🔍 today's nearby sightings: {creatures}. the raffle pulls from these five, and only these five.",
  '🌤️ five creatures have wandered into range: {creatures}. tonight, one becomes someone\'s.',
  "👀 keep an eye out — today's local wildlife: {creatures}.",
  '🌱 seen grazing nearby: {creatures}. one of them is headed for somebody\'s barn.',
  "🗺️ today's territory report: {creatures}. tonight's raffle is limited to this lineup.",
  '🐾 fresh sightings just in: {creatures}. play today for a shot at one of these.',
  "🌤️ the day's wanderers: {creatures}. odds are equal among them once the drum spins tonight.",
  '🔭 scouted this morning: {creatures}. tonight, one gets a new home.',
];

// Lead-in line for the 20:00 podium - no variables, since the actual top-3
// names get their own plain medal lines (🥇🥈🥉) built directly in
// index.js right after this.
const PODIUM_INTRO = [
  "🔒 today's locked in — here's the podium:",
  "🏆 the podium's locked in for today:",
  "📊 today's results are final, no appeals:",
  "🌊 the sea has ranked you all — here's who floated to the top:",
  "🎯 tonight's standings, top to bottom:",
  "🔒 today's closed, and here's who's standing:",
  "🥁 drumroll — today's top 3:",
  "📯 hear ye — today's podium is set:",
  "🎬 tonight's cast, in order of appearance:",
  "🐚 straight from the deep, today's top 3:",
  "🎪 step right up for tonight's podium:",
  "🧾 the ledger's closed. today's top 3:",
  "🌙 lights out on today. here's who's on top:",
  "⚡ the verdict is in. tonight's podium:",
  "🎣 reeled in for tonight, the top 3:",
  "🐙 tallied and final — today's podium:",
  "🎫 tonight's winners circle:",
  "🫧 surfacing now — today's top 3:",
  "🎖️ tonight's honors, top to bottom:",
  "📢 today's results, unappealable:",
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
  closeIntro: (vars) => fill(pick(INTROS.concat(CLOSE_INTROS)), vars),
  preview: (vars) => fill(pick(PREVIEW), vars),
  podiumIntro: () => pick(PODIUM_INTRO),
  raffle: (vars) => fill(pick(RAFFLE), vars),
  streakMilestone: (vars) => fill(pick(STREAK_MILESTONE), vars),
};

module.exports = { say, fill, pick, INTROS, CLOSE_INTROS, PREVIEW, PODIUM_INTRO, RAFFLE, STREAK_MILESTONE };
