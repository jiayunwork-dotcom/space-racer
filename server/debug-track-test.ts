import { generateTrack, isPointInTrack } from './src/services/trackGenerator';

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
      samples.push(bezierPoint(curvePoints, t));
    }
  }
  return samples;
}

function testTrackGeometry() {
  const track = generateTrack({ difficulty: 3, lengthFactor: 1.0, trackWidth: 120, seed: 42 });
  if (!track) {
    console.log('Failed to generate track');
    return;
  }

  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, 100);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, 100);

  // 计算几何中心
  let sumX = 0, sumY = 0;
  for (const p of outerSamples) {
    sumX += p.x; sumY += p.y;
  }
  const center = { x: sumX / outerSamples.length, y: sumY / outerSamples.length };
  console.log(`Center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`);

  // 计算平均半径
  let outerAvgR = 0, innerAvgR = 0;
  for (const p of outerSamples) {
    outerAvgR += Math.hypot(p.x - center.x, p.y - center.y);
  }
  outerAvgR /= outerSamples.length;
  for (const p of innerSamples) {
    innerAvgR += Math.hypot(p.x - center.x, p.y - center.y);
  }
  innerAvgR /= innerSamples.length;

  console.log(`Outer boundary avg radius: ${outerAvgR.toFixed(1)}`);
  console.log(`Inner boundary avg radius: ${innerAvgR.toFixed(1)}`);
  console.log(`Outer > Inner? ${outerAvgR > innerAvgR}`);

  // 测试 isPointInTrack
  const testPoints = [
    { name: 'Center', point: center },
    { name: 'R=100', point: { x: center.x + 100, y: center.y } },
    { name: 'R=300', point: { x: center.x + 300, y: center.y } },
    { name: 'R=500', point: { x: center.x + 500, y: center.y } },
    { name: 'R=700', point: { x: center.x + 700, y: center.y } },
    { name: 'R=800', point: { x: center.x + 800, y: center.y } },
  ];

  console.log('\n=== isPointInTrack test ===');
  for (const tp of testPoints) {
    const inTrack = isPointInTrack(tp.point, track);
    const r = Math.hypot(tp.point.x - center.x, tp.point.y - center.y);
    console.log(`  ${tp.name} (r=${r.toFixed(0)}): inTrack=${inTrack}`);
  }

  // 找出一个确定在赛道上的点
  console.log('\n=== Finding track zone ===');
  for (let r = 0; r < 1000; r += 50) {
    const p = { x: center.x + r, y: center.y };
    const inTrack = isPointInTrack(p, track);
    if (inTrack) {
      console.log(`  Found track at r ≈ ${r}`);
      break;
    }
  }

  // 找出内圈和外圈半径范围
  let inTrack = false;
  let trackInnerR = 0, trackOuterR = 0;
  for (let r = 0; r < 1000; r += 1) {
    const p = { x: center.x + r, y: center.y };
    const nowInTrack = isPointInTrack(p, track);
    if (!inTrack && nowInTrack) {
      trackInnerR = r;
      inTrack = true;
    }
    if (inTrack && !nowInTrack) {
      trackOuterR = r;
      break;
    }
  }
  console.log(`Track radial range: r=${trackInnerR} to r=${trackOuterR} (width=${trackOuterR - trackInnerR})`);
  console.log(`Which boundary is at inner radius? ${trackInnerR < 500 ? 'outerBoundary' : 'innerBoundary'} (approx)`);
}

testTrackGeometry();
