# Creature art — generation guide

How to produce the 36 barn creature images so they look like one set rather
than 36 unrelated pictures.

Prompts are **generated**, not written out by hand:

```sh
node dev/creature-prompts.js              # all 36
node dev/creature-prompts.js unicorn      # one creature (slug match)
node dev/creature-prompts.js legendary    # one rarity tier
node dev/creature-prompts.js > dev/creature-prompts.txt   # refresh the dump
```

`dev/creature-prompts.txt` is the generated dump, committed so you can
copy-paste without running anything. Edit the script, never the .txt.

The script reads `CREATURES` straight out of `leaderboard-bot/index.js`, so
it can't drift from the real list. Add a creature to the bot and this script
refuses to run until you give it a `SUBJECT` line.

## Where the consistency comes from

Every prompt is `SUBJECT + STYLE`, and **STYLE is byte-identical across all
36**. That single shared block is doing most of the work. The usual way a
generated set ends up looking mismatched is someone tweaking the style
wording partway through a batch — resist it. If STYLE needs a change, change
it once and regenerate *everything*.

The second lever is the per-creature `SUBJECT` line, which fixes three
things deliberately:

- **pose / camera angle**
- **the one defining feature** (the horn, the two heads, the flat glide
  membrane)
- **dominant colours**

Those are spread apart *within each look-alike cluster* on purpose. The list
has five horses (Unicorn, Pegasus, Kelpie, Alicorn, The Last Unicorn), four
dragons (Baby Wyrm, Dragon, Ancient Wyrm, Blue Dragon Sea Slug), seven small
fluffy mammals and four birds. At the size these render, silhouette and
dominant colour are the *only* things separating two chips — detail does
nothing. That's why the unicorns are standing/rearing/lowered/leaping/bowed
in five different colours instead of all standing in profile in white.

## Suggested order

1. **Generate the 9 commons first.** They're the ones that'll show up most.
2. Pick the 2–3 that best nail the look. Those are now your canon reference.
3. Feed those back as a style reference for everything after (see below).
4. Do the remaining 27 in rarity batches, checking against the canon as you
   go.

Doing all 36 blind in one sitting and *then* judging them is how you end up
regenerating most of the set.

## Tool-specific settings

**Midjourney** — append `--ar 1:1 --style raw`. After step 2 above, add
`--sref <url of a canon image> --sw 100` to every subsequent prompt. That is
the single most effective consistency lever the tool has.

**DALL·E / ChatGPT / Gemini (Nano Banana)** — keep one long-running chat,
attach the canon images, and ask for each new creature "in exactly the same
style as the attached". Starting a fresh chat per creature resets the style
and you'll see the drift immediately.

**Stable Diffusion / ComfyUI** — fix the seed, sampler, steps and CFG across
the whole run and vary only the prompt. Put the `NEGATIVE` block from the
script in the negative field. An IP-Adapter pointed at a canon image beats
all of the above if you have one set up.

## Checking the results

Before accepting an image:

- **Look at it at 28px.** Shrink it right down. If you can't tell what it is,
  the image has failed regardless of how good it looks at full size. This is
  the actual test — the barn chips are tiny.
- **Put it next to its cluster-mates.** Unicorn beside Pegasus beside
  Alicorn. If two read as the same chip, regenerate one with a different
  pose or dominant colour.
- **Check the background is genuinely transparent**, not white. Most tools
  ignore "transparent background" and hand you a white square; expect to cut
  it out.

## Output prep

- Master at 512×512 or 1024×1024, transparent PNG.
- Trim transparent margins **consistently** across the set — if one creature
  is trimmed tight and the next has 40px of padding, they'll render at
  visibly different sizes in the barn even though the files are square.
- Export the web copy at 128×128 (the chip renders around 28px, so 128 covers
  retina with room to spare). Keep the masters out of the repo, or in a
  separate folder that isn't served.
- Name each file by the slug the generator prints — `unicorn.png`,
  `griffin-chick.png`, `the-last-unicorn.png`. That's the slug
  `creature_name` maps to, so a file dropped in with the right name just
  starts appearing.
