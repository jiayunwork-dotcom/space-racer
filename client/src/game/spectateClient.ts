import type { GameStateData } from '../types/game';

export interface DanmakuMessage {
  type: 'danmaku';
  spectatorId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export class SpectateClient {
  private ws: WebSocket | null = null;
  private roomId: string;
  private spectatorId: string;
  private playerName: string;
  private lastServerState: GameStateData | null = null;
  private onStateUpdate: ((state: GameStateData) => void) | null = null;
  private onDanmaku: ((msg: DanmakuMessage) => void) | null = null;
  private onRaceEnded: ((msg: string) => void) | null = null;
  private lastDanmakuTime = 0;

  constructor(roomId: string, spectatorId: string, playerName: string) {
    this.roomId = roomId;
    this.spectatorId = spectatorId;
    this.playerName = playerName;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/spectate/${this.roomId}/${this.spectatorId}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Spectate] WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('[Spectate] Failed to parse message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Spectate] WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[Spectate] WebSocket disconnected');
      };
    });
  }

  private handleMessage(data: any): void {
    if (data.type === 'state') {
      this.lastServerState = data.data as GameStateData;
      if (this.onStateUpdate && this.lastServerState) {
        this.onStateUpdate(this.lastServerState);
      }
    }

    if (data.type === 'danmaku') {
      if (this.onDanmaku) {
        this.onDanmaku(data as DanmakuMessage);
      }
    }

    if (data.type === 'race_ended') {
      if (this.onRaceEnded) {
        this.onRaceEnded(data.message || '比赛已结束');
      }
    }
  }

  sendDanmaku(text: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const now = Date.now();
    if (now - this.lastDanmakuTime < 10000) return false;
    this.lastDanmakuTime = now;
    this.ws.send(JSON.stringify({
      type: 'danmaku',
      text: text.slice(0, 40),
      playerName: this.playerName
    }));
    return true;
  }

  canSendDanmaku(): boolean {
    return Date.now() - this.lastDanmakuTime >= 10000;
  }

  getDanmakuCooldownRemaining(): number {
    const elapsed = Date.now() - this.lastDanmakuTime;
    return Math.max(0, 10000 - elapsed);
  }

  setOnStateUpdate(callback: (state: GameStateData) => void): void {
    this.onStateUpdate = callback;
  }

  setOnDanmaku(callback: (msg: DanmakuMessage) => void): void {
    this.onDanmaku = callback;
  }

  setOnRaceEnded(callback: (msg: string) => void): void {
    this.onRaceEnded = callback;
  }

  getLastState(): GameStateData | null {
    return this.lastServerState;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
