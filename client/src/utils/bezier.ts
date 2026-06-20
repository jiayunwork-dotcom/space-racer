import type { Vector2 } from '../types/game';
import { vec2, vecSub, vecMul, vecNormalize } from './vector';

export function bezierPoint(points: Vector2[], t: number): Vector2 {
  if (points.length === 1) return { ...points[0] };
  
  const newPoints: Vector2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPoints.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t
    });
  }
  
  return bezierPoint(newPoints, t);
}

export function bezierTangent(points: Vector2[], t: number): Vector2 {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  
  const derivativePoints: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y)
    });
  }
  
  return bezierPoint(derivativePoints, t);
}

export function bezierNormal(points: Vector2[], t: number): Vector2 {
  const tangent = bezierTangent(points, t);
  const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -tangent.y / len, y: tangent.x / len };
}

export interface BezierSample {
  point: Vector2;
  tangent: Vector2;
  normal: Vector2;
  t: number;
}

export function sampleBezier(points: Vector2[], segments: number = 100): BezierSample[] {
  const samples: BezierSample[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    samples.push({
      point: bezierPoint(points, t),
      tangent: bezierTangent(points, t),
      normal: bezierNormal(points, t),
      t
    });
  }
  return samples;
}

export function drawBezierPath(
  ctx: CanvasRenderingContext2D,
  points: Vector2[]
): void {
  if (points.length < 4) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i += 3) {
    if (i + 2 < points.length) {
      ctx.bezierCurveTo(
        points[i].x, points[i].y,
        points[i + 1].x, points[i + 1].y,
        points[i + 2].x, points[i + 2].y
      );
    }
  }

  ctx.closePath();
}

export function drawBezierStroke(
  ctx: CanvasRenderingContext2D,
  points: Vector2[]
): void {
  if (points.length < 4) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i += 3) {
    if (i + 2 < points.length) {
      ctx.bezierCurveTo(
        points[i].x, points[i].y,
        points[i + 1].x, points[i + 1].y,
        points[i + 2].x, points[i + 2].y
      );
    }
  }
}

export function createCircleControlPoints(
  cx: number,
  cy: number,
  radius: number,
  segments: number = 8
): Vector2[] {
  const points: Vector2[] = [];
  const controlOffset = radius * 0.5522847498;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const nextAngle = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;

    const startPoint = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };

    const endPoint = {
      x: cx + Math.cos(nextAngle) * radius,
      y: cy + Math.sin(nextAngle) * radius
    };

    const startTangent = {
      x: -Math.sin(angle) * controlOffset,
      y: Math.cos(angle) * controlOffset
    };

    const endTangent = {
      x: -Math.sin(nextAngle) * controlOffset,
      y: Math.cos(nextAngle) * controlOffset
    };

    if (i === 0) {
      points.push(startPoint);
    }
    points.push({ x: startPoint.x + startTangent.x, y: startPoint.y + startTangent.y });
    points.push({ x: endPoint.x - endTangent.x, y: endPoint.y - endTangent.y });
    if (i === segments - 1) {
      points.push(endPoint);
    }
  }

  return points;
}

export function pointToBezierDistance(
  px: number,
  py: number,
  samples: BezierSample[]
): { distance: number; closestPoint: Vector2; index: number } {
  let minDist = Infinity;
  let closestPoint: Vector2 = { x: 0, y: 0 };
  let closestIndex = 0;

  for (let i = 0; i < samples.length; i++) {
    const dx = px - samples[i].point.x;
    const dy = py - samples[i].point.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < minDist) {
      minDist = dist;
      closestPoint = samples[i].point;
      closestIndex = i;
    }
  }

  return { distance: minDist, closestPoint, index: closestIndex };
}

export function isPointInsideClosedBezier(
  point: Vector2,
  samples: BezierSample[]
): boolean {
  let crossings = 0;
  
  for (let i = 0; i < samples.length - 1; i++) {
    const p1 = samples[i].point;
    const p2 = samples[i + 1].point;
    
    if (((p1.y <= point.y && p2.y > point.y) ||
         (p1.y > point.y && p2.y <= point.y))) {
      const t = (point.y - p1.y) / (p2.y - p1.y);
      const xIntersect = p1.x + t * (p2.x - p1.x);
      if (point.x < xIntersect) {
        crossings++;
      }
    }
  }
  
  return crossings % 2 === 1;
}

export function isPointInTrack(
  point: Vector2,
  outerSamples: BezierSample[],
  innerSamples: BezierSample[]
): boolean {
  const insideOuter = isPointInsideClosedBezier(point, outerSamples);
  const insideInner = isPointInsideClosedBezier(point, innerSamples);
  return insideOuter && !insideInner;
}

export function getTrackBoundaryCollision(
  point: Vector2,
  radius: number,
  outerSamples: BezierSample[],
  innerSamples: BezierSample[]
): { collided: boolean; normal: Vector2; pushOut: Vector2 } {
  const insideOuter = isPointInsideClosedBezier(point, outerSamples);
  const insideInner = isPointInsideClosedBezier(point, innerSamples);

  if (insideOuter && !insideInner) {
    const outerDist = pointToBezierDistance(point.x, point.y, outerSamples);
    const innerDist = pointToBezierDistance(point.x, point.y, innerSamples);

    if (outerDist.distance < radius) {
      const normal = vecNormalize(vecSub(point, outerDist.closestPoint));
      const pushAmount = radius - outerDist.distance;
      return {
        collided: true,
        normal,
        pushOut: vecMul(normal, pushAmount)
      };
    }

    if (innerDist.distance < radius) {
      const normal = vecNormalize(vecSub(innerDist.closestPoint, point));
      const pushAmount = radius - innerDist.distance;
      return {
        collided: true,
        normal,
        pushOut: vecMul(normal, pushAmount)
      };
    }

    return { collided: false, normal: vec2(), pushOut: vec2() };
  }

  if (!insideOuter) {
    const outerDist = pointToBezierDistance(point.x, point.y, outerSamples);
    const normal = vecNormalize(vecSub(point, outerDist.closestPoint));
    const pushAmount = radius + outerDist.distance;
    return {
      collided: true,
      normal,
      pushOut: vecMul(normal, pushAmount)
    };
  }

  if (insideInner) {
    const innerDist = pointToBezierDistance(point.x, point.y, innerSamples);
    const normal = vecNormalize(vecSub(innerDist.closestPoint, point));
    const pushAmount = radius + innerDist.distance;
    return {
      collided: true,
      normal,
      pushOut: vecMul(normal, pushAmount)
    };
  }

  return { collided: false, normal: vec2(), pushOut: vec2() };
}
