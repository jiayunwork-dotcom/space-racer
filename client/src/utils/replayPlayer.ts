import type { RaceReplay, RaceReplayFrame, ShipReplayFrame } from '../types/game';
import { vecLength } from './vector';

export interface ReplayPlayerState {
  replay: RaceReplay;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentFrameIndex: number;
  followPlayerId: string | null;
  isFreeCamera: boolean;
  lastFrameTime: number;
}

export function createReplayPlayer(replay: RaceReplay): ReplayPlayerState {
  return {
    replay,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    currentFrameIndex: 0,
    followPlayerId: null,
    isFreeCamera: true,
    lastFrameTime: 0
  };
}

export function getInterpolatedFrame(
  replay: RaceReplay,
  time: number
): { frame: RaceReplayFrame; interpolation: number } | null {
  if (replay.frames.length === 0) return null;
  
  if (time <= 0) {
    return { frame: replay.frames[0], interpolation: 0 };
  }
  
  if (time >= replay.duration) {
    return { frame: replay.frames[replay.frames.length - 1], interpolation: 1 };
  }
  
  let left = 0;
  let right = replay.frames.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const frameTime = replay.frames[mid].timestamp;
    
    if (frameTime === time) {
      return { frame: replay.frames[mid], interpolation: 0 };
    } else if (frameTime < time) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  if (right < 0) right = 0;
  if (left >= replay.frames.length) left = replay.frames.length - 1;
  
  const prevFrame = replay.frames[right];
  const nextFrame = replay.frames[left];
  
  if (prevFrame === nextFrame) {
    return { frame: prevFrame, interpolation: 0 };
  }
  
  const frameDuration = nextFrame.timestamp - prevFrame.timestamp;
  const elapsed = time - prevFrame.timestamp;
  const interpolation = frameDuration > 0 ? elapsed / frameDuration : 0;
  
  return { frame: prevFrame, interpolation };
}

export function interpolateShipFrame(
  prevShip: ShipReplayFrame,
  nextShip: ShipReplayFrame,
  t: number
): ShipReplayFrame {
  return {
    ...prevShip,
    position: {
      x: prevShip.position.x + (nextShip.position.x - prevShip.position.x) * t,
      y: prevShip.position.y + (nextShip.position.y - prevShip.position.y) * t
    },
    velocity: {
      x: prevShip.velocity.x + (nextShip.velocity.x - prevShip.velocity.x) * t,
      y: prevShip.velocity.y + (nextShip.velocity.y - prevShip.velocity.y) * t
    },
    angle: prevShip.angle + (nextShip.angle - prevShip.angle) * t,
    shield: prevShip.shield + (nextShip.shield - prevShip.shield) * t
  };
}

export function getInterpolatedShips(
  replay: RaceReplay,
  time: number
): ShipReplayFrame[] {
  const result = getInterpolatedFrame(replay, time);
  if (!result) return [];
  
  const { frame, interpolation } = result;
  
  if (interpolation === 0) {
    return frame.ships;
  }
  
  const nextFrameIndex = Math.min(
    replay.frames.findIndex(f => f.timestamp === frame.timestamp) + 1,
    replay.frames.length - 1
  );
  
  if (nextFrameIndex >= replay.frames.length) {
    return frame.ships;
  }
  
  const nextFrame = replay.frames[nextFrameIndex];
  
  return frame.ships.map(ship => {
    const nextShip = nextFrame.ships.find(s => s.playerId === ship.playerId);
    if (!nextShip) return ship;
    return interpolateShipFrame(ship, nextShip, interpolation);
  });
}

export function updateReplayPlayer(
  player: ReplayPlayerState,
  deltaTime: number
): void {
  if (!player.isPlaying) return;
  
  player.currentTime += deltaTime * player.playbackSpeed;
  
  if (player.currentTime >= player.replay.duration) {
    player.currentTime = player.replay.duration;
    player.isPlaying = false;
  }
  
  if (player.currentTime < 0) {
    player.currentTime = 0;
  }
}

export function seekToTime(player: ReplayPlayerState, time: number): void {
  player.currentTime = Math.max(0, Math.min(player.replay.duration, time));
}

export function stepForward(player: ReplayPlayerState, frames: number = 1): void {
  const frameInterval = player.replay.frames.length > 1 
    ? player.replay.frames[1].timestamp - player.replay.frames[0].timestamp 
    : 1000 / 30;
  player.currentTime = Math.min(
    player.replay.duration,
    player.currentTime + frameInterval * frames
  );
  player.isPlaying = false;
}

export function stepBackward(player: ReplayPlayerState, frames: number = 1): void {
  const frameInterval = player.replay.frames.length > 1 
    ? player.replay.frames[1].timestamp - player.replay.frames[0].timestamp 
    : 1000 / 30;
  player.currentTime = Math.max(0, player.currentTime - frameInterval * frames);
  player.isPlaying = false;
}

export function togglePlay(player: ReplayPlayerState): void {
  if (player.currentTime >= player.replay.duration) {
    player.currentTime = 0;
  }
  player.isPlaying = !player.isPlaying;
}

export function setPlaybackSpeed(player: ReplayPlayerState, speed: number): void {
  player.playbackSpeed = speed;
}

export function setFollowPlayer(player: ReplayPlayerState, playerId: string | null): void {
  player.followPlayerId = playerId;
  player.isFreeCamera = playerId === null;
}

export function getShipSpeed(ship: ShipReplayFrame): number {
  return vecLength(ship.velocity);
}

export function getEventsAtTime(
  replay: RaceReplay,
  startTime: number,
  endTime: number
) {
  return replay.events.filter(
    e => e.timestamp >= startTime && e.timestamp <= endTime
  );
}
