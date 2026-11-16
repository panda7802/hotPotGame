'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const data = require('../cloudfunctions/hotpotPlayerDev/CookingData');
const {INGREDIENTS} = require('../cloudfunctions/hotpotPlayerDev/GameConfig');

const ts = loadTypeScript();
const file = path.join(__dirname, '../assets/scripts/data/CookingRingRound.ts');
const {outputText} = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
});
const model = {exports: {}};
new Function('require', 'module', 'exports', outputText)(name => {
  assert.equal(name, './CookingData');
  return data;
}, model, model.exports);
const {CookingRingRound, COOKING_SERVE_ANGLE, COOKING_TIME_SECONDS, COOKING_RING_SECONDS} = model.exports;
const discovered = INGREDIENTS.map(food => food.id);

function turn(round, index, delta) {
  const before = Object.values(round.portions).reduce((sum, count) => sum + count, 0);
  const drop = round.rotate(index, delta);
  const after = Object.values(round.portions).reduce((sum, count) => sum + count, 0);
  assert.equal(after - before, drop ? 1 : 0);
  if (drop) {
    assert.equal(drop.ring, index);
    assert.equal(drop.food, round.rings[index].food);
  }
  return drop;
}

function turnTo(round, index, angle) {
  const clockwise = (angle - round.rings[index].angle + 360) % 360;
  return turn(round, index, clockwise || 1);
}

function releaseClip(round, clip) {
  if (clip.pinned) assert(round.pullPin(round.clips.indexOf(clip)));
  if (clip.paired) turnTo(round, clip.owner, clip.angle + 180);
  if (clip.attached) turnTo(round, clip.holder, clip.angle);
  assert.equal(clip.attached, false);
}

function step(round, includeExtras) {
  const available = round.rings.findIndex((ring, index) => ring.food && !ring.released
    && (includeExtras || !ring.food.extra) && !round.locked(index));
  if (available >= 0) {
    assert(turnTo(round, available, COOKING_SERVE_ANGLE));
    return true;
  }
  const clip = round.clips.find(clip => clip.attached);
  if (!clip) return false;
  releaseClip(round, clip);
  return true;
}

const dish = data.findRecipe('mixed-seafood@1');
const varied = new CookingRingRound(dish, discovered, () => .1);
const paired = varied.clips.find(clip => clip.paired && !clip.pinned);
assert(paired);
varied.rings[paired.holder].angle = (paired.angle + 75) % 360;
varied.rings[paired.owner].angle = (paired.angle + 255) % 360;
turnTo(varied, paired.owner, paired.angle + 180);
assert(paired.attached, 'one aligned end cannot remove a paired clasp');
turnTo(varied, paired.holder, paired.angle);
assert.equal(paired.attached, false);
const pin = varied.clips.findIndex(clip => clip.pinned && !clip.paired);
assert(pin >= 0);
const rail = varied.clips[pin];
turn(varied, rail.owner, 360);
assert(rail.attached, 'the slide pin blocks an aligned clasp');
const beforePull = varied.snapshot();
assert(varied.pullPin(pin));
assert.equal(varied.pullPin(pin), false);
assert(varied.restore(beforePull));
assert(rail.pinned);
assert(varied.pullPin(pin));
turnTo(varied, rail.owner, rail.angle + 180);
assert.equal(rail.attached, false, 'a regular clasp can be removed from its other end');

const compound = varied.clips.find(clip => clip.paired && clip.pinned);
assert(compound, 'hard mode includes pipe-blocked double clasps');
varied.rings[compound.holder].angle = (compound.angle + 65) % 360;
varied.rings[compound.owner].angle = (compound.angle + 245) % 360;
turnTo(varied, compound.owner, compound.angle + 180);
turnTo(varied, compound.holder, compound.angle);
assert(compound.attached, 'aligned ends cannot bypass an attached pipe');
assert(varied.pullPin(varied.clips.indexOf(compound)));
turnTo(varied, compound.holder, compound.angle);
assert.equal(compound.attached, false);

function verifyGeometry(round) {
  const {rings, clips} = round;
  const outer = ring => ring.radius * (ring.shape === 'square' ? .9 * 2 ** (1 / 3) : 1) + 13;
  assert(rings.every(ring => ring.radius >= 51 && ring.x - outer(ring) >= 6 && ring.x + outer(ring) <= 610));
  for (let i = 0; i < rings.length; i++) {
    const a = rings[i];
    for (const b of rings.slice(i + 1)) {
      assert(Math.hypot(a.x - b.x, a.y - b.y) >= outer(a) + outer(b), 'rings can rotate without visual overlap');
    }
  }
  for (const {holder, owner} of clips) {
    const a = rings[holder], b = rings[owner], x = b.x - a.x, y = b.y - a.y;
    rings.forEach((ring, index) => {
      if (index === holder || index === owner) return;
      const t = Math.max(0, Math.min(1, ((ring.x - a.x) * x + (ring.y - a.y) * y) / (x * x + y * y)));
      assert(Math.hypot(ring.x - a.x - t * x, ring.y - a.y - t * y) >= outer(ring) + 4,
        `${round.dish.name}: clasp ${holder}-${owner} should not cross ring ${index}`);
    });
  }
  if (round.dish.difficulty > 1) {
    assert(new Set(rings.map(ring => ring.shape)).size >= 3);
    assert(clips.some(clip => clip.pinned && clip.pinShape !== 'straight'));
  }
}

for (const recipe of [...data.RECIPES, data.practiceRecipe(discovered)]) {
  for (const random of [() => .1, () => .3, () => .6, () => .9]) {
    const round = new CookingRingRound(recipe, discovered, random);
    let ringCount = 0;
    do {
      ringCount += round.rings.length;
      assert(round.rings.every((_, i) => round.present(i)), 'no disconnected empty rings');
      verifyGeometry(round);
      for (const [id, target] of round.batch) {
        assert.equal(round.rings.filter(ring => ring.food?.id === id && !ring.food.extra).length, target);
      }
      for (let index = 0; index < round.rings.length; index++) {
        const checkpoint = round.snapshot();
        const wasLocked = round.locked(index);
        const drop = turn(round, index, 47);
        assert.equal(round.rings[index].angle, (checkpoint.angles[index] + 47) % 360,
          'every ring can turn even if it is still clipped');
        if (wasLocked) assert.equal(drop, undefined);
        assert(round.restore(checkpoint));
      }
      while (!round.batchReady) assert(step(round, false), recipe.name + ' must have a route without spare food');
      if (round.lastBatch) break;
      const previous = round.snapshot(), seconds = round.timeLeft;
      assert(round.nextBatch());
      assert.equal(round.timeLeft, seconds);
      assert.equal(round.restore(previous), false);
    } while (true);
    assert.equal(ringCount, [9, 32, 88][recipe.difficulty - 1]);
    assert.deepEqual(round.portions, Object.fromEntries(recipe.ingredients));
    assert.equal(round.result.stars, 5);
  }
}

for (const recipe of data.RECIPES.filter(recipe => recipe.difficulty >= 2)) {
  const round = new CookingRingRound(recipe, discovered, () => .1);
  let checkpoint;
  assert.equal(round.rings.filter(ring => ring.food?.extra).length, round.excessLimit + 1);
  while (!round.ruined) {
    checkpoint = round.snapshot();
    assert(step(round, true), recipe.name + ' must have a reachable spare food ring');
  }
  assert.equal(round.excess, round.excessLimit + 1);
  const ruined = round.snapshot();
  assert.equal(turn(round, 0, 360), undefined);
  assert.deepEqual(round.snapshot(), ruined);
  assert(round.restore(checkpoint));
  assert.deepEqual(round.snapshot(), checkpoint);
  assert.equal(round.ruined, false);
}

const clock = new CookingRingRound(data.RECIPES[0], discovered, () => .1);
assert.equal(clock.timeLeft, COOKING_TIME_SECONDS);
assert.equal(clock.resumeAfterVideo(), false);
clock.tick(23.5);
assert.equal(clock.timeLeft, 156.5);
while (true) {
  const before = clock.snapshot(), time = clock.timeLeft;
  let action;
  const unlockedFood = clock.rings.findIndex((ring, index) => ring.food && !ring.released && !clock.locked(index));
  if (unlockedFood >= 0) action = () => turnTo(clock, unlockedFood, COOKING_SERVE_ANGLE);
  else {
    const clip = clock.clips.find(clip => clip.attached);
    assert(clip);
    action = () => releaseClip(clock, clip);
  }
  const visible = clock.rings.filter((_, index) => clock.present(index)).length;
  action();
  const removed = visible - clock.rings.filter((_, index) => clock.present(index)).length;
  assert.equal(clock.timeLeft, time + removed * COOKING_RING_SECONDS);
  if (!removed) continue;
  assert(clock.restore(before));
  const seconds = clock.timeLeft;
  action();
  assert.equal(clock.timeLeft, seconds, 'redo must not give repeat time');
  break;
}
clock.tick(100000);
assert(clock.expired);
const expired = clock.snapshot();
assert.equal(turn(clock, 0, 360), undefined);
assert.equal(clock.pullPin(0), false);
assert.deepEqual(clock.snapshot(), expired);
assert(clock.resumeAfterVideo());
assert.equal(clock.timeLeft, 180);
assert.deepEqual(clock.snapshot(), expired);
assert.equal(clock.resumeAfterVideo(), false);
console.log('Cooking rings: both ends, paired clasps, slide pins, all recipes, single servings, 180-second resets and one +10 bonus per ring OK');
