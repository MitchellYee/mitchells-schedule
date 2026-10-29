import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../store/useStore';
import { nowCN, todayCN } from '../time';
import { isDone } from '../types';
import { expandOccurrences } from '../domain/recurrence';
import { toolRegistry } from './registry';
import ToolIcon from '../components/ToolIcon';

export default function Home() {
  const { setActiveTool, setAnchor, setView, tasks, events, calendars } = useStore();
  const today = todayCN();
  const due = tasks.filter(t => (t.startDate || t.dueDate || '') <= today && (t.dueDate || '') >= today);
  const done = due.filter(t => isDone(t.status)).length;
  const upcoming = useMemo(() => {
    const start = nowCN().startOf('day').valueOf();
    const visible = new Set(calendars.filter(c=>c.isVisible).map(c=>c.id));
    return events.filter(e=>visible.has(e.calendarId)).flatMap(e=>expandOccurrences(e,start,start+86400000).map(o=>({...e,...o}))).sort((a,b)=>a.start-b.start);
  },[events,calendars,today]);
  const openSchedule = () => { setAnchor(today); setView('week'); setActiveTool('schedule'); };
  return <div className="workspace-page"><div className="home-content">
    <section className="home-intro">
      <div><div className="eyebrow">MITCHELL'S WORKSPACE</div><h1>你的工作，从这里开始。</h1><p>日程、翻译与写作，集中在一个安静的工作空间。</p></div>
      <div className="date-object"><span>{nowCN().format('YYYY / MM')}</span><strong>{nowCN().format('DD')}</strong><span>{['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][nowCN().day()]}</span></div>
    </section>
    <div className="section-title"><h2>我的工具</h2><span>为每天的专注而准备</span></div>
    <div className="tool-grid">
      {toolRegistry.filter(t=>t.id!=='home').map((tool,i)=><button key={tool.id} className={`tool-card ${tool.status==='planned'?'planned':''}`} disabled={tool.status==='planned'} onClick={()=>setActiveTool(tool.id)}>
        <div className="tool-card-top"><span className="tool-emblem"><ToolIcon id={tool.id} size={29}/></span><span className="tool-index">0{i+1}</span></div>
        <div className="tool-card-title"><h3>{tool.name}</h3><p>{tool.description}</p></div>
        <div className="tool-card-bottom"><span>{tool.id==='schedule'?'日 / 周 / 月 · 任务管理':tool.id==='translate'?'中英双向 · 长文翻译':'即将加入'}</span>{tool.status==='ready'?<ToolIcon id="arrow" size={19}/>:<span className="planned-tag">规划中</span>}</div>
      </button>)}
    </div>
    <section className="home-overview">
      <div className="today-summary"><div className="section-title"><h2>今天一览</h2><button onClick={openSchedule}>打开日程 <span>↗</span></button></div>
        <div className="overview-metrics"><div><strong>{upcoming.length.toString().padStart(2,'0')}</strong><span>项日程</span></div><div><strong>{(due.length-done).toString().padStart(2,'0')}</strong><span>项待完成</span></div><div><strong>{done.toString().padStart(2,'0')}</strong><span>项已完成</span></div></div>
      </div>
      <div className="today-list">{upcoming.length ? upcoming.slice(0,3).map((e,i)=><button onClick={openSchedule} key={e.id+'-'+i}><span className="timeline-dot"/><time>{e.isAllDay?'全天':dayjs(e.start).format('HH:mm')}</time><span>{e.title}</span><span className="text-tt">↗</span></button>):<div className="home-empty"><span className="empty-line"/><p>今天还没有日程</p><button onClick={openSchedule}>留一点空间，安排重要的事 ↗</button></div>}</div>
    </section>
    <footer className="home-footer"><span>一个空间，连接你的日常。</span><button onClick={()=>useStore.getState().setSettingsOpen(true)}><ToolIcon id="settings" size={15}/> 调整空间配色</button></footer>
  </div></div>;
}
