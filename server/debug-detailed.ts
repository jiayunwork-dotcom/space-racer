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
        tangent: bezierTangent(curvePoints, t)
      });
    }
  }
  return samples;
}

// 三点外接圆法计算曲率
function curvature3Point(p0, p1, p2) {
  const ax = p0.x, ay = p0.y;
  const bx = p1.x, by = p1.y;
  const cx = p2.x, cy = p2.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) return 0;

  const ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx*cx + cy*cy) * (ay - by)) / d;
  const uy = ((ax*ax + ay*ay) * (cx - bx) + (bx*bx + by*by) * (ax - cx) + (cx*cx + cy*cy) * (bx - ax)) / d;

  const r = Math.sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));
  if (r < 1e-6) return Infinity;

  return 1 / r;
}

// 切向量角度差法（当前方法）
function curvatureTangentMethod(samples) {
  const n = samples.length;
  const curvatures = [];
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

function debugDetailed() {
  const track = generateTrack({ difficulty: 5, lengthFactor: 1.0, trackWidth: 120, seed: 12345 });
  if (!track) return;

  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  console.log(`Outer samples: ${outerSamples.length}`);

  // 两种方法计算外边界曲率
  const kTangent = curvatureTangentMethod(outerSamples);
  const k3Point = [];
  for (let i = 0; i < outerSamples.length; i++) {
    const p0 = outerSamples[(i - 1 + outerSamples.length) % outerSamples.length].point;
    const p1 = outerSamples[i].point;
    const p2 = outerSamples[(i + 1) % outerSamples.length].point;
    k3Point.push(curvature3Point(p0, p1, p2));
  }

  console.log('\n=== 外边界曲率对比 ===');
  console.log(`Tangent method: min=${Math.min(...kTangent).toFixed(6)}, max=${Math.max(...kTangent).toFixed(6)}, avg=${(kTangent.reduce((a,b)=>a+b,0)/kTangent.length).toFixed(6)}`);
  console.log(`3-point method:  min=${Math.min(...k3Point).toFixed(6)}, max=${Math.max(...k3Point).toFixed(6)}, avg=${(k3Point.reduce((a,b)=>a+b,0)/k3Point.length).toFixed(6)}`);

  // 找出最大曲率的位置
  let maxIdx = 0;
  let maxK = 0;
  for (let i = 0; i < kTangent.length; i++) {
    if (kTangent[i] > maxK) {
      maxK = kTangent[i];
      maxIdx = i;
    }
  }
  console.log(`\nMax curvature at index ${maxIdx}: ${maxK.toFixed(6)} (R=${(1/maxK).toFixed(1)})`);

  // 输出曲率分布（按区间统计）
  const bins = [0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.003, 0.004, 0.005, 0.006, 0.008, 0.01];
  console.log('\nCurvature distribution:');
  let prev = 0;
  for (const bin of bins) {
    const count = kTangent.filter(k => k >= prev && k < bin).length;
    const pct = (count / kTangent.length * 100).toFixed(1);
    console.log(`  ${prev.toFixed(4)} - ${bin.toFixed(4)}: ${count} (${pct}%)`);
    prev = bin;
  }
  const aboveCount = kTangent.filter(k => k >= prev).length;
  console.log(`  >= ${prev.toFixed(4)}: ${aboveCount} (${(aboveCount/kTangent.length*100).toFixed(1)}%)`);

  console.log(`\nThreshold = 0.005 (1/200)`);
  console.log(`Points above threshold: ${kTangent.filter(k => k > 0.005).length} / ${kTangent.length}`);

  // 测试不同难度的最大曲率
  console.log('\n=== 不同难度的最大曲率（外边界） ===');
  for (let diff = 1; diff <= 5; diff++) {
    const t = generateTrack({ difficulty: diff, lengthFactor: 1.0, trackWidth: 120, seed: 42 });
    if (!t) continue;
    const samples = sampleClosedBezier(t.outerBoundary.controlPoints, SAMPLE_COUNT);
    const ks = curvatureTangentMethod(samples);
    const maxk = Math.max(...ks);
    const avgk = ks.reduce((a,b) => a+b, 0) / ks.length;
    console.log(`  Difficulty ${diff}: max=${maxk.toFixed(6)} (R=${(1/maxk).toFixed(1)}), avg=${avgk.toFixed(6)}`);
  }
}

debugDetailed();
