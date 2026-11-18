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

function turnTo(round, index, angle, direction = 1) {
  const travel = (direction * (angle - round.rings[index].angle) + 720) % 360;
  return turn(round, index, direction * (travel || 1));
}

function releaseClip(round, clip) {
  const index = round.clips.indexOf(clip);
  const cross = clip.crossPinned ? index : clip.sharedPin;
  if (round.clips[cross]?.crossPinned) assert(round.pullCrossPin(cross));
  if (clip.pinned) assert(round.pullPin(index));
  if (clip.paired) turnTo(round, clip.owner, clip.angle + 180);
  if (clip.attached) turnTo(round, clip.holder, clip.angle, clip.turnDirection);
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
const pin = varied.clips.findIndex(clip => clip.pinned && !clip.paired && clip.sharedPin === undefined);
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
releaseClip(varied, compound);

const directional = varied.clips.find(clip => clip.turnDirection && clip.attached);
assert(directional);
turnTo(varied, directional.owner, directional.angle + 180, directional.turnDirection);
assert(directional.attached, 'the unmarked end cannot open the one-way clasp');
turnTo(varied, directional.holder, directional.angle, -directional.turnDirection);
assert(directional.attached, 'the wrong direction cannot open the one-way clasp');
turnTo(varied, directional.holder, directional.angle, directional.turnDirection);
assert.equal(directional.attached, false);

const sharedRound = new CookingRingRound(dish, discovered, () => .1);
const sharedIndex = sharedRound.clips.findIndex(clip => clip.sharedPin !== undefined);
assert(sharedIndex >= 0);
const shared = sharedRound.clips[sharedIndex], other = sharedRound.clips[shared.sharedPin];
for (const clip of [shared, other]) {
  turn(sharedRound, clip.holder, 360);
  assert(clip.attached);
}
const beforeShared = sharedRound.snapshot();
assert(shared.crossPinned);
assert.equal(sharedRound.pullPin(sharedIndex), false);
assert.equal(sharedRound.pullPin(shared.sharedPin), false);
const beforeCross = sharedRound.timeLeft;
assert(sharedRound.pullCrossPin(sharedIndex));
assert.equal(sharedRound.timeLeft, beforeCross, 'the upper pin alone does not award time');
assert(shared.pinned && other.pinned);
assert.equal(sharedRound.pullCrossPin(sharedIndex), false);
assert(sharedRound.pullPin(shared.sharedPin));
assert(shared.attached && other.attached);
assert(!shared.pinned && !other.pinned, 'one pull unblocks both clasps');
assert.equal(sharedRound.pullPin(sharedIndex), false);
assert(sharedRound.restore(beforeShared));
assert(shared.pinned && other.pinned && shared.crossPinned, 'the snapshot records both layers');

function verifyGeometry(round) {
  const {rings, clips} = round;
  const outer = ring => ring.radius + 13;
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
    assert(rings.some((_, index) => clips.filter(clip => clip.holder === index || clip.owner === index).length >= 4));
    assert(clips.some(clip => clip.pinned && clip.pinShape !== 'straight'));
    assert(clips.some(clip => clip.turnDirection));
  }
  const rails = clips.map((clip, index) => [clip, index]).filter(([clip, index]) => clip.sharedPin > index);
  assert.equal(rails.length, round.dish.difficulty === 3 ? 2 : 0);
  for (const [clip, index] of rails) {
    const other = clips[clip.sharedPin];
    assert.equal(other.sharedPin, index);
    assert(clip.crossPinned);
    assert(other.paired);
    const a = rings[clip.holder], b = rings[clip.owner], c = rings[other.holder], d = rings[other.owner];
    assert.equal(a.y, b.y);
    assert.equal(c.y, d.y);
    assert.equal(a.x + b.x, c.x + d.x);
    const x = (a.x + b.x) / 2;
    for (const ring of rings) {
      const low = Math.min(a.y, c.y), high = Math.max(a.y, c.y);
      const y = Math.max(low - 8, Math.min(ring.y, high + 8));
      const handle = Math.max((low + high) / 2 - 19, Math.min(ring.y, (low + high) / 2 + 19));
      const cross = Math.max(x - 38, Math.min(ring.x, x + 38));
      assert(Math.hypot(ring.x - x, ring.y - y) >= outer(ring) + 9, 'long tube fits between circular rings');
      assert(Math.hypot(ring.x - x, ring.y - handle) >= outer(ring) + 16, 'the handle has room to grab');
      assert(Math.hypot(ring.x - cross, ring.y - (low + high) / 2) >= outer(ring) + 11);
    }
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
      const opener = round.rings.findIndex((ring, index) => ring.y < 180 && round.clips
        .filter(clip => clip.holder === index || clip.owner === index)
        .every(clip => !clip.paired && !clip.pinned && !clip.turnDirection));
      assert(opener >= 0, 'each batch offers a plain opening ring');
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
      while (!round.batchReady) {
        round.tick(1.25);
        assert(!round.expired, recipe.name + ' must offer enough time for a steady solution');
        assert(step(round, false), recipe.name + ' must have a route without spare food');
      }
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
assert.equal(clock.timeLeft, 36.5);
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
assert.equal(clock.timeLeft, 60);
assert.deepEqual(clock.snapshot(), expired);
assert.equal(clock.resumeAfterVideo(), false);
console.log('Cooking rings: all recipes, both ends, directional and paired clasps, crossed tubes, 60-second resets and single-serving time bonuses OK');
