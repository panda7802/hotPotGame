import {IngredientType} from './GameConfig';
import {Portions, Recipe, recipeBatches, scoreCooking} from './CookingData';

export const COOKING_RING_GAP = 25;
export const COOKING_SERVE_ANGLE = 300;
export const COOKING_TIME_SECONDS = 60;
export const COOKING_RING_SECONDS = 10;
export const cookingRingCount = (difficulty: Recipe['difficulty']) => [9, 32, 88][difficulty - 1];

export interface RingPortion {
  id: IngredientType;
  extra?: boolean;
}

export interface CookingRingSnapshot {
  batch: number;
  angles: number[];
  released: boolean[];
  attached: boolean[];
  pins: boolean[];
  crossPins: boolean[];
  portions: Portions;
}

export type CookingPinShape = 'straight' | 'elbow' | 'u';

export interface CookingRing {
  x: number;
  y: number;
  radius: number;
  angle: number;
  food?: RingPortion;
  released: boolean;
}

interface CookingClip {
  holder: number;
  owner: number;
  angle: number;
  attached: boolean;
  paired: boolean;
  pinned: boolean;
  pinShape: CookingPinShape;
  sharedPin?: number;
  crossPinned?: boolean;
  turnDirection?: 1 | -1;
}

const wrap = (angle: number) => (angle % 360 + 360) % 360;
const angleDistance = (a: number, b: number) => Math.abs(wrap(a - b + 180) - 180);
const SNAP_TOLERANCE = 9;

type Layout = {points: readonly (readonly [number, number, number])[]; links: readonly (readonly [number, number])[]};

const CLUSTERS: Record<number, Layout> = {
  6: {
    points: [[140, 85, 63], [452, 105, 62], [294, 241, 64], [501, 305, 58],
      [107, 416, 60], [302, 468, 63]],
    links: [[0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5], [4, 5]],
  },
  7: {
    points: [[100, 94, 61], [307, 79, 60], [520, 110, 62], [205, 245, 60],
      [412, 263, 61], [95, 412, 60], [315, 426, 62]],
    links: [[0, 1], [1, 2], [0, 3], [1, 3], [2, 4], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6]],
  },
  8: {
    points: [[102, 86, 61], [514, 99, 62], [309, 174, 61], [104, 280, 60], [520, 284, 61],
      [102, 471, 62], [310, 407, 60], [518, 472, 61]],
    links: [[0, 2], [1, 2], [0, 3], [2, 3], [2, 4], [1, 4], [3, 5], [3, 6], [4, 6], [4, 7], [5, 6], [6, 7]],
  },
  9: {
    points: [[86, 87, 51], [237, 106, 52], [387, 84, 53], [537, 102, 51],
      [123, 275, 61], [322, 255, 59], [514, 278, 60], [217, 450, 62], [434, 441, 62]],
    links: [[0, 1], [1, 2], [2, 3], [0, 4], [1, 4], [2, 5], [3, 6], [4, 5], [5, 6], [4, 7], [5, 7], [5, 8], [6, 8]],
  },
  10: {
    points: [[96, 101, 60], [276, 101, 62], [486, 77, 59], [96, 283, 60], [276, 283, 63],
      [507, 255, 57], [179, 467, 64], [400, 422, 61], [100, 627, 52], [503, 587, 63]],
    // The first two clasps sit on the same vertical line and share a slide pin.
    links: [[0, 1], [3, 4], [1, 2], [0, 3], [1, 4], [2, 5], [4, 5],
      [3, 6], [4, 6], [4, 7], [5, 7], [6, 7], [6, 8], [7, 9]],
  },
};

const MEDIUM_ARRANGEMENTS = [[6, 10], [7, 9], [9, 7], [8, 8]];
const HARD_ARRANGEMENT = [10, 7, 10, 8, 9];

const SIMPLE_CLUSTER: Layout = {
  points: [[133, 85, 63], [486, 90, 63], [98, 250, 59], [310, 227, 63], [526, 257, 59],
    [187, 406, 62], [435, 427, 62], [91, 545, 59], [517, 567, 59]],
  links: [[0, 2], [0, 3], [1, 4], [2, 3], [3, 6], [4, 6], [2, 5], [5, 7], [6, 8]],
};

export class CookingRingRound {
  readonly batches: ReturnType<typeof recipeBatches>;
  readonly portions: Portions = {};
  readonly rings: CookingRing[] = [];
  readonly clips: CookingClip[] = [];
  batchIndex = 0;
  private seconds = COOKING_TIME_SECONDS;
  private readonly credited = new Set<number>();

  constructor(readonly dish: Recipe, private readonly discovered: readonly IngredientType[],
    private readonly random = Math.random) {
    this.batches = recipeBatches(dish);
    this.buildBatch();
  }

  get batch() { return this.batches[this.batchIndex]; }
  get lastBatch() { return this.batchIndex === this.batches.length - 1; }
  get hasFood() { return Object.keys(this.portions).length > 0; }
  get finished() { return this.clips.every(clip => !clip.attached) && this.rings.every(ring => !ring.food || ring.released); }
  get batchReady() { return this.batch.every(([id, count]) => (this.portions[id] ?? 0) >= count); }
  get totalRings() { return cookingRingCount(this.dish.difficulty); }
  get height() { return Math.max(...this.rings.map(ring => ring.y + ring.radius)) + 28; }
  get timeLeft() { return this.seconds; }
  get expired() { return this.seconds <= 0; }
  get result() { return scoreCooking(this.dish, this.portions); }
  get excess() { return this.result.rows.reduce((n, row) => n + Math.max(0, row.actual - row.target), 0); }
  get excessLimit() { return Math.floor(this.dish.ingredients.reduce((n, [, count]) => n + count, 0) * 3 / 10); }
  get ruined() { return this.excess > this.excessLimit; }

  tick(delta: number): void {
    if (Number.isFinite(delta) && delta > 0) this.seconds = Math.max(0, this.seconds - delta);
  }

  resumeAfterVideo(): boolean {
    if (!this.expired) return false;
    this.seconds = COOKING_TIME_SECONDS;
    return true;
  }

  snapshot(): CookingRingSnapshot {
    return {batch: this.batchIndex, angles: this.rings.map(ring => ring.angle),
      released: this.rings.map(ring => ring.released), attached: this.clips.map(clip => clip.attached),
      pins: this.clips.map(clip => clip.pinned), crossPins: this.clips.map(clip => !!clip.crossPinned),
      portions: {...this.portions}};
  }

  restore(saved: CookingRingSnapshot): boolean {
    if (saved.batch !== this.batchIndex || saved.angles.length !== this.rings.length
      || saved.attached.length !== this.clips.length || saved.pins.length !== this.clips.length
      || saved.crossPins.length !== this.clips.length) return false;
    this.rings.forEach((ring, i) => { ring.angle = saved.angles[i]; ring.released = saved.released[i]; });
    this.clips.forEach((clip, i) => {
      clip.attached = saved.attached[i];
      clip.pinned = saved.pins[i];
      if (clip.crossPinned !== undefined) clip.crossPinned = saved.crossPins[i];
    });
    for (const id of Object.keys(this.portions) as IngredientType[]) delete this.portions[id];
    Object.assign(this.portions, saved.portions);
    return true;
  }

  locked(index: number): boolean {
    return this.clips.some(clip => (clip.holder === index || clip.owner === index) && clip.attached);
  }

  present(index: number): boolean {
    const ring = this.rings[index];
    return !!ring && (!!ring.food && !ring.released || this.locked(index));
  }

  rotate(index: number, delta: number): {ring: number; food: RingPortion} | undefined {
    const ring = this.rings[index];
    if (!ring || this.expired || this.ruined || !this.present(index) || !Number.isFinite(delta) || !delta) return;

    // Screen angles turn clockwise. Check the full sweep, including when a fast swipe skips the clip visually.
    const distanceTo = (angle: number) => {
      const offset = wrap(Math.sign(delta) * (angle - ring.angle));
      return offset <= SNAP_TOLERANCE || offset >= 360 - SNAP_TOLERANCE ? 0 : offset - SNAP_TOLERANCE;
    };
    const travel = Math.abs(delta);
    const food = !this.locked(index) && !ring.released && ring.food && distanceTo(COOKING_SERVE_ANGLE) <= travel
      ? ring.food : undefined;
    const touched = new Set([index]);
    if (food) {
      ring.released = true;
      this.portions[food.id] = (this.portions[food.id] ?? 0) + 1;
    }
    for (const clip of this.clips) {
      if (!clip.attached || clip.pinned || (clip.holder !== index && clip.owner !== index)) continue;
      if (clip.turnDirection && (clip.holder !== index || Math.sign(delta) !== clip.turnDirection)) continue;
      const other = clip.holder === index ? clip.owner : clip.holder;
      const target = clip.holder === index ? clip.angle : clip.angle + 180;
      if (distanceTo(target) > travel) continue;
      if (clip.paired && angleDistance(this.rings[other].angle, target + 180) > SNAP_TOLERANCE) continue;
      clip.attached = false;
      touched.add(other);
    }
    ring.angle = wrap(ring.angle + delta);
    for (const entry of touched) {
      if (!this.present(entry) && !this.credited.has(entry)) {
        this.credited.add(entry);
        this.seconds += COOKING_RING_SECONDS;
      }
    }
    return food ? {ring: index, food} : undefined;
  }

  pullPin(index: number): boolean {
    const clip = this.clips[index];
    if (this.expired || this.ruined || !clip?.attached || !clip.pinned
      || clip.crossPinned || (clip.sharedPin !== undefined && this.clips[clip.sharedPin].crossPinned)) return false;
    clip.pinned = false;
    if (clip.sharedPin !== undefined) this.clips[clip.sharedPin].pinned = false;
    return true;
  }

  pullCrossPin(index: number): boolean {
    const clip = this.clips[index];
    if (this.expired || this.ruined || !clip?.crossPinned || !clip.pinned) return false;
    clip.crossPinned = false;
    return true;
  }

  nextBatch(): boolean {
    if (this.expired || this.ruined || this.lastBatch || (!this.batchReady && !this.finished)) return false;
    this.batchIndex++;
    this.buildBatch();
    return true;
  }

  private buildBatch(): void {
    this.rings.length = 0;
    this.clips.length = 0;
    this.credited.clear();
    const extras = this.discovered.filter(id => !this.dish.ingredients.some(([target]) => target === id));
    const extra = !this.dish.practice && extras.length ? extras[Math.floor(this.random() * extras.length)] : undefined;
    const start = Math.floor(this.totalRings * this.batchIndex / this.batches.length);
    const end = Math.floor(this.totalRings * (this.batchIndex + 1) / this.batches.length);
    const count = end - start;
    const pattern = Math.floor(this.random() * 4);
    this.layoutRings(count, (pattern + this.batchIndex) % 4);
    const decoys = new Set<number>();
    if (extra && this.dish.difficulty > 1) {
      const candidates = this.rings.map((_, i) => i).filter(i => this.rings[i].x < 175 || this.rings[i].x > 450);
      const amount = this.excessLimit + 1;
      for (let i = 0; i < amount; i++) decoys.add(candidates[Math.floor(candidates.length * (i + .5) / amount)]);
    }
    const rewards = this.rings.filter((_, i) => !decoys.has(i));
    const portions = this.batch.flatMap(([id, count]) => Array<IngredientType>(count).fill(id));
    portions.forEach((id, i) => {
      rewards[Math.ceil(rewards.length * (i + 1) / portions.length) - 1].food = {id};
    });
    for (const index of decoys) this.rings[index].food = {id: extra!, extra: true};
  }

  private layoutRings(count: number, pattern: number): void {
    const difficulty = this.dish.difficulty;
    const sizes = difficulty === 1 ? [count] : difficulty === 2
      ? MEDIUM_ARRANGEMENTS[pattern].concat(count === 32 ? MEDIUM_ARRANGEMENTS[(pattern + 2) % 4] : [])
      : HARD_ARRANGEMENT.map((_, index) => HARD_ARRANGEMENT[(index + pattern) % HARD_ARRANGEMENT.length]);
    let yOffset = 0, previousBottom: number[] = [];
    sizes.forEach((size, group) => {
      const start = this.rings.length;
      const layout = difficulty === 1 ? SIMPLE_CLUSTER : CLUSTERS[size];
      const mirror = (pattern + group) % 2 !== 0;
      const highest = Math.min(...layout.points.map(point => point[1]));
      const lowest = Math.max(...layout.points.map(point => point[1]));
      const nextTop: number[] = [], nextBottom: number[] = [];
      layout.points.forEach(([x, y, radius], i) => {
        const index = start + i;
        this.rings.push({x: mirror ? 616 - x : x, y: y + yOffset, radius,
          angle: wrap(37 + pattern * 90 + index * 71), released: false});
        if (y - highest <= 58) nextTop.push(index);
        if (lowest - y <= 74) nextBottom.push(index);
      });
      const firstClip = this.clips.length;
      for (const [from, to] of layout.links) this.addClip(start + from, start + to, pattern);
      if (difficulty === 3 && size === 10) {
        this.clips[firstClip].sharedPin = firstClip + 1;
        this.clips[firstClip + 1].sharedPin = firstClip;
        this.clips[firstClip].pinned = this.clips[firstClip + 1].pinned = true;
        this.clips[firstClip + 1].paired = true;
        this.clips[firstClip].crossPinned = true;
      }
      if (previousBottom.length && (difficulty === 3 ? group !== 3 : (pattern + group) % 3 !== 1)) {
        const joins = previousBottom.flatMap(from => nextTop.map(to => ({from, to,
          distance: Math.hypot(this.rings[from].x - this.rings[to].x, this.rings[from].y - this.rings[to].y)})));
        joins.sort((a, b) => a.distance - b.distance);
        this.addClip(joins[0].from, joins[0].to, pattern);
      }
      previousBottom = nextBottom;
      yOffset += lowest + 115;
    });
    // Keep a short opening move in reach before the board starts scrolling.
    const opening = this.rings.findIndex((ring, index) => ring.y < 180
      && this.clips.filter(clip => clip.holder === index || clip.owner === index)
        .every(clip => clip.sharedPin === undefined));
    for (const clip of this.clips.filter(clip => clip.holder === opening || clip.owner === opening)) {
      clip.paired = clip.pinned = false;
      clip.turnDirection = undefined;
    }
  }

  private addClip(holder: number, owner: number, pattern: number): void {
    const from = this.rings[holder], to = this.rings[owner];
    const angle = wrap(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI);
    const variant = (holder * 3 + owner + pattern) % 7;
    const difficulty = this.dish.difficulty;
    this.clips.push({holder, owner, angle, attached: true,
      paired: difficulty > 1 && variant < difficulty - 1,
      pinned: difficulty > 1 && (variant === 4 || difficulty === 3 && (variant === 0 || variant === 6)),
      pinShape: variant === 4 ? 'elbow' : variant === 6 ? 'u' : 'straight',
      turnDirection: difficulty > 1 && variant === 2 ? (holder % 2 === 0 ? 1 : -1) : undefined});
  }
}
