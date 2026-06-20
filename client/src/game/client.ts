import type { GameStateData, Ship, InputState } from '../types/game';

export class GameClient {
  private ws: WebSocket | null = null;
  private roomId: string;
  private playerId: string;
  private serverTimeOffset = 0;
  private lastServerState: GameStateData | null = null;
  private previousServerState: GameStateData | null = null;
  private lastServerTime = 0;
  private onStateUpdate: ((state: GameStateData) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(roomId: string, playerId: string) {
    this.roomId = roomId;
    this.playerId = playerId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/game/${this.roomId}/${this.playerId}`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.sendPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };
    });
  }

  private handleMessage(data: any): void {
    if (data.type === 'state') {
      this.previousServerState = this.lastServerState;
      this.lastServerState = data.data as GameStateData;
      this.lastServerTime = data.timestamp;
      
      if (this.onStateUpdate && this.lastServerState) {
        this.onStateUpdate(this.lastServerState);
      }
    }

    if (data.type === 'pong') {
      const now = Date.now();
      const latency = (now - data.timestamp) / 2;
      this.serverTimeOffset = data.serverTimestamp - (now - latency);
    }
  }

  private sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }));
    }

    setTimeout(() => this.sendPing(), 3000);
  }

  sendInput(input: InputState): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'input',
        input
      }));
    }
  }

  setOnStateUpdate(callback: (state: GameStateData) => void): void {
    this.onStateUpdate = callback;
  }

  getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  getLastState(): GameStateData | null {
    return this.lastServerState;
  }

  getInterpolatedShips(shipList: Ship[]): Ship[] {
    if (!this.previousServerState || !this.lastServerState) {
      return shipList;
    }

    const now = this.getServerTime();
    const timeSinceLastUpdate = now - this.lastServerTime;
    const serverDelta = this.lastServerTime - (this.previousServerState?.room.raceStartTime || 0);
    const alpha = Math.min(timeSinceLastUpdate / 50, 1);

    if (alpha <= 0 || !this.previousServerState) {
      return shipList;
    }

    return shipList.map(currentShip => {
      const prevShip = this.previousServerState?.ships.find(s => s.id === currentShip.id);
      if (!prevShip) return currentShip;

      return {
        ...currentShip,
        position: {
          x: prevShip.position.x + (currentShip.position.x - prevShip.position.x) * alpha,
          y: prevShip.position.y + (currentShip.position.y - prevShip.position.y) * alpha
        },
        angle: this.lerpAngle(prevShip.angle, currentShip.angle, alpha)
      };
    });
  }

  private lerpAngle(a: number, b: number, t: number): number {
    const diff = b - a;
    const adjusted = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a + adjusted * t;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(() => {
        this.attemptReconnect();
      });
    }, delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getLatency(): number {
    return 0;
  }
}
