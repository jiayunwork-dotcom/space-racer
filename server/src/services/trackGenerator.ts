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

const BASE_CIRCUMFERENCE = 3000;
const MIN_CONTROL_POINTS = 8;
const MAX_CONTROL_POINTS = 20;
const SAMPLE_COUNT = 200;
const MAX_RETRIES = 3;

function getCurvatureRadiusRange(difficulty: number): { min: number; max: number } {
  const maxRadius = 200 + (5 - difficulty) * 35;
  const minRadius = 60 + (5 - difficulty) * 35;
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
  const { min: minRadius } = getCurvatureRadiusRange(difficulty);
  const maxOffset = Math.min(baseRadius * 0.4, baseRadius - minRadius);

  const points: Vector2[] = [];

  for (let i = 0; i < cpCount; i++) {
    const angle = (i / cpCount) * Math.PI * 2 - Math.PI / 2;
    const wobbleAmount = rng.range(-maxOffset, maxOffset) * (difficulty / 5);
    const r = baseRadius + wobbleAmount;

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
    if (i === n - 1) {
      controlPoints.push(next);
    }
  }

  return controlPoints;
}

function calculateControlPoint(p0: Vector2, p1: Vector2, p2: Vector2, isStart: boolean): Vector2 {
  const scale = 0.4;

  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;

  if (isStart) {
    return vec2(
      p1.x - dx * scale * 0.5,
      p1.y - dy * scale * 0.5
    );
  } else {
    return vec2(
      p1.x + dx * scale * 0.5,
      p1.y + dy * scale * 0.5
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
  const curveCount = (n - 1) / 3;

  for (let i = 0; i < curveCount; i++) {
    const startIdx = i * 3;
    const curvePoints = [
      controlPoints[startIdx],
      controlPoints[startIdx + 1],
      controlPoints[startIdx + 2],
      controlPoints[startIdx + 3]
    ];

    const segsPerCurve = Math.ceil(segments / curveCount);
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
  const innerKnots: Vector2[] = [];

  const n = outerControlPoints.length;
  const curveCount = (n - 1) / 3;

  for (let i = 0; i < curveCount; i++) {
    const t = (i + 0.5) / curveCount;
    const sampleIdx = Math.floor(t * samples.length) % samples.length;
    const sample = samples[sampleIdx];
    const inwardNormal = vec2(-sample.normal.x, -sample.normal.y);
    innerKnots.push(vecAdd(sample.point, vecMul(inwardNormal, trackWidth / 2)));
  }

  return createBezierControlPoints(innerKnots);
}

function validateTrack(
  outerControlPoints: Vector2[],
  innerControlPoints: Vector2[],
  trackWidth: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const outerSamples = sampleClosedBezier(outerControlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(innerControlPoints, SAMPLE_COUNT);

  const minWidth = trackWidth * 0.9;
  const maxWidth = trackWidth * 1.1;

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

  if (checkSelfIntersection(outerSamples)) {
    issues.push('Outer boundary self-intersects');
  }

  if (checkSelfIntersection(innerSamples)) {
    issues.push('Inner boundary self-intersects');
  }

  if (checkBoundaryIntersection(outerSamples, innerSamples)) {
    issues.push('Inner and outer boundaries intersect');
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
