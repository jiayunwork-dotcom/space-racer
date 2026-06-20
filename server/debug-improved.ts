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

function computeWeightedStats(values, weights) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (let i = 0; i < values.length; i++) {
    weightedSum += values[i] * weights[i];
    totalWeight += weights[i];
  }
  const mean = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  let varianceSum = 0;
  for (let i = 0; i < values.length; i++) {
    varianceSum += weights[i] * Math.pow(values[i] - mean, 2);
  }
  const variance = totalWeight > 0 ? varianceSum / totalWeight : 0;
  const stdDev = Math.sqrt(variance);
  
  return { mean, stdDev, cv: mean > 0 ? stdDev / mean : 0 };
}

function scoreStraightCurveRatioV2(curvatures, arcLengths, relativeThreshold) {
  const stats = computeWeightedStats(curvatures, arcLengths);
  const relativeCurvatures = curvatures.map(c => Math.abs(c - stats.mean));
  
  let straightLen = 0;
  let totalLen = 0;
  for (let i = 0; i < arcLengths.length; i++) {
    totalLen += arcLengths[i];
    if (relativeCurvatures[i] <= relativeThreshold) straightLen += arcLengths[i];
  }
  if (totalLen === 0) return 0;
  const ratio = straightLen / totalLen;

  if (ratio >= 0.3 && ratio <= 0.5) return { score: 100, ratio, meanCurvature: stats.mean };

  if (ratio < 0.3) {
    return { score: (ratio / 0.3) * 100, ratio, meanCurvature: stats.mean };
  }

  const excess = ratio - 0.5;
  const score = Math.max(0, 100 - (excess / 0.5) * 100);
  return { score, ratio, meanCurvature: stats.mean };
}

function scoreCurvatureRichnessV2(curvatures, arcLengths, relativeThreshold) {
  const stats = computeWeightedStats(curvatures, arcLengths);
  const relativeCurvatures = curvatures.map(c => Math.abs(c - stats.mean));
  
  const isCurve = relativeCurvatures.map(c => c > relativeThreshold);
  
  const sections = [];
  let currentSection = null;
  
  for (let i = 0; i < curvatures.length; i++) {
    if (isCurve[i]) {
      if (!currentSection) {
        currentSection = { startIdx: i, endIdx: i, totalRelCurvature: 0, totalWeight: 0 };
      }
      currentSection.endIdx = i;
      currentSection.totalRelCurvature += relativeCurvatures[i] * arcLengths[i];
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
      lastSection.totalRelCurvature += currentSection.totalRelCurvature;
      lastSection.totalWeight += currentSection.totalWeight;
    } else {
      sections.push(currentSection);
    }
  }

  const sectionCount = sections.length;
  
  if (sectionCount < 2) {
    return { score: 10, sectionCount, avgDiff: 0, stdDev: stats.stdDev, cv: stats.cv };
  }

  const avgRelCurvatures = sections.map(s => s.totalWeight > 0 ? s.totalRelCurvature / s.totalWeight : 0);
  
  let totalDiff = 0;
  let diffCount = 0;
  for (let i = 0; i < avgRelCurvatures.length; i++) {
    const next = (i + 1) % avgRelCurvatures.length;
    totalDiff += Math.abs(avgRelCurvatures[i] - avgRelCurvatures[next]);
    diffCount++;
  }

  const avgDiff = totalDiff / diffCount;
  
  const richnessFromDiff = Math.min(100, (avgDiff / 0.002) * 100);
  const richnessFromCount = Math.min(100, (sectionCount / 12) * 100);
  const richnessFromStdDev = Math.min(100, (stats.stdDev / 0.001) * 100);
  
  const score = Math.round(richnessFromDiff * 0.5 + richnessFromCount * 0.3 + richnessFromStdDev * 0.2);
  
  return { score, sectionCount, avgDiff, stdDev: stats.stdDev, cv: stats.cv, richnessFromDiff, richnessFromCount, richnessFromStdDev };
}

function comprehensiveTestV2() {
  const thresholds = [
    { name: '0.0002', value: 0.0002 },
    { name: '0.0003', value: 0.0003 },
    { name: '0.0005', value: 0.0005 },
    { name: '0.0008', value: 0.0008 },
    { name: '0.0010', value: 0.0010 },
    { name: '0.0015', value: 0.0015 },
  ];

  console.log('=== 相对曲率方案 - 综合测试 ===\n');

  for (const th of thresholds) {
    console.log(`--- 相对阈值: ${th.name} ---`);
    console.log(`${'难度'.padEnd(6)}${'直弯得分'.padEnd(12)}${'直道占比'.padEnd(12)}${'丰富度得分'.padEnd(12)}${'弯道数'.padEnd(10)}${'平均曲率'.padEnd(14)}${'综合分'.padEnd(10)}`);
    
    let minTotal = Infinity, maxTotal = -Infinity;
    
    for (let diff = 1; diff <= 5; diff++) {
      let sumStraight = 0, sumRatio = 0, sumRich = 0, sumCount = 0, sumMean = 0, sumTotal = 0;
      let count = 0;
      
      for (let seed = 1; seed <= 5; seed++) {
        const track = generateTrack({ difficulty: diff, lengthFactor: 1.0, trackWidth: 120, seed: seed * 100 + diff });
        if (!track) continue;
        
        const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
        const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);
        const centerline = getCenterline(outerSamples, innerSamples);
        const curvatures = computeCurvatures(centerline);
        const arcLengths = computeArcLengths(centerline);
        
        const straightResult = scoreStraightCurveRatioV2(curvatures, arcLengths, th.value);
        const richResult = scoreCurvatureRichnessV2(curvatures, arcLengths, th.value);
        const totalScore = richResult.score * 0.4 + straightResult.score * 0.3 + 97 * 0.3;
        
        sumStraight += straightResult.score;
        sumRatio += straightResult.ratio;
        sumRich += richResult.score;
        sumCount += richResult.sectionCount;
        sumMean += straightResult.meanCurvature;
        sumTotal += totalScore;
        count++;
      }
      
      const avgStraight = sumStraight / count;
      const avgRatio = sumRatio / count;
      const avgRich = sumRich / count;
      const avgCount = sumCount / count;
      const avgMean = sumMean / count;
      const avgTotal = sumTotal / count;
      
      minTotal = Math.min(minTotal, avgTotal);
      maxTotal = Math.max(maxTotal, avgTotal);
      
      console.log(
        String(diff).padEnd(6) +
        avgStraight.toFixed(1).padEnd(12) +
        (avgRatio * 100).toFixed(1) + '%'.padEnd(11) +
        avgRich.toFixed(1).padEnd(12) +
        avgCount.toFixed(1).padEnd(10) +
        avgMean.toFixed(6).padEnd(14) +
        avgTotal.toFixed(1).padEnd(10)
      );
    }
    
    console.log(`  总分范围: ${minTotal.toFixed(1)} - ${maxTotal.toFixed(1)} (范围: ${(maxTotal-minTotal).toFixed(1)})`);
    console.log('');
  }
}

comprehensiveTestV2();
