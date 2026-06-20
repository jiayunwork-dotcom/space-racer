import type { Track, TrackBoundary, Vector2, EnvElement, Checkpoint, ItemSpawner } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { vec2, vecAdd, vecSub, vecMul, vecNormalize, vecDistance, vecLength, vecRotate } from '../utils/vector';

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export interface TrackGenParams {
  difficulty: number;
  lengthFactor: number;
  trackWidth: number;
  seed: number;
}

export interface TrackScore {
  total: number;
  curvatureRichness: number;
  straightCurveRatio: number;
  checkpointUniformity: number;
}

const CURVATURE_THRESHOLD = 1 / 200;

const BASE_CIRCUMFERENCE = 3000;
const MIN_CONTROL_POINTS = 8;
const MAX_CONTROL_POINTS = 20;
const SAMPLE_COUNT = 200;
const MAX_RETRIES = 10;

function getCurvatureRadiusRange(difficulty: number, trackWidth: number): { min: number; max: number } {
  const maxRadius = 200 + (5 - difficulty) * 35;
  const baseMin = 60 + (5 - difficulty) * 35;
  const minRadius = Math.max(trackWidth * 1.5, baseMin);
  return { min: minRadius, max: maxRadius };
}

function getObstacleFillRate(difficulty: number): number {
  if (difficulty < 2) return 0;
  return ((difficulty - 1) / 4) * 0.15;
}

function getControlPointCount(lengthFactor: number): number {
  const count = Math.round(MIN_CONTROL_POINTS + (lengthFactor - 0.5) / 1.5 * (MAX_CONTROL_POINTS - MIN_CONTROL_POINTS));
  return Math.max(MIN_CONTROL_POINTS, Math.min(MAX_CONTROL_POINTS, count));
}

function getAsteroidCount(difficulty: number): number {
  if (difficulty < 3) return 0;
  return (difficulty - 2) * 4;
}

function generateOuterControlPoints(
  rng: SeededRandom,
  params: TrackGenParams,
  center: Vector2
): Vector2[] {
  const { difficulty, lengthFactor } = params;
  const cpCount = getControlPointCount(lengthFactor);
  const baseRadius = (BASE_CIRCUMFERENCE * lengthFactor) / (2 * Math.PI);
  const { min: minRadius } = getCurvatureRadiusRange(difficulty, params.trackWidth);
  const maxOffset = Math.min(baseRadius * 0.4, baseRadius - minRadius);

  const points: Vector2[] = [];
  const rawWobbles: number[] = [];

  for (let i = 0; i < cpCount; i++) {
    const wobbleAmount = rng.range(-maxOffset, maxOffset) * (difficulty / 5);
    rawWobbles.push(wobbleAmount);
  }

  const smoothedWobbles: number[] = [];
  for (let i = 0; i < cpCount; i++) {
    const prev = rawWobbles[(i - 1 + cpCount) % cpCount];
    const curr = rawWobbles[i];
    const next = rawWobbles[(i + 1) % cpCount];
    smoothedWobbles.push(prev * 0.25 + curr * 0.5 + next * 0.25);
  }

  for (let i = 0; i < cpCount; i++) {
    const angle = (i / cpCount) * Math.PI * 2 - Math.PI / 2;
    const r = baseRadius + smoothedWobbles[i];

    points.push(vec2(
      center.x + Math.cos(angle) * r,
      center.y + Math.sin(angle) * r
    ));
  }

  return points;
}

function createBezierControlPoints(knotPoints: Vector2[]): Vector2[] {
  const n = knotPoints.length;
  const controlPoints: Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = knotPoints[(i - 1 + n) % n];
    const curr = knotPoints[i];
    const next = knotPoints[(i + 1) % n];
    const nextNext = knotPoints[(i + 2) % n];

    const cp1 = calculateControlPoint(prev, curr, next, true);
    const cp2 = calculateControlPoint(curr, next, nextNext, false);

    if (i === 0) {
      controlPoints.push(curr);
    }
    controlPoints.push(cp1);
    controlPoints.push(cp2);
    controlPoints.push(next);
  }

  return controlPoints;
}

function calculateControlPoint(p0: Vector2, p1: Vector2, p2: Vector2, isStart: boolean): Vector2 {
  const scale = 0.4;

  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;

  if (isStart) {
    return vec2(
      p1.x + dx * scale * 0.5,
      p1.y + dy * scale * 0.5
    );
  } else {
    return vec2(
      p1.x - dx * scale * 0.5,
      p1.y - dy * scale * 0.5
    );
  }
}

function bezierPoint(points: Vector2[], t: number): Vector2 {
  if (points.length === 1) return { ...points[0] };

  const newPoints: Vector2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPoints.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t
    });
  }

  return bezierPoint(newPoints, t);
}

function bezierTangent(points: Vector2[], t: number): Vector2 {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  const derivativePoints: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y)
    });
  }

  return bezierPoint(derivativePoints, t);
}

function bezierNormal(points: Vector2[], t: number): Vector2 {
  const tangent = bezierTangent(points, t);
  const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -tangent.y / len, y: tangent.x / len };
}

function sampleClosedBezier(controlPoints: Vector2[], segments: number): { point: Vector2; tangent: Vector2; normal: Vector2; t: number }[] {
  const samples: { point: Vector2; tangent: Vector2; normal: Vector2; t: number }[] = [];

  const n = controlPoints.length;
  const curveCount = Math.floor((n - 1) / 3);

  if (curveCount < 1 || n < 4) {
    return samples;
  }

  for (let i = 0; i < curveCount; i++) {
    const startIdx = i * 3;
    if (startIdx + 3 >= n) {
      break;
    }
    const curvePoints = [
      controlPoints[startIdx],
      controlPoints[startIdx + 1],
      controlPoints[startIdx + 2],
      controlPoints[startIdx + 3]
    ];

    const segsPerCurve = Math.max(1, Math.ceil(segments / curveCount));
    for (let j = 0; j < segsPerCurve; j++) {
      const t = j / segsPerCurve;
      samples.push({
        point: bezierPoint(curvePoints, t),
        tangent: bezierTangent(curvePoints, t),
        normal: bezierNormal(curvePoints, t),
        t: (i + t) / curveCount
      });
    }
  }

  return samples;
}

function closedCurveLength(samples: { point: Vector2 }[]): number {
  if (samples.length === 0) return 0;
  let length = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    length += vecDistance(samples[i].point, samples[i + 1].point);
  }
  length += vecDistance(samples[samples.length - 1].point, samples[0].point);
  return length;
}

function generateInnerBoundary(
  outerSamples: { point: Vector2; normal: Vector2 }[],
  trackWidth: number
): { controlPoints: Vector2[]; samples: { point: Vector2; normal: Vector2 }[] } {
  const innerPoints: Vector2[] = outerSamples.map(s => {
    const inwardNormal = vec2(-s.normal.x, -s.normal.y);
    return vecAdd(s.point, vecMul(inwardNormal, trackWidth / 2));
  });

  return {
    controlPoints: innerPoints,
    samples: innerPoints.map(p => ({ point: p, normal: vec2(0, 0) }))
  };
}

function generateInnerBoundaryFromOuter(
  outerControlPoints: Vector2[],
  trackWidth: number
): Vector2[] {
  const samples = sampleClosedBezier(outerControlPoints, SAMPLE_COUNT);
  if (samples.length === 0) return [];

  const offsetPoints: { point: Vector2; tangent: Vector2 }[] = [];
  for (const s of samples) {
    const inward = vec2(-s.normal.x, -s.normal.y);
    offsetPoints.push({
      point: vecAdd(s.point, vecMul(inward, trackWidth)),
      tangent: s.tangent
    });
  }

  const n = offsetPoints.length;
  const segmentCount = Math.max(12, Math.floor(n / 5));
  const step = Math.max(1, Math.floor(n / segmentCount));

  const controlPoints: Vector2[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const currIdx = (i * step) % n;
    const nextIdx = ((i + 1) * step) % n;
    const curr = offsetPoints[currIdx];
    const next = offsetPoints[nextIdx];

    const d = vecDistance(curr.point, next.point);
    const tangentLen = d / 3;

    const currTangent = vecNormalize(curr.tangent);
    const nextTangent = vecNormalize(next.tangent);
    const currTLen = vecLength(curr.tangent);
    const nextTLen = vecLength(next.tangent);

    const cp1 = vecAdd(curr.point, vecMul(currTLen > 0 ? currTangent : vec2(1, 0), tangentLen));
    const cp2 = vecSub(next.point, vecMul(nextTLen > 0 ? nextTangent : vec2(1, 0), tangentLen));

    if (i === 0) controlPoints.push(curr.point);
    controlPoints.push(cp1);
    controlPoints.push(cp2);
    controlPoints.push(next.point);
  }

  if (controlPoints.length < 4) return [];

  return controlPoints;
}

function validateTrack(
  outerControlPoints: Vector2[],
  innerControlPoints: Vector2[],
  trackWidth: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const outerSamples = sampleClosedBezier(outerControlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(innerControlPoints, SAMPLE_COUNT);

  const minWidth = trackWidth * 0.75;
  const maxWidth = trackWidth * 1.35;

  for (let i = 0; i < outerSamples.length; i++) {
    const outerPt = outerSamples[i].point;
    const outerNormal = outerSamples[i].normal;
    const inwardDir = vec2(-outerNormal.x, -outerNormal.y);

    let minDist = Infinity;
    let closestInnerPt: Vector2 | null = null;

    for (let j = 0; j < innerSamples.length; j++) {
      const innerPt = innerSamples[j].point;
      const dist = vecDistance(outerPt, innerPt);
      if (dist < minDist) {
        minDist = dist;
        closestInnerPt = innerPt;
      }
    }

    if (closestInnerPt) {
      const toInner = vecSub(closestInnerPt, outerPt);
      const dot = (toInner.x * inwardDir.x + toInner.y * inwardDir.y);
      if (dot > 0) {
        const normalDist = Math.abs(dot);
        if (normalDist < minWidth || normalDist > maxWidth) {
          issues.push(`Width out of range at sample ${i}: ${normalDist.toFixed(1)}px (expected ${trackWidth}px)`);
        }
      }
    }
  }

  const outerSelfIntersects = checkSelfIntersection(outerSamples);
  const innerSelfIntersects = checkSelfIntersection(innerSamples);
  const boundariesIntersect = checkBoundaryIntersection(outerSamples, innerSamples);

  if (outerSelfIntersects) {
    issues.push('Outer boundary self-intersects');
  }

  if (boundariesIntersect) {
    issues.push('Inner and outer boundaries intersect');
  }

  if (innerSelfIntersects && boundariesIntersect) {
    issues.push('Inner boundary self-intersects and crosses outer boundary');
  }

  return { valid: issues.length === 0, issues };
}

function checkSelfIntersection(samples: { point: Vector2 }[]): boolean {
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const p1 = samples[i].point;
    const p2 = samples[(i + 1) % n].point;

    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;

      const p3 = samples[j].point;
      const p4 = samples[(j + 1) % n].point;

      if (lineSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

function checkBoundaryIntersection(
  outerSamples: { point: Vector2 }[],
  innerSamples: { point: Vector2 }[]
): boolean {
  for (let i = 0; i < outerSamples.length - 1; i++) {
    const p1 = outerSamples[i].point;
    const p2 = outerSamples[i + 1].point;

    for (let j = 0; j < innerSamples.length - 1; j++) {
      const p3 = innerSamples[j].point;
      const p4 = innerSamples[j + 1].point;

      if (lineSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

function lineSegmentsIntersect(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function direction(p1: Vector2, p2: Vector2, p3: Vector2): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

function isPointInsideClosedCurve(point: Vector2, samples: { point: Vector2 }[]): boolean {
  let crossings = 0;

  for (let i = 0; i < samples.length; i++) {
    const p1 = samples[i].point;
    const p2 = samples[(i + 1) % samples.length].point;

    if (((p1.y <= point.y && p2.y > point.y) ||
         (p1.y > point.y && p2.y <= point.y))) {
      const t = (point.y - p1.y) / (p2.y - p1.y);
      const xIntersect = p1.x + t * (p2.x - p1.x);
      if (point.x < xIntersect) {
        crossings++;
      }
    }
  }

  return crossings % 2 === 1;
}

function pointToCurveDistance(point: Vector2, samples: { point: Vector2 }[]): { distance: number; closestPoint: Vector2; index: number } {
  let minDist = Infinity;
  let closestPoint = vec2();
  let closestIndex = 0;

  for (let i = 0; i < samples.length; i++) {
    const dist = vecDistance(point, samples[i].point);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = samples[i].point;
      closestIndex = i;
    }
  }

  return { distance: minDist, closestPoint, index: closestIndex };
}

function getCenterlineSamples(
  outerSamples: { point: Vector2; normal: Vector2 }[],
  innerSamples: { point: Vector2; normal: Vector2 }[],
  trackWidth: number
): { point: Vector2; tangent: Vector2; normal: Vector2 }[] {
  const centerline: { point: Vector2; tangent: Vector2; normal: Vector2 }[] = [];

  for (let i = 0; i < outerSamples.length; i++) {
    const outerPt = outerSamples[i].point;
    const outerNormal = outerSamples[i].normal;
    const inwardNormal = vec2(-outerNormal.x, -outerNormal.y);

    const centerPt = vecAdd(outerPt, vecMul(inwardNormal, trackWidth / 2));

    const nextIdx = (i + 1) % outerSamples.length;
    const nextCenterPt = vecAdd(outerSamples[nextIdx].point, vecMul(vec2(-outerSamples[nextIdx].normal.x, -outerSamples[nextIdx].normal.y), trackWidth / 2));

    const tangent = vecNormalize(vecSub(nextCenterPt, centerPt));
    const normal = vec2(-tangent.y, tangent.x);

    centerline.push({ point: centerPt, tangent, normal });
  }

  return centerline;
}

function generateCheckpoints(
  centerline: { point: Vector2; tangent: Vector2; normal: Vector2 }[],
  controlPointCount: number
): Checkpoint[] {
  const checkpointCount = Math.max(4, Math.floor(controlPointCount / 2));
  const checkpoints: Checkpoint[] = [];

  const totalLength = closedCurveLength(centerline);
  const spacing = totalLength / checkpointCount;

  let accumulatedDist = 0;
  let lastPoint = centerline[0].point;
  let checkpointIdx = 0;

  for (let i = 0; i < centerline.length && checkpointIdx < checkpointCount; i++) {
    const current = centerline[i];
    const dist = vecDistance(lastPoint, current.point);
    accumulatedDist += dist;

    const targetDist = (checkpointIdx + 0.5) * spacing;

    if (accumulatedDist >= targetDist) {
      const direction = Math.atan2(current.tangent.y, current.tangent.x);
      checkpoints.push({
        id: uuidv4(),
        position: { ...current.point },
        direction,
        index: checkpointIdx
      });
      checkpointIdx++;
    }

    lastPoint = current.point;
  }

  return checkpoints;
}

function generateItemSpawners(
  centerline: { point: Vector2; tangent: Vector2; normal: Vector2 }[],
  difficulty: number,
  rng: SeededRandom,
  checkpoints: Checkpoint[]
): ItemSpawner[] {
  const spawnerCount = difficulty * 3;
  const spawners: ItemSpawner[] = [];

  const totalLength = closedCurveLength(centerline);
  const minSpacing = totalLength * 0.1;

  const usedPositions: number[] = [];

  let attempts = 0;
  const maxAttempts = spawnerCount * 20;

  while (spawners.length < spawnerCount && attempts < maxAttempts) {
    attempts++;

    const idx = rng.int(0, centerline.length - 1);
    const point = centerline[idx];
    const distAlongPath = (idx / centerline.length) * totalLength;

    let tooClose = false;
    for (const used of usedPositions) {
      const diff = Math.abs(distAlongPath - used);
      const wrappedDiff = totalLength - diff;
      if (Math.min(diff, wrappedDiff) < minSpacing) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) continue;

    for (const cp of checkpoints) {
      if (vecDistance(cp.position, point.point) < 50) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) continue;

    const offsetDir = rng.next() > 0.5 ? 1 : -1;
    const offsetAmount = rng.range(0, 0.3) * (totalLength / (2 * Math.PI) * 0.3);
    const offsetPos = vecAdd(point.point, vecMul(point.normal, offsetDir * offsetAmount));

    spawners.push({
      id: uuidv4(),
      position: offsetPos,
      lastSpawn: 0,
      currentItem: null,
      cooldown: 15
    });

    usedPositions.push(distAlongPath);
  }

  return spawners;
}

function generateAsteroids(
  centerline: { point: Vector2; tangent: Vector2; normal: Vector2 }[],
  outerSamples: { point: Vector2 }[],
  innerSamples: { point: Vector2 }[],
  trackWidth: number,
  difficulty: number,
  rng: SeededRandom,
  checkpoints: Checkpoint[],
  itemSpawners: ItemSpawner[]
): EnvElement[] {
  const asteroidCount = getAsteroidCount(difficulty);
  const asteroids: EnvElement[] = [];

  if (asteroidCount === 0) return asteroids;

  const minOffsetFromCenter = trackWidth * 0.3;
  const maxOffsetFromCenter = trackWidth * 0.4;

  let attempts = 0;
  const maxAttempts = asteroidCount * 50;

  while (asteroids.length < asteroidCount && attempts < maxAttempts) {
    attempts++;

    const idx = rng.int(0, centerline.length - 1);
    const point = centerline[idx];

    const offsetDir = rng.next() > 0.5 ? 1 : -1;
    const offsetAmount = rng.range(minOffsetFromCenter, maxOffsetFromCenter);
    const position = vecAdd(point.point, vecMul(point.normal, offsetDir * offsetAmount));

    const radius = rng.range(15, 30);

    let overlaps = false;

    for (const cp of checkpoints) {
      if (vecDistance(cp.position, position) < radius + 50) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      for (const spawner of itemSpawners) {
        if (vecDistance(spawner.position, position) < radius + 50) {
          overlaps = true;
          break;
        }
      }
    }

    if (!overlaps) {
      for (const ast of asteroids) {
        if (vecDistance(ast.position, position) < ast.radius + radius + 20) {
          overlaps = true;
          break;
        }
      }
    }

    if (!overlaps) {
      asteroids.push({
        id: uuidv4(),
        type: 'asteroid',
        position,
        radius
      });
    }
  }

  return asteroids;
}

function scaleToTargetLength(
  controlPoints: Vector2[],
  targetLength: number
): { points: Vector2[]; actualLength: number } {
  const samples = sampleClosedBezier(controlPoints, SAMPLE_COUNT);
  const currentLength = closedCurveLength(samples);
  const scale = targetLength / currentLength;

  let cx = 0, cy = 0;
  for (const p of controlPoints) {
    cx += p.x;
    cy += p.y;
  }
  cx /= controlPoints.length;
  cy /= controlPoints.length;
  const center = vec2(cx, cy);

  const scaledPoints = controlPoints.map(p => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return vec2(center.x + dx * scale, center.y + dy * scale);
  });

  const newSamples = sampleClosedBezier(scaledPoints, SAMPLE_COUNT);
  const newLength = closedCurveLength(newSamples);

  return { points: scaledPoints, actualLength: newLength };
}

function adjustProblemPoints(
  knotPoints: Vector2[],
  issues: string[],
  rng: SeededRandom
): Vector2[] {
  const adjusted = [...knotPoints];

  for (let i = 0; i < adjusted.length; i++) {
    if (rng.next() < 0.3) {
      const adjustment = rng.range(-20, 20);
      const angle = rng.range(0, Math.PI * 2);
      adjusted[i] = vecAdd(adjusted[i], vec2(
        Math.cos(angle) * adjustment,
        Math.sin(angle) * adjustment
      ));
    }
  }

  return adjusted;
}

export function generateTrack(params: TrackGenParams): Track | null {
  const { difficulty, lengthFactor, trackWidth, seed } = params;

  if (difficulty < 1 || difficulty > 5) return null;
  if (lengthFactor < 0.5 || lengthFactor > 2.0) return null;
  if (trackWidth < 80 || trackWidth > 200) return null;

  const rng = new SeededRandom(seed);
  const targetCircumference = BASE_CIRCUMFERENCE * lengthFactor;
  const center = vec2(800, 600);

  let bestTrack: Track | null = null;
  let bestError = Infinity;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const knotPoints = generateOuterControlPoints(rng, params, center);
      let outerControlPoints = createBezierControlPoints(knotPoints);

      const { points: scaledOuter, actualLength } = scaleToTargetLength(outerControlPoints, targetCircumference);
      outerControlPoints = scaledOuter;

      const lengthError = Math.abs(actualLength - targetCircumference) / targetCircumference;
      if (lengthError > 0.08) {
        continue;
      }

      const innerControlPoints = generateInnerBoundaryFromOuter(outerControlPoints, trackWidth);

      if (innerControlPoints.length === 0) {
        continue;
      }

      const validation = validateTrack(outerControlPoints, innerControlPoints, trackWidth);

      if (!validation.valid) {
        if (attempt < MAX_RETRIES - 1) {
          const adjustedKnots = adjustProblemPoints(knotPoints, validation.issues, rng);
          const newOuter = createBezierControlPoints(adjustedKnots);
          const scaled = scaleToTargetLength(newOuter, targetCircumference);
          const newInner = generateInnerBoundaryFromOuter(scaled.points, trackWidth);
          const newValidation = validateTrack(scaled.points, newInner, trackWidth);

          if (newValidation.valid) {
            outerControlPoints = scaled.points;
          } else {
            continue;
          }
        } else {
          continue;
        }
      }

      const outerSamples = sampleClosedBezier(outerControlPoints, SAMPLE_COUNT);
      const innerSamples = sampleClosedBezier(innerControlPoints, SAMPLE_COUNT);
      const centerline = getCenterlineSamples(outerSamples, innerSamples, trackWidth);

      const cpCount = knotPoints.length;
      const checkpoints = generateCheckpoints(centerline, cpCount);
      const itemSpawners = generateItemSpawners(centerline, difficulty, rng, checkpoints);
      const asteroids = generateAsteroids(centerline, outerSamples, innerSamples, trackWidth, difficulty, rng, checkpoints, itemSpawners);

      const envElements: EnvElement[] = [...asteroids];

      const seedStr = seed.toString();
      const seedSuffix = seedStr.slice(-4);
      const trackName = `随机赛道-${seedSuffix}`;

      if (checkpoints.length === 0) continue;
      const startCheckpoint = checkpoints[0];

      const track: Track = {
        id: uuidv4(),
        name: trackName,
        author: 'Procedural Generator',
        isBuiltIn: false,
        outerBoundary: { controlPoints: outerControlPoints },
        innerBoundary: { controlPoints: innerControlPoints },
        checkpoints,
        envElements,
        itemSpawners,
        startPosition: { ...startCheckpoint.position },
        startAngle: startCheckpoint.direction,
        playCount: 0,
        createdAt: Date.now()
      };

      const error = Math.abs(actualLength - targetCircumference);
      if (error < bestError) {
        bestError = error;
        bestTrack = track;
      }

      if (lengthError <= 0.05) {
        return track;
      }

    } catch (e) {
      console.error('Track generation error:', e);
      continue;
    }
  }

  return bestTrack;
}

function computeCurvatures(
  samples: { point: Vector2; tangent: Vector2 }[]
): number[] {
  const n = samples.length;
  if (n < 3) return new Array(n).fill(0);

  const curvatures: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n];
    const curr = samples[i];
    const next = samples[(i + 1) % n];

    const d1 = vecDistance(prev.point, curr.point);
    const d2 = vecDistance(curr.point, next.point);
    const arcLen = (d1 + d2) / 2;
    if (arcLen < 1e-6) {
      curvatures.push(0);
      continue;
    }

    const t1 = curr.tangent;
    const t2 = next.tangent;
    const len1 = Math.sqrt(t1.x * t1.x + t1.y * t1.y);
    const len2 = Math.sqrt(t2.x * t2.x + t2.y * t2.y);
    if (len1 < 1e-6 || len2 < 1e-6) {
      curvatures.push(0);
      continue;
    }

    const dot = (t1.x * t2.x + t1.y * t2.y) / (len1 * len2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleDiff = Math.acos(clampedDot);
    curvatures.push(Math.abs(angleDiff / arcLen));
  }
  return curvatures;
}

function computeArcLengths(
  samples: { point: Vector2 }[]
): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const next = samples[(i + 1) % samples.length];
    lengths.push(vecDistance(samples[i].point, next.point));
  }
  return lengths;
}

function scoreCurvatureRichness(curvatures: number[], arcLengths: number[]): number {
  const isCurve = curvatures.map(c => c > CURVATURE_THRESHOLD);

  let totalArcLen = 0;
  for (const l of arcLengths) totalArcLen += l;

  interface CurveSection {
    startIdx: number;
    endIdx: number;
    totalCurvature: number;
    totalWeight: number;
  }

  const sections: CurveSection[] = [];
  let currentSection: CurveSection | null = null;

  for (let i = 0; i < curvatures.length; i++) {
    if (isCurve[i]) {
      if (!currentSection) {
        currentSection = { startIdx: i, endIdx: i, totalCurvature: 0, totalWeight: 0 };
      }
      currentSection.endIdx = i;
      currentSection.totalCurvature += curvatures[i] * arcLengths[i];
      currentSection.totalWeight += arcLengths[i];
    } else {
      if (currentSection) {
        sections.push(currentSection);
        currentSection = null;
      }
    }
  }
  if (currentSection) {
    const lastSection = sections.length > 0 ? sections[sections.length - 1] : null;
    if (lastSection && lastSection.endIdx === curvatures.length - 1 && currentSection.startIdx === 0) {
      lastSection.endIdx = currentSection.endIdx;
      lastSection.totalCurvature += currentSection.totalCurvature;
      lastSection.totalWeight += currentSection.totalWeight;
    } else {
      sections.push(currentSection);
    }
  }

  if (sections.length < 2) return 10;

  const avgCurvatures = sections.map(s => s.totalWeight > 0 ? s.totalCurvature / s.totalWeight : 0);

  let totalDiff = 0;
  let diffCount = 0;
  for (let i = 0; i < avgCurvatures.length; i++) {
    const next = (i + 1) % avgCurvatures.length;
    totalDiff += Math.abs(avgCurvatures[i] - avgCurvatures[next]);
    diffCount++;
  }

  const avgDiff = totalDiff / diffCount;
  const score = Math.min(100, (avgDiff / 0.004) * 100);
  return Math.round(score * 100) / 100;
}

function scoreStraightCurveRatio(curvatures: number[], arcLengths: number[]): number {
  const isStraight = curvatures.map(c => c <= CURVATURE_THRESHOLD);

  let straightLen = 0;
  let totalLen = 0;
  for (let i = 0; i < arcLengths.length; i++) {
    totalLen += arcLengths[i];
    if (isStraight[i]) straightLen += arcLengths[i];
  }

  if (totalLen === 0) return 0;
  const ratio = straightLen / totalLen;

  if (ratio >= 0.3 && ratio <= 0.5) return 100;

  if (ratio < 0.3) {
    return Math.round((ratio / 0.3) * 100 * 100) / 100;
  }

  const excess = ratio - 0.5;
  const score = Math.max(0, 100 - (excess / 0.5) * 100);
  return Math.round(score * 100) / 100;
}

function scoreCheckpointUniformity(track: Track): number {
  const checkpoints = track.checkpoints;
  if (checkpoints.length < 2) return 50;

  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);

  if (outerSamples.length < 2 || innerSamples.length < 2) return 50;

  const centerline = getCenterlineSamples(
    outerSamples,
    innerSamples,
    estimateTrackWidth(outerSamples, innerSamples)
  );

  if (centerline.length < 2) return 50;

  const arcLens = computeArcLengths(centerline);
  const cumulativeArc: number[] = [0];
  for (let i = 0; i < arcLens.length; i++) {
    cumulativeArc.push(cumulativeArc[i] + arcLens[i]);
  }
  const totalArcLen = cumulativeArc[cumulativeArc.length - 1];

  const cpArcPositions: number[] = [];
  for (const cp of checkpoints) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centerline.length; i++) {
      const d = vecDistance(cp.position, centerline[i].point);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    cpArcPositions.push(cumulativeArc[bestIdx]);
  }

  cpArcPositions.sort((a, b) => a - b);

  const distances: number[] = [];
  for (let i = 0; i < cpArcPositions.length; i++) {
    const next = (i + 1) % cpArcPositions.length;
    let dist = cpArcPositions[next] - cpArcPositions[i];
    if (next === 0) dist = totalArcLen - cpArcPositions[i] + cpArcPositions[0];
    distances.push(dist);
  }

  if (distances.length === 0) return 50;

  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  if (mean === 0) return 50;

  const variance = distances.reduce((sum, d) => sum + (d - mean) ** 2, 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  const score = Math.max(0, 100 - cv * 200);
  return Math.round(score * 100) / 100;
}

function estimateTrackWidth(
  outerSamples: { point: Vector2 }[],
  innerSamples: { point: Vector2 }[]
): number {
  if (outerSamples.length === 0 || innerSamples.length === 0) return 120;

  let totalDist = 0;
  const sampleCount = Math.min(20, outerSamples.length);
  const step = Math.max(1, Math.floor(outerSamples.length / sampleCount));

  let count = 0;
  for (let i = 0; i < outerSamples.length; i += step) {
    let minDist = Infinity;
    for (let j = 0; j < innerSamples.length; j++) {
      const d = vecDistance(outerSamples[i].point, innerSamples[j].point);
      if (d < minDist) minDist = d;
    }
    totalDist += minDist;
    count++;
  }

  return count > 0 ? totalDist / count : 120;
}

export function calculateTrackScore(track: Track): TrackScore {
  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);

  if (outerSamples.length < 3) {
    return { total: 0, curvatureRichness: 0, straightCurveRatio: 0, checkpointUniformity: 0 };
  }

  const tw = estimateTrackWidth(outerSamples, innerSamples);
  const centerline = getCenterlineSamples(outerSamples, innerSamples, tw);

  if (centerline.length < 3) {
    return { total: 0, curvatureRichness: 0, straightCurveRatio: 0, checkpointUniformity: 0 };
  }

  const curvatures = computeCurvatures(centerline);
  const arcLengths = computeArcLengths(centerline);

  const curvatureRichness = scoreCurvatureRichness(curvatures, arcLengths);
  const straightCurveRatio = scoreStraightCurveRatio(curvatures, arcLengths);
  const checkpointUniformity = scoreCheckpointUniformity(track);

  const total = Math.round(
    curvatureRichness * 0.4 +
    straightCurveRatio * 0.3 +
    checkpointUniformity * 0.3
  );

  return {
    total,
    curvatureRichness: Math.round(curvatureRichness),
    straightCurveRatio: Math.round(straightCurveRatio),
    checkpointUniformity: Math.round(checkpointUniformity)
  };
}
