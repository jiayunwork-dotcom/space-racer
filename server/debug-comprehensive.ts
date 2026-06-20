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

function getCenterline(outerSamples, innerSamples) {
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

function scoreStraightCurveRatio(curvatures, arcLengths, threshold) {
  let straightLen = 0;
  let totalLen = 0;
  for (let i = 0; i < arcLengths.length; i++) {
    totalLen += arcLengths[i];
    if (curvatures[i] <= threshold) straightLen += arcLengths[i];
  }
  if (totalLen === 0) return 0;
  const ratio = straightLen / totalLen;

  if (ratio >= 0.3 && ratio <= 0.5) return 100;
  if (ratio < 0.3) return (ratio / 0.3) * 100;
  const excess = ratio - 0.5;
  return Math.max(0, 100 - (excess / 0.5) * 100);
}

function scoreCurvatureRichness(curvatures, arcLengths, threshold) {
  const isCurve = curvatures.map(c => c > threshold);
  
  const sections = [];
  let currentSection = null;
  
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

  if (sections.length < 2) return { score: 10, sectionCount: sections.length, avgDiff: 0 };

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
  
  return { score, sectionCount: sections.length, avgDiff };
}

function comprehensiveTest() {
  const thresholds = [
    { name: '1/200', value: 1/200 },
    { name: '1/300', value: 1/300 },
    { name: '1/400', value: 1/400 },
    { name: '1/450', value: 1/450 },
    { name: '1/500', value: 1/500 },
    { name: '1/600', value: 1/600 },
    { name: '1/800', value: 1/800 },
  ];

  console.log('=== 综合阈值测试 ===\n');

  for (const th of thresholds) {
    console.log(`--- Threshold: ${th.name} (${th.value.toFixed(5)}) ---`);
    console.log(`${'难度'.padEnd(6)}${'直弯得分'.padEnd(12)}${'丰富度得分'.padEnd(12)}${'弯道数'.padEnd(10)}${'avgDiff'.padEnd(14)}${'综合分'.padEnd(10)}`);
    
    let minTotal = Infinity, maxTotal = -Infinity;
    
    for (let diff = 1; diff <= 5; diff++) {
      let sumStraight = 0, sumRich = 0, sumCount = 0, sumDiff = 0, sumTotal = 0;
      let count = 0;
      
      for (let seed = 1; seed <= 5; seed++) {
        const track = generateTrack({ difficulty: diff, lengthFactor: 1.0, trackWidth: 120, seed: seed * 100 + diff });
        if (!track) continue;
        
        const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
        const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);
        const centerline = getCenterline(outerSamples, innerSamples);
        const curvatures = computeCurvatures(centerline);
        const arcLengths = computeArcLengths(centerline);
        
        const straightScore = scoreStraightCurveRatio(curvatures, arcLengths, th.value);
        const richResult = scoreCurvatureRichness(curvatures, arcLengths, th.value);
        const totalScore = richResult.score * 0.4 + straightScore * 0.3 + 97 * 0.3;
        
        sumStraight += straightScore;
        sumRich += richResult.score;
        sumCount += richResult.sectionCount;
        sumDiff += richResult.avgDiff;
        sumTotal += totalScore;
        count++;
      }
      
      const avgStraight = sumStraight / count;
      const avgRich = sumRich / count;
      const avgCount = sumCount / count;
      const avgDiffVal = sumDiff / count;
      const avgTotal = sumTotal / count;
      
      minTotal = Math.min(minTotal, avgTotal);
      maxTotal = Math.max(maxTotal, avgTotal);
      
      console.log(
        String(diff).padEnd(6) +
        avgStraight.toFixed(1).padEnd(12) +
        avgRich.toFixed(1).padEnd(12) +
        avgCount.toFixed(1).padEnd(10) +
        avgDiffVal.toFixed(6).padEnd(14) +
        avgTotal.toFixed(1).padEnd(10)
      );
    }
    
    console.log(`  总分范围: ${minTotal.toFixed(1)} - ${maxTotal.toFixed(1)} (范围: ${(maxTotal-minTotal).toFixed(1)})`);
    console.log('');
  }

  console.log('=== 分析与建议 ===');
  console.log('理想情况:');
  console.log('  1. 直弯比例得分有较大范围（0-100）');
  console.log('  2. 弯道丰富度得分有较大范围（0-100）');
  console.log('  3. 不同难度有明显的分数差异');
  console.log('  4. 综合总分有合理的分布范围');
}

comprehensiveTest();
