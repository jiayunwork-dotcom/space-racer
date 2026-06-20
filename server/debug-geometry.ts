import { generateTrack } from './src/services/trackGenerator';
import { isPointInTrack, sampleClosedBezier, vec2 } from './src/utils/bezier';

function testTrackGeometry() {
  const track = generateTrack({ difficulty: 3, lengthFactor: 1.0, trackWidth: 120, seed: 42 });
  if (!track) {
    console.log('Failed to generate track');
    return;
  }

  const SAMPLE_COUNT = 200;
  const outerSamples = sampleClosedBezier(track.outerBoundary.controlPoints, SAMPLE_COUNT);
  const innerSamples = sampleClosedBezier(track.innerBoundary.controlPoints, SAMPLE_COUNT);

  // 计算几何中心
  let sumX = 0, sumY = 0;
  for (const s of outerSamples) {
    sumX += s.point.x; sumY += s.point.y;
  }
  const center = vec2(sumX / outerSamples.length, sumY / outerSamples.length);
  console.log(`Center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`);

  // 计算平均半径
  let outerAvgR = 0, innerAvgR = 0;
  for (const s of outerSamples) {
    outerAvgR += Math.hypot(s.point.x - center.x, s.point.y - center.y);
  }
  outerAvgR /= outerSamples.length;
  for (const s of innerSamples) {
    innerAvgR += Math.hypot(s.point.x - center.x, s.point.y - center.y);
  }
  innerAvgR /= innerSamples.length;

  console.log(`Outer boundary avg radius: ${outerAvgR.toFixed(1)}`);
  console.log(`Inner boundary avg radius: ${innerAvgR.toFixed(1)}`);
  console.log(`outer > inner? ${outerAvgR > innerAvgR}`);

  // 测试 isPointInTrack
  console.log('\n=== isPointInTrack test ===');
  const testRs = [100, 200, 300, 400, 450, 500, 550, 600, 650, 700, 800];
  for (const r of testRs) {
    const p = vec2(center.x + r, center.y);
    const inTrack = isPointInTrack(p, outerSamples, innerSamples);
    console.log(`  r=${r}: inTrack=${inTrack}`);
  }

  // 找到赛道的径向范围
  let inTrackState = false;
  let trackInnerR = 0, trackOuterR = 0;
  let foundInner = false;
  for (let r = 0; r < 1000; r += 1) {
    const p = vec2(center.x + r, center.y);
    const nowInTrack = isPointInTrack(p, outerSamples, innerSamples);
    if (!inTrackState && nowInTrack) {
      trackInnerR = r;
      inTrackState = true;
      foundInner = true;
    }
    if (inTrackState && !nowInTrack) {
      trackOuterR = r;
      break;
    }
  }
  
  console.log(`\nTrack radial range: r=${trackInnerR} to r=${trackOuterR}`);
  console.log(`Track width (radial): ${trackOuterR - trackInnerR}`);
  
  // 判断哪个边界在内侧
  const diffOuter = Math.abs(trackInnerR - outerAvgR);
  const diffInner = Math.abs(trackInnerR - innerAvgR);
  console.log(`\nInner track boundary (smaller radius) is: ${diffOuter < diffInner ? 'outerBoundary' : 'innerBoundary'}`);
  console.log(`Outer track boundary (larger radius) is: ${diffOuter > diffInner ? 'outerBoundary' : 'innerBoundary'}`);
}

testTrackGeometry();
