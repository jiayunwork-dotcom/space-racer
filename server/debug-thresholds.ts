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

function computeCurvatures(samples) {
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

function computeArcLengths(samples) {
  const lengths = [];
  for (let i = 0; i < samples.length; i++) {
    const next = samples[(i + 1) % samples.length];
    lengths.push(vecDistance(samples[i].point, next.point));
  }
  return lengths;
}

function getCenterline(outerSamples, innerSamples, trackWidth) {
  const centerline = [];
  const n = Math.min(outerSamples.length, innerSamples.length);
  for (let i = 0; i < n; i++) {
    const outerPt = outerSamples[i].point;
    const innerPt = innerSamples[i].point;
    
    const centerPt = {
      x: (outerPt.x + innerPt.x) / 2,
      y: (outerPt.y + innerPt.y) / 2
    };
    
    const nextIdx = (i + 1) % n;
    const nextCenterPt = {
      x: (outerSamples[nextIdx].point.x + innerSamples[nextIdx].point.x) / 2,
      y: (outerSamples[nextIdx].point.y + innerSamples[nextIdx].point.y) / 2
    };
    
    const dx = nextCenterPt.x - centerPt.x;
    const dy = nextCenterPt.y - centerPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const tangent = { x: dx / (len || 1), y: dy / (len || 1) };
    
    centerline.push({ point: centerPt, tangent });
  }
  return centerline;
}

function straightRatio(curvatures, arcLengths, threshold) {
  let straightLen = 0;
  let totalLen = 0;
  for (let i = 0; i < arcLengths.length; i++) {
    totalLen += arcLengths[i];
    if (curvatures[i] <= threshold) straightLen += arcLengths[i];
  }
  return totalLen > 0 ? straightLen / totalLen : 0;
}

function testThresholds() {
  const thresholds = [
    { name: '1/200 (0.005)', value: 0.005 },
    { name: '1/300 (0.0033)', value: 1/300 },
    { name: '1/400 (0.0025)', value: 0.0025 },
    { name: '1/500 (0.002)', value: 0.002 },
    { name: '1/600 (0.0017)', value: 1/600 },
    { name: '1/800 (0.00125)', value: 0.00125 },
    { name: '1/1000 (0.001)', value: 0.001 },
  ];

  console.log('=== 不同难度不同种子的直道比例 ===\n');

  function pad(s, n) { return String(s).padEnd(n); }

  for (const th of thresholds) {
    console.log('\n--- Threshold: ' + th.name + ' ---');
    console.log(pad('Difficulty', 12) + pad('Seed 1', 12) + pad('Seed 2', 12) + pad('Seed 3', 12) + pad('Avg', 12));
    
    for (let diff = 1; diff <= 5; diff++) {
      const ratios = [];
      for (let seed = 1; seed <= 3; seed++) {
        const track = generateTrack({ difficulty: diff, lengthFactor: 1.0, trackWidth: 120, seed: seed * 100 + diff });
        if (!track) {
          ratios.push(-1);
          continue;
        }
        const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
        const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);
        
        let totalDist = 0;
        for (let i = 0; i < Math.min(20, outerSamples.length); i++) {
          let minD = Infinity;
          for (let j = 0; j < innerSamples.length; j++) {
            const d = vecDistance(outerSamples[i].point, innerSamples[j].point);
            if (d < minD) minD = d;
          }
          totalDist += minD;
        }
        const tw = totalDist / Math.min(20, outerSamples.length);
        
        const centerline = getCenterline(outerSamples, innerSamples, tw);
        const curvatures = computeCurvatures(centerline);
        const arcLengths = computeArcLengths(centerline);
        const ratio = straightRatio(curvatures, arcLengths, th.value);
        ratios.push(ratio);
      }
      const avg = ratios.reduce((a,b) => a+b, 0) / ratios.length;
      console.log(pad(diff, 12) + pad((ratios[0]*100).toFixed(1), 12) + pad((ratios[1]*100).toFixed(1), 12) + pad((ratios[2]*100).toFixed(1), 12) + pad((avg*100).toFixed(1), 12));
    }
  }

  console.log('\n=== 推荐阈值分析 ===');
  console.log('理想直道比例：30%-50%（满分区间）');
  console.log('我们需要找到一个阈值，使得：');
  console.log('  - 不同难度的赛道有不同的直道比例');
  console.log('  - 至少有一些赛道落在 30%-50% 的最佳区间');
  console.log('  - 大部分赛道有可区分的评分');
}

testThresholds();
