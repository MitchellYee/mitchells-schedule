import { useEffect, useRef, useState } from 'react';
import ToolIcon from '../components/ToolIcon';
import { detectDirection, getTranslationConfig, translationClient, type ProviderConfig, type TranslationConfig, type TranslationEngine, type TranslationLanguage } from './translation';

const languageNames = { zh: '中文', en: '英语' };
const SAMPLE = '一个好的工作空间，应该让日程、想法和表达彼此连接。我们希望工具保持简洁，同时为复杂的工作保留足够的空间。\n\n当你阅读一篇长文章时，翻译应当保留段落结构，让你能够轻松对照、理解，并继续自己的思考。';
const ENGINE_NAMES: Record<TranslationEngine, string> = { 'google-web': 'Google 翻译', minimax: 'MiniMax', glm: 'GLM', deepseek: 'DeepSeek', custom: '自定义接口' };

export default function TranslateTool({ active }: { active: boolean }) {
  const [text, setText] = useState(''); const [result, setResult] = useState('');
  const [source, setSource] = useState<'auto' | TranslationLanguage>('auto');
  const [engine, setEngine] = useState<TranslationEngine>(() => (localStorage.getItem('working-tool-translation-provider') as TranslationEngine) || 'google-web');
  const [config, setConfig] = useState<TranslationConfig | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'cancelled' | 'error'>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 }); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false); const [key, setKey] = useState(''); const [keyStatus, setKeyStatus] = useState(''); const [savingKey, setSavingKey] = useState(false);
  const [preset, setPreset] = useState('general'); const [context, setContext] = useState(''); const [model, setModel] = useState(''); const [endpoint, setEndpoint] = useState('');
  const controller = useRef<AbortController | null>(null); const requestId = useRef(0); const inputRef = useRef<HTMLTextAreaElement>(null); const [lastInput, setLastInput] = useState('');
  const sourceLang = source === 'auto' ? detectDirection(text) : source; const target: TranslationLanguage = sourceLang === 'zh' ? 'en' : 'zh';
  const count = Array.from(text).length; const busy = status === 'loading'; const max = config?.maxCharacters || 30_000; const maxContext = config?.maxContextCharacters || 6_000;
  const provider = config?.providers?.[engine] as ProviderConfig | undefined; const isLlm = engine !== 'google-web';
  const effectiveContext = context.trim() || config?.presets?.[preset] || config?.defaultContext || '';
  const activeKey = key.trim(); const configured = !isLlm || !!activeKey || !!provider?.configured;
  const stale = !!result && lastInput !== `${text}|${source}|${engine}|${model}|${endpoint}|${effectiveContext}`;

  const refreshConfig = () => getTranslationConfig().then(setConfig).catch((e) => setError(e.message));
  useEffect(() => { if (active) void refreshConfig(); }, [active]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => { if (!settingsOpen) setKeyStatus(''); }, [settingsOpen]);
  useEffect(() => {
    if (!provider || engine === 'google-web') return;
    setModel((old) => old || provider.model || ''); setEndpoint((old) => old || provider.endpoint || '');
  }, [engine, provider]);
  function resetOutput() { setResult(''); setError(''); setCopied(false); setStatus('idle'); setProgress({ completed: 0, total: 0 }); }
  function selectEngine(value: TranslationEngine) { if (busy) return; setEngine(value); localStorage.setItem('working-tool-translation-provider', value); setError(''); setKey(''); setModel(''); setEndpoint(''); }
  async function translate() {
    if (busy || !text.trim() || count > max || (isLlm && !configured) || (context.length > maxContext)) return;
    const id = ++requestId.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const snapshot = `${text}|${source}|${engine}|${model}|${endpoint}|${effectiveContext}`; setLastInput(snapshot); setResult(''); setError(''); setCopied(false); setStatus('loading'); setProgress({ completed: 0, total: 0 });
    try {
      await translationClient.translate({ text, source, target, provider: engine, model: model.trim() || undefined, endpoint: endpoint.trim() || undefined, context: effectiveContext, apiKey: activeKey || undefined }, abort.signal, (part) => { if (id === requestId.current) { setResult(part.text); setProgress({ completed: part.completed, total: part.total }); } });
      if (id === requestId.current) setStatus('done');
    } catch (e) { if (id !== requestId.current) return; if (abort.signal.aborted) setStatus('cancelled'); else { setStatus('error'); setError(e instanceof Error ? e.message : '翻译失败，请重试。'); } }
    finally { if (id === requestId.current) controller.current = null; }
  }
  async function saveKey(value: string) {
    if (!window.chronaDesktop?.saveTranslationKey || engine === 'custom') return;
    setSavingKey(true); setKeyStatus('');
    try { const state = await window.chronaDesktop.saveTranslationKey(engine, value); setKey(''); await refreshConfig(); setKeyStatus(value ? '密钥已加密保存在本机。' : '本机保存的密钥已清除。'); if (!state.configured) setError('未检测到可用密钥。'); }
    catch { setKeyStatus('未能保存。请检查系统安全存储是否可用。'); }
    finally { setSavingKey(false); }
  }
  function swap() { if (busy) return; setCopied(false); setSource(target); if (result && !stale) { setText(result); setResult(text); setLastInput(`${result}|${target}|${engine}|${model}|${endpoint}|${effectiveContext}`); setStatus('done'); } else resetOutput(); }
  const download = () => { const url = URL.createObjectURL(new Blob([result], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'translation.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  async function copyResult() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setError('复制失败，请手动复制。');
    }
  }

  return <div className="workspace-page translation-page" onKeyDown={(e) => { if (active && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void translate(); } if (e.key === 'Escape' && settingsOpen) setSettingsOpen(false); }}><div className="translation-content">
    <section className="tool-page-heading"><div><div className="eyebrow">TRANSLATE</div><h1>让表达，跨越语言。</h1><p>Google 翻译与可配置 LLM，保留思路，也保留段落。</p></div><button className="quiet-button" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}><ToolIcon id="settings" size={17} /> 翻译设置</button></section>
    {settingsOpen && <section className="translation-settings" aria-label="翻译设置">
      <div><strong>翻译引擎</strong><p>Google 适合快速直译；LLM 会携带专业翻译上下文，适合语气、术语和长文质量控制。</p></div>
      <div className="engine-options">{(['google-web', 'minimax', 'glm', 'deepseek', 'custom'] as TranslationEngine[]).map((id) => <button key={id} disabled={busy} aria-pressed={engine === id} onClick={() => selectEngine(id)}><b>{ENGINE_NAMES[id]}</b><span>{id === 'google-web' ? '免密钥 · 快速翻译' : id === 'custom' ? '自定义 OpenAI 兼容接口' : `${config?.providers?.[id]?.configured ? '已配置' : '需要密钥'} · 官方接口`}</span></button>)}</div>
      {isLlm && <div className="llm-settings">
        <div className="settings-grid"><label>模型名称<input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider?.model || '例如：deepseek-flash'} disabled={busy} /></label><label>接口地址<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={provider?.endpoint || 'https://your-host/v1'} disabled={busy || engine !== 'custom'} /></label></div>
        <label className="key-label">API 密钥<input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider?.configured ? '已保存；输入新密钥可临时替换' : '输入密钥（仅本次会话，桌面版可加密保存）'} disabled={busy} /></label>
        <div className="key-actions">{window.chronaDesktop?.saveTranslationKey && engine !== 'custom' && <><button className="primary-button" disabled={!activeKey || savingKey || busy} onClick={() => void saveKey(activeKey)}>加密保存</button><button className="quiet-button" disabled={savingKey || busy || !provider?.configured} onClick={() => void saveKey('')}>清除已保存密钥</button></>}{engine === 'custom' && <span>自定义密钥仅保留在本次会话，不写入浏览器存储。</span>}{keyStatus && <span role="status">{keyStatus}</span>}</div>
        <div className="context-row"><label>翻译上下文 / Skill<select value={preset} onChange={(e) => { setPreset(e.target.value); setContext(''); }} disabled={busy}>{Object.keys(config?.presets || { general: '' }).map((id) => <option key={id} value={id}>{id === 'general' ? '通用准确' : id === 'business' ? '商务沟通' : id === 'academic' ? '学术写作' : '自然口语'}</option>)}</select></label><label className="context-field">可选补充<textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder={config?.defaultContext || '描述术语、语气或受众…'} disabled={busy} /></label></div>
        <div className="provider-footnote">系统会发送固定翻译规则、你选择的上下文和原文片段；原文中的指令会被当作待翻译内容，不会覆盖翻译规则。当前上下文 {Array.from(effectiveContext).length.toLocaleString()} / {maxContext.toLocaleString()} 字符。</div>
      </div>}
      <div className="provider-footnote">密钥只在本机服务端用于调用所选接口，不会出现在配置查询结果或应用日志中；不会在 Google 与 LLM 之间自动切换。</div>
    </section>}
    <section className="translation-workbench"><div className="language-toolbar"><div><span className="field-label">原文</span><select aria-label="原文语言" value={source} disabled={busy} onChange={(e) => setSource(e.target.value as typeof source)}><option value="auto">自动识别 · 中英互译</option><option value="zh">中文</option><option value="en">英语</option></select></div><button className="swap-button" aria-label="交换翻译方向" title="交换翻译方向" disabled={busy} onClick={swap}>⇄</button><div><span className="field-label">译文</span><strong>{languageNames[target]}</strong><span className="engine-pill">{ENGINE_NAMES[engine]}</span></div></div>
      <div className="translation-editors"><div className="source-editor"><textarea ref={inputRef} aria-label="待翻译文本" placeholder="在这里输入或粘贴文本…" value={text} readOnly={busy} onChange={(e) => setText(e.target.value)} spellCheck={false} />{!text && <button className="sample-button" onClick={() => { setText(SAMPLE); inputRef.current?.focus(); }}>试试一段文字 <span>↗</span></button>}<div className="editor-footer"><span className={count > max ? 'text-danger' : ''}>{count.toLocaleString()} / {max.toLocaleString()} 字符</span><button disabled={busy || !text} onClick={() => { setText(''); resetOutput(); }}>清空</button></div></div>
        <div className="result-editor" aria-busy={busy}>{result ? <textarea readOnly aria-label="翻译结果" value={result} spellCheck={false} /> : <div className="translation-empty"><ToolIcon id="translate" size={38} /><p>{busy ? '正在理解这段文字…' : '译文将在这里呈现'}</p><span>保留段落 · 支持长文本</span></div>}<div className="editor-footer"><span>{stale ? '原文或设置已变化，请重新翻译' : busy ? `已完成 ${progress.completed} / ${progress.total || '…'} 段` : status === 'done' ? '翻译完成' : status === 'cancelled' ? '已取消，保留已完成部分' : status === 'error' && result ? '保留已完成部分' : `${ENGINE_NAMES[engine]} · 中英双向`}</span><div className="flex gap-4"><button disabled={!result || busy} onClick={download}>导出</button><button disabled={!result || busy} onClick={() => void copyResult()}>{copied ? '已复制 ✓' : '复制译文'}</button></div></div></div></div>
      {busy && <div className="translation-progress" role="progressbar" aria-label="翻译进度" aria-valuenow={progress.completed} aria-valuemax={progress.total || 1}><span style={{ width: `${progress.total ? progress.completed / progress.total * 100 : 3}%` }} /></div>}
    </section>
    <div className="translation-actions"><div><span className="service-dot" />{ENGINE_NAMES[engine]}<small>{busy ? '正在翻译，切换工具不会中断' : isLlm ? '已携带翻译上下文 · Ctrl + Enter 翻译' : 'Ctrl + Enter 翻译 · 文本仅保留于当前会话'}</small></div><div className="flex items-center gap-3">{busy ? <button className="quiet-button" onClick={() => controller.current?.abort()}>取消翻译</button> : <button className="primary-button" disabled={!text.trim() || count > max || (isLlm && !configured) || context.length > maxContext} onClick={() => void translate()}>{status === 'error' ? '重新翻译' : '翻译文本'}<ToolIcon id="arrow" size={17} /></button>}</div></div>
    {isLlm && !configured && <p className="translation-notice">请在“翻译设置”中配置 {ENGINE_NAMES[engine]} API 密钥，或切换到 Google 翻译。</p>}{error && <div role="alert" className="translation-error">{error}{result && <span> 已完成部分仍可复制；重试将重新翻译全文。</span>}</div>}
  </div></div>;
}
