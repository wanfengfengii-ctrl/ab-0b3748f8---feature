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

console.log('== 时长与扩张量录入校验 ==');
{
  const mkNeedles = (duration) => [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration },
    { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  const oneCircle = (growth) => [{ x: 50, y: 50, r: 5, growth }];
  check('时长留空（不填）合法', Sweep.validate(mkNeedles(undefined), oneCircle(undefined)).length === 0);
  check('时长 0（未填按 0）合法', Sweep.validate(mkNeedles(0), oneCircle(0)).length === 0);
  check('时长 1 合法', Sweep.validate(mkNeedles(1), oneCircle(0)).length === 0);
  check('时长 120 合法', Sweep.validate(mkNeedles(120), oneCircle(0)).length === 0);
  check('时长 0.5（不足 1 秒）被拒', Sweep.validate(mkNeedles(0.5), oneCircle(0)).length > 0);
  check('时长 121 被拒', Sweep.validate(mkNeedles(121), oneCircle(0)).length > 0);
  check('时长为负被拒', Sweep.validate(mkNeedles(-3), oneCircle(0)).length > 0);
  check('时长非数值被拒', Sweep.validate(mkNeedles(NaN), oneCircle(0)).length > 0);
  check('扩张量 0 合法', Sweep.validate(mkNeedles(0), oneCircle(0)).length === 0);
  check('扩张量为负被拒', Sweep.validate(mkNeedles(0), oneCircle(-0.1)).length > 0);
  check('扩张量非数值被拒', Sweep.validate(mkNeedles(0), oneCircle(NaN)).length > 0);
}

console.log('== 动态晕染：平直段闭式解（扩张吞没原安全扇区） ==');
{
  // 针 (0,0) L=10，0°→90° 逆时针，全程 10 秒；圆 (-20,0) r0=2、扩张 2/秒。
  // 圆心始终在针身后方（针身到圆心距离恒为 20），触及 ⇔ 2+2t=20 ⇔ t=9s（转角 81°）。
  const needles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration: 10 },
    { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  const growing = [{ x: -20, y: 0, r: 2, growth: 2 }];
  const r = Sweep.checkAll(needles, growing);
  check('静态安全但晕染扩张后判为不安全', !r.results[0].safe);
  check('首次触及角 = 81°', r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 81));
  check('首次触及偏移 = 81°', approx(r.results[0].firstTouch.offsetDeg, 81));
  check('首次触及时刻 = 9 秒', approx(r.results[0].firstTouch.timeSec, 9));
  check('触及保护圆 = #1', r.results[0].firstTouch.circle === 0);
  check('全过程最小动态净距 = -2', approx(r.results[0].minClearance, -2));
  check(
    '首项冲突携带角度/秒数/保护圆',
    r.firstConflict &&
      r.firstConflict.needle === 0 &&
      r.firstConflict.circle === 0 &&
      approx(r.firstConflict.angleDeg, 81) &&
      approx(r.firstConflict.timeSec, 9)
  );

  // 同一几何、扩张量为 0：保持既有静态结果（安全，净距 20-2=18）
  const zeroGrowth = Sweep.checkAll(needles, [{ x: -20, y: 0, r: 2, growth: 0 }]);
  check('扩张量为零保持静态放行', zeroGrowth.results[0].safe && approx(zeroGrowth.results[0].minClearance, 18));
  check('扩张量为零时无触及', zeroGrowth.results[0].firstTouch === null && zeroGrowth.firstConflict === null);

  // 未录时长（按 0）：扩张不生效，同样保持静态结果
  const noTime = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    growing
  );
  check('时长为 0 时保持静态结果', noTime.results[0].safe && approx(noTime.results[0].minClearance, 18));

  // 相切情形：全程 9 秒，触及恰发生在终止角（净距恰为 0，判不安全）
  const tangent = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration: 9 },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    growing
  );
  check('动态相切判为不安全', !tangent.results[0].safe);
  check('相切触及角 = 90°（终止角）', tangent.results[0].firstTouch && approx(tangent.results[0].firstTouch.angleDeg, 90));
  check('相切时刻 = 9 秒', approx(tangent.results[0].firstTouch.timeSec, 9));
  check('相切净距 ≈ 0', approx(tangent.results[0].minClearance, 0, 1e-7));
}

console.log('== 动态晕染：垂足/针尖段与静态路径一致性 ==');
{
  // 针 (0,0) L=10，0°→90° 逆时针，全程 10 秒；圆 (0,20) r0=1、扩张 1.5/秒。
  // 圆心角向在扫掠角域内：净距函数经过垂足段与针尖段，且单调下降，首根唯一。
  const needles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration: 10 },
    { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  const circles = [{ x: 0, y: 20, r: 1, growth: 1.5 }];
  const r = Sweep.checkAll(needles, circles);
  check('扩张后判为不安全', !r.results[0].safe);

  // 测试侧独立参考解：同一连续方程在单调区间上二分求根（不调用被测模块）
  const amount = Math.PI / 2;
  const lambda = (1.5 * 10) / amount;
  const refClearance = (s) => {
    const theta = Math.PI / 2 - s; // 圆心方位 90°，针角随 s 逆时针增大
    const p = 20 * Math.cos(theta);
    const dist = p <= 0 ? 20 : p >= 10 ? Math.hypot(20 * Math.sin(theta), p - 10) : Math.abs(20 * Math.sin(theta));
    return dist - 1 - lambda * s;
  };
  let lo = 0;
  let hi = amount;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (refClearance(mid) > 0) lo = mid;
    else hi = mid;
  }
  const refOffsetDeg = ((lo + hi) / 2) * 180 / Math.PI;
  check('首次触及偏移与独立参考解一致', approx(r.results[0].firstTouch.offsetDeg, refOffsetDeg, 1e-6));
  check(
    '首次触及角 = 偏移量（起始角 0°）',
    approx(r.results[0].firstTouch.angleDeg, refOffsetDeg, 1e-6)
  );
  check('触及时刻 = 偏移占比 × 10 秒', approx(r.results[0].firstTouch.timeSec, (refOffsetDeg / 90) * 10, 1e-6));
  // 触及瞬间净距方程确实为 0（残差复核）
  const touchS = (r.results[0].firstTouch.offsetDeg * Math.PI) / 180;
  check('触及瞬间净距残差 ≈ 0', approx(refClearance(touchS), 0, 1e-6));
  // 终止时圆心正对针身方向：净距 = (d-len) - (r0+k·T) = 10 - 16 = -6
  check('全过程最小动态净距 = -6', approx(r.results[0].minClearance, -6));

  // 同一几何、扩张量为 0：动态路径退化为既有静态结果
  const staticAgain = Sweep.checkAll(needles, [{ x: 0, y: 20, r: 1, growth: 0 }]);
  check('扩张量为零：净距 = d-len-r = 9', staticAgain.results[0].safe && approx(staticAgain.results[0].minClearance, 9));

  // 有时长但扩张量全为零：几何结论与静态一致，触及附带秒数
  const timed = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw', duration: 20 },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [{ x: 0, y: 15, r: 5, growth: 0 }]
  );
  check('扩张全零：触及角保持静态结果 90°', timed.results[0].firstTouch && approx(timed.results[0].firstTouch.angleDeg, 90));
  check('扩张全零：触及时刻 = 偏移占比 × 20 秒 = 10', approx(timed.results[0].firstTouch.timeSec, 10));
}

console.log('== 动态晕染：首项冲突顺序 ==');
{
  // 两根针均有动态风险：按录入顺序取第一根
  const r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration: 10 },
      { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw', duration: 10 },
    ],
    [
      { x: -20, y: 0, r: 2, growth: 2 },   // 针1 于 9 秒触及
      { x: 80, y: 0, r: 2, growth: 2 },    // 针2 于 9 秒触及
    ]
  );
  check('两根针均风险时按录入顺序取首根', r.firstConflict && r.firstConflict.needle === 0 && r.firstConflict.circle === 0);
  check('第二根针也给出首次触及秒数', r.results[1].firstTouch && approx(r.results[1].firstTouch.timeSec, 9));
}

if (failures > 0) {
  console.error(`\n${failures} 项测试失败`);
  process.exit(1);
}
console.log('\n全部测试通过');
