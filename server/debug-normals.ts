import { generateTrack } from './src/services/trackGenerator';

const SAMPLE_COUNT = 200;

function vecDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function bezierPoint(points, t) {
  if (points.length === 1) return { ...points[0] };
  const newPoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPoints.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t
    });
  }
  return bezierPoint(newPoints, t);
}

function bezierTangent(points, t) {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y)
    });
  }
  return bezierPoint(derivativePoints, t);
}

function bezierNormal(points, t) {
  const tangent = bezierTangent(points, t);
  const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -tangent.y / len, y: tangent.x / len };
}

function sampleClosedBezier(controlPoints, segments) {
  const samples = [];
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

function debugNormals() {
  const track = generateTrack({ difficulty: 3, lengthFactor: 1.0, trackWidth: 120, seed: 12345 });
  if (!track) return;

  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);

  console.log('=== 赛道几何分析 ===');

  // 计算中心
  let cx = 0, cy = 0;
  for (const s of outerSamples) {
    cx += s.point.x;
    cy += s.point.y;
  }
  cx /= outerSamples.length;
  cy /= outerSamples.length;
  console.log(`Track center: (${cx.toFixed(1)}, ${cy.toFixed(1)})`);

  // 计算外边界平均半径
  let outerAvgR = 0;
  let outerMaxR = 0;
  let outerMinR = Infinity;
  for (const s of outerSamples) {
    const r = vecDistance(s.point, { x: cx, y: cy });
    outerAvgR += r;
    outerMaxR = Math.max(outerMaxR, r);
    outerMinR = Math.min(outerMinR, r);
  }
  outerAvgR /= outerSamples.length;
  console.log(`Outer boundary: avg R=${outerAvgR.toFixed(1)}, min=${outerMinR.toFixed(1)}, max=${outerMaxR.toFixed(1)}`);

  // 计算内边界平均半径
  let innerAvgR = 0;
  let innerMaxR = 0;
  let innerMinR = Infinity;
  for (const s of innerSamples) {
    const r = vecDistance(s.point, { x: cx, y: cy });
    innerAvgR += r;
    innerMaxR = Math.max(innerMaxR, r);
    innerMinR = Math.min(innerMinR, r);
  }
  innerAvgR /= innerSamples.length;
  console.log(`Inner boundary: avg R=${innerAvgR.toFixed(1)}, min=${innerMinR.toFixed(1)}, max=${innerMaxR.toFixed(1)}`);

  console.log(`\nTrack width (radial): ${(outerAvgR - innerAvgR).toFixed(1)} (expected: 120)`);

  // 检查法线方向
  console.log('\n=== 法线方向检查（前5个采样点） ===');
  for (let i = 0; i < 5; i++) {
    const s = outerSamples[i];
    const radialOutward = {
      x: (s.point.x - cx) / outerAvgR,
      y: (s.point.y - cy) / outerAvgR
    };
    const normal = {
      x: s.normal.x,
      y: s.normal.y
    };
    const dot = radialOutward.x * normal.x + radialOutward.y * normal.y;
    console.log(`Point ${i}: pos=(${s.point.x.toFixed(1)}, ${s.point.y.toFixed(1)})`);
    console.log(`  radial outward: (${radialOutward.x.toFixed(3)}, ${radialOutward.y.toFixed(3)})`);
    console.log(`  bezier normal: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`);
    console.log(`  dot product: ${dot.toFixed(3)} (1=same direction, -1=opposite)`);
  }

  // 测试沿法线方向偏移是否到达内边界
  console.log('\n=== 沿法线偏移测试 ===');
  const testIdx = 0;
  const outerPt = outerSamples[testIdx].point;
  const outerNormal = outerSamples[testIdx].normal;

  // 尝试沿负法线方向偏移 120
  const inwardNeg = { x: -outerNormal.x, y: -outerNormal.y };
  const testPtNeg = {
    x: outerPt.x + inwardNeg.x * 120,
    y: outerPt.y + inwardNeg.y * 120
  };
  const distNegToInner = Math.min(
    ...innerSamples.map(s => vecDistance(s.point, testPtNeg))
  );

  // 尝试沿法线方向偏移 120
  const testPtPos = {
    x: outerPt.x + outerNormal.x * 120,
    y: outerPt.y + outerNormal.y * 120
  };
  const distPosToInner = Math.min(
    ...innerSamples.map(s => vecDistance(s.point, testPtPos))
  );

  console.log(`Outer point ${testIdx}: (${outerPt.x.toFixed(1)}, ${outerPt.y.toFixed(1)})`);
  console.log(`Offset along -normal by 120: dist to inner = ${distNegToInner.toFixed(1)}`);
  console.log(`Offset along +normal by 120: dist to inner = ${distPosToInner.toFixed(1)}`);
  console.log(`Closer along -normal? ${distNegToInner < distPosToInner ? 'YES - normal points outward' : 'NO - normal points inward'}`);
}

debugNormals();
