import { generateTrack, calculateTrackScore } from './src/services/trackGenerator';

function testScores() {
  console.log('=== 修复后评分验证 ===\n');
  console.log('测试不同难度和种子的赛道评分：\n');

  const headers = ['难度', '种子', '总分', '弯道变化', '直弯比例', '检查点均匀'];
  console.log(headers.map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(72));

  for (let diff = 1; diff <= 5; diff++) {
    for (let seed = 1; seed <= 3; seed++) {
      const track = generateTrack({ difficulty: diff, lengthFactor: 1.0, trackWidth: 120, seed: seed * 100 + diff });
      if (!track) continue;
      const score = calculateTrackScore(track);
      console.log(
        String(diff).padEnd(12) +
        String(seed * 100 + diff).padEnd(12) +
        String(score.total).padEnd(12) +
        String(score.curvatureRichness).padEnd(12) +
        String(score.straightCurveRatio).padEnd(12) +
        String(score.checkpointUniformity).padEnd(12)
      );
    }
    if (diff < 5) console.log('');
  }

  console.log('\n=== 不同长度因子 ===\n');
  console.log(headers.map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(72));
  
  for (const lengthFactor of [0.75, 1.0, 1.5, 2.0]) {
    const track = generateTrack({ difficulty: 3, lengthFactor, trackWidth: 120, seed: 42 });
    if (!track) continue;
    const score = calculateTrackScore(track);
    console.log(
      '3'.padEnd(12) +
      String(lengthFactor).padEnd(12) +
      String(score.total).padEnd(12) +
      String(score.curvatureRichness).padEnd(12) +
      String(score.straightCurveRatio).padEnd(12) +
      String(score.checkpointUniformity).padEnd(12)
    );
  }

  console.log('\n=== 不同赛道宽度 ===\n');
  console.log(headers.map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(72));
  
  for (const trackWidth of [80, 120, 150, 200]) {
    const track = generateTrack({ difficulty: 3, lengthFactor: 1.0, trackWidth, seed: 42 });
    if (!track) continue;
    const score = calculateTrackScore(track);
    console.log(
      '3'.padEnd(12) +
      String(trackWidth).padEnd(12) +
      String(score.total).padEnd(12) +
      String(score.curvatureRichness).padEnd(12) +
      String(score.straightCurveRatio).padEnd(12) +
      String(score.checkpointUniformity).padEnd(12)
    );
  }

  console.log('\n=== 分析 ===');
  console.log('期望：不同参数应该得到不同的评分');
  console.log('期望：直弯比例应该在 0-100 之间，不应该全是 0');
  console.log('期望：难度越高，弯道变化丰富度应该越高');
}

testScores();
