import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceParticle,
  advanceParticles,
  attractParticle,
  createParticleRenderer,
  createParticleSimulation,
  followCursor,
  type Particle,
} from '../src/lib/particles';

const cursor = { x: 500, y: 450 };

test('慢启动时先约束附近的外漂，粒子不会在吸力建立前逃走', () => {
  for (const radius of [150, 170, 180]) {
    const point = { x: cursor.x + radius, y: cursor.y, vx: 0.6, vy: 0.25 };
    const simulation = createParticleSimulation();
    for (let frame = 0; frame < 1200; frame++)
      simulation.advance([point], 1200, 900, cursor);
    assert.ok(Math.hypot(point.x - cursor.x, point.y - cursor.y) < 90);
  }
});

test('移动鼠标不会把已经聚合的点整圈拖走', () => {
  const point = { x: cursor.x + 80, y: cursor.y, vx: 0.1, vy: 0.2 };
  const simulation = createParticleSimulation();
  for (let frame = 0; frame < 600; frame++)
    simulation.advance([point], 1200, 900, cursor);
  const before = { ...point };
  simulation.advance([point], 1200, 900, { x: cursor.x + 40, y: cursor.y });
  assert.ok(
    Math.hypot(point.x - before.x, point.y - before.y) < 2,
    '旧圈应从原位置松开，不能随鼠标刚性平移',
  );
});

test('释放从当前位置恢复漂移，不瞬移回隐藏的背景轨迹', () => {
  const point = { x: cursor.x + 180, y: cursor.y, vx: 0.2, vy: 0 };
  const simulation = createParticleSimulation();
  for (let frame = 0; frame < 600; frame++)
    simulation.advance([point], 1200, 900, cursor);
  const before = { ...point };
  simulation.advance([point], 1200, 900, null);
  assert.ok(
    Math.hypot(point.x - before.x, point.y - before.y) < 2,
    '释放时出现了位置跳变',
  );
  assert.ok(point.x > before.x, '离开吸附区后应恢复原有漂移');
});

test('鼠标静止时后来进入的真实粒子也会受到吸附', () => {
  const point = { x: cursor.x + 360, y: cursor.y, vx: -0.8, vy: 0 };
  const simulation = createParticleSimulation();
  for (let frame = 0; frame < 600; frame++)
    simulation.advance([point], 1200, 900, cursor);
  assert.ok(simulation.members.has(point), '后来进入的点被固定名单排除');
});

test('长时间停留保留缓慢自然漂移，不锁死成静态图形', () => {
  const point = { x: cursor.x + 76, y: cursor.y, vx: 0, vy: 0.2 };
  const simulation = createParticleSimulation();
  for (let frame = 0; frame < 1500; frame++)
    simulation.advance([point], 1200, 900, cursor);
  const before = { ...point };
  for (let frame = 0; frame < 120; frame++)
    simulation.advance([point], 1200, 900, cursor);
  assert.ok(
    Math.hypot(point.x - before.x, point.y - before.y) > 1,
    '长时间停留后节点被冻结',
  );
});

interface Position {
  x: number;
  y: number;
}
function canvasRecorder() {
  let start: Position = { x: 0, y: 0 };
  const edges: { from: Position; to: Position }[] = [];
  const calls = { dots: 0, strokes: 0, clears: 0, widest: 0 };
  const context = {
    clearRect: () => {
      calls.clears++;
      calls.dots = calls.strokes = calls.widest = 0;
      edges.length = 0;
    },
    fillRect: () => {
      calls.dots++;
    },
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      start = { x, y };
    },
    lineTo: (x: number, y: number) => {
      edges.push({ from: start, to: { x, y } });
    },
    stroke: () => {
      calls.strokes++;
      calls.widest = Math.max(calls.widest, context.lineWidth);
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, calls, edges };
}
const same = (a: Position, b: Position) =>
  Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;

test('周围已有粒子逐个靠近，实际进入范围后才出现中心连线', () => {
  for (const rate of [30, 60, 120, 144]) {
    const points = Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      const radius = 160 + index * 2;
      return {
        x: cursor.x + Math.cos(angle) * radius,
        y: cursor.y + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
    const originals = [...points];
    const simulation = createParticleSimulation();
    const recorder = canvasRecorder();
    const render = createParticleRenderer(recorder.context);
    let spokes = 0;
    for (let frame = 0; frame < rate * 10; frame++) {
      const before = structuredClone(points);
      simulation.advance(points, 1200, 900, cursor, 60 / rate);
      render(points, 1200, 900, cursor, { step: 60 / rate });
      const centerEdges = recorder.edges.filter((edge) =>
        same(edge.to, cursor),
      );
      spokes = centerEdges.length;
      for (const edge of centerEdges) {
        assert.ok(
          points.some((point) => same(point, edge.from)),
          '连线必须连接真实粒子',
        );
        assert.ok(
          Math.hypot(edge.from.x - cursor.x, edge.from.y - cursor.y) <
            Math.sqrt(20000),
          '粒子进入距离范围前不能连到中心',
        );
      }
      if (frame < rate / 2) assert.equal(spokes, 0, '远处粒子不能凭空连到中心');
      for (let index = 0; index < points.length; index++)
        assert.ok(
          Math.hypot(
            points[index]!.x - before[index]!.x,
            points[index]!.y - before[index]!.y,
          ) /
            (60 / rate) <
            1.25,
          '聚拢不能瞬移',
        );
    }
    assert.equal(spokes, 12, '不同距离的周围粒子最终应实际接入线网');
    assert.equal(points.length, originals.length);
    for (let index = 0; index < points.length; index++)
      assert.equal(points[index], originals[index]);
    const beforeReset = structuredClone(points);
    simulation.reset();
    assert.deepEqual(points, beforeReset, '清除影响状态不能改变真实位置');
  }
});

test('线条预算不会把后来进入的物理粒子排除在吸附之外', () => {
  const points = Array.from({ length: 36 }, (_, index) => {
    const angle = (index / 36) * Math.PI * 2;
    return {
      x: cursor.x + Math.cos(angle) * 160,
      y: cursor.y + Math.sin(angle) * 160,
      vx: 0,
      vy: 0,
    };
  });
  const simulation = createParticleSimulation();
  for (let frame = 0; frame < 600; frame++)
    simulation.advance(points, 1200, 900, cursor);
  assert.equal(
    simulation.members.size,
    points.length,
    '范围内不能存在固定名单外节点',
  );
  for (const point of points)
    assert.ok(Math.hypot(point.x - cursor.x, point.y - cursor.y) < 85);
  const recorder = canvasRecorder();
  const render = createParticleRenderer(recorder.context);
  for (let frame = 0; frame < 60; frame++) render(points, 1200, 900, cursor);
  const spokes = recorder.edges.filter((edge) => same(edge.to, cursor));
  assert.ok(spokes.length > 0 && spokes.length <= 18);
  assert.ok(
    spokes.some((edge) => edge.from.x < cursor.x) &&
      spokes.some((edge) => edge.from.x > cursor.x),
    '中心线应覆盖左右两侧',
  );
});

test('外部近邻接入同一线网，不被成员分组隔离', () => {
  const points = [100, 150, 190, 200].map((radius) => ({
    x: cursor.x + radius,
    y: cursor.y,
    vx: -0.5,
    vy: 0,
  }));
  const recorder = canvasRecorder();
  const render = createParticleRenderer(recorder.context);
  for (let frame = 0; frame < 60; frame++) render(points, 1200, 900, cursor);
  const joined = (a: Particle, b: Particle) =>
    recorder.edges.some(
      (edge) =>
        (same(edge.from, a) && same(edge.to, b)) ||
        (same(edge.from, b) && same(edge.to, a)),
    );
  assert.equal(recorder.calls.dots, points.length, '聚拢不能挖空背景');
  assert.equal(recorder.context.globalAlpha, 1);
  assert.ok(joined(points[0]!, points[1]!), '吸附范围的节点应保留外部近邻连接');
  assert.ok(joined(points[2]!, points[3]!));
  assert.ok(
    recorder.edges.some(
      (edge) => same(edge.from, points[0]!) && same(edge.to, cursor),
    ),
  );
  render(points, 1200, 900, null);
  assert.equal(
    recorder.edges.filter((edge) => same(edge.to, cursor)).length,
    0,
  );
  assert.ok(joined(points[0]!, points[1]!), '释放影响后仍应绘制真实背景近邻');
});

test('较粗的局部三角网保留斜边和内圈，不跨越远距离强制闭合', () => {
  const points = [
    { x: 576, y: 450, vx: 0, vy: 0 },
    { x: 570, y: 470, vx: 0, vy: 0 },
    { x: 565, y: 485, vx: 0, vy: 0 },
    { x: 534, y: 460, vx: 0, vy: 0 },
    { x: 424, y: 450, vx: 0, vy: 0 },
  ];
  const recorder = canvasRecorder();
  const render = createParticleRenderer(recorder.context);
  for (let frame = 0; frame < 60; frame++) render(points, 1200, 900, cursor);
  const joined = (a: Particle, b: Particle) =>
    recorder.edges.some(
      (edge) =>
        (same(edge.from, a) && same(edge.to, b)) ||
        (same(edge.from, b) && same(edge.to, a)),
    );
  assert.ok(
    joined(points[0]!, points[1]!) &&
      joined(points[1]!, points[2]!) &&
      joined(points[0]!, points[2]!),
    '真实近邻应形成三角形',
  );
  assert.ok(joined(points[0]!, points[3]!), '内圈节点应接入近邻');
  assert.ok(!joined(points[0]!, points[4]!), '不能为补全轮廓跨越远距离缺口');
  assert.ok(recorder.calls.widest > 1, '短边需要呈现加粗后的线宽');
});

test('内圈静止点保留原位置，有速度的点保留自然漂移', () => {
  const points = [0, 24, 51, 68].map((radius, index) => ({
    x: cursor.x + Math.cos(index) * radius,
    y: cursor.y + Math.sin(index) * radius,
    vx: 0,
    vy: 0,
  }));
  const simulation = createParticleSimulation();
  const before = structuredClone(points);
  for (let frame = 0; frame < 600; frame++)
    simulation.advance(points, 1200, 900, cursor);
  assert.deepEqual(points, before, '静止内圈节点不能被撑到统一圆周');
  points[1]!.vx = 0.2;
  points[1]!.vy = -0.3;
  simulation.advance(points, 1200, 900, cursor);
  assert.ok(points[1]!.x > before[1]!.x && points[1]!.y < before[1]!.y);
});

test('吸附的内外边界连续启停，远处保持自由运动', () => {
  for (const radius of [76, 220]) {
    const displacements = [-0.001, 0.001].map((offset) => {
      const point = {
        x: cursor.x + radius + offset,
        y: cursor.y,
        vx: 0,
        vy: 0,
      };
      const before = point.x;
      attractParticle(point, cursor);
      return point.x - before;
    });
    assert.ok(Math.abs(displacements[0]! - displacements[1]!) < 0.001);
  }
  const point = { x: cursor.x + 260, y: cursor.y, vx: 0.4, vy: -0.3 };
  advanceParticles([point], 1200, 900, cursor);
  assert.equal(point.x, cursor.x + 260.4);
  assert.equal(point.y, cursor.y - 0.3);
});

test('朝外漂移的周围粒子被缓慢拉入，释放后恢复原有速度', () => {
  const point = { x: cursor.x + 130, y: cursor.y, vx: 1, vy: 0 };
  for (let frame = 0; frame < 600; frame++)
    advanceParticles([point], 1200, 900, cursor);
  assert.ok(point.x - cursor.x < 85, '吸附应能克服范围内的朝外漂移');
  assert.equal(point.vx, 1);
  const before = { ...point };
  advanceParticles([point], 1200, 900, null);
  assert.equal(point.x, before.x + 1);
});

test('不同刷新率下的聚拢与鼠标移动响应一致', () => {
  function simulate(rate: number) {
    const points = [
      { x: cursor.x + 180, y: cursor.y, vx: 0.6, vy: 0.25 },
      { x: cursor.x - 145, y: cursor.y - 20, vx: -0.4, vy: 0.3 },
    ];
    const simulation = createParticleSimulation();
    for (let frame = 0; frame < rate * 8; frame++)
      simulation.advance(points, 1200, 900, cursor, 60 / rate);
    for (let frame = 0; frame < rate * 2; frame++) {
      const progress = Math.min(1, (frame + 1) / (rate / 2));
      simulation.advance(
        points,
        1200,
        900,
        { x: cursor.x + 40 * progress, y: cursor.y + 20 * progress },
        60 / rate,
      );
    }
    return points;
  }
  const reference = simulate(60);
  for (const rate of [30, 120, 144])
    for (const [index, point] of simulate(rate).entries())
      assert.ok(
        Math.hypot(
          point.x - reference[index]!.x,
          point.y - reference[index]!.y,
        ) < 1,
        rate + 'Hz 运动偏离',
      );
});

test('视口边缘连续反弹，中心重合和零时长不会产生 NaN', () => {
  const point: Particle = { x: 99.5, y: 0.5, vx: 1, vy: -1 };
  advanceParticle(point, 100, 100);
  assert.equal(point.vx, -1);
  assert.equal(point.vy, 1);
  advanceParticle(point, 100, 100);
  assert.equal(point.x, 99.5);
  assert.equal(point.y, 0.5);
  const before = { ...point };
  advanceParticles([point], 100, 100, cursor, 0);
  assert.deepEqual(point, before);
  attractParticle(point, { x: point.x, y: point.y });
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  const edge = { x: 2, y: 2, vx: -1, vy: -1 };
  for (let frame = 0; frame < 600; frame++)
    advanceParticles([edge], 1200, 900, { x: 0, y: 0 });
  assert.ok(
    edge.x >= -1 &&
      edge.y >= -1 &&
      Number.isFinite(edge.x) &&
      Number.isFinite(edge.y),
  );
});

test('鼠标跟随按时间平滑补齐事件间隔，松开后立即清除', () => {
  const target = { x: 100, y: 200 };
  let current = followCursor(null, target)!;
  assert.notEqual(current, target);
  target.x = 130;
  current = followCursor(current, target, 7 / (1000 / 60))!;
  assert.ok(current.x > 100 && current.x < 130);
  const before = current.x;
  current = followCursor(current, target, 7 / (1000 / 60))!;
  assert.ok(current.x > before && current.x < 130);
  assert.equal(followCursor(current, null), null);
});

test('鼠标跟随在不同刷新率下具有相同响应时间', () => {
  const samples = [60, 120, 144].map((rate) => {
    let current = { x: 0, y: 0 };
    for (let frame = 0; frame < rate / 12; frame++)
      current = followCursor(current, { x: 100, y: 200 }, 60 / rate)!;
    return current;
  });
  assert.ok(samples[0]!.x > 90 && samples[0]!.x < 100);
  for (const sample of samples)
    assert.ok(
      Math.hypot(sample.x - samples[0]!.x, sample.y - samples[0]!.y) < 1e-8,
    );
});

test('密集线网保持有界边数和批量描边，重绘不改变粒子或残留旧线', () => {
  const recorder = canvasRecorder();
  const points = Array.from({ length: 120 }, (_, index) => ({
    x: cursor.x + ((index % 11) - 5) * 2 + 0.3,
    y: cursor.y + (Math.floor(index / 11) - 4) * 2 + 0.7,
    vx: 0.6,
    vy: 0.2,
  }));
  const before = structuredClone(points);
  const render = createParticleRenderer(recorder.context);
  for (let frame = 0; frame < 60; frame++) render(points, 1200, 900, cursor);
  const spokes = recorder.edges.filter((edge) => same(edge.to, cursor));
  const key = (a: Position, b: Position) =>
    [a, b]
      .map((p) => p.x + ',' + p.y)
      .sort()
      .join('|');
  assert.equal(recorder.calls.dots, points.length);
  assert.ok(spokes.length <= 18);
  assert.ok(
    recorder.edges.length > 0 &&
      recorder.edges.length <= points.length * 3 + 18,
  );
  assert.equal(
    new Set(recorder.edges.map((edge) => key(edge.from, edge.to))).size,
    recorder.edges.length,
    '无向边不能重复加深',
  );
  assert.ok(recorder.calls.strokes > 0 && recorder.calls.strokes <= 32);
  assert.deepEqual(points, before, '绘制不能推进运动状态');
  render([{ x: 1, y: 1, vx: 0, vy: 0 }], 1200, 900, cursor);
  assert.equal(recorder.edges.length, 0);
  assert.equal(recorder.calls.strokes, 0);
});
