import type { Ship, Checkpoint, Track } from '../types/game';
import { PHYSICS_CONFIG } from '../types/game';
import { vecDistance, vecSub, vecDot, vecNormalize } from '../utils/vector';

export function checkCheckpoint(
  ship: Ship,
  checkpoints: Checkpoint[],
  currentTime: number
): { checkpointPassed: boolean; lapCompleted: boolean; lapTime: number | null } {
  if (ship.finished || ship.isRespawning) {
    return { checkpointPassed: false, lapCompleted: false, lapTime: null };
  }

  const nextCheckpointIndex = ship.currentCheckpoint;
  const checkpoint = checkpoints[nextCheckpointIndex];

  if (!checkpoint) {
    return { checkpointPassed: false, lapCompleted: false, lapTime: null };
  }

  const dist = vecDistance(ship.position, checkpoint.position);
  if (dist > 60) {
    return { checkpointPassed: false, lapCompleted: false, lapTime: null };
  }

  const dirToShip = vecNormalize(vecSub(ship.position, checkpoint.position));
  const checkpointDir = {
    x: Math.cos(checkpoint.direction),
    y: Math.sin(checkpoint.direction)
  };

  const dotProduct = vecDot(dirToShip, checkpointDir);
  if (dotProduct < 0.3) {
    return { checkpointPassed: false, lapCompleted: false, lapTime: null };
  }

  ship.lastCheckpointPos = { ...checkpoint.position };
  ship.currentCheckpoint = (nextCheckpointIndex + 1) % checkpoints.length;

  if (nextCheckpointIndex === 0 && ship.lap > 0) {
    const lapTime = currentTime - ship.lapStartTime;
    
    if (ship.bestLapTime === null || lapTime < ship.bestLapTime) {
      ship.bestLapTime = lapTime;
    }

    ship.lap++;
    ship.lapStartTime = currentTime;

    return { checkpointPassed: true, lapCompleted: true, lapTime };
  }

  if (ship.lap === 0 && nextCheckpointIndex === 0) {
    ship.lap = 1;
    ship.lapStartTime = currentTime;
  }

  return { checkpointPassed: true, lapCompleted: false, lapTime: null };
}

export function checkRaceFinish(
  ship: Ship,
  totalLaps: number,
  currentTime: number,
  finishPosition: number
): boolean {
  if (ship.finished) return false;

  if (ship.lap > totalLaps) {
    ship.finished = true;
    ship.finishTime = currentTime;
    ship.finishPosition = finishPosition;
    ship.totalTime = currentTime;
    return true;
  }

  return false;
}

export function getSortedShips(ships: Ship[]): Ship[] {
  return [...ships].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTime || 0) - (b.finishTime || 0);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    
    if (a.lap !== b.lap) {
      return b.lap - a.lap;
    }
    return b.currentCheckpoint - a.currentCheckpoint;
  });
}

export function getPlayerRank(ship: Ship, allShips: Ship[]): number {
  const sorted = getSortedShips(allShips);
  return sorted.findIndex(s => s.id === ship.id) + 1;
}

export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}
