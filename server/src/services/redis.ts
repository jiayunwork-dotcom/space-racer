import Redis from 'ioredis';
import type { Track, LeaderboardEntry, GlobalLeaderboardEntry, Replay, RaceReplay, Tournament, TournamentStanding, TournamentStageResult, TournamentPlayer } from '../types/game';
import { getBuiltInTracks } from '../game/tracks';
import { calculatePoints, sortStandings } from '../types/game';

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

export interface TrackLeaderboardEntry {
  trackId: string;
  name: string;
  score: number;
  difficulty: number;
  lengthFactor: number;
  trackWidth: number;
  seed: number;
  createdAt: number;
}

const LEADERBOARD_KEY = 'track:leaderboard';
const LEADERBOARD_META_KEY = 'track:leaderboard:meta';
const LEADERBOARD_MAX_SIZE = 20;

export async function addTrackToLeaderboard(entry: TrackLeaderboardEntry): Promise<boolean> {
  const r = getRedis();
  const currentCount = await r.zcard(LEADERBOARD_KEY);
  const minEntry = currentCount > 0 ? await r.zrange(LEADERBOARD_KEY, 0, 0, 'WITHSCORES') : [];

  if (currentCount >= LEADERBOARD_MAX_SIZE) {
    const minScore = minEntry.length >= 2 ? parseFloat(minEntry[1]) : 0;
    if (entry.score <= minScore) return false;
  }

  await r.zadd(LEADERBOARD_KEY, entry.score, entry.trackId);
  await r.hset(LEADERBOARD_META_KEY, entry.trackId, JSON.stringify(entry));

  if (currentCount >= LEADERBOARD_MAX_SIZE) {
    const toRemove = await r.zrange(LEADERBOARD_KEY, 0, 0);
    for (const id of toRemove) {
      await r.zrem(LEADERBOARD_KEY, id);
      await r.hdel(LEADERBOARD_META_KEY, id);
    }
  }

  return true;
}

export async function getTrackLeaderboard(): Promise<TrackLeaderboardEntry[]> {
  const r = getRedis();
  const ids = await r.zrevrange(LEADERBOARD_KEY, 0, LEADERBOARD_MAX_SIZE - 1);

  const entries: TrackLeaderboardEntry[] = [];
  for (const id of ids) {
    const data = await r.hget(LEADERBOARD_META_KEY, id);
    if (data) {
      entries.push(JSON.parse(data) as TrackLeaderboardEntry);
    }
  }

  return entries;
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

export async function saveRaceReplay(replay: RaceReplay): Promise<void> {
  const r = getRedis();
  const key = `race_replay:${replay.id}`;
  await r.set(key, JSON.stringify(replay));
  await r.expire(key, 7 * 24 * 60 * 60);
  
  const roomKey = `race_replays:${replay.roomId}`;
  await r.zadd(roomKey, replay.createdAt, replay.id);
  await r.expire(roomKey, 7 * 24 * 60 * 60);
  await r.zremrangebyrank(roomKey, 0, -11);
}

export async function getRaceReplay(replayId: string): Promise<RaceReplay | null> {
  const r = getRedis();
  const key = `race_replay:${replayId}`;
  const data = await r.get(key);
  if (!data) return null;
  return JSON.parse(data) as RaceReplay;
}

export async function getLatestRaceReplayForRoom(roomId: string): Promise<RaceReplay | null> {
  const r = getRedis();
  const roomKey = `race_replays:${roomId}`;
  const replayIds = await r.zrevrange(roomKey, 0, 0);
  if (replayIds.length === 0) return null;
  return getRaceReplay(replayIds[0]);
}

export async function getRaceReplaysForRoom(roomId: string, limit: number = 10): Promise<RaceReplay[]> {
  const r = getRedis();
  const roomKey = `race_replays:${roomId}`;
  const replayIds = await r.zrevrange(roomKey, 0, limit - 1);
  const replays: RaceReplay[] = [];
  
  for (const id of replayIds) {
    const replay = await getRaceReplay(id);
    if (replay) replays.push(replay);
  }
  
  return replays;
}

function getTournamentKey(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}

function getTournamentListKey(status: string): string {
  return `tournaments:${status}`;
}

export async function saveTournament(tournament: Tournament): Promise<void> {
  const r = getRedis();
  const key = getTournamentKey(tournament.id);
  await r.set(key, JSON.stringify(tournament));
  
  await r.srem(getTournamentListKey('registering'), tournament.id);
  await r.srem(getTournamentListKey('ongoing'), tournament.id);
  await r.srem(getTournamentListKey('finished'), tournament.id);
  await r.sadd(getTournamentListKey(tournament.status), tournament.id);
}

export async function getTournament(tournamentId: string): Promise<Tournament | null> {
  const r = getRedis();
  const key = getTournamentKey(tournamentId);
  const data = await r.get(key);
  if (!data) return null;
  return JSON.parse(data) as Tournament;
}

export async function getTournamentsByStatus(status: 'registering' | 'ongoing' | 'finished'): Promise<Tournament[]> {
  const r = getRedis();
  const key = getTournamentListKey(status);
  const ids = await r.smembers(key);
  const tournaments: Tournament[] = [];
  
  for (const id of ids) {
    const tournament = await getTournament(id);
    if (tournament) {
      tournaments.push(tournament);
    }
  }
  
  return tournaments.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const r = getRedis();
  const key = getTournamentKey(tournamentId);
  await r.del(key);
  await r.srem(getTournamentListKey('registering'), tournamentId);
  await r.srem(getTournamentListKey('ongoing'), tournamentId);
  await r.srem(getTournamentListKey('finished'), tournamentId);
}

export async function addPlayerToTournament(
  tournamentId: string,
  player: TournamentPlayer
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  const existingPlayer = tournament.players.find(p => p.playerId === player.playerId);
  if (existingPlayer) return tournament;
  
  tournament.players.push(player);
  await saveTournament(tournament);
  return tournament;
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: 'registering' | 'ongoing' | 'finished'
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  tournament.status = status;
  if (status === 'ongoing' && !tournament.startedAt) {
    tournament.startedAt = Date.now();
  }
  if (status === 'finished') {
    tournament.finishedAt = Date.now();
  }
  
  await saveTournament(tournament);
  return tournament;
}

export async function submitStageResult(
  tournamentId: string,
  stageIndex: number,
  results: TournamentStageResult[]
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  tournament.stageResults[stageIndex] = results;
  
  if (tournament.stages[stageIndex]) {
    tournament.stages[stageIndex].status = 'completed';
  }
  
  if (stageIndex >= tournament.stages.length - 1) {
    tournament.status = 'finished';
    tournament.finishedAt = Date.now();
  } else {
    tournament.currentStageIndex = stageIndex + 1;
    const nextStage = tournament.stages[stageIndex + 1];
    if (nextStage) {
      nextStage.status = 'pending';
      nextStage.preparationEndTime = null;
      nextStage.roomId = null;
    }
  }
  
  await saveTournament(tournament);
  return tournament;
}

export async function startStagePreparation(
  tournamentId: string,
  stageIndex: number,
  roomId: string
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  const stage = tournament.stages[stageIndex];
  if (!stage) return null;
  
  stage.status = 'preparing';
  stage.preparationEndTime = Date.now() + 30000;
  stage.roomId = roomId;
  
  await saveTournament(tournament);
  return tournament;
}

export async function setStageRacing(
  tournamentId: string,
  stageIndex: number
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  const stage = tournament.stages[stageIndex];
  if (!stage) return null;
  
  stage.status = 'racing';
  
  await saveTournament(tournament);
  return tournament;
}

function buildPlayerStandings(
  tournament: Tournament
): TournamentStanding[] {
  const standings: Map<string, TournamentStanding> = new Map();
  
  for (const player of tournament.players) {
    standings.set(player.playerId, {
      playerId: player.playerId,
      playerName: player.playerName,
      colorIndex: player.colorIndex,
      totalPoints: 0,
      stageResults: [],
      bestPositions: [],
      registrationOrder: player.registrationOrder
    });
  }
  
  for (let stageIdx = 0; stageIdx < tournament.stages.length; stageIdx++) {
    const stageResults = tournament.stageResults[stageIdx];
    if (!stageResults) {
      for (const standing of standings.values()) {
        standing.stageResults.push(null);
      }
      continue;
    }
    
    for (const result of stageResults) {
      const standing = standings.get(result.playerId);
      if (standing) {
        const points = calculatePoints(result.position, result.disconnected);
        result.points = points;
        standing.stageResults.push(result);
        standing.totalPoints += points;
        
        if (result.position !== null && !result.disconnected) {
          standing.bestPositions.push(result.position);
        }
      }
    }
  }
  
  for (const standing of standings.values()) {
    standing.bestPositions.sort((a, b) => a - b);
  }
  
  return sortStandings(Array.from(standings.values()));
}

export async function getTournamentStandings(
  tournamentId: string
): Promise<TournamentStanding[] | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  return buildPlayerStandings(tournament);
}

export async function getCurrentStageStatus(
  tournamentId: string
): Promise<{ tournament: Tournament; standings: TournamentStanding[]; canEnterRace: boolean; countdownRemaining: number } | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  
  const standings = buildPlayerStandings(tournament);
  
  if (tournament.status !== 'ongoing') {
    return {
      tournament,
      standings,
      canEnterRace: false,
      countdownRemaining: 0
    };
  }
  
  const currentStage = tournament.stages[tournament.currentStageIndex];
  if (!currentStage) {
    return {
      tournament,
      standings,
      canEnterRace: false,
      countdownRemaining: 0
    };
  }
  
  let canEnterRace = false;
  let countdownRemaining = 0;
  
  if (currentStage.status === 'preparing' && currentStage.preparationEndTime) {
    countdownRemaining = Math.max(0, currentStage.preparationEndTime - Date.now());
    canEnterRace = countdownRemaining > 0;
  } else if (currentStage.status === 'pending') {
    canEnterRace = false;
    countdownRemaining = 0;
  } else if (currentStage.status === 'racing') {
    canEnterRace = true;
    countdownRemaining = 0;
  }
  
  return {
    tournament,
    standings,
    canEnterRace,
    countdownRemaining
  };
}
