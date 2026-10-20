/*!
 * Direct TypeScript port of canvas-nest.js (MIT), Copyright (c) 2015 Hust.cc.
 * Source: https://siaimes.github.io/lib/canvas-nest/canvas-nest.min.js
 * Upstream: https://github.com/hustcc/canvas-nest.js
 * Full license: /third-party-notices.txt
 * Optional gentleCollection refinements leave the default upstream behaviour intact.
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

export function createCanvasNestFrame(
  ctx: CanvasRenderingContext2D,
  options: { gentleCollection?: boolean } = {},
) {
  const remaining: Position[] = [];
  const rim: {
    point: Particle;
    angle: number;
    radius: number;
    turn: number;
  }[] = [];
  function gapPressure(gap: number, spacing: number) {
    return gap - Math.max(spacing * 0.65, Math.min(gap, spacing * 1.5));
  }
  return function paint(
    points: Particle[],
    width: number,
    height: number,
    cursor: Position | null,
    advance = true,
    step = 1,
  ) {
    if (options.gentleCollection && advance && cursor) {
      let count = 0;
      for (const point of points) {
        const dx = point.x - cursor.x;
        const dy = point.y - cursor.y;
        const radius = Math.hypot(dx, dy);
        if (radius < 90 || radius >= 120) continue;
        const entry = rim[count] ?? {
          point,
          angle: 0,
          radius: 0,
          turn: 0,
        };
        entry.point = point;
        entry.angle = Math.atan2(dy, dx);
        entry.radius = radius;
        rim[count++] = entry;
      }
      rim.length = count;
      if (count >= 4) {
        rim.sort((a, b) => a.angle - b.angle);
        const spacing = (Math.PI * 2) / count;
        // Let actual neighbours gently make room. Ordinary density differences
        // have no pressure; there are no target slots or additional particles.
        for (let index = 0; index < count; index++) {
          const entry = rim[index]!;
          const previous = rim[(index + count - 1) % count]!;
          const next = rim[(index + 1) % count]!;
          const before =
            entry.angle - previous.angle + (index === 0 ? Math.PI * 2 : 0);
          const after =
            next.angle - entry.angle + (index === count - 1 ? Math.PI * 2 : 0);
          const limit = (0.12 * step) / entry.radius;
          entry.turn = Math.max(
            -limit,
            Math.min(
              limit,
              (gapPressure(after, spacing) - gapPressure(before, spacing)) *
                0.003 *
                step,
            ),
          );
        }
        // Apply the snapshot together so array order cannot favour one side.
        for (const entry of rim) {
          if (!entry.turn) continue;
          const angle = entry.angle + entry.turn;
          const x = cursor.x + Math.cos(angle) * entry.radius;
          const y = cursor.y + Math.sin(angle) * entry.radius;
          if (x < 0 || x > width || y < 0 || y > height) continue;
          entry.point.x = x;
          entry.point.y = y;
        }
      }
    }
    ctx.clearRect(0, 0, width, height);
    // With default options, step=1 remains exactly the reference.
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
          // Reduce the original boundary kick by up to a quarter, retaining
          // its subtle motion and full collection strength outside the rim.
          const softenedPull = options.gentleCollection
            ? pull *
              (0.75 + 0.25 * Math.min(1, (Math.sqrt(distance) - 100) / 8))
            : pull;
          point.x -= softenedPull * dx;
          point.y -= softenedPull * dy;
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
