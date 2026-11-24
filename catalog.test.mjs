import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('catalog.json', import.meta.url), 'utf8'));
const expected = new Map([
  ['io.github.streaik/OpenAI-Images', ['/openai-images', 'Authorization']],
  ['io.github.streaik/Google-Images', ['/google-images', 'x-goog-api-key']],
  ['io.github.streaik/Anthropic-Skills', ['/anthropic-skills', 'x-api-key']],
]);

test('catalog carries one complete registry document per built-in route', () => {
  assert.deepEqual(Object.keys(catalog), ['servers']);
  assert.deepEqual(new Set(catalog.servers.map(server => server.name)), new Set(expected.keys()));
  assert.equal(catalog.servers.length, expected.size);
  for (const server of catalog.servers) {
    const [path] = expected.get(server.name);
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

  for (const server of catalog.servers) {
    const { headers } = server.remotes[0];
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
