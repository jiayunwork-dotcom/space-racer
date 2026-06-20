import type { Vector2 } from '../types/game';
import { vec2, vecAdd, vecMul, vecSub, vecDistance, vecNormalize, vecDot } from './vector';

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

export function closedBezierLength(samples: BezierSample[]): number {
  let length = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    length += vecDistance(samples[i].point, samples[i + 1].point);
  }
  return length;
}

export function pointToBezierDistance(
  point: Vector2,
  samples: BezierSample[]
): { distance: number; closestPoint: Vector2; normal: Vector2; sampleIndex: number } {
  let minDist = Infinity;
  let closestPoint: Vector2 = vec2();
  let closestNormal: Vector2 = vec2(0, -1);
  let closestIndex = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const dist = vecDistance(point, sample.point);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = sample.point;
      closestNormal = sample.normal;
      closestIndex = i;
    }
  }

  return {
    distance: minDist,
    closestPoint,
    normal: closestNormal,
    sampleIndex: closestIndex
  };
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
    const outerDist = pointToBezierDistance(point, outerSamples);
    const innerDist = pointToBezierDistance(point, innerSamples);

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
    const outerDist = pointToBezierDistance(point, outerSamples);
    const normal = vecNormalize(vecSub(point, outerDist.closestPoint));
    const pushAmount = radius + outerDist.distance;
    return {
      collided: true,
      normal,
      pushOut: vecMul(normal, pushAmount)
    };
  }

  if (insideInner) {
    const innerDist = pointToBezierDistance(point, innerSamples);
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

export function createCircleControlPoints(
  center: Vector2,
  radius: number,
  segments: number = 8
): Vector2[] {
  const points: Vector2[] = [];
  const controlOffset = radius * 0.5522847498;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const nextAngle = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;

    const startPoint = vec2(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius
    );

    const endPoint = vec2(
      center.x + Math.cos(nextAngle) * radius,
      center.y + Math.sin(nextAngle) * radius
    );

    const startTangent = vec2(
      -Math.sin(angle) * controlOffset,
      Math.cos(angle) * controlOffset
    );

    const endTangent = vec2(
      -Math.sin(nextAngle) * controlOffset,
      Math.cos(nextAngle) * controlOffset
    );

    if (i === 0) {
      points.push(startPoint);
    }
    points.push(vecAdd(startPoint, startTangent));
    points.push(vecSub(endPoint, endTangent));
    if (i === segments - 1) {
      points.push(endPoint);
    }
  }

  return points;
}
