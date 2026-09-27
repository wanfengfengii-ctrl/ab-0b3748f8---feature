/*
 * 扫掠几何模块单元测试（Node 原生断言，无第三方依赖）。
 * 运行：node tests/sweep.test.js，失败以非零码退出。
 */
'use strict';
const Sweep = require('../js/sweep.js');

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log('  PASS', name);
  } else {
    failures += 1;
    console.error('  FAIL', name);
  }
}
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('== 录入校验 ==');
{
  const twoNeedles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  check('合法数据无错误', Sweep.validate(twoNeedles, [{ x: 50, y: 50, r: 5 }]).length === 0);
  check('针数量不足被拒', Sweep.validate([twoNeedles[0]], [{ x: 50, y: 50, r: 5 }]).length > 0);
  check(
    '起止角相同被拒',
    Sweep.validate(
      [
        { x: 0, y: 0, len: 10, a0: 30, a1: 30, dir: 'ccw' },
        { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      ],
      [{ x: 50, y: 50, r: 5 }]
    ).length > 0
  );
  check(
    '起止角相差 360°（等价同角）被拒',
    Sweep.validate(
      [
        { x: 0, y: 0, len: 10, a0: 0, a1: 360, dir: 'ccw' },
        { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      ],
      [{ x: 50, y: 50, r: 5 }]
    ).length > 0
  );
  check(
    '保护圆覆盖支点被拒',
    Sweep.validate(twoNeedles, [{ x: 1, y: 1, r: 5 }]).length > 0
  );
  check(
    '保护圆数量超限被拒',
    Sweep.validate(twoNeedles, Array.from({ length: 7 }, (_, i) => ({ x: 500 + i * 10, y: 500, r: 1 }))).length > 0
  );
}

console.log('== 最小净距 ==');
{
  // 针：支点原点，长 10，0° -> 90° 逆时针
  const n = { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' };
  const base = [{ x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' }, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }];

  let r = Sweep.checkAll([n, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }], [{ x: 20, y: 0, r: 3 }]);
  check('圆在起始射线之外：净距 = 到针尖距离 - r', approx(r.results[0].minClearance, 10 - 3));
  check('该情形安全', r.results[0].safe === true);

  r = Sweep.checkAll(base, [{ x: 0, y: 20, r: 4 }]);
  check('圆心在扫掠角域内且在弧外：净距 = d - len - r', approx(r.results[0].minClearance, 20 - 10 - 4));

  r = Sweep.checkAll(base, [{ x: 3, y: 4, r: 1 }]);
  check('圆心在扇形内部：净距为负', approx(r.results[0].minClearance, -1) && !r.results[0].safe);

  r = Sweep.checkAll(base, [{ x: 0, y: 11, r: 1 }]);
  check('与弧相切：净距为 0 且判为不安全', approx(r.results[0].minClearance, 0, 1e-7) && !r.results[0].safe);

  r = Sweep.checkAll(base, [{ x: -10, y: -5, r: 2 }]);
  check(
    '圆在角域外：净距 = 到最近径向边界端点距离 - r',
    approx(r.results[0].minClearance, Math.hypot(10, 5) - 2)
  );
}

console.log('== 首次触及角度 ==');
{
  const mk = (a0, a1, dir) => [{ x: 0, y: 0, len: 10, a0, a1, dir }, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }];

  // 针尖恰好掠过圆底：圆 (0,15) r=5，针长 10，0°->180° 逆时针，触及角恰为 90°
  let r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 0, y: 15, r: 5 }]);
  check('针尖掠圆：首次触及角 = 90°', r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 90));
  check('触及偏移量 = 90°', approx(r.results[0].firstTouch.offsetDeg, 90));

  // 切线边界：圆 (14,0) r=4，针长 14，-90° -> 90° 逆时针，触及角 = -asin(4/14)
  const gamma = (Math.asin(4 / 14) * 180) / Math.PI;
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 14, a0: -90, a1: 90, dir: 'ccw' },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [{ x: 14, y: 0, r: 4 }]
  );
  check(
    '切线触及：首次触及角 = -asin(r/d)',
    r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 360 - gamma, 1e-6)
  );

  // 顺时针：180° -> 0°，圆 (0,15) r=5，触及角 90°，偏移 90°
  r = Sweep.checkAll(mk(180, 0, 'cw'), [{ x: 0, y: 15, r: 5 }]);
  check(
    '顺时针扫掠：首次触及角 = 90°',
    r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 90) && approx(r.results[0].firstTouch.offsetDeg, 90)
  );

  // 起始角已在触及区间内：圆 (10,0) r=2，针长 10，0° -> 180°
  r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 10, y: 0, r: 2 }]);
  check('起始即触及：偏移量 = 0', r.results[0].firstTouch && approx(r.results[0].firstTouch.offsetDeg, 0));

  // 圆在针长范围之外：永不触及
  r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 20, y: 0, r: 5 }]);
  check('圆超出针长：无触及且安全', r.results[0].firstTouch === null && r.results[0].safe);

  // 触及区间在扫掠范围之外：不触及
  r = Sweep.checkAll(mk(30, 180, 'ccw'), [{ x: 10, y: 0, r: 2 }]);
  check('触及区间在扫掠范围外：无触及', r.results[0].firstTouch === null && r.results[0].safe);
}

console.log('== 首项冲突排序 ==');
{
  // 针1安全、针2风险 -> 首项冲突为针2
  let r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [{ x: 100, y: 5, r: 3 }]
  );
  check('首项冲突落在首根风险针（录入顺序）', r.firstConflict && r.firstConflict.needle === 1 && r.firstConflict.circle === 0);

  // 两根针都风险：按录入顺序取第一根，即使第二根触及偏移更小
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
      { x: 100, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    ],
    [
      { x: 0, y: 15, r: 5 },   // 针1 在 90° 触及
      { x: 105, y: 0, r: 3 },  // 针2 起始即触及
    ]
  );
  check('两根针均风险时按录入顺序取首根', r.firstConflict && r.firstConflict.needle === 0);
  check('首项冲突角度为针1的最早触及角', approx(r.firstConflict.angleDeg, 90));

  // 同一根针触及多个圆：取旋转方向上最早者
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [
      { x: 0, y: 15, r: 5 },   // 90° 触及
      { x: 15, y: 0, r: 5 },   // 0° 起始即触及
    ]
  );
  check('同针多圆取最早触及（起始角）', r.results[0].firstTouch.circle === 1 && approx(r.results[0].firstTouch.offsetDeg, 0));
}

console.log('== 时长与晕染扩张：录入校验 ==');
{
  const two = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  const circ = [{ x: 50, y: 50, r: 5 }];
  check('补录合法时长（60 秒）通过', Sweep.validate(two.map((n) => ({ ...n, dur: 60 })), circ).length === 0);
  check('时长 0（不计时）通过', Sweep.validate(two.map((n) => ({ ...n, dur: 0 })), circ).length === 0);
  check('时长留空（NaN）按 0 通过', Sweep.validate(two.map((n) => ({ ...n, dur: NaN })), circ).length === 0);
  check('时长不足 1 秒被拒', Sweep.validate(two.map((n) => ({ ...n, dur: 0.5 })), circ).length > 0);
  check('时长超过 120 秒被拒', Sweep.validate(two.map((n) => ({ ...n, dur: 121 })), circ).length > 0);
  check('时长为负被拒', Sweep.validate(two.map((n) => ({ ...n, dur: -3 })), circ).length > 0);
  check('非负扩张量通过', Sweep.validate(two, [{ x: 50, y: 50, r: 5, grow: 0.25 }]).length === 0);
  check('扩张量留空（NaN）按 0 通过', Sweep.validate(two, [{ x: 50, y: 50, r: 5, grow: NaN }]).length === 0);
  check('负扩张量被拒', Sweep.validate(two, [{ x: 50, y: 50, r: 5, grow: -0.1 }]).length > 0);
}

console.log('== 动态扩张：连续判定 ==');
{
  const far = { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' };

  // 终点正对圆心：d=20, L=10, r0=9, grow=0.1, T=10s → 第 10 秒、90° 处恰好相切
  let r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 10 },
      { ...far },
    ],
    [{ x: 0, y: 20, r: 9, grow: 0.1 }]
  );
  check('扩张吞没终点扇区：判为风险', !r.results[0].safe && !r.safe);
  check('首次触及在第 10 秒', r.results[0].firstTouch && approx(r.results[0].firstTouch.seconds, 10, 1e-6));
  check('首次触及角为 90°', approx(r.results[0].firstTouch.angleDeg, 90, 1e-6));
  check('首次触及圆为保护圆 #1', r.results[0].firstTouch.circle === 0);
  check('首项冲突附秒数', r.firstConflict && approx(r.firstConflict.seconds, 10, 1e-6) && r.firstConflict.needle === 0);

  // 同一几何、扩张量为零：保持既有静态结论（安全，净距 1）
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 10 },
      { ...far },
    ],
    [{ x: 0, y: 20, r: 9, grow: 0 }]
  );
  check('零扩张保持静态结论：安全且净距不变', r.results[0].safe && approx(r.results[0].minClearance, 1));
  check('零扩张不触发动态标记', r.results[0].dynamic === false);

  // 时长为 0：即使有扩张量也保持静态结论
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 0 },
      { ...far },
    ],
    [{ x: 0, y: 20, r: 9, grow: 0.1 }]
  );
  check('时长为 0 时保持静态结论', r.results[0].safe && approx(r.results[0].minClearance, 1));

  // 旋转中途被吞没：圆心在 45° 方位 d=20，r0=5, grow=1, T=10s
  // 第 5 秒针至 45°，针尖-圆心距 = 20-10 = 10 = r(5)，此前距离恒大于半径
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 10 },
      { ...far },
    ],
    [{ x: 20 * Math.SQRT1_2, y: 20 * Math.SQRT1_2, r: 5, grow: 1 }]
  );
  check('旋转中途被吞没：第 5 秒首次触及', r.results[0].firstTouch && approx(r.results[0].firstTouch.seconds, 5, 1e-6));
  check('中途触及角为 45°', approx(r.results[0].firstTouch.angleDeg, 45, 1e-6));
  check('中途触及判为风险且净距为负', !r.results[0].safe && r.results[0].minClearance < 0);

  // 与密集采样交叉验证：连续判定的最小动态净距与首次触及时刻不得被采样推翻
  {
    const gAt = (t) => {
      const a = ((0 + 9 * t) * Math.PI) / 180; // ω = 90°/10s
      const tx = 10 * Math.cos(a);
      const ty = 10 * Math.sin(a);
      const cx = 20 * Math.SQRT1_2;
      const cy = 20 * Math.SQRT1_2;
      let u = (cx * tx + cy * ty) / 100;
      u = Math.max(0, Math.min(1, u));
      return Math.hypot(cx - u * tx, cy - u * ty) - (5 + 1 * t);
    };
    let sampMin = Infinity;
    let sampTouch = null;
    for (let i = 0; i <= 100000; i += 1) {
      const t = i / 10000;
      const v = gAt(t);
      if (v < sampMin) sampMin = v;
      if (sampTouch === null && v <= 0) sampTouch = t;
    }
    check('最小动态净距与 10 万点采样一致', approx(r.results[0].minClearance, sampMin, 1e-3));
    check('首次触及时刻与 10 万点采样一致', approx(r.results[0].firstTouch.seconds, sampTouch, 1e-3));
  }

  // 扩张后仍安全：圆始终够不着针（d=100, L=10, r0=5, grow=0.5, T=10 → r(10)=10 ≪ 90）
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 10 },
      { ...far },
    ],
    [{ x: 0, y: 100, r: 5, grow: 0.5 }]
  );
  check('扩张后仍安全：无触及', r.results[0].safe && r.results[0].firstTouch === null);
  check('最小动态净距出现在终点时刻', approx(r.results[0].minClearance, 100 - 10 - 10, 1e-6));

  // 静态触及 + 时长（零扩张）：秒数 = 偏移角占比 × 时长
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw', dur: 10 },
      { ...far },
    ],
    [{ x: 0, y: 15, r: 5, grow: 0 }]
  );
  check(
    '零扩张静态触及附秒数（90°/180°×10s = 5s）',
    r.results[0].firstTouch && approx(r.results[0].firstTouch.seconds, 5, 1e-9) && r.results[0].dynamic === false
  );

  // 两根针均因扩张触及：第二根触及更早，但首项冲突仍按针录入顺序取第一根
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 10 },
      { x: 300, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', dur: 4 },
    ],
    [
      { x: 0, y: 20, r: 9, grow: 0.1 },
      { x: 300, y: 20, r: 9, grow: 1 },
    ]
  );
  check('第二根针也被扩张吞没', !r.results[1].safe && r.results[1].firstTouch.seconds < 4);
  check(
    '动态首项冲突按针录入顺序稳定给出',
    r.firstConflict && r.firstConflict.needle === 0 && r.firstConflict.circle === 0 && approx(r.firstConflict.seconds, 10, 1e-6)
  );

  // 历史草稿（无 dur/grow 字段）：结果与既有静态实现逐项一致
  {
    const legacy = Sweep.checkAll(
      [
        { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
        { x: 100, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
      ],
      [{ x: 0, y: 15, r: 5 }]
    );
    const zeros = Sweep.checkAll(
      [
        { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw', dur: 0 },
        { x: 100, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw', dur: 0 },
      ],
      [{ x: 0, y: 15, r: 5, grow: 0 }]
    );
    check(
      '扩张量均为零的历史草稿保持既有静态结果',
      legacy.safe === zeros.safe &&
        approx(legacy.results[0].minClearance, zeros.results[0].minClearance, 0) &&
        approx(legacy.results[0].firstTouch.angleDeg, zeros.results[0].firstTouch.angleDeg, 0) &&
        legacy.firstConflict.angleDeg === zeros.firstConflict.angleDeg
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} 项测试失败`);
  process.exit(1);
}
console.log('\n全部测试通过');
