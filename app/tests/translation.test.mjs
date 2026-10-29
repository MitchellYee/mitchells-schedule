import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CONTEXT_PRESETS, DEFAULT_CONTEXT, LLM_PROVIDERS, createTranslator, createTranslationHandler, splitText, validateTranslation } from '../server/translation.mjs';

const googleRequest = { text: 'Hello world.', source: 'en', target: 'zh', provider: 'google-web' };
const llmRequest = { text: 'Hello world.', source: 'en', target: 'zh', provider: 'deepseek', apiKey: 'test-key' };
const mockGoogle = (text = '你好。') => new Response(JSON.stringify([[[text, 'Hello']], null, 'en']), { status: 200, headers: { 'Content-Type': 'application/json' } });
const mockSse = (text = '你好。') => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
async function collect(generator) { const parts = []; for await (const part of generator) parts.push(part); return parts; }

test('长句按 Unicode 安全拆分，保留 CRLF、段落和空格且不丢字', () => {
  const text = '  ' + ('A long sentence with emoji 🧰 and words. ').repeat(120) + '\r\n\r\n' + ('很长的中文句子没有空格🪷').repeat(170) + '\n  ';
  const parts = splitText(text); assert.equal(parts.map((p) => p.literal ?? p.before + p.text + p.after).join(''), text); assert.ok(parts.filter((p) => p.text).length > 3);
  for (const p of parts.filter((p) => p.text)) { assert.ok(Array.from(p.text).length <= 1000); assert.equal(p.text.isWellFormed(), true); }
});

test('Google 长文顺序、进度和段落保留', async () => {
  const translator = createTranslator({ fetchImpl: async (url) => mockGoogle(new URL(url).searchParams.get('q').toUpperCase()) });
  const text = ('hello world. ').repeat(110) + '\n\nsecond paragraph.\n'; const parts = await collect(translator.translate({ ...googleRequest, text })); const final = parts.at(-1);
  assert.equal(final.type, 'done'); assert.equal(final.text, text.toUpperCase()); assert.ok(final.total > 1); assert.deepEqual(parts.filter((p) => p.type === 'progress').map((p) => p.completed), Array.from({ length: final.total + 1 }, (_, i) => i));
});

test('只保留 Google 网页和四个 LLM 提供方，移除 Google Cloud', () => {
  assert.deepEqual(Object.keys(LLM_PROVIDERS), ['minimax', 'glm', 'deepseek', 'custom']);
  assert.throws(() => validateTranslation({ ...googleRequest, provider: 'google-cloud' }), { code: 'INPUT' });
  assert.equal(validateTranslation({ ...llmRequest, context: DEFAULT_CONTEXT }).provider, 'deepseek'); assert.ok(CONTEXT_PRESETS.academic);
});

test('官方 LLM 请求携带系统 Prompt、上下文和 Bearer 密钥', async () => {
  let captured; const translator = createTranslator({ fetchImpl: async (url, options) => { captured = { url, options }; return mockSse('译文'); } });
  const parts = await collect(translator.translate({ ...llmRequest, context: '产品术语保持一致。', model: 'deepseek-flash' }));
  const body = JSON.parse(captured.options.body); assert.equal(captured.url, LLM_PROVIDERS.deepseek.endpoint); assert.equal(captured.options.headers.Authorization, 'Bearer test-key'); assert.equal(body.model, 'deepseek-flash'); assert.equal(body.stream, true); assert.equal(body.thinking.type, 'disabled'); assert.match(body.messages[0].content, /产品术语保持一致/); assert.match(body.messages[1].content, /Hello world/); assert.equal(parts.at(-1).text, '译文');
});

test('MiniMax、GLM 和自定义接口使用可编辑模型与接口', async () => {
  for (const provider of ['minimax', 'glm']) {
    let url; const translator = createTranslator({ fetchImpl: async (value) => { url = value; return mockSse('ok'); } });
    await collect(translator.translate({ ...llmRequest, provider, model: 'chosen-model', apiKey: 'key' })); assert.equal(url, LLM_PROVIDERS[provider].endpoint);
  }
  let customUrl; const custom = createTranslator({ fetchImpl: async (value) => { customUrl = value; return mockSse('ok'); } });
  await collect(custom.translate({ ...llmRequest, provider: 'custom', endpoint: 'http://127.0.0.1:1234/v1', model: 'local-model', apiKey: 'key' })); assert.equal(customUrl, 'http://127.0.0.1:1234/v1/chat/completions');
});

test('LLM 未配置密钥不会发请求，也不会静默改用 Google', async () => {
  let calls = 0; const translator = createTranslator({ getKey: () => '', fetchImpl: async () => { calls += 1; return mockGoogle(); } });
  await assert.rejects(() => collect(translator.translate({ ...llmRequest, apiKey: '' })), { code: 'CONFIG' }); assert.equal(calls, 0);
});

test('流式 LLM 增量会按顺序返回并最终完成', async () => {
  const translator = createTranslator({ fetchImpl: async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '第' } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: '一段' } }] })}\n\ndata: [DONE]\n`, { headers: { 'Content-Type': 'text/event-stream' } }) });
  const parts = await collect(translator.translate(llmRequest)); assert.equal(parts.at(-1).text, '第一段'); assert.ok(parts.filter((p) => p.type === 'progress').length >= 3);
});

test('LLM JSON 非流式响应也能解析', async () => {
  const translator = createTranslator({ fetchImpl: async () => Response.json({ choices: [{ message: { content: 'JSON 译文' } }] }) });
  assert.equal((await collect(translator.translate(llmRequest))).at(-1).text, 'JSON 译文');
});

test('取消立即中止上游且不继续发送下一段', async () => {
  let calls = 0; const abort = new AbortController(); const translator = createTranslator({ fetchImpl: async (_url, { signal }) => { calls += 1; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  const promise = collect(translator.translate({ ...llmRequest, text: 'x'.repeat(2500) }, abort.signal)); await new Promise((resolve) => setImmediate(resolve)); abort.abort(new DOMException('Stop', 'AbortError')); await assert.rejects(promise, { name: 'AbortError' }); assert.equal(calls, 1);
});

test('限流、鉴权和异常响应不泄露上游内容', async () => {
  await assert.rejects(() => collect(createTranslator({ fetchImpl: async () => new Response('secret upstream', { status: 429 }) }).translate(llmRequest)), { code: 'RATE_LIMIT' });
  await assert.rejects(() => collect(createTranslator({ fetchImpl: async () => new Response('secret upstream', { status: 401 }) }).translate(llmRequest)), { code: 'AUTH' });
  await assert.rejects(() => collect(createTranslator({ fetchImpl: async () => Response.json({ unexpected: 'data' }) }).translate(llmRequest)), { code: 'UPSTREAM' });
});

test('服务配置不暴露密钥，同源接口返回 NDJSON', async (t) => {
  const handler = createTranslationHandler({ getKey: (provider) => provider === 'deepseek' ? 'secret' : '', fetchImpl: async () => mockSse('你好') }); const server = http.createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); }); const origin = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(origin + '/api/translation/config')).json(); assert.equal(config.providers.deepseek.configured, true); assert.equal(config.providers['google-cloud'], undefined); assert.ok(!JSON.stringify(config).includes('secret'));
  assert.equal((await fetch(origin + '/api/translation', { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: JSON.stringify(llmRequest) })).status, 403);
  const response = await fetch(origin + '/api/translation', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(llmRequest) }); const parts = (await response.text()).trim().split('\n').map(JSON.parse); assert.equal(parts.at(-1).type, 'done'); assert.equal(parts.at(-1).text, '你好');
});
