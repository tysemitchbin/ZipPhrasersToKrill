# Creature art

One image per creature, named after the creature with a `.png` extension:
`unicorn.png`, `griffin-chick.png`, `the-last-unicorn.png`.

The site derives that filename from `creature_name` in `creatures_owned`
(`creatureSlug()` in `index.html`), so a file dropped in here with the right
name starts showing up on its own - there's no database column and no code
change. A creature with no file here keeps rendering as its emoji.

To see the exact filename each creature needs, and which are still missing:

    node dev/creature-prompts.js --check images/creatures

These should be the cleaned-up, transparent, 128x128 versions produced by
`dev/cleanup-creature-art.py` - not the raw generator output. Keep the raw
generations somewhere outside the repo; they're large, and every byte here is
served to every visitor.

Rarity is drawn by the chip's border in `index.html`, not baked into the art,
so all 36 images stay stylistically identical.
