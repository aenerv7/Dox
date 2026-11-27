const PROCESSOR = 'https://ffmpeg.bmmmd.com/';
const PROMPT_LIFETIME = 120_000;
const PROMPT_COOLDOWN = 10_000;
const LOAD_POLL = 500;

type Sender = chrome.runtime.MessageSender;
type Media = {data: Blob | string; type?: string};
type Transfer = {Message: string; action: string; files: Media[]; url: string; title: string; output?: string; quantity: number; tabId: number};
type Job = {data: Transfer; frame: number; prompt?: number; approved: boolean; active: boolean; deadline: number};

function mediaFile(value: unknown): value is Media {
  if (!value || typeof value !== 'object' || !('data' in value)) { return false; }
  return value.data instanceof Blob || (typeof value.data === 'string' && /^(?:https?:\/\/|blob:)/i.test(value.data));
}

export function createConsent() {
  const page = chrome.runtime.getURL('ffmpeg-consent.html');
  let job: Job | undefined;
  let timer: ReturnType<typeof setTimeout>;
  let opened: Promise<void> | undefined;
  let nextPrompt = 0;

  async function closePrompt(tabId: number) {
    try {
      if ((await chrome.tabs.get(tabId)).url === page) { await chrome.tabs.remove(tabId); }
    } catch { /* Already closed. */ }
  }

  function discard(current: Job) {
    if (current !== job) { return; }
    clearTimeout(timer);
    job = undefined;
    opened = undefined;
    if (current.prompt !== undefined) { void closePrompt(current.prompt); }
  }

  function request(input: Record<string, unknown>, sender: Sender) {
    const tabId = sender.tab?.id;
    if (job || Date.now() < nextPrompt || sender.id !== chrome.runtime.id || tabId === undefined || sender.tab?.incognito || !sender.url || !/^https?:\/\//i.test(sender.url)) { return false; }
    if (typeof input.action !== 'string' || !Array.isArray(input.files) || !input.files.length || !input.files.every(mediaFile)) { return false; }

    // Send only the media and metadata used by the bundled recorder and merger.
    const data: Transfer = {Message: 'ffmpeg', action: input.action, files: input.files.map(({data, type}) => ({data, type: typeof type === 'string' ? type : undefined})),
      tabId, url: sender.url, title: typeof input.title === 'string' ? input.title : '', quantity: input.files.length};
    if (typeof input.output === 'string') { data.output = input.output; }
    const current: Job = {data, frame: sender.frameId ?? 0, approved: false, active: input.active !== false, deadline: Date.now() + PROMPT_LIFETIME};
    nextPrompt = Date.now() + PROMPT_COOLDOWN;
    job = current;
    timer = setTimeout(() => discard(current), PROMPT_LIFETIME);
    opened = chrome.tabs.create({url: page, active: true}).then(tab => {
      if (tab.id === undefined) { discard(current); return; }
      if (job !== current) { void closePrompt(tab.id); return; }
      current.prompt = tab.id;
    }).catch(() => discard(current));
    return true;
  }

  function trusted(sender: Sender) {
    return job && !job.approved && Date.now() < job.deadline && sender.id === chrome.runtime.id && sender.frameId === 0 && sender.url === page && job.prompt !== undefined && sender.tab?.id === job.prompt ? job : undefined;
  }

  function inspect(sender: Sender) {
    const current = trusted(sender);
    if (!current) { return null; }
    const {title, output, url, action, files} = current.data;
    return {target: PROCESSOR, url, title, output, action, files: files.map(({data,type}) => typeof data === 'string' ? [type, data].filter(Boolean).join(' · ') : `${type || data.type || 'Blob'} · ${data.size} B`)};
  }

  async function deliver(current: Job) {
    const [existing] = await chrome.tabs.query({url: PROCESSOR + '*'});
    if (job !== current) { return; }
    const target = existing ?? await chrome.tabs.create({url: PROCESSOR, active: current.active});
    if (target.id === undefined) { return; }
    // Keep the approval bound to this request; never persist or replay media after restart.
    while (job === current && Date.now() < current.deadline) {
      const tab = await chrome.tabs.get(target.id);
      if (job !== current || Date.now() >= current.deadline) { return; }
      if (tab.url?.startsWith(PROCESSOR) && tab.status === 'complete') {
        await chrome.tabs.sendMessage(target.id, current.data, {frameId: 0});
        return;
      }
      if (tab.url && tab.url !== 'about:blank' && !tab.url.startsWith(PROCESSOR)) { return; }
      await new Promise(resolve => setTimeout(resolve, LOAD_POLL));
    }
  }

  function answer(sender: Sender, decision: unknown) {
    const current = trusted(sender);
    if (!current) { return false; }
    if (decision !== 'allow') { discard(current); return true; }
    current.approved = true;
    nextPrompt = 0;
    const prompt = current.prompt!;
    current.prompt = undefined;
    void closePrompt(prompt);
    void deliver(current).catch(() => {}).finally(() => discard(current));
    return true;
  }

  function removed(tabId: number) {
    if (job && (tabId === job.prompt || tabId === job.data.tabId)) { discard(job); }
  }

  function navigated(tabId: number, frameId: number, url: string) {
    if (!job) { return; }
    const leftSource = tabId === job.data.tabId && (frameId === 0 || frameId === job.frame);
    const leftPrompt = tabId === job.prompt && frameId === 0 && url !== page;
    if (leftSource || leftPrompt) { discard(job); }
  }

  return {request, inspect, answer, removed, navigated, ready: () => opened};
}
