import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpec, fetchKeyboard } from '../js/remote.js';

// vendor/js-yaml.min.js is a UMD build loaded as a classic script in the browser; load it the same way here.
const yaml = (() => {
  const module = { exports: {} };
  new Function('module', 'exports', readFileSync(new URL('../vendor/js-yaml.min.js', import.meta.url), 'utf8'))(module, module.exports);
  return module.exports;
})();

test('parseSpec: repository forms', () => {
  assert.deepEqual(parseSpec('tadakado/tk46v6b'), { kind: 'github', owner: 'tadakado', repo: 'tk46v6b', ref: 'HEAD', path: '' });
  assert.deepEqual(parseSpec('tadakado/tk46v6b@dev'), { kind: 'github', owner: 'tadakado', repo: 'tk46v6b', ref: 'dev', path: '' });
  assert.deepEqual(parseSpec('https://github.com/tadakado/tk46v6b'), { kind: 'github', owner: 'tadakado', repo: 'tk46v6b', ref: 'HEAD', path: '' });
  assert.deepEqual(parseSpec('https://github.com/tadakado/tk46v6b/blob/main/keymap/tk46v6b.yaml'),
    { kind: 'github', owner: 'tadakado', repo: 'tk46v6b', ref: 'main', path: 'keymap/tk46v6b.yaml' });
  assert.deepEqual(parseSpec('https://raw.githubusercontent.com/tadakado/tk46v6b/main/keymap/tk46v6b.yaml'),
    { kind: 'github', owner: 'tadakado', repo: 'tk46v6b', ref: 'main', path: 'keymap/tk46v6b.yaml' });
  assert.deepEqual(parseSpec('https://example.com/kb/my.yaml'), { kind: 'url', url: 'https://example.com/kb/my.yaml' });
  assert.throws(() => parseSpec('http://example.com/a.yaml'));
  assert.throws(() => parseSpec(''));
});

const YAML = 'layout: {dts_layout: config/boards/shields/x/x.dtsi}\nlayers:\n  US:\n  - [A, B]\n';
const DTSI = '<&key_physical_attrs 100 100 0 0 0 0 0>';

test('fetchKeyboard: repo -> keymap/<repo>.yaml -> dts_layout (repo-relative)', async () => {
  const seen = [];
  const fetchText = async url => {
    seen.push(url);
    if (url === 'https://raw.githubusercontent.com/o/x/HEAD/keymap/x.yaml') return YAML;
    if (url === 'https://raw.githubusercontent.com/o/x/HEAD/config/boards/shields/x/x.dtsi') return DTSI;
    throw new Error('404 ' + url);
  };
  const kb = await fetchKeyboard('o/x', { yaml, fetchText });
  assert.equal(kb.name, 'x');
  assert.equal(kb.source, 'o/x');
  assert.equal(kb.layoutText, DTSI);
});

test('fetchKeyboard: falls back to the GitHub API listing of keymap/', async () => {
  const fetchText = async url => {
    if (url === 'https://api.github.com/repos/o/x/contents/keymap') return JSON.stringify([
      { type: 'file', name: 'config.yaml', path: 'keymap/config.yaml' },
      { type: 'file', name: 'board.yaml', path: 'keymap/board.yaml' },
    ]);
    if (url.endsWith('/keymap/board.yaml')) return YAML;
    if (url.endsWith('/x.dtsi')) return DTSI;
    throw new Error('404 ' + url);
  };
  const kb = await fetchKeyboard('o/x', { yaml, fetchText });
  assert.equal(kb.yamlUrl, 'https://raw.githubusercontent.com/o/x/HEAD/keymap/board.yaml');
});

test('fetchKeyboard: plain URL resolves dts_layout relative to the YAML; explicit layout URL wins', async () => {
  const fetchText = async url => {
    if (url === 'https://example.com/kb/my.yaml') return 'layout: {dts_layout: ../hw/my.dtsi}\nlayers: {A: [[a]]}\n';
    if (url === 'https://example.com/hw/my.dtsi') return DTSI;
    if (url === 'https://example.com/other.dtsi') return 'other';
    throw new Error('404 ' + url);
  };
  assert.equal((await fetchKeyboard('https://example.com/kb/my.yaml', { yaml, fetchText })).layoutUrl, 'https://example.com/hw/my.dtsi');
  const kb = await fetchKeyboard('https://example.com/kb/my.yaml', { yaml, fetchText, layoutUrl: 'https://example.com/other.dtsi' });
  assert.equal(kb.layoutText, 'other');
  assert.equal(kb.name, 'my');
});

test('fetchKeyboard: YAML without dts_layout and no layout URL is an error', async () => {
  const fetchText = async () => 'layers: {A: [[a]]}\n';
  await assert.rejects(fetchKeyboard('https://example.com/a.yaml', { yaml, fetchText }), /dts_layout/);
});

test('fetchKeyboard: a network failure is reported as such, not as "not found"', async () => {
  const fetchText = async () => { throw Object.assign(new Error('offline'), { network: true }); };
  await assert.rejects(fetchKeyboard('o/x', { yaml, fetchText }), /offline/);
});
