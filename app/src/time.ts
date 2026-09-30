// 中国时区统一时钟：软件的"今天/现在"一律按 UTC+8 计算，与运行设备的系统时区无关。
// 返回值保持在系统时区帧内（墙钟分量 = 中国墙钟），因此可与库内其他 dayjs 值直接比较/求差。
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** 当前中国墙钟时间（UTC+8） */
export function nowCN() {
  return dayjs(dayjs().utcOffset(480).format('YYYY-MM-DD HH:mm:ss'));
}

/** 今天的日期键（YYYY-MM-DD，中国时区） */
export function todayCN() {
  return dayjs().utcOffset(480).format('YYYY-MM-DD');
}
