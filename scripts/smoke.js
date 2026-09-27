#!/usr/bin/env node
/*
 * 注胶扫掠模块烟测：模拟修复室真实录入，
 * 验证首项冲突定位与移开保护圆后的安全放行。
 */
'use strict';
const Sweep = require('../js/sweep.js');

const needles = [
  { x: 0, y: 0, len: 100, a0: 0, a1: 90, dir: 'ccw' },
  { x: 300, y: 0, len: 100, a0: 180, a1: 90, dir: 'cw' },
  { x: 600, y: 0, len: 100, a0: 0, a1: 90, dir: 'ccw' },
];
const circles = [
  { x: 150, y: 50, r: 20 },
  { x: 300, y: 130, r: 20 },
  { x: 600, y: 105, r: 10 },
];

const errors = Sweep.validate(needles, circles);
if (errors.length) {
  console.error('烟测数据未通过录入校验:', errors);
  process.exit(1);
}

const res = Sweep.checkAll(needles, circles);
console.log(
  '逐针结果:',
  JSON.stringify(
    res.results.map((r) => ({
      safe: r.safe,
      minClearance: +r.minClearance.toFixed(4),
      firstTouchDeg: r.firstTouch ? +r.firstTouch.angleDeg.toFixed(4) : null,
    })),
    null,
    2
  )
);

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
let ok = true;
function expect(name, cond) {
  console.log(cond ? '  PASS' : '  FAIL', name);
  if (!cond) ok = false;
}

expect('针1安全', res.results[0].safe);
expect('针1净距 ≈ 38.1139', approx(res.results[0].minClearance, Math.hypot(150, 50) - 100 - 20));
expect('针2安全', res.results[1].safe);
expect('针2净距 = 10', approx(res.results[1].minClearance, 10, 1e-9));
expect('针3存在风险', !res.results[2].safe);

// 针3：圆 (600,105) r=10，针长 100，切点在针尖之外，触及边界由针尖掠圆决定
const beta = (Math.acos((105 * 105 + 100 * 100 - 10 * 10) / (2 * 105 * 100)) * 180) / Math.PI;
expect('针3首次触及角 ≈ 90° - β', res.results[2].firstTouch && approx(res.results[2].firstTouch.angleDeg, 90 - beta));
expect(
  '首项冲突为针3 / 保护圆3',
  res.firstConflict && res.firstConflict.needle === 2 && res.firstConflict.circle === 2
);

// 将保护圆3 移出扫掠区域后，整体应安全
const moved = Sweep.checkAll(needles, [circles[0], circles[1], { x: 600, y: 130, r: 10 }]);
expect('移开保护圆后整体安全', moved.safe && moved.firstConflict === null);

// ---- 动态晕染：补录旋转时长与每秒扩张量 ----
// 扩张量全为零的历史草稿：补录时长后结论必须与既有静态结果一致
const timedNeedles = needles.map((n) => ({ ...n, duration: 10 }));
const zeroGrowth = Sweep.checkAll(timedNeedles, circles.map((c) => ({ ...c, growth: 0 })));
expect(
  '扩张量全为零时保持既有静态结果',
  zeroGrowth.results.every((r, i) => r.safe === res.results[i].safe && approx(r.minClearance, res.results[i].minClearance, 1e-9)) &&
    zeroGrowth.firstConflict !== null &&
    zeroGrowth.firstConflict.needle === res.firstConflict.needle &&
    approx(zeroGrowth.firstConflict.angleDeg, res.firstConflict.angleDeg, 1e-6)
);

// 保护圆2 以 3/秒 晕染扩张：原本静态安全（净距 10）的针2 在旋转中被吞没
const dyn = Sweep.checkAll(timedNeedles, [circles[0], { ...circles[1], growth: 3 }, circles[2]]);
console.log(
  '动态结果:',
  JSON.stringify(
    dyn.results.map((r) => ({
      safe: r.safe,
      minClearance: +r.minClearance.toFixed(4),
      firstTouchDeg: r.firstTouch ? +r.firstTouch.angleDeg.toFixed(4) : null,
      firstTouchSec: r.firstTouch ? +r.firstTouch.timeSec.toFixed(4) : null,
    })),
    null,
    2
  )
);
expect('针1动态下仍安全', dyn.results[0].safe);
expect('针2被扩张的晕染圈吞没', !dyn.results[1].safe);
// 针2：圆 (300,130) r=20+3t，针长 100，全程 10 秒；触及发生在 8~8.5 秒之间（连续判定给出可复核瞬间）
expect(
  '针2首次触及时刻落在 8~8.5 秒',
  dyn.results[1].firstTouch && dyn.results[1].firstTouch.timeSec > 8 && dyn.results[1].firstTouch.timeSec < 8.5
);
expect(
  '针2首次触及角与时刻自洽（180° − 9°/s × t）',
  dyn.results[1].firstTouch && approx(dyn.results[1].firstTouch.angleDeg, 180 - 9 * dyn.results[1].firstTouch.timeSec, 1e-6)
);
// 终止瞬间圆心正对针身：净距 = (130-100) - (20+3×10) = -20
expect('针2全过程最小动态净距 = -20', approx(dyn.results[1].minClearance, -20));
// 针3 的触及圆扩张量为 0：触及角与静态闭式解一致
expect('针3动态触及角保持静态闭式解', dyn.results[2].firstTouch && approx(dyn.results[2].firstTouch.angleDeg, 90 - beta));
expect('针3触及时刻 = 偏移占比 × 10 秒', approx(dyn.results[2].firstTouch.timeSec, ((90 - beta) / 90) * 10));
expect(
  '动态首项冲突为针2 / 保护圆2（按录入顺序）',
  dyn.firstConflict && dyn.firstConflict.needle === 1 && dyn.firstConflict.circle === 1
);
// 扩张量调回 0：结论恢复静态放行/风险格局
const reverted = Sweep.checkAll(timedNeedles, circles.map((c) => ({ ...c, growth: 0 })));
expect('扩张量调回零后恢复既有静态结论', reverted.results[1].safe && approx(reverted.results[1].minClearance, 10, 1e-9));

if (!ok) {
  console.error('烟测失败');
  process.exit(1);
}
console.log('烟测通过');
