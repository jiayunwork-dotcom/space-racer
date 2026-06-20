import { v4 as uuidv4 } from 'uuid';
import type { Tournament, TournamentStage, TournamentPlayer, TournamentStageResult, TournamentStanding } from '../types/game';
import { TOURNAMENT_MIN_STAGES, TOURNAMENT_MAX_STAGES, TOURNAMENT_MAX_PLAYERS, SHIP_COLORS } from '../types/game';
import {
  saveTournament,
  getTournament,
  getTournamentsByStatus,
  addPlayerToTournament,
  updateTournamentStatus,
  submitStageResult,
  startStagePreparation,
  setStageRacing,
  getTournamentStandings,
  getCurrentStageStatus,
  getTrack
} from './redis';
import { createRoom, setTournamentRoom } from './rooms';

export interface CreateTournamentRequest {
  name: string;
  creatorId: string;
  creatorName: string;
  stages: Array<{
    trackId: string;
    laps: number;
  }>;
}

export interface JoinTournamentRequest {
  playerId: string;
  playerName: string;
}

export interface SubmitResultRequest {
  stageIndex: number;
  results: Array<{
    playerId: string;
    playerName: string;
    position: number | null;
    time: number | null;
    disconnected: boolean;
  }>;
}

async function validateStages(stageConfigs: Array<{ trackId: string; laps: number }>): Promise<{ valid: boolean; error?: string; stages?: TournamentStage[] }> {
  if (stageConfigs.length < TOURNAMENT_MIN_STAGES || stageConfigs.length > TOURNAMENT_MAX_STAGES) {
    return { valid: false, error: `锦标赛必须包含 ${TOURNAMENT_MIN_STAGES}-${TOURNAMENT_MAX_STAGES} 个分站` };
  }

  const trackIds = new Set<string>();
  const stages: TournamentStage[] = [];

  for (const config of stageConfigs) {
    if (trackIds.has(config.trackId)) {
      return { valid: false, error: '同一赛道不能重复选择' };
    }
    trackIds.add(config.trackId);

    const track = await getTrack(config.trackId);
    if (!track) {
      return { valid: false, error: `赛道 ${config.trackId} 不存在` };
    }

    if (config.laps < 1 || config.laps > 20) {
      return { valid: false, error: '每站圈数必须在 1-20 之间' };
    }

    stages.push({
      trackId: config.trackId,
      trackName: track.name,
      laps: config.laps,
      status: 'pending',
      preparationEndTime: null,
      roomId: null
    });
  }

  return { valid: true, stages };
}

export async function createTournament(request: CreateTournamentRequest): Promise<{ tournament?: Tournament; error?: string }> {
  const validation = await validateStages(request.stages);
  if (!validation.valid || !validation.stages) {
    return { error: validation.error };
  }

  const creatorColorIndex = 0;
  const stages = validation.stages;

  const tournament: Tournament = {
    id: uuidv4(),
    name: request.name || '新锦标赛',
    creatorId: request.creatorId,
    creatorName: request.creatorName,
    status: 'registering',
    stages,
    currentStageIndex: 0,
    players: [
      {
        playerId: request.creatorId,
        playerName: request.creatorName,
        colorIndex: creatorColorIndex,
        registrationOrder: 0
      }
    ],
    stageResults: [],
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null
  };

  await saveTournament(tournament);
  return { tournament };
}

export async function listTournaments(status: 'registering' | 'ongoing' | 'finished'): Promise<Tournament[]> {
  return getTournamentsByStatus(status);
}

export async function getTournamentDetail(tournamentId: string): Promise<{ tournament?: Tournament; standings?: TournamentStanding[]; error?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return { error: '锦标赛不存在' };
  }

  const standings = await getTournamentStandings(tournamentId);
  return { tournament, standings: standings || [] };
}

export async function joinTournament(
  tournamentId: string,
  request: JoinTournamentRequest
): Promise<{ tournament?: Tournament; error?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return { error: '锦标赛不存在' };
  }

  if (tournament.status !== 'registering') {
    return { error: '锦标赛已开始，无法加入' };
  }

  if (tournament.players.length >= TOURNAMENT_MAX_PLAYERS) {
    return { error: '锦标赛人数已满' };
  }

  const existingPlayer = tournament.players.find(p => p.playerId === request.playerId);
  if (existingPlayer) {
    return { tournament };
  }

  const usedColors = tournament.players.map(p => p.colorIndex);
  let colorIndex = 0;
  for (let i = 0; i < SHIP_COLORS.length; i++) {
    if (!usedColors.includes(i)) {
      colorIndex = i;
      break;
    }
  }

  const player: TournamentPlayer = {
    playerId: request.playerId,
    playerName: request.playerName,
    colorIndex,
    registrationOrder: tournament.players.length
  };

  const updated = await addPlayerToTournament(tournamentId, player);
  if (!updated) {
    return { error: '加入锦标赛失败' };
  }

  return { tournament: updated };
}

export async function startTournament(
  tournamentId: string,
  creatorId: string
): Promise<{ tournament?: Tournament; error?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return { error: '锦标赛不存在' };
  }

  if (tournament.creatorId !== creatorId) {
    return { error: '只有创建者可以开始锦标赛' };
  }

  if (tournament.status !== 'registering') {
    return { error: '锦标赛状态不正确' };
  }

  if (tournament.players.length < 2) {
    return { error: '至少需要 2 名玩家才能开始' };
  }

  const updated = await updateTournamentStatus(tournamentId, 'ongoing');
  if (!updated) {
    return { error: '开始锦标赛失败' };
  }

  return { tournament: updated };
}

export async function getCurrentStage(
  tournamentId: string
): Promise<{ tournament?: Tournament; standings?: TournamentStanding[]; canEnterRace?: boolean; countdownRemaining?: number; currentStage?: TournamentStage; currentStageIndex?: number; error?: string }> {
  const status = await getCurrentStageStatus(tournamentId);
  if (!status) {
    return { error: '锦标赛不存在' };
  }

  const currentStage = status.tournament.stages[status.tournament.currentStageIndex];

  return {
    tournament: status.tournament,
    standings: status.standings,
    canEnterRace: status.canEnterRace,
    countdownRemaining: status.countdownRemaining,
    currentStage,
    currentStageIndex: status.tournament.currentStageIndex
  };
}

export async function createStageRoom(
  tournamentId: string,
  creatorId: string
): Promise<{ tournament?: Tournament; roomId?: string; error?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return { error: '锦标赛不存在' };
  }

  if (tournament.creatorId !== creatorId) {
    return { error: '只有创建者可以创建比赛房间' };
  }

  if (tournament.status !== 'ongoing') {
    return { error: '锦标赛未在进行中' };
  }

  const currentStage = tournament.stages[tournament.currentStageIndex];
  if (!currentStage) {
    return { error: '当前分站不存在' };
  }

  if (currentStage.status !== 'pending') {
    return { error: '当前分站已准备或进行中' };
  }

  const roomName = `${tournament.name} - 第${tournament.currentStageIndex + 1}站: ${currentStage.trackName}`;
  const room = createRoom(
    creatorId,
    tournament.creatorName,
    roomName,
    currentStage.trackId,
    currentStage.laps,
    tournament.players.length
  );

  setTournamentRoom(room.id, tournamentId, tournament.currentStageIndex);

  const updated = await startStagePreparation(tournamentId, tournament.currentStageIndex, room.id);
  if (!updated) {
    return { error: '开始准备阶段失败' };
  }

  return { tournament: updated, roomId: room.id };
}

export async function markStageRacing(
  tournamentId: string,
  stageIndex: number
): Promise<{ tournament?: Tournament; error?: string }> {
  const updated = await setStageRacing(tournamentId, stageIndex);
  if (!updated) {
    return { error: '更新分站状态失败' };
  }
  return { tournament: updated };
}

export async function submitStageResults(
  tournamentId: string,
  request: SubmitResultRequest
): Promise<{ tournament?: Tournament; standings?: TournamentStanding[]; error?: string; isFinished?: boolean }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return { error: '锦标赛不存在' };
  }

  if (tournament.status !== 'ongoing') {
    return { error: '锦标赛未在进行中' };
  }

  if (request.stageIndex !== tournament.currentStageIndex) {
    return { error: '分站索引不匹配' };
  }

  const stageResults: TournamentStageResult[] = request.results.map(r => ({
    ...r,
    points: 0
  }));

  const updated = await submitStageResult(tournamentId, request.stageIndex, stageResults);
  if (!updated) {
    return { error: '提交结果失败' };
  }

  const standings = await getTournamentStandings(tournamentId);
  const isFinished = updated.status === 'finished';

  return { tournament: updated, standings: standings || [], isFinished };
}

export async function getStandings(
  tournamentId: string
): Promise<{ standings?: TournamentStanding[]; error?: string }> {
  const standings = await getTournamentStandings(tournamentId);
  if (!standings) {
    return { error: '锦标赛不存在' };
  }
  return { standings };
}
