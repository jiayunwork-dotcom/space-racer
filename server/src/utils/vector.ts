import type { Vector2 } from '../types/game';

export const vec2 = (x = 0, y = 0): Vector2 => ({ x, y });

export const vecAdd = (a: Vector2, b: Vector2): Vector2 => ({
  x: a.x + b.x,
  y: a.y + b.y
});

export const vecSub = (a: Vector2, b: Vector2): Vector2 => ({
  x: a.x - b.x,
  y: a.y - b.y
});

export const vecMul = (v: Vector2, scalar: number): Vector2 => ({
  x: v.x * scalar,
  y: v.y * scalar
});

export const vecDiv = (v: Vector2, scalar: number): Vector2 => ({
  x: v.x / scalar,
  y: v.y / scalar
});

export const vecDot = (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y;

export const vecLength = (v: Vector2): number => Math.sqrt(v.x * v.x + v.y * v.y);

export const vecLengthSq = (v: Vector2): number => v.x * v.x + v.y * v.y;

export const vecNormalize = (v: Vector2): Vector2 => {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

export const vecLimit = (v: Vector2, max: number): Vector2 => {
  const lenSq = vecLengthSq(v);
  if (lenSq > max * max) {
    const len = Math.sqrt(lenSq);
    return { x: (v.x / len) * max, y: (v.y / len) * max };
  }
  return { ...v };
};

export const vecRotate = (v: Vector2, angle: number): Vector2 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos
  };
};

export const vecDistance = (a: Vector2, b: Vector2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const vecDistanceSq = (a: Vector2, b: Vector2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const vecLerp = (a: Vector2, b: Vector2, t: number): Vector2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});

export const vecReflect = (v: Vector2, normal: Vector2): Vector2 => {
  const d = vecDot(v, normal);
  return {
    x: v.x - 2 * d * normal.x,
    y: v.y - 2 * d * normal.y
  };
};
