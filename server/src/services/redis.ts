import Redis from 'ioredis';
import type { Track, LeaderboardEntry, GlobalLeaderboardEntry, Replay } from '../types/game';
import { getBuiltInTracks } from '../game/tracks';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT
    });
  }
  return redis;
}

export async function initRedis(): Promise<void> {
  const r = getRedis();
  
  const tracksKey = 'tracks';
  const tracksExist = await r.exists(tracksKey);
  
  if (!tracksExist) {
    const builtInTracks = getBuiltInTracks();
    for (const track of builtInTracks) {
      await saveTrack(track);
    }
  }
}

export async function saveTrack(track: Track): Promise<void> {
  const r = getRedis();
  await r.hset('tracks', track.id, JSON.stringify(track));
  if (track.isBuiltIn) {
    await r.sadd('built_in_tracks', track.id);
  } else {
    await r.zadd('track_play_count', track.playCount, track.id);
  }
}

export async function getTrack(id: string): Promise<Track | null> {
  const r = getRedis();
  const data = await r.hget('tracks', id);
  if (!data) return null;
  return JSON.parse(data) as Track;
}

export async function getAllTracks(): Promise<Track[]> {
  const r = getRedis();
  const tracksData = await r.hgetall('tracks');
  const tracks: Track[] = [];
  
  for (const id in tracksData) {
    tracks.push(JSON.parse(tracksData[id]) as Track);
  }
  
  return tracks.sort((a, b) => b.playCount - a.playCount);
}

export async function getPopularTracks(limit: number = 20): Promise<Track[]> {
  const r = getRedis();
  const trackIds = await r.zrevrange('track_play_count', 0, limit - 1);
  const tracks: Track[] = [];
  
  for (const id of trackIds) {
    const track = await getTrack(id);
    if (track) tracks.push(track);
  }
  
  return tracks;
}

export async function incrementTrackPlayCount(trackId: string): Promise<void> {
  const r = getRedis();
  await r.zincrby('track_play_count', 1, trackId);
  
  const track = await getTrack(trackId);
  if (track) {
    track.playCount++;
    await saveTrack(track);
  }
}

export async function addLeaderboardEntry(
  trackId: string,
  playerName: string,
  time: number
): Promise<void> {
  const r = getRedis();
  const key = `leaderboard:${trackId}`;
  const entry: LeaderboardEntry = {
    playerName,
    time,
    date: Date.now()
  };
  
  await r.zadd(key, time, JSON.stringify(entry));
  await r.zremrangebyrank(key, 20, -1);
}

export async function getLeaderboard(trackId: string): Promise<LeaderboardEntry[]> {
  const r = getRedis();
  const key = `leaderboard:${trackId}`;
  const entries = await r.zrange(key, 0, 19);
  return entries.map(e => JSON.parse(e) as LeaderboardEntry);
}

export async function getBestLapTime(trackId: string): Promise<number | null> {
  const r = getRedis();
  const key = `leaderboard:${trackId}`;
  const entries = await r.zrange(key, 0, 0);
  if (entries.length === 0) return null;
  const entry = JSON.parse(entries[0]) as LeaderboardEntry;
  return entry.time;
}

export async function addGlobalWin(playerName: string): Promise<void> {
  const r = getRedis();
  await r.zincrby('global_wins', 1, playerName);
}

export async function addGlobalRace(playerName: string): Promise<void> {
  const r = getRedis();
  await r.zincrby('global_races', 1, playerName);
}

export async function getGlobalLeaderboard(limit: number = 20): Promise<GlobalLeaderboardEntry[]> {
  const r = getRedis();
  const winners = await r.zrevrange('global_wins', 0, limit - 1, 'WITHSCORES');
  const results: GlobalLeaderboardEntry[] = [];
  
  for (let i = 0; i < winners.length; i += 2) {
    const playerName = winners[i];
    const wins = parseInt(winners[i + 1]);
    
    const raceCount = await r.zscore('global_races', playerName);
    
    results.push({
      playerName,
      wins,
      races: raceCount ? parseInt(raceCount) : 0
    });
  }
  
  return results;
}

export async function saveRoomState(roomId: string, state: string): Promise<void> {
  const r = getRedis();
  await r.setex(`room:${roomId}`, 3600, state);
}

export async function getRoomState(roomId: string): Promise<string | null> {
  const r = getRedis();
  return await r.get(`room:${roomId}`);
}

export async function deleteRoomState(roomId: string): Promise<void> {
  const r = getRedis();
  await r.del(`room:${roomId}`);
}

export async function saveReplay(replay: Replay): Promise<void> {
  const r = getRedis();
  const key = `replay:${replay.id}`;
  await r.set(key, JSON.stringify(replay));
  await r.zadd(`replays:${replay.trackId}`, replay.totalTime, replay.id);
  await r.zremrangebyrank(`replays:${replay.trackId}`, 20, -1);
}

export async function getReplay(replayId: string): Promise<Replay | null> {
  const r = getRedis();
  const key = `replay:${replayId}`;
  const data = await r.get(key);
  if (!data) return null;
  return JSON.parse(data) as Replay;
}

export async function getReplaysForTrack(trackId: string): Promise<Replay[]> {
  const r = getRedis();
  const key = `replays:${trackId}`;
  const replayIds = await r.zrange(key, 0, 19);
  const replays: Replay[] = [];
  
  for (const id of replayIds) {
    const replay = await getReplay(id);
    if (replay) replays.push(replay);
  }
  
  return replays.sort((a, b) => a.totalTime - b.totalTime);
}
