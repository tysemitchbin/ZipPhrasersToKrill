#!/usr/bin/env node
// ---------------------------------------------------------------------------
//  Generates one image-generation prompt per creature, for the barn art.
//
//    node dev/creature-prompts.js            # all 36, ready to copy-paste
//    node dev/creature-prompts.js unicorn    # just the ones matching a slug
//
//  The creature list is read straight out of leaderboard-bot/index.js, so
//  this can't drift from the real CREATURES array - add a creature there and
//  this script fails loudly until you write it a SUBJECT line below.
//
//  Consistency across 36 images comes from STYLE being byte-identical on
//  every prompt. Only SUBJECT changes. Don't "improve" STYLE halfway through
//  a batch - that's what makes a collection look assembled from three
//  different artists. See dev/creature-art-prompts.md for the workflow.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// The fixed half. Pasted onto every single prompt, unchanged.
const STYLE = [
  'Flat vector sticker illustration.',
  'Bold uniform dark outline of even weight all the way round.',
  'Three to five flat colours, no gradients, no texture, no noise, no painterly brushwork;',
  'at most one simple cel-shaded shadow shape per colour area.',
  'Characterful mascot proportions, slightly oversized head, large expressive eyes.',
  'Full body, centred, filling about 85% of a square frame.',
  'Plain transparent background - no ground, no cast shadow, no scenery, no props,',
  'no text, no signature, no frame, no border.',
  'Even flat lighting.',
  'Chunky readable silhouette that still reads clearly when shrunk to 28 pixels.',
].join(' ');

// What to hand a tool with a separate negative-prompt field.
const NEGATIVE = [
  'photorealistic, 3d render, octane, painterly, watercolour, sketchy lines,',
  'gradients, texture, grain, drop shadow, ground shadow, background scenery,',
  'props, multiple subjects, text, watermark, signature, logo, frame, border,',
  'cropped limbs, cut off, realistic fur detail, hyperdetailed, busy composition',
].join(' ');

// The changing half: pose + defining feature + dominant colours.
// Poses and colours are deliberately spread apart within each look-alike
// cluster (5 horses, 4 dragons, 7 small fluffy mammals, 4 birds) because at
// 28px the silhouette and the dominant colour are the ONLY things telling
// two chips apart. Detail does nothing at that size.
const SUBJECTS = {
  // ---- common ----
  'Unicorn': 'a unicorn standing in left-facing profile, head raised, one long spiralled horn, flowing mane and tail; pearl white body, soft pink mane, gold horn',
  'Pegasus': 'a pegasus rearing on its hind legs, both feathered wings spread wide and upward; cream white body, pale sky-blue wings, silver-grey mane',
  'Griffin Chick': 'a baby griffin sitting, oversized fluffy head, stubby half-grown wings, eagle beak and small lion hindquarters; sandy brown body, cream chest, yellow beak',
  'Jackalope': 'a jackalope alert on its hind legs in three-quarter view, tall branching antlers; tawny brown fur, cream belly, bone-white antlers',
  'Baby Wyrm': 'a baby wingless serpent-dragon coiled into a sitting spiral, a tiny puff of smoke at its nostrils; ember orange scales, cream underbelly',
  'Wolpertinger': 'a wolpertinger sitting upright, small feathered wings on its back, short antlers and two tiny fangs; grey-brown fur, white wings, tan antlers',
  'Hedgehog': 'a hedgehog walking in right-facing profile, crest of spines raised along its back; chestnut brown spines, cream face and belly, black nose',
  'Fennec Fox': 'a fennec fox sitting facing the viewer, enormous triangular ears, tail curled round its paws; sandy gold fur, cream muzzle and ear insides',
  'Quokka': 'a quokka sitting facing the viewer, round body, wide friendly smile; warm chestnut fur, pale cream cheeks',

  // ---- uncommon ----
  'Dragon': 'a four-legged dragon standing in three-quarter view, bat wings spread, a small flame at its mouth; emerald green scales, lime belly plates, red spines',
  'Kraken Spawn': 'a small round-bodied baby kraken, tentacles splayed downward, huge expressive eyes; deep violet skin, magenta suckers',
  'Qilin': 'a qilin standing in left-facing profile, hooved legs, scaled body, antlered head, wisps of flame at its heels; jade green scales, gold mane and antlers',
  'Kelpie': 'a kelpie water horse with its head lowered in right-facing profile, mane and tail trailing away into streaming water; dark teal body, seaweed-green dripping mane',
  'Chimera': 'a chimera standing in three-quarter view, lion body, goat head rising from its back, serpent for a tail; tawny gold lion, white goat, olive serpent',
  'Amphisbaena': 'an amphisbaena serpent curved into a wide S with an identical head at each end facing opposite ways; brick red scales, cream banding, yellow eyes',
  'Caladrius': 'a caladrius bird standing tall in profile, wings folded, long neck, faint halo above its head; pure white plumage, gold beak and legs',
  'Axolotl': 'an axolotl floating horizontally facing the viewer, feathery external gills fanned out, permanent smile; pale pink body, magenta gills',
  'Narwhal': 'a narwhal swimming in left-facing profile, long spiralled tusk; slate blue-grey speckled body, cream underside, ivory tusk',
  'Leafy Seadragon': 'a leafy seadragon in a vertical S-curve, body covered in leaf-shaped fins; olive and yellow-green body, amber leaf fins',
  'Sugar Glider': 'a sugar glider mid-glide seen head-on, gliding membrane stretched flat into a squared-off silhouette; silver-grey fur, cream belly, black dorsal stripe',

  // ---- rare ----
  'Ancient Wyrm': 'an ancient wingless serpent-dragon coiled into a tall figure-eight, whiskered head raised; deep plum scales, bronze belly, gold whiskers',
  'Alicorn': 'an alicorn leaping in three-quarter view, wings swept back, spiralled horn; lavender body, mane in flat banded stripes of pink, cyan and yellow',
  'Bunyip': 'a hulking shaggy bunyip water beast hunched forward, broad flat snout, two tusks, dripping matted fur; murky teal fur, dark green tusks',
  'Nue': 'a nue crouching in three-quarter view, monkey face, striped tiger body, serpent tail raised behind; dark indigo fur with black stripes, pale grey face, olive serpent',
  'Hippogriff': 'a hippogriff standing in three-quarter view, eagle head and forelegs, horse hindquarters, wings half-raised; chestnut body, bronze feathers, yellow beak',
  'Glass Frog': 'a glass frog sitting facing the viewer, translucent belly showing one small red heart, large round eyes; lime green back, pale mint translucent belly',
  'Sea Bunny': 'a sea bunny nudibranch in three-quarter front view, two black rhinophores like ears, feathery tail tuft; white velvety body, black spots',
  'Mandarinfish': 'a mandarinfish swimming in left-facing profile, ornate maze-like wave markings, fan-shaped fins; electric blue body, orange and green banding',
  'Satanic Leaf-tailed Gecko': 'a satanic leaf-tailed gecko in a flat splayed clinging pose seen from above, flattened leaf-shaped tail, notched skin edges; dead-leaf brown and rust mottling, amber eyes',
  'Pink Fairy Armadillo': 'a pink fairy armadillo walking in right-facing profile, domed plated shell along its back, large digging claws; pale rose shell, white silky fur',

  // ---- legendary ----
  'Phoenix': 'a phoenix with wings flung upward in a V, tail feathers streaming down, body wreathed in flat stylised flames; scarlet and orange body, yellow flame tips',
  'The Last Unicorn': 'a solitary unicorn standing still in left-facing profile, head bowed slightly, long spiralled horn, long trailing mane; luminous pearl white body, pale gold horn and hooves',
  'Simurgh': 'a gigantic simurgh in three-quarter front view, mammalian wolf-like head with a canine snout and sharp teeth, elongated elegant avian torso, enormous sweeping peacock tail fanned out behind it, four powerful clawed legs with predatory lion-eagle talons; copper-orange and deep gold feathers, brilliant emerald-green tail',
  'Questing Beast': 'a questing beast in three-quarter rear view, body turned away showing its spotted leopard flank and deer hooves, long serpent neck curving back over its shoulder to face the viewer; pale silver-white body with charcoal spots, deep violet serpent head',
  'Blue Dragon Sea Slug': 'a blue dragon sea slug seen from directly above, flat body with six finger-like appendages fanned out symmetrically; electric blue and silver-white, dark blue edging',
  'Tardigrade': 'a tardigrade in right-facing profile, plump segmented body on eight stubby clawed legs, round circular mouth; translucent amber-tan body, moss green segment markings',
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Pull CREATURES out of the bot rather than duplicating it here.
function loadCreatures() {
  const file = path.join(__dirname, '..', 'leaderboard-bot', 'index.js');
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('const CREATURES = [');
  if (start === -1) throw new Error('CREATURES array not found in ' + file);
  const body = src.slice(start);
  const literal = body.slice(body.indexOf('['), body.indexOf('\n];') + 2);
  return eval(literal); // eslint-disable-line no-eval -- our own source, not input
}

const creatures = loadCreatures();

const missing = creatures.filter(c => !SUBJECTS[c.name]).map(c => c.name);
if (missing.length) {
  console.error('No SUBJECT line for: ' + missing.join(', '));
  console.error('Add one to SUBJECTS in ' + path.relative(process.cwd(), __filename) + ' and re-run.');
  process.exit(1);
}

const filter = process.argv[2] ? process.argv[2].toLowerCase() : null;
const shown = filter
  ? creatures.filter(c => slug(c.name).includes(filter) || c.rarity === filter)
  : creatures;

console.log('# Creature art prompts - ' + shown.length + ' of ' + creatures.length + ' creatures');
console.log('# Generated by dev/creature-prompts.js. Do not edit by hand; edit the script.');
console.log('#');
console.log('# Negative prompt (same for all, if your tool has the field):');
console.log('# ' + NEGATIVE);
console.log('');

for (const c of shown) {
  console.log('='.repeat(78));
  console.log(slug(c.name) + '.png   ' + c.emoji + ' ' + c.name + '   [' + c.rarity + ']');
  console.log('='.repeat(78));
  console.log(SUBJECTS[c.name] + '. ' + STYLE);
  console.log('');
}
