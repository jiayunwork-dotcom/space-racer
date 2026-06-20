import type { InputState } from '../types/game';

export class InputManager {
  private keys: Set<string> = new Set();
  private inputState: InputState = {
    thrust: false,
    left: false,
    right: false,
    useItem: false
  };
  private onInputChange: ((input: InputState) => void) | null = null;
  private useItemPressed = false;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    
    this.keys.add(e.key.toLowerCase());
    this.updateInputState();
    
    if (e.key === ' ') {
      this.useItemPressed = true;
    }
    
    if (this.onInputChange) {
      this.onInputChange(this.getInputState());
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
    this.updateInputState();
    
    if (this.onInputChange) {
      this.onInputChange(this.getInputState());
    }
  }

  private updateInputState(): void {
    this.inputState.thrust = this.keys.has('w') || this.keys.has('arrowup');
    this.inputState.left = this.keys.has('a') || this.keys.has('arrowleft');
    this.inputState.right = this.keys.has('d') || this.keys.has('arrowright');
    this.inputState.useItem = this.useItemPressed;
  }

  getInputState(): InputState {
    const state = { ...this.inputState };
    this.useItemPressed = false;
    this.inputState.useItem = false;
    return state;
  }

  getCurrentState(): InputState {
    return { ...this.inputState };
  }

  setOnInputChange(callback: (input: InputState) => void): void {
    this.onInputChange = callback;
  }

  resetUseItem(): void {
    this.useItemPressed = false;
    this.inputState.useItem = false;
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
}
