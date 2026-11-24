import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const folder = new URL('servers/', import.meta.url);
const entries = await Promise.all((await readdir(folder)).map(async file => ({
  file, ...JSON.parse(await readFile(new URL(file, folder), 'utf8')),
})));
const expected = new Map([
  ['io.github.streaik/OpenAI-Images', ['/openai-images', 'Authorization']],
  ['io.github.streaik/Google-Images', ['/google-images', 'x-goog-api-key']],
  ['io.github.streaik/Anthropic-Skills', ['/anthropic-skills', 'x-api-key']],
  ['io.github.streaik/Microsoft-OutlookCalendar', ['/microsoft-outlook-calendar']],
  ['io.github.streaik/Microsoft-OutlookMail', ['/microsoft-outlook-mail']],
  ['io.github.streaik/Microsoft-OneNote', ['/microsoft-onenote']],
]);

test('catalog carries one complete registry document per built-in route', () => {
  assert.deepEqual(new Set(entries.map(({ server }) => server.name)), new Set(expected.keys()));
  assert.equal(entries.length, expected.size);
  for (const entry of entries) {
    const { file, server, capabilities, obo } = entry;
    const [path, header] = expected.get(server.name);
    assert.equal(file, `${path.slice(1)}.json`);
    assert.deepEqual(Object.keys(entry), ['file', 'server', 'capabilities', ...(header ? [] : ['obo'])]);
    if (obo) {
      assert.deepEqual(Object.keys(obo), ['graph.microsoft.com']);
      for (const scope of obo['graph.microsoft.com'].split(' ')) assert.match(scope, /^https:\/\/graph\.microsoft\.com\/[A-Z][\w.]+$/);
    }
    assert.deepEqual(Object.keys(capabilities), ['resources', 'resourceTemplates', 'prompts']);
    for (const value of Object.values(capabilities)) assert.ok(Array.isArray(value));
    assert.equal(server.$schema, 'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json');
    assert.match(server.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    assert.ok(server.title && server.description && server.description.length <= 100);
    assert.match(server.version, /^\d+\.\d+\.\d+$/);
    assert.equal(server.remotes.length, 1);
    assert.equal(server.remotes[0].type, 'streamable-http');
    assert.equal(server.remotes[0].url, `https://default-mcp-host.invalid${path}`);
    for (const field of ['id', 'path', 'provider', 'header', 'scheme']) assert.ok(!(field in server));
  }
});

test('headers declare required secret inputs, without publishing credential values', () => {
  function assertSecretInput(input) {
    assert.equal(input.format, 'string');
    assert.equal(input.isRequired, true);
    assert.equal(input.isSecret, true);
    assert.ok(input.placeholder);
    for (const field of ['value', 'default', 'choices']) assert.ok(!(field in input));
  }

  for (const { server, obo } of entries) {
    const { headers } = server.remotes[0];
    if (obo) {
      assert.equal(headers, undefined);
      continue;
    }
    assert.equal(headers.length, 1);
    const [header] = headers;
    assert.equal(header.name, expected.get(server.name)[1]);
    if (header.name === 'Authorization') {
      assert.equal(header.isRequired, true);
      assert.equal(header.value, 'Bearer {openai_api_key}');
      assert.ok(!('default' in header) && !('choices' in header));
      assert.deepEqual(Object.keys(header.variables), ['openai_api_key']);
      assertSecretInput(header.variables.openai_api_key);
    } else {
      assert.ok(!('variables' in header));
      assertSecretInput(header);
    }
  }
});

test('Graph capabilities match the imported AI Happey contracts, except the omitted widget', async t => {
  // The source checkout is optional; builds and ordinary catalog validation don't depend on it.
  const sourceEnv = process.env.AIHAPPEY_MCP_SOURCE;
  if (!sourceEnv) return t.skip('Set AIHAPPEY_MCP_SOURCE to the legacy Servers folder for migration parity testing.');
  const { join } = await import('node:path');
  for (const { server, capabilities, obo } of entries) {
    if (!obo) continue;
    const base = join(sourceEnv, server.name.split('/').at(-1));
    const load = async (file, key) => JSON.parse(await readFile(join(base, file), 'utf8'))[key];
    assert.deepEqual(capabilities.resources, (await load('Resources.json', 'resources')).filter(resource => !resource.uri.startsWith('ui://')));
    assert.deepEqual(capabilities.resourceTemplates, await load('ResourceTemplates.json', 'resourceTemplates'));
    const prompts = await load('Prompts.json', 'prompts').catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    assert.deepEqual(capabilities.prompts, prompts);
  }
});
