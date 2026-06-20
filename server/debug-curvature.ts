import { generateTrack } from './src/services/trackGenerator';

const SAMPLE_COUNT = 200;
const CURVATURE_THRESHOLD = 1 / 200;

function vecDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function vecSub(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vecAdd(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: a.x + b.x, y: a.y + b.y };
}

function vecMul(v: { x: number; y: number }, s: number): { x: number; y: number } {
  return { x: v.x * s, y: v.y * s };
}

function vecNormalize(v: { x: number; y: number }): { x: number; y: number } {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function bezierPoint(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (points.length === 1) return { ...points[0] };
  const newPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPoints.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t
    });
  }
  return bezierPoint(newPoints, t);
}

function bezierTangent(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  const derivativePoints: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y)
    });
  }
  return bezierPoint(derivativePoints, t);
}

function bezierNormal(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  const tangent = bezierTangent(points, t);
  const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -tangent.y / len, y: tangent.x / len };
}

function sampleClosedBezier(controlPoints: { x: number; y: number }[], segments: number) {
  const samples: { point: { x: number; y: number }; tangent: { x: number; y: number }; normal: { x: number; y: number } }[] = [];
  const n = controlPoints.length;
  const curveCount = Math.floor((n - 1) / 3);
  if (curveCount < 1 || n < 4) return samples;

  for (let i = 0; i < curveCount; i++) {
    const startIdx = i * 3;
    if (startIdx + 3 >= n) break;
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
        normal: bezierNormal(curvePoints, t)
      });
    }
  }
  return samples;
}

function computeCurvatures(samples: { point: { x: number; y: number }; tangent: { x: number; y: number } }[]): number[] {
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

function getCenterlineSamples(
  outerSamples: { point: { x: number; y: number }; normal: { x: number; y: number } }[],
  trackWidth: number
) {
  const centerline: { point: { x: number; y: number }; tangent: { x: number; y: number }; normal: { x: number; y: number } }[] = [];
  for (let i = 0; i < outerSamples.length; i++) {
    const outerPt = outerSamples[i].point;
    const outerNormal = outerSamples[i].normal;
    const inwardNormal = { x: -outerNormal.x, y: -outerNormal.y };
    const centerPt = vecAdd(outerPt, vecMul(inwardNormal, trackWidth / 2));

    const nextIdx = (i + 1) % outerSamples.length;
    const nextCenterPt = vecAdd(
      outerSamples[nextIdx].point,
      vecMul({ x: -outerSamples[nextIdx].normal.x, y: -outerSamples[nextIdx].normal.y }, trackWidth / 2)
    );

    const tangent = vecNormalize(vecSub(nextCenterPt, centerPt));
    const normal = { x: -tangent.y, y: tangent.x };
    centerline.push({ point: centerPt, tangent, normal });
  }
  return centerline;
}

function estimateTrackWidth(
  outerSamples: { point: { x: number; y: number } }[],
  innerSamples: { point: { x: number; y: number } }[]
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

function debugTrack(
  label: string,
  difficulty: number,
  lengthFactor: number,
  trackWidth: number,
  seed: number
) {
  console.log(`\n========== ${label} ==========`);
  console.log(`Params: diff=${difficulty}, len=${lengthFactor}, w=${trackWidth}, seed=${seed}`);

  const track = generateTrack({ difficulty, lengthFactor, trackWidth, seed });
  if (!track) {
    console.log('Failed to generate track');
    return;
  }

  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);

  console.log(`Outer samples: ${outerSamples.length}, Inner samples: ${innerSamples.length}`);

  const tw = estimateTrackWidth(outerSamples, innerSamples);
  console.log(`Estimated track width: ${tw.toFixed(2)} (expected: ${trackWidth})`);

  const centerline = getCenterlineSamples(outerSamples, tw);
  console.log(`Centerline samples: ${centerline.length}`);

  // Compute arc lengths
  let totalArcLen = 0;
  for (let i = 0; i < centerline.length; i++) {
    const next = centerline[(i + 1) % centerline.length];
    totalArcLen += vecDistance(centerline[i].point, next.point);
  }
  console.log(`Total arc length: ${totalArcLen.toFixed(2)}`);

  // Outer boundary curvature
  const outerCurvatures = computeCurvatures(outerSamples);
  const outerMin = Math.min(...outerCurvatures);
  const outerMax = Math.max(...outerCurvatures);
  const outerAvg = outerCurvatures.reduce((a, b) => a + b, 0) / outerCurvatures.length;
  console.log(`Outer boundary curvature: min=${outerMin.toFixed(6)}, max=${outerMax.toFixed(6)}, avg=${outerAvg.toFixed(6)}`);

  // Centerline curvature
  const curvatures = computeCurvatures(centerline);
  const minCurv = Math.min(...curvatures);
  const maxCurv = Math.max(...curvatures);
  const avgCurv = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;
  console.log(`Centerline curvature: min=${minCurv.toFixed(6)}, max=${maxCurv.toFixed(6)}, avg=${avgCurv.toFixed(6)}`);
  console.log(`Curvature threshold (1/200): ${CURVATURE_THRESHOLD.toFixed(6)}`);

  // Count curve vs straight
  let curveCount = 0;
  let straightCount = 0;
  let curveLen = 0;
  let straightLen = 0;
  for (let i = 0; i < curvatures.length; i++) {
    const next = (i + 1) % curvatures.length;
    const segLen = vecDistance(centerline[i].point, centerline[next].point);
    if (curvatures[i] > CURVATURE_THRESHOLD) {
      curveCount++;
      curveLen += segLen;
    } else {
      straightCount++;
      straightLen += segLen;
    }
  }
  console.log(`Curve segments: ${curveCount}/${curvatures.length} (arc length: ${curveLen.toFixed(1)})`);
  console.log(`Straight segments: ${straightCount}/${curvatures.length} (arc length: ${straightLen.toFixed(1)})`);
  console.log(`Straight ratio: ${(straightLen / totalArcLen * 100).toFixed(1)}%`);

  // Curve sections
  const isCurve = curvatures.map(c => c > CURVATURE_THRESHOLD);
  const sections: number[] = [];
  let inCurve = false;
  let sectionStart = 0;
  for (let i = 0; i < isCurve.length; i++) {
    if (isCurve[i] && !inCurve) {
      inCurve = true;
      sectionStart = i;
    } else if (!isCurve[i] && inCurve) {
      inCurve = false;
      sections.push(i - sectionStart);
    }
  }
  if (inCurve) {
    // Handle wrap-around
    if (isCurve[0]) {
      // Merge with first section if exists
      // For simplicity just add
      sections.push(isCurve.length - sectionStart);
    } else {
      sections.push(isCurve.length - sectionStart);
    }
  }
  console.log(`Curve sections: ${sections.length}, lengths: ${sections.map(s => s.toFixed(0)).join(', ')}`);

  // Print first 20 curvatures
  console.log('First 20 curvatures:');
  for (let i = 0; i < 20; i++) {
    console.log(`  [${i}] k=${curvatures[i].toFixed(6)} ${curvatures[i] > CURVATURE_THRESHOLD ? 'CURVE' : 'straight'}`);
  }
}

debugTrack('Test 1 (diff=3, seed=12345)', 3, 1.0, 120, 12345);
debugTrack('Test 2 (diff=5, seed=12345)', 5, 1.0, 120, 12345);
debugTrack('Test 3 (diff=3, seed=99999)', 3, 1.0, 120, 99999);
