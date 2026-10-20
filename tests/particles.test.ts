import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  createCanvasNestFrame,
  type Particle,
  type Position,
} from '../src/vendor/canvas-nest';

// Execute the original site script as the oracle rather than duplicating its
// algorithm. The fixture preserves its script body and MIT attribution.
const originalScript = readFileSync(
  new URL('./fixtures/canvas-nest.min.js', import.meta.url),
  'utf8',
);
type DrawCall = (string | number)[];

function recorder() {
  const calls: DrawCall[] = [];
  const context = {
    clearRect: (...values: number[]) => calls.push(['clearRect', ...values]),
    fillRect: (...values: number[]) => calls.push(['fillRect', ...values]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...values: number[]) => calls.push(['moveTo', ...values]),
    lineTo: (...values: number[]) => calls.push(['lineTo', ...values]),
    stroke: () => calls.push(['stroke']),
    set lineWidth(value: number) {
      calls.push(['lineWidth', value]);
    },
    set strokeStyle(value: string) {
      calls.push(['strokeStyle', value]);
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

function seededValues(count: number, seed: number) {
  let state = seed >>> 0;
  return Array.from({ length: count * 4 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
}

function initialPoints(values: number[], width: number, height: number) {
  return Array.from({ length: values.length / 4 }, (_, index) => ({
    x: values[index * 4]! * width,
    y: values[index * 4 + 1]! * height,
    vx: values[index * 4 + 2]! * 2 - 1,
    vy: values[index * 4 + 3]! * 2 - 1,
  }));
}

function original(width: number, height: number, values: number[]) {
  const capture = recorder();
  const pending: (() => void)[] = [];
  let index = 0;
  const math = Object.create(Math) as Math;
  math.random = () => {
    assert.ok(index < values.length, '原脚本不能额外生成粒子');
    return values[index++]!;
  };
  const attributes: Record<string, string> = {
    color: '0,0,255',
    opacity: '0.5',
    count: String(values.length / 4),
    zindex: '-1',
  };
  const canvas = {
    style: { cssText: '' },
    getContext: () => capture.context,
  };
  const window = {
    innerWidth: width,
    innerHeight: height,
    requestAnimationFrame: (callback: () => void) => pending.push(callback),
    onmousemove: (_event: { clientX: number; clientY: number }) => {},
    onmouseout: () => {},
  };
  const document = {
    createElement: (name: string) => {
      assert.equal(name, 'canvas');
      return canvas;
    },
    getElementsByTagName: (name: string) => {
      if (name === 'script')
        return [
          {
            getAttribute: (key: string) => attributes[key.toLowerCase()],
          },
        ];
      assert.equal(name, 'body');
      return [
        { appendChild: (element: unknown) => assert.equal(element, canvas) },
      ];
    },
  };
  runInNewContext(originalScript, {
    Math: math,
    window,
    document,
    setTimeout: (callback: () => void) => pending.push(callback),
  });
  assert.equal(index, values.length);
  return {
    frame(cursor: Position | null) {
      if (cursor) window.onmousemove({ clientX: cursor.x, clientY: cursor.y });
      else window.onmouseout();
      capture.calls.length = 0;
      assert.equal(pending.length, 1, '原脚本每帧只安排一次重绘');
      pending.shift()!();
      return capture.calls;
    },
  };
}

test('移植与原站脚本逐帧一致：自由漂移、吸附、鼠标移动和离开', () => {
  const width = 1440;
  const height = 1000;
  for (const seed of [0x0a1c, 0x5ea]) {
    const values = seededValues(99, seed);
    const points = initialPoints(values, width, height);
    const oracle = original(width, height, values);
    const capture = recorder();
    const paint = createCanvasNestFrame(capture.context);
    for (let frame = 0; frame < 240; frame++) {
      const cursor =
        frame < 5 || (frame >= 140 && frame < 180) || frame >= 220
          ? null
          : frame < 65
            ? { x: 120, y: 500 }
            : frame < 100
              ? { x: 720, y: 500 }
              : frame < 140
                ? { x: 0, y: 0 }
                : { x: 1430, y: 995 };
      capture.calls.length = 0;
      paint(points, width, height, cursor);
      assert.deepEqual(
        capture.calls,
        oracle.frame(cursor),
        `seed=${seed}, frame=${frame}: 位置、绘制次序、线宽和颜色应一致`,
      );
    }
  }
});

test('移植保留原站边界反弹及先更新当前点、再连接尚未更新近邻的次序', () => {
  const width = 1024;
  const height = 512;
  const values = [
    [1023.5, 0.5, 0.75, -0.75],
    [0.5, 511.5, -0.75, 0.75],
    [612, 256, 0.5, 0],
    [650, 256, -0.5, 0.25],
    [512, 256, 0, 0],
    [570, 280, -0.25, 0.5],
  ].flatMap(([x, y, vx, vy]) => [
    x! / width,
    y! / height,
    (vx! + 1) / 2,
    (vy! + 1) / 2,
  ]);
  const points = initialPoints(values, width, height);
  const oracle = original(width, height, values);
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context);
  for (let frame = 0; frame < 120; frame++) {
    const cursor = frame < 60 ? { x: 512, y: 256 } : null;
    capture.calls.length = 0;
    paint(points, width, height, cursor);
    assert.deepEqual(capture.calls, oracle.frame(cursor), `frame=${frame}`);
  }
});

test('鼠标只作已有粒子的连线端点，不生成实体中心或远距离连线', () => {
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context);
  const points: Particle[] = [{ x: 100, y: 100, vx: 0, vy: 0 }];
  paint(points, 1000, 800, { x: 900, y: 700 });
  assert.deepEqual(capture.calls, [
    ['clearRect', 0, 0, 1000, 800],
    ['fillRect', 99.5, 99.5, 1, 1],
  ]);
  capture.calls.length = 0;
  paint(points, 1000, 800, { x: 150, y: 100 });
  assert.equal(capture.calls.filter(([name]) => name === 'fillRect').length, 1);
  assert.ok(
    capture.calls.some((call) => call[0] === 'lineTo' && call[1] === 150),
  );
  assert.equal(points.length, 1);
});

test('移入内容时在当前位置去掉光标连线并重画，不推进或重置真实粒子', () => {
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context);
  const points: Particle[] = [
    { x: 200, y: 200, vx: 0.5, vy: -0.25 },
    { x: 220, y: 210, vx: -0.5, vy: 0.25 },
  ];
  paint(points, 1000, 800, { x: 300, y: 200 });
  const before = structuredClone(points);
  capture.calls.length = 0;
  paint(points, 1000, 800, null, false);
  assert.deepEqual(points, before);
  assert.deepEqual(
    capture.calls.filter(([name]) => name === 'fillRect'),
    points.map(({ x, y }) => ['fillRect', x - 0.5, y - 0.5, 1, 1]),
  );
  assert.deepEqual(
    capture.calls.filter(([name]) => name === 'lineTo'),
    [['lineTo', points[1]!.x, points[1]!.y]],
    '释放只保留已有粒子之间的近邻边',
  );
});

test('七成速度同时放慢漂移和吸附，保留原站距离与绘制规则', () => {
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context);
  const slow = [{ x: 200, y: 200, vx: 0.5, vy: -0.25 }];
  for (let frame = 0; frame < 60; frame++)
    paint(slow, 1000, 800, null, true, 0.7);
  assert.ok(Math.abs(slow[0]!.x - 221) < 1e-10);
  assert.ok(Math.abs(slow[0]!.y - 189.5) < 1e-10);

  const normalRim = [{ x: 620, y: 450, vx: 0, vy: 0 }];
  const slowRim = structuredClone(normalRim);
  paint(normalRim, 1000, 800, { x: 500, y: 450 });
  paint(slowRim, 1000, 800, { x: 500, y: 450 }, true, 0.7);
  assert.ok(slowRim[0]!.x > normalRim[0]!.x && slowRim[0]!.x < 620);
  assert.ok(Math.abs(slowRim[0]!.x - (500 + 120 * 0.97 ** 0.7)) < 1e-10);
  const before = structuredClone(slowRim);
  paint(slowRim, 1000, 800, null, false, 0.7);
  assert.deepEqual(slowRim, before, '减速不能改变即时释放时的位置');
});

test('轻柔聚拢减少边缘跳动，同时保留微动与远处粒子的原有运动', () => {
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context, {
    gentleCollection: true,
  });
  const points = [
    { x: 600, y: 450, vx: 0.5, vy: 0 },
    { x: 850, y: 450, vx: -0.25, vy: 0.125 },
  ];
  const radii: number[] = [];
  for (let frame = 0; frame < 240; frame++) {
    capture.calls.length = 0;
    paint(points, 1200, 900, { x: 500, y: 450 }, true, 0.7);
    if (frame >= 120) radii.push(points[0]!.x - 500);
  }
  const variation = Math.max(...radii) - Math.min(...radii);
  assert.ok(variation < 1.8, `边缘跳动应小于原版约2.1px，实际${variation}`);
  assert.ok(variation > 0.4, '仍保留原站的轻微自然抖动');
  assert.ok(Math.abs(points[1]!.x - 808) < 1e-9);
  assert.ok(Math.abs(points[1]!.y - 471) < 1e-9);
});

test('轻柔聚拢逐步缩小大缺口，保留疏密与真实粒子', () => {
  const capture = recorder();
  const paint = createCanvasNestFrame(capture.context, {
    gentleCollection: true,
  });
  const cursor = { x: 500, y: 450 };
  const points = [
    -155, -125, -95, -65, -35, -5, 25, 55, 85, 85.5, 86, 86.5,
  ].map((degrees) => ({
    x: cursor.x + Math.cos((degrees * Math.PI) / 180) * 99.5,
    y: cursor.y + Math.sin((degrees * Math.PI) / 180) * 99.5,
    vx: 0,
    vy: 0,
  }));
  const gaps = () => {
    const angles = points
      .map((point) => Math.atan2(point.y - cursor.y, point.x - cursor.x))
      .sort((a, b) => a - b);
    return angles.map((angle, index) =>
      index + 1 < angles.length
        ? angles[index + 1]! - angle
        : angles[0]! + 2 * Math.PI - angle,
    );
  };
  const before = Math.max(...gaps());
  const initial = structuredClone(points);
  paint(points, 1200, 900, cursor, true, 0.7);
  assert.ok(
    points.every(
      (point, index) =>
        Math.hypot(point.x - initial[index]!.x, point.y - initial[index]!.y) <
        0.7,
    ),
    '调整应逐帧进行，不能瞬移补齐缺口',
  );
  for (let frame = 1; frame < 1200; frame++) {
    capture.calls.length = 0;
    paint(points, 1200, 900, cursor, true, 0.7);
  }
  const after = gaps();
  assert.ok(Math.max(...after) < before * 0.8, '大缺口应逐步收窄');
  assert.ok(Math.max(...after) > Math.min(...after) * 1.15, '允许自然疏密');
  assert.equal(points.length, initial.length, '不能新建粒子补洞');
  assert.ok(
    points.every(
      (point) =>
        Math.abs(Math.hypot(point.x - 500, point.y - 450) - 99.5) < 0.01,
    ),
  );
  const released = structuredClone(points);
  paint(points, 1200, 900, null, false, 0.7);
  assert.deepEqual(points, released, '释放不能继续分配或重置位置');
  paint(points, 1200, 900, { x: 1000, y: 450 }, true, 0.7);
  assert.deepEqual(points, released, '旧圈不受远处鼠标影响');
});
