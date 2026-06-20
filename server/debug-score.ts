import { generateTrack, calculateTrackScore } from './src/services/trackGenerator';

async function debug() {
  const testCases = [
    { difficulty: 3, lengthFactor: 1.0, trackWidth: 120, seed: 12345 },
    { difficulty: 5, lengthFactor: 1.0, trackWidth: 120, seed: 12345 },
    { difficulty: 1, lengthFactor: 1.0, trackWidth: 120, seed: 12345 },
    { difficulty: 3, lengthFactor: 1.5, trackWidth: 150, seed: 67890 },
    { difficulty: 5, lengthFactor: 1.5, trackWidth: 150, seed: 11111 },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n========== Test Case ${i + 1} ==========`);
    console.log(`Params: difficulty=${tc.difficulty}, length=${tc.lengthFactor}, width=${tc.trackWidth}, seed=${tc.seed}`);

    const track = generateTrack(tc);
    if (!track) {
      console.log('Failed to generate track');
      continue;
    }

    console.log(`Track: ${track.name}`);
    console.log(`Checkpoints: ${track.checkpoints.length}`);

    const score = calculateTrackScore(track);
    console.log('Score:', score);
  }
}

debug().catch(console.error);
