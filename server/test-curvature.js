function vecDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function vecNormalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

// 测试1: 半径200的圆，曲率应该=1/200=0.005
function testCircleCurvature(radius, N) {
  const points = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    points.push({
      point: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
      tangent: vecNormalize({ x: -Math.sin(angle), y: Math.cos(angle) })
    });
  }

  const curvatures = [];
  for (let i = 0; i < N; i++) {
    const prev = points[(i - 1 + N) % N];
    const curr = points[i];
    const next = points[(i + 1) % N];

    const d1 = vecDistance(prev.point, curr.point);
    const d2 = vecDistance(curr.point, next.point);
    const arcLen = (d1 + d2) / 2;

    const t1 = curr.tangent;
    const t2 = next.tangent;
    const dot = t1.x * t2.x + t1.y * t2.y;
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleDiff = Math.acos(clampedDot);

    curvatures.push(Math.abs(angleDiff / arcLen));
  }

  const minC = Math.min(...curvatures);
  const maxC = Math.max(...curvatures);
  const avgC = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;

  console.log(`Circle R=${radius}, N=${N}:`);
  console.log(`  Expected curvature: ${(1/radius).toFixed(6)}`);
  console.log(`  Actual: min=${minC.toFixed(6)}, max=${maxC.toFixed(6)}, avg=${avgC.toFixed(6)}`);
  console.log(`  Error: ${((avgC - 1/radius) / (1/radius) * 100).toFixed(2)}%`);
}

console.log('=== 曲率计算准确性验证 ===');
testCircleCurvature(200, 200);
testCircleCurvature(477, 200);
testCircleCurvature(250, 200);
testCircleCurvature(150, 200);

// 测试2: 用三点外接圆法计算曲率（另一种方法）
function curvatureFromThreePoints(p0, p1, p2) {
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

function testCircleCurvature3Point(radius, N) {
  const points = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  const curvatures = [];
  for (let i = 0; i < N; i++) {
    const p0 = points[(i - 1 + N) % N];
    const p1 = points[i];
    const p2 = points[(i + 1) % N];
    curvatures.push(curvatureFromThreePoints(p0, p1, p2));
  }

  const avgC = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;
  console.log(`3-point method, R=${radius}, N=${N}: avg=${avgC.toFixed(6)}, err=${((avgC - 1/radius) / (1/radius) * 100).toFixed(2)}%`);
}

console.log('\n=== 三点外接圆法验证 ===');
testCircleCurvature3Point(200, 200);
testCircleCurvature3Point(477, 200);
