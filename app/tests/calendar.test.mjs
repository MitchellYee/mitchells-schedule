import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Load pure TypeScript domain functions without producing build artifacts.
function moduleUrl(file, imports = {}) {
  let source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) source = source.replace(`'${specifier}'`, `'${url}'`);
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}
const { expandOccurrences } = await import(moduleUrl('../src/domain/recurrence.ts'));
const typesUrl = moduleUrl('../src/types.ts');
const { taskColorVars } = await import(typesUrl);
const { normalizeSettings, appearanceTokens, COLOR_SCHEMES } = await import(moduleUrl('../src/domain/appearance.ts', { '../types': typesUrl }));

test('每月重复保持原始日号与时刻，跳过不存在的日期，遵守截止日', () => {
  const at = (month, day, hour = 10) => new Date(2026, month - 1, day, hour).getTime();
  const event = { start: at(1, 15), end: at(1, 15, 11), rrule: 'FREQ=MONTHLY;UNTIL=20260415' };
  assert.deepEqual(expandOccurrences(event, at(2, 1, 0), at(5, 1, 0)).map(o=>o.start), [at(2,15),at(3,15),at(4,15)]);
  const endOfMonth = { start: at(1,31), end: at(1,31,11), rrule: 'FREQ=MONTHLY' };
  assert.deepEqual(expandOccurrences(endOfMonth, at(2,1,0), at(4,1,0)).map(o=>o.start), [at(3,31)]);
});

test('升级旧配置采用十小时自动视野和新品牌，同时保留个人名称、图标和偏好', () => {
  const upgraded = normalizeSettings({ appName: "Mitchell's Schedule", hourHeight: 90, use24h: false });
  assert.equal(upgraded.appName, "Mitchell's Working Tool");
  assert.equal(upgraded.autoFitHours, true);
  assert.equal(upgraded.use24h, false);
  const personal = normalizeSettings({ appName: '我的空间', appIcon: 'data:image/png;base64,test', autoFitHours: false, hourHeight: 100 });
  assert.equal(personal.appName, '我的空间');
  assert.equal(personal.appIcon, 'data:image/png;base64,test');
  assert.equal(personal.autoFitHours, false);
  assert.equal(personal.hourHeight, 100);
});

test('两种完成状态统一使用中性灰，未完成保持重要程度色彩', () => {
  for (const status of ['done','done-late']) {
    assert.equal(taskColorVars({ importance: 'important', status }).bg, 'var(--completed-bg)');
    assert.equal(taskColorVars({ importance: 'unimportant', status }).bar, 'var(--completed-bar)');
  }
  assert.notEqual(taskColorVars({ importance: 'important', status: 'ongoing' }).bg, 'var(--completed-bg)');
});

test('仅允许四套完整配色，旧自选色迁移且按钮对比度满足普通文字要求', () => {
  const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  assert.equal(COLOR_SCHEMES.length,4);
  for(const p of COLOR_SCHEMES) for(const dark of [false,true]) {
    const tokens=appearanceTokens(p.id,dark);
    const a=luminance(tokens['--accent']),b=luminance(tokens['--accent-contrast']);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${p.id} button contrast`);
  }
  const invalid = normalizeSettings({ accentColor: 'broken', hourHeight: -5, surface: 'invalid', density: 'invalid' });
  assert.equal(invalid.accentColor, '#315e53');
  assert.equal(normalizeSettings({colorScheme:'invalid',accentColor:'#ff0000'}).colorScheme,'forest');
  assert.equal(invalid.hourHeight, 24);
  assert.equal(invalid.surface, 'neutral');
  assert.equal(invalid.density, 'comfortable');
});
