import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { createApiHandler } from '../server/api-core.mjs';

test('全天事件默认恰好一天，显式 end 按排他边界保留', async (t) => {
  const f = fixture(t);
  const start = Date.parse('2026-10-26T00:00:00+08:00');
  const { body: single } = await f.request('POST', '/api/events', { title: '全天', isAllDay: true, start: '2026-10-26' });
  assert.equal(single.start, start);
  assert.equal(single.end, start + 86_400_000);
  const { body: multi } = await f.request('POST', '/api/events', { title: '两天', isAllDay: true, start, end: start + 2 * 86_400_000 });
  assert.equal(multi.end - multi.start, 2 * 86_400_000);
});

test('查询后续日期仍返回重复系列，日期范围覆盖中国时区的凌晨', async (t) => {
  const f = fixture(t);
  const { body: series } = await f.request('POST', '/api/events', { title: '月度回顾', start: '2026-09-15T10:00:00+08:00', rrule: 'FREQ=MONTHLY' });
  const { body: early } = await f.request('POST', '/api/events', { title: '凌晨事项', start: '2026-10-15T01:00:00+08:00' });
  await f.request('POST', '/api/events', { title: '隔天', start: '2026-10-16T01:00:00+08:00' });
  const range = await f.request('GET', '/api/events?from=2026-10-15&to=2026-10-15');
  assert.deepEqual(range.body.map(e => e.id), [series.id, early.id]);
  assert.equal((await f.request('GET', '/api/events?from=invalid')).status, 400);
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-task-test-'));
  const file = path.join(dir, 'db.json');
  let handler = createApiHandler(file);
  t.after(() => {
    for (const name of ['db.json', 'db.json.tmp']) {
      const target = path.join(dir, name);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(dir);
  });
  function begin(method, url, body) {
    const req = new PassThrough(); req.method = method; req.url = url;
    let result;
    const res = { statusCode: 200, setHeader() {}, end(raw) { result = { status: this.statusCode, body: raw ? JSON.parse(raw) : null }; } };
    const pending = handler(req, res, () => assert.fail('unexpected fallback'));
    return async () => { req.end(body === undefined ? undefined : JSON.stringify(body)); await pending; return result; };
  }
  return { file, begin, request: (method, url, body) => begin(method, url, body)(),
    restart: () => { handler = createApiHandler(file); } };
}

const mission = { title: '完成项目', startDate: '2026-10-01', dueDate: '2026-10-30', importance: 'important',
  description: '背景第一行\n目标第二行', subtasks: [{ id: 'step-a', title: '需求分析', done: false }, { title: '交付验收', done: true }] };

test('任务详情创建后跨服务重启完整保留，子任务有稳定 ID 和完成状态', async (t) => {
  const f = fixture(t);
  const created = await f.request('POST', '/api/tasks', mission);
  assert.equal(created.status, 201);
  assert.equal(created.body.importance, 'important');
  assert.equal(created.body.description, mission.description);
  assert.equal(created.body.subtasks[0].id, 'step-a');
  assert.ok(created.body.subtasks[1].id);
  f.restart();
  const loaded = await f.request('GET', '/api/data');
  assert.deepEqual(loaded.body.tasks[0].subtasks, created.body.subtasks);
  assert.equal(loaded.body.tasks[0].description, mission.description);
});

test('修改日期、标题和完成状态不会丢失任务描述或子任务', async (t) => {
  const f = fixture(t);
  const { body: task } = await f.request('POST', '/api/tasks', mission);
  const updated = await f.request('PATCH', `/api/tasks/${task.id}`, { title: '新标题', dueDate: '2026-11-02', status: 'done' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, '新标题');
  assert.equal(updated.body.status, 'done');
  assert.equal(updated.body.description, mission.description);
  assert.deepEqual(updated.body.subtasks, task.subtasks);
});

test('旧 PUT 客户端省略新增字段时保留既有详情；显式空内容可清除', async (t) => {
  const f = fixture(t);
  const { body: task } = await f.request('POST', '/api/tasks', mission);
  const put = await f.request('PUT', `/api/tasks/${task.id}`, { title: '旧客户端改名', startDate: task.startDate, dueDate: task.dueDate });
  assert.equal(put.body.importance, 'important');
  assert.equal(put.body.description, mission.description);
  assert.deepEqual(put.body.subtasks, task.subtasks);
  const cleared = await f.request('PATCH', `/api/tasks/${task.id}`, { importance: 'unimportant', description: '', subtasks: [] });
  assert.equal(cleared.body.importance, 'unimportant');
  assert.equal(cleared.body.description, '');
  assert.deepEqual(cleared.body.subtasks, []);
});

test('附属待办继承重要程度，可独立改级和解除附属', async (t) => {
  const f = fixture(t);
  const { body: parent } = await f.request('POST', '/api/tasks', mission);
  const { body: todo } = await f.request('POST', '/api/tasks', { title: '今日执行', dueDate: '2026-10-10', parent: parent.title });
  assert.equal(todo.importance, 'important');
  assert.equal(todo.parentId, parent.id);
  const override = await f.request('PATCH', `/api/tasks/${todo.id}`, { importance: 'normal' });
  assert.equal(override.body.importance, 'normal');
  const unlinked = await f.request('PATCH', `/api/tasks/${todo.id}`, { parent: '' });
  assert.equal(unlinked.status, 200);
  assert.equal(unlinked.body.parentId, undefined);
  const direct = await f.request('PATCH', `/api/tasks/${todo.id}`, { parentId: parent.id });
  assert.equal(direct.body.parentId, parent.id);
  const removed = await f.request('PUT', `/api/tasks/${todo.id}`, { ...direct.body, parentId: null });
  assert.equal(removed.body.parentId, undefined);
});

test('三级重要程度均可创建和修改，完成态改详情时保持完成', async (t) => {
  const f = fixture(t);
  for (const importance of ['important', 'normal', 'unimportant']) {
    const created = await f.request('POST', '/api/tasks', { title: importance, importance, status: 'done-late' });
    assert.equal(created.body.importance, importance);
    const updated = await f.request('PATCH', `/api/tasks/${created.body.id}`, { description: '背景' });
    assert.equal(updated.body.status, 'done-late');
  }
});

test('旧数据默认一般，不将旧色板推断为重要程度，读取不会改写源文件', async (t) => {
  const f = fixture(t);
  const raw = JSON.stringify({ calendars: [], events: [], tasks: [{ id: 'old', title: '旧任务', color: 'tomato', done: true, createdAt: 1 }] });
  fs.writeFileSync(f.file, raw);
  const { body: tasks } = await f.request('GET', '/api/tasks');
  assert.equal(tasks[0].importance, 'normal');
  assert.equal(tasks[0].status, 'done');
  assert.equal(tasks[0].color, 'tomato');
  assert.deepEqual(tasks[0].subtasks, []);
  assert.equal(fs.readFileSync(f.file, 'utf8'), raw);
});

test('非法重要程度、描述、子任务、日期及附属关系被拒绝且不落盘', async (t) => {
  const f = fixture(t);
  const { body: task } = await f.request('POST', '/api/tasks', mission);
  const before = fs.readFileSync(f.file, 'utf8');
  for (const patch of [
    { importance: 'urgent' }, { importance: null }, { description: 42 }, { subtasks: {} }, { subtasks: [{ title: '' }] },
    { subtasks: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] },
    { subtasks: [{ title: 'A', done: 'true' }] }, { dueDate: '2026-02-30' },
    { startDate: '2027-01-01' }, { parentId: task.id }, { title: '   ' },
  ]) {
    const response = await f.request('PATCH', `/api/tasks/${task.id}`, patch);
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  }
});

test('并发创建与更新详情保存全部结果', async (t) => {
  const f = fixture(t);
  const pending = Array.from({ length: 12 }, (_, i) => f.begin('POST', '/api/tasks', { title: `待办${i}`, importance: 'normal' }));
  const responses = await Promise.all(pending.map((finish) => finish()));
  assert.ok(responses.every((r) => r.status === 201));
  const { body: tasks } = await f.request('GET', '/api/tasks');
  assert.equal(tasks.length, 12);
  const updates = tasks.map((task) => f.begin('PATCH', `/api/tasks/${task.id}`, { description: task.title }));
  await Promise.all(updates.map((finish) => finish()));
  const loaded = await f.request('GET', '/api/tasks');
  assert.ok(loaded.body.every((task) => task.description === task.title));
});

test('损坏的数据文件报错，写请求不会用空库覆盖原文件', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{invalid JSON');
  assert.equal((await f.request('GET', '/api/data')).status, 500);
  assert.equal((await f.request('POST', '/api/tasks', { title: '新任务' })).status, 500);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{invalid JSON');
});

test('备份恢复保留任务详情、子任务 ID、创建时间和附属关系', async (t) => {
  const f = fixture(t);
  const data = { calendars: [], events: [], tasks: [
    { ...mission, id: 'parent', createdAt: 123, subtasks: [{ id: 's1', title: '步骤', done: false }] },
    { id: 'child', title: '执行', dueDate: '2026-10-10', parentId: 'parent', importance: 'important' },
  ] };
  assert.equal((await f.request('PUT', '/api/data', data)).status, 200);
  const restored = await f.request('GET', '/api/data');
  assert.equal(restored.body.tasks[0].createdAt, 123);
  assert.equal(restored.body.tasks[0].subtasks[0].id, 's1');
  assert.equal(restored.body.tasks[1].parentId, 'parent');
});
