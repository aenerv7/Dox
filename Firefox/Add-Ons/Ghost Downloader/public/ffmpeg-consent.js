const dialog = document.querySelector('dialog');
const text = key => chrome.i18n.getMessage(key);
const language = chrome.i18n.getUILanguage();
document.documentElement.lang = language;
document.documentElement.dir = text('@@bidi_dir') || 'auto';
document.title = text('ffmpegConsentTitle');
document.querySelector('#heading').textContent = document.title;
document.querySelector('#notice').textContent = text('ffmpegConsentData');
document.querySelector('#cancel').textContent = text('cancel');
document.querySelector('#allow').textContent = text('ffmpegConsentAllow');

dialog.addEventListener('close', async () => {
  try {
    await chrome.runtime.sendMessage({type: 'ffmpeg_consent_answer', decision: dialog.returnValue === 'allow' ? 'allow' : 'cancel'});
  } finally {
    window.close();
  }
});
dialog.showModal();

async function load() {
  const view = await chrome.runtime.sendMessage({type: 'ffmpeg_consent_view'});
  if (!view) { dialog.close(); return; }
  document.querySelector('#target').textContent = view.target;
  const list = document.querySelector('#details');
  const count = chrome.i18n.getMessage('itemCount', [String(view.files.length)]);
  for (const value of [view.url, view.title, view.output, view.action, count, ...view.files]) {
    if (!value) { continue; }
    const row = document.createElement('li');
    row.textContent = value;
    list.append(row);
  }
  document.querySelector('#allow').disabled = false;
}
void load().catch(() => dialog.close());
