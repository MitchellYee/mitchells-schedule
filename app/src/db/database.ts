import Dexie, { type Table } from 'dexie';
import type { Calendar, EventItem, TaskItem } from '../types';

class ScheduleDB extends Dexie {
  calendars!: Table<Calendar, string>;
  events!: Table<EventItem, string>;
  tasks!: Table<TaskItem, string>;

  constructor() {
    super('chrona-db');
    this.version(1).stores({
      calendars: 'id, sortOrder',
      events: 'id, calendarId, start, taskId',
      tasks: 'id, done, dueDate',
    });
  }
}

export const db = new ScheduleDB();

// 开发诊断钩子：控制台可用 __db.events.toArray() 检查数据
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__db = db;
}
