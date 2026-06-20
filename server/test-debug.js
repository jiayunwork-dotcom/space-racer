const { generateTrack } = require('./dist/services/trackGenerator');

const params = { difficulty: 1, lengthFactor: 1.0, trackWidth: 100, seed: 12345 };

console.log('Testing with:', JSON.stringify(params));

const SeededRandom = require('./dist/services/trackGenerator').SeededRandom;
console.log('SeededRandom available:', !!SeededRandom);

const { vec2, vecAdd, vecSub, vecMul, vecNormalize, vecDistance, vecLength, vecRotate } = require('./dist/utils/vector');

const BASE_CIRCUMFERENCE = 3000;
const SAMPLE_COUNT = 200;

class TestRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number { this.seed = (this.seed * 9301 + 49297) % 233280; return this.seed / 233280; }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
}

const rng = new TestRNG(12345);
const center = vec2(800, 600);

function getControlPointCount(lengthFactor: number): number {
  const count = Math.round(8 + (lengthFactor - 0.5) / 1.5 * (20 - 8));
  return Math.max(8, Math.min(20, count));
}

const cpCount = getControlPointCount(params.lengthFactor);
const baseRadius = (BASE_CIRCUMFERENCE * params.lengthFactor) / (2 * Math.PI);
console.log('cpCount:', cpCount, 'baseRadius:', baseRadius.toFixed(1));

const maxOffset = Math.min(baseRadius * 0.4, baseRadius - 200);
console.log('maxOffset:', maxOffset.toFixed(1));

const knotPoints = [];
for (let i = 0; i < cpCount; i++) {
  const angle = (i / cpCount) * Math.PI * 2 - Math.PI / 2;
  const wobbleAmount = rng.range(-maxOffset, maxOffset) * (1 / 5);
  const r = baseRadius + wobbleAmount;
  knotPoints.push(vec2(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r));
}

console.log('knotPoints:', knotPoints.length);

function calculateControlPoint(p0, p1, p2, isStart) {
  const scale = 0.4;
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  if (isStart) return vec2(p1.x - dx * scale * 0.5, p1.y - dy * scale * 0.5);
  else return vec2(p1.x + dx * scale * 0.5, p1.y + dy * scale * 0.5);
}

const controlPoints = [];
const n = knotPoints.length;
for (let i = 0; i < n; i++) {
  const prev = knotPoints[(i - 1 + n) % n];
  const curr = knotPoints[i];
  const next = knotPoints[(i + 1) % n];
  const nextNext = knotPoints[(i + 2) % n];
  const cp1 = calculateControlPoint(prev, curr, next, true);
  const cp2 = calculateControlPoint(curr, next, nextNext, false);
  if (i === 0) controlPoints.push(curr);
  controlPoints.push(cp1);
  controlPoints.push(cp2);
  controlPoints.push(next);
}
console.log('outerControlPoints:', controlPoints.length, '(expected:', 1 + 3 * n, ')');

function bezierPoint(points, t) {
  if (points.length === 1) return { ...points[0] };
  const newPoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPoints.push({ x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t });
  }
  return bezierPoint(newPoints, t);
}

function bezierTangent(points, t) {
  const np = points.length - 1;
  if (np < 1) return { x: 0, y: 0 };
  const derivativePoints = [];
  for (let i = 0; i < np; i++) {
    derivativePoints.push({ x: np * (points[i + 1].x - points[i].x), y: np * (points[i + 1].y - points[i].y) });
  }
  return bezierPoint(derivativePoints, t);
}

function bezierNormal(points, t) {
  const tangent = bezierTangent(points, t);
  const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -tangent.y / len, y: tangent.x / len };
}

const cpn = controlPoints.length;
const curveCount = Math.floor((cpn - 1) / 3);
console.log('curveCount:', curveCount);

const samples = [];
for (let i = 0; i < curveCount; i++) {
  const startIdx = i * 3;
  if (startIdx + 3 >= cpn) break;
  const curvePoints = [controlPoints[startIdx], controlPoints[startIdx + 1], controlPoints[startIdx + 2], controlPoints[startIdx + 3]];
  const segsPerCurve = Math.max(1, Math.ceil(SAMPLE_COUNT / curveCount));
  for (let j = 0; j < segsPerCurve; j++) {
    const t = j / segsPerCurve;
    samples.push({ point: bezierPoint(curvePoints, t), tangent: bezierTangent(curvePoints, t), normal: bezierNormal(curvePoints, t) });
  }
}
console.log('samples:', samples.length);

let totalLen = 0;
for (let i = 0; i < samples.length - 1; i++) totalLen += vecDistance(samples[i].point, samples[i + 1].point);
totalLen += vecDistance(samples[samples.length - 1].point, samples[0].point);
console.log('outer boundary length:', totalLen.toFixed(1), 'target:', (BASE_CIRCUMFERENCE * params.lengthFactor).toFixed(1));

const innerKnots = [];
for (let i = 0; i < curveCount; i++) {
  const t = (i + 0.5) / curveCount;
  const sampleIdx = Math.floor(t * samples.length) % samples.length;
  const sample = samples[sampleIdx];
  const inwardNormal = vec2(-sample.normal.x, -sample.normal.y);
  innerKnots.push(vecAdd(sample.point, vecMul(inwardNormal, params.trackWidth)));
}
console.log('innerKnots:', innerKnots.length);

const innerControlPoints = [];
const inn = innerKnots.length;
for (let i = 0; i < inn; i++) {
  const prev = innerKnots[(i - 1 + inn) % inn];
  const curr = innerKnots[i];
  const next = innerKnots[(i + 1) % inn];
  const nextNext = innerKnots[(i + 2) % inn];
  const cp1 = calculateControlPoint(prev, curr, next, true);
  const cp2 = calculateControlPoint(curr, next, nextNext, false);
  if (i === 0) innerControlPoints.push(curr);
  innerControlPoints.push(cp1);
  innerControlPoints.push(cp2);
  innerControlPoints.push(next);
}
console.log('innerControlPoints:', innerControlPoints.length);

const innerCurveCount = Math.floor((innerControlPoints.length - 1) / 3);
const innerSamples = [];
for (let i = 0; i < innerCurveCount; i++) {
  const startIdx = i * 3;
  if (startIdx + 3 >= innerControlPoints.length) break;
  const curvePoints = [innerControlPoints[startIdx], innerControlPoints[startIdx + 1], innerControlPoints[startIdx + 2], innerControlPoints[startIdx + 3]];
  const segsPerCurve = Math.max(1, Math.ceil(SAMPLE_COUNT / innerCurveCount));
  for (let j = 0; j < segsPerCurve; j++) {
    const t = j / segsPerCurve;
    innerSamples.push({ point: bezierPoint(curvePoints, t), normal: bezierNormal(curvePoints, t) });
  }
}
console.log('innerSamples:', innerSamples.length);

let widthIssues = 0;
const minWidth = params.trackWidth * 0.9;
const maxWidth = params.trackWidth * 1.1;
for (let i = 0; i < Math.min(samples.length, 20); i++) {
  const outerPt = samples[i].point;
  const outerNormal = samples[i].normal;
  const inwardDir = vec2(-outerNormal.x, -outerNormal.y);
  let minDist = Infinity;
  let closestInnerPt = null;
  for (let j = 0; j < innerSamples.length; j++) {
    const dist = vecDistance(outerPt, innerSamples[j].point);
    if (dist < minDist) { minDist = dist; closestInnerPt = innerSamples[j].point; }
  }
  if (closestInnerPt) {
    const toInner = vecSub(closestInnerPt, outerPt);
    const dot = toInner.x * inwardDir.x + toInner.y * inwardDir.y;
    if (dot > 0) {
      const normalDist = Math.abs(dot);
      if (normalDist < minWidth || normalDist > maxWidth) widthIssues++;
      if (i < 3) console.log(`  sample ${i}: normalDist=${normalDist.toFixed(1)}, expected range [${minWidth.toFixed(1)}, ${maxWidth.toFixed(1)}]`);
    }
  }
}
console.log('width issues (first 20 samples):', widthIssues);

console.log('\nNow running full generateTrack...');
const track = generateTrack(params);
console.log('Result:', track ? `OK - "${track.name}"` : 'NULL');
