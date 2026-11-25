import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const folder = new URL('servers/', import.meta.url);
const entries = await Promise.all((await readdir(folder)).map(async file => ({
  file, ...JSON.parse(await readFile(new URL(file, folder), 'utf8')),
})));
const expected = new Map([
  ['invalid.default-mcp-host/OpenAI-Images', ['/openai-images', 'Authorization']],
  ['invalid.default-mcp-host/Google-Images', ['/google-images', 'x-goog-api-key']],
  ['invalid.default-mcp-host/Anthropic-Skills', ['/anthropic-skills', 'x-api-key']],
  ['invalid.default-mcp-host/GitHub-RESTCountries', ['/github-rest-countries']],
  ['invalid.default-mcp-host/ModelContext-Utils', ['/modelcontext-utils']],
  ['invalid.default-mcp-host/Microsoft-OutlookCalendar', ['/microsoft-outlook-calendar']],
  ['invalid.default-mcp-host/Microsoft-OutlookMail', ['/microsoft-outlook-mail']],
  ['invalid.default-mcp-host/Microsoft-OneNote', ['/microsoft-onenote']],
]);

test('catalog carries one complete registry document per built-in route', () => {
  assert.deepEqual(new Set(entries.map(({ server }) => server.name)), new Set(expected.keys()));
  assert.equal(entries.length, expected.size);
  for (const entry of entries) {
    const { file, server, capabilities, obo } = entry;
    const [path] = expected.get(server.name);
    const graph = path.startsWith('/microsoft-');
    const hasInstructions = path === '/modelcontext-utils';
    assert.equal(file, `${path.slice(1)}.json`);
    assert.deepEqual(Object.keys(entry), ['file', 'server', 'capabilities', ...(graph ? ['obo'] : []), ...(hasInstructions ? ['instructions'] : [])]);
    if (graph) {
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

  for (const { server } of entries) {
    const { headers } = server.remotes[0];
    const [, expectedHeader] = expected.get(server.name);
    if (!expectedHeader) {
      assert.equal(headers, undefined);
      continue;
    }
    assert.equal(headers.length, 1);
    const [header] = headers;
    assert.equal(header.name, expectedHeader);
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

test('ported capabilities match the AI Happey contracts, except omitted widgets', async t => {
  // The source checkout is optional; builds and ordinary catalog validation don't depend on it.
  const sourceEnv = process.env.AIHAPPEY_MCP_SOURCE;
  if (!sourceEnv) return t.skip('Set AIHAPPEY_MCP_SOURCE to the legacy Servers folder for migration parity testing.');
  const { join } = await import('node:path');
  for (const { server, capabilities, obo, instructions } of entries) {
    const name = server.name.split('/').at(-1);
    if (!obo && !['GitHub-RESTCountries', 'ModelContext-Utils'].includes(name)) continue;
    const base = join(sourceEnv, server.name.split('/').at(-1));
    const load = async (file, key) => JSON.parse(await readFile(join(base, file), 'utf8'))[key];
    const optional = (file, key) => load(file, key).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    assert.deepEqual(capabilities.resources, (await optional('Resources.json', 'resources')).filter(resource => !resource.uri.startsWith('ui://')));
    assert.deepEqual(capabilities.resourceTemplates, await optional('ResourceTemplates.json', 'resourceTemplates'));
    assert.deepEqual(capabilities.prompts, await optional('Prompts.json', 'prompts'));
    if (name === 'ModelContext-Utils') assert.equal(instructions, await load('Server.json', 'instructions'));
  }
});
