/**
 * 数据访问层：通过 REST API 读写 app/data/db.json（见 server/api-plugin.ts）。
 * 兼容迁移：首次启动若服务端为空而浏览器 IndexedDB（旧版存储）有数据，自动上传迁移。
 */
import dayjs from 'dayjs';
import { db } from './database';
import type { Calendar, EventItem, TaskItem } from '../types';
import { uid } from '../types';

interface AllData {
  calendars: Calendar[];
  events: EventItem[];
  tasks: TaskItem[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function isEmpty(d: AllData): boolean {
  return d.calendars.length === 0 && d.events.length === 0 && d.tasks.length === 0;
}

export async function loadAll(): Promise<AllData> {
  const remote = await api<AllData>('/api/data');
  if (!isEmpty(remote)) return remote;

  // 服务端为空：尝试迁移旧版 IndexedDB 数据
  try {
    const local = await migrateFromIndexedDb();
    if (!isEmpty(local)) {
      await api('/api/data', { method: 'PUT', body: JSON.stringify(local) });
      return local;
    }
  } catch {
    /* 无旧数据或 IndexedDB 不可用 */
  }

  // 全新环境：播种演示数据
  const seeded = await seed();
  await api('/api/data', { method: 'PUT', body: JSON.stringify(seeded) });
  return seeded;
}

async function migrateFromIndexedDb(): Promise<AllData> {
  const [calendars, events, tasks] = await Promise.all([
    db.calendars.toArray(),
    db.events.filter((e) => !e.deletedAt).toArray(),
    db.tasks.filter((t) => !t.deletedAt).toArray(),
  ]);
  return { calendars, events, tasks };
}

/** 新环境空启动：日历/事件/任务均由用户或 CLI/API 显式创建 */
async function seed(): Promise<AllData> {
  return { calendars: [], events: [], tasks: [] };
}

/* ---------------- CRUD（全部走 REST API） ---------------- */

export async function putEvent(ev: EventItem): Promise<void> {
  await api(`/api/events/${ev.id}`, { method: 'PUT', body: JSON.stringify(ev) });
}

export async function deleteEvent(id: string): Promise<void> {
  await api(`/api/events/${id}`, { method: 'DELETE' });
}

export async function putTask(task: TaskItem): Promise<void> {
  await api(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(task) });
}

export async function deleteTask(id: string): Promise<void> {
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
}

export async function putCalendar(cal: Calendar): Promise<void> {
  await api(`/api/calendars/${cal.id}`, { method: 'PUT', body: JSON.stringify(cal) });
}

export async function fetchRemote(): Promise<AllData> {
  return api<AllData>('/api/data');
}
