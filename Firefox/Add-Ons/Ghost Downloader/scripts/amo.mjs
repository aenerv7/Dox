// First listed release only. No updates and no third-party endpoints.
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const api = new URL('https://addons.mozilla.org/api/v5/');
const reader = 'dox-reader@magi';
const upstream = 'ghostdownloader@github.com';
const guid = 'ghost-downloader@magi';
const slug = 'ghost-downloader-dox';
const version = '1.0.0';
const target = `addons/addon/${encodeURIComponent(guid)}/`;
const artifacts = `web-ext-artifacts/ghost-downloader-${version}-`;
const unsigned = `${artifacts}unsigned.zip`;
const source = `${artifacts}source.zip`;
const icon = 'public/icon128.png';
const notFound = 404;
const missing = Symbol('not found');
const uuidPattern = /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i;
const bytes = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await bytes(path));

class ReleaseError extends Error {}
function requireThat(condition, message) {
  if (!condition) { throw new ReleaseError(message); }
}
function safeUuid(value) {
  requireThat(typeof value === 'string' && uuidPattern.test(value), 'Invalid upload UUID.');
  return value.replaceAll('-', '').toLowerCase();
}
function endpoint(path) {
  const url = new URL(path, api);
  requireThat(url.origin === api.origin && url.pathname.startsWith(api.pathname) && !url.username && !url.password, 'Refusing non-AMO endpoint.');
  return url;
}
const safeFields = new Set(('detail non_field_errors error errors code name guid slug categories firefox default_locale description homepage support_url summary privacy_policy requires_payment version upload license release_notes source icon channel authors zh-CN en-US').split(' '));
const httpLabels = new Map([[400, 'validation'], [401, 'authentication'], [403, 'permission'], [404, 'not-found'], [409, 'conflict'], [413, 'too-large'], [429, 'rate-limit']]);
function collectFields(value, found = new Set(), parent = '', depth = 0) {
  if (!value || typeof value !== 'object' || depth >= 5) { return found; }
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(value)) { collectFields(child, found, parent, depth + 1); continue; }
    if (!safeFields.has(key)) { continue; }
    const name = parent ? `${parent}.${key}` : key;
    found.add(name);
    collectFields(child, found, name, depth + 1);
  }
  return found;
}
async function connect() {
  // Sample fresh server time before opening the credential file.
  const clock = await fetch(endpoint(`addons/addon/${encodeURIComponent(reader)}/?clock=${randomUUID()}`), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  const now = Date.parse(clock.headers.get('date'));
  requireThat(clock.ok && Number.isFinite(now), 'Cannot obtain AMO time.');
  const started = performance.now();
  await clock.body?.cancel();
  const { AMO_API_KEY: issuer, AMO_API_SECRET: secret } = parseEnv((await bytes('../Dox Reader/.env.release')).toString());
  requireThat(/^user:\d+(?::\d+)?$/.test(issuer) && secret, 'Missing or invalid release credentials.');
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  return async function request(path, method = 'GET', body, optional) {
    const url = endpoint(path);
    const iat = Math.floor((now + performance.now() - started) / 1000) - 2;
    const jwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, jti: randomUUID(), iat, exp: iat + 60 })}`;
    const signature = createHmac('sha256', secret).update(jwt).digest('base64url');
    const headers = { Authorization: `JWT ${jwt}.${signature}` };
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(url, { method, body, headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (response.status === notFound && optional === missing) { return null; }
    if (!response.ok) {
      // Never log error bodies, which may echo request data.
      const fields = [...collectFields(await response.json().catch(() => null))].join(', ');
      const label = httpLabels.get(response.status) || 'server-response';
      throw new ReleaseError(`AMO ${method} ${url.pathname}: HTTP ${response.status} (${label})${fields ? `; fields: ${fields}` : ''}.`);
    }
    return response.json();
  };
}
async function identify(request) {
  const profile = await request('accounts/profile/');
  const addon = await request(`addons/addon/${encodeURIComponent(reader)}/`);
  requireThat(Number.isSafeInteger(profile.id) && addon.guid === reader && addon.authors.some(a => a.id === profile.id), 'Account is not a listed Dox Reader author.');
  const manifest = await json('dist/manifest.json');
  requireThat(manifest.browser_specific_settings.gecko.id === guid && manifest.version === version && guid !== upstream && guid !== reader, 'Unexpected release identity.');
  return profile.id;
}
async function checkNew(request) {
  for (const key of [guid, slug]) {
    const addon = await request(`addons/addon/${encodeURIComponent(key)}/`, 'GET', undefined, missing);
    requireThat(addon === null, 'Target GUID or listing slug already exists. No registration or update attempted.');
  }
}
function formFile(key, path, type, data) {
  const form = new FormData();
  form.set(key, new Blob([data], { type }), path.split('/').at(-1));
  return form;
}
function zipManifest() {
  // release.ps1 already requires PowerShell. Inspect the archive, not only dist/.
  const code = `$ErrorActionPreference='Stop'; $z=[IO.Compression.ZipFile]::OpenRead('${unsigned}'); try { $m=@($z.Entries | Where-Object FullName -ieq 'manifest.json'); if ($m.Count -ne 1 -or $m[0].FullName -cne 'manifest.json') {throw 'manifest'}; $r=[IO.StreamReader]::new($m[0].Open()); try { [Console]::Write($r.ReadToEnd()) } finally {$r.Dispose()} } finally {$z.Dispose()}`;
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', code], { cwd: fileURLToPath(root), stdio: ['ignore', 'pipe', 'ignore'] }));
}
const digest = data => createHash('sha256').update(data).digest('hex');
const receipt = id => new URL(`web-ext-artifacts/.amo-${safeUuid(id)}.json`, root);
async function upload(request) {
  const data = await bytes(unsigned);
  const m = zipManifest();
  requireThat(m.version === version && m.browser_specific_settings.gecko.id === guid, 'Unexpected ID or version inside ZIP.');
  const hashes = { unsigned: digest(data), source: digest(await bytes(source)) };
  const form = formFile('upload', unsigned, 'application/zip', data);
  form.set('channel', 'listed');
  const result = await request('addons/upload/', 'POST', form);
  const id = safeUuid(result.uuid);
  await writeFile(receipt(id), JSON.stringify(hashes), { flag: 'wx', mode: 0o600 });
  console.log(id);
}
async function status(request, id) {
  const data = await request(`addons/upload/${id}/`);
  requireThat(safeUuid(data.uuid) === id && data.channel === 'listed', 'Upload does not match listed channel or UUID.');
  return { uuid: id, processed: data.processed, valid: data.valid, submitted: data.submitted, version: data.version };
}
async function identity(request, owner) {
  const a = await request(target);
  requireThat(a.guid === guid && a.slug === slug && a.authors.some(x => x.id === owner), 'Refusing to edit an unrelated add-on.');
  const filter = 'filter=all_without_unlisted';
  const versions = await request(`${target}versions/?${filter}`);
  requireThat(versions.count === 1 && versions.results[0]?.version === version, 'Expected only the first listed version.');
  const versionId = versions.results[0].id;
  requireThat(Number.isSafeInteger(versionId), 'Missing AMO version ID.');
  const v = await request(`${target}versions/${versionId}/`);
  requireThat(v.channel === 'listed' && v.version === version && 'source' in v, 'Expected own listed version.');
  return { a, v };
}
function hasIcon(addon) {
  return /\/user-media\/addon_icons\//.test(addon.icon_url ?? '');
}
async function policyMatches(request, listing) {
  const policy = await request(`${target}eula_policy/?show_source=true`, 'GET', undefined, missing);
  return Object.entries(listing.privacy_policy).every(([lang, text]) => text === policy?.privacy_policy?.[lang]);
}
async function finalize(request, listing, owner, stage) {
  const { a, v } = await identity(request, owner);
  if (!v.source) { await request(`${target}versions/${v.id}/`, 'PATCH', formFile('source', source, 'application/zip', await bytes(source))); }
  if (stage === 'create' || !hasIcon(a)) { await request(target, 'PATCH', formFile('icon', icon, 'image/png', await bytes(icon))); }
  if (!await policyMatches(request, listing)) {
    await request(`${target}eula_policy/`, 'PATCH', { privacy_policy: listing.privacy_policy });
  }
}
async function verify(request, listing, owner) {
  const { a, v } = await identity(request, owner);
  console.log(JSON.stringify({ guid, version, addonStatus: a.status, fileStatus: v.file?.status, reviewed: v.reviewed, source: !!v.source, icon: hasIcon(a), privacy: await policyMatches(request, listing) }));
}
async function main() {
  const [command, arg, ...extra] = process.argv.slice(2);
  requireThat(['check', 'upload', 'status', 'create', 'finalize', 'verify'].includes(command) && !extra.length, 'Use: check | upload listed | status UUID | create UUID | finalize | verify');
  let id;
  if (['status', 'create'].includes(command)) { id = safeUuid(arg); }
  else if (command === 'upload') { requireThat(arg === 'listed', 'Use: upload listed'); }
  else { requireThat(arg === undefined, 'Unexpected argument.'); }
  const listing = await json('amo-listing.json');
  requireThat(listing.slug === slug && listing.privacy_policy?.['zh-CN'] && listing.privacy_policy?.['en-US'], 'Invalid listing or privacy policy.');
  const request = await connect();
  const owner = await identify(request);
  if (['check', 'upload', 'create'].includes(command)) { await checkNew(request); }
  if (command === 'check') { console.log(`Dox Reader author verified; ${guid} differs from ${upstream}; target GUID and slug not found.`); return; }
  if (command === 'upload') { return upload(request); }
  if (command === 'status') { console.log(JSON.stringify(await status(request, id))); return; }
  if (command === 'create') {
    const hashes = JSON.parse(await readFile(receipt(id)));
    requireThat(hashes.unsigned === digest(await bytes(unsigned)) && hashes.source === digest(await bytes(source)), 'Upload receipt or local artifacts do not match.');
    const s = await status(request, id);
    requireThat(s.processed && s.valid && !s.submitted && s.version === version, 'Upload not ready, invalid, consumed, or wrong version.');
    const { privacy_policy, categories, ...data } = listing;
    const a = await request('addons/addon/', 'POST', { ...data, categories: Array.isArray(categories) ? { firefox: categories } : categories, version: { ...listing.version, upload: id } });
    requireThat(a.guid === guid, 'Unexpected registered GUID. Stop and inspect Developer Hub.');
    console.log('Registered. If interrupted, run finalize, not create.');
  }
  if (command !== 'verify') { await finalize(request, listing, owner, command); }
  await verify(request, listing, owner);
}
main().catch(error => {
  console.error(error instanceof ReleaseError ? error.message : 'Local input, transport, or response error. No sensitive details logged.');
  process.exitCode = 1;
});
