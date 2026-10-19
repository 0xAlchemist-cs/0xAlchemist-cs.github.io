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
