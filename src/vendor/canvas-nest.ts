/*!
 * Direct TypeScript port of canvas-nest.js (MIT), Copyright (c) 2015 Hust.cc.
 * Source: https://siaimes.github.io/lib/canvas-nest/canvas-nest.min.js
 * Upstream: https://github.com/hustcc/canvas-nest.js
 * Full license: /third-party-notices.txt
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Position {
  x: number;
  y: number;
}

export function createCanvasNestFrame(ctx: CanvasRenderingContext2D) {
  const remaining: Position[] = [];
  return function paint(
    points: Particle[],
    width: number,
    height: number,
    cursor: Position | null,
    advance = true,
    step = 1,
  ) {
    ctx.clearRect(0, 0, width, height);
    // Only the time scale changes; step=1 remains exactly the reference.
    const pull = step === 1 ? 0.03 : -Math.expm1(Math.log1p(-0.03) * step);
    remaining.length = 0;
    if (cursor) remaining.push(cursor);
    remaining.push(...points);
    for (const point of points) {
      if (advance) {
        point.x += point.vx * step;
        point.y += point.vy * step;
        point.vx *= point.x > width || point.x < 0 ? -1 : 1;
        point.vy *= point.y > height || point.y < 0 ? -1 : 1;
      }
      // The reference draws only real ambient particles. The mouse is a
      // distance/line endpoint, never an added particle or a painted centre.
      ctx.fillRect(point.x - 0.5, point.y - 0.5, 1, 1);
      for (const neighbour of remaining) {
        if (point === neighbour) continue;
        const dx = point.x - neighbour.x;
        const dy = point.y - neighbour.y;
        const distance = dx * dx + dy * dy;
        const range = neighbour === cursor ? 20000 : 6000;
        if (distance >= range) continue;
        if (advance && neighbour === cursor && distance >= range / 2) {
          point.x -= pull * dx;
          point.y -= pull * dy;
        }
        const strength = (range - distance) / range;
        ctx.beginPath();
        ctx.lineWidth = strength / 2;
        ctx.strokeStyle = `rgba(0,0,255,${strength + 0.2})`;
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(neighbour.x, neighbour.y);
        ctx.stroke();
      }
      // Preserve the original interleaved move/draw order: future particles
      // retain their previous positions until their own turn in this frame.
      remaining.splice(remaining.indexOf(point), 1);
    }
  };
}
