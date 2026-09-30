/**
 * 重叠事件并列布局算法（设计方案 §8.3）：
 * 排序 → 传递性重叠分簇 → 簇内贪心分列 → 向无邻列扩展（Google Calendar 同款）。
 */

export interface LayoutInput {
  id: string;
  startMin: number;
  endMin: number;
}

export interface LayoutResult {
  leftPct: number;
  widthPct: number;
}

export function layoutDayEvents(events: LayoutInput[]): Map<string, LayoutResult> {
  const result = new Map<string, LayoutResult>();
  if (events.length === 0) return result;

  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // 1. 传递性重叠分簇
  const clusters: LayoutInput[][] = [];
  let current: LayoutInput[] = [];
  let clusterEnd = -Infinity;
  for (const ev of sorted) {
    if (current.length > 0 && ev.startMin < clusterEnd) {
      current.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    } else {
      if (current.length > 0) clusters.push(current);
      current = [ev];
      clusterEnd = ev.endMin;
    }
  }
  if (current.length > 0) clusters.push(current);

  for (const cluster of clusters) {
    // 2. 贪心分列
    const columns: LayoutInput[][] = [];
    const colOf = new Map<string, number>();
    const colEnds: number[] = [];
    for (const ev of cluster) {
      let placed = -1;
      for (let i = 0; i < colEnds.length; i++) {
        if (ev.startMin >= colEnds[i]) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        columns.push([ev]);
        colEnds.push(ev.endMin);
        placed = columns.length - 1;
      } else {
        columns[placed].push(ev);
        colEnds[placed] = ev.endMin;
      }
      colOf.set(ev.id, placed);
    }
    const totalCols = columns.length;

    // 3. 向无相邻重叠的列扩展宽度
    for (const ev of cluster) {
      const c = colOf.get(ev.id)!;
      let rightBoundary = totalCols;
      let leftBoundary = c;
      for (const other of cluster) {
        if (other.id === ev.id) continue;
        const oc = colOf.get(other.id)!;
        const overlaps = ev.startMin < other.endMin && other.startMin < ev.endMin;
        if (!overlaps) continue;
        if (oc > c) rightBoundary = Math.min(rightBoundary, oc);
        if (oc < c) leftBoundary = Math.max(leftBoundary, oc + 1);
      }
      result.set(ev.id, {
        leftPct: (leftBoundary / totalCols) * 100,
        widthPct: ((rightBoundary - leftBoundary) / totalCols) * 100,
      });
    }
  }

  return result;
}
