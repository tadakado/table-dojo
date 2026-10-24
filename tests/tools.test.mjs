import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../tools/azik-from-azookey.mjs';

test('azooKey table conversion: full-width symbol keys and pending input', () => {
  const swift = `
    static let x = InputTables.Helper.constructPieceMap([
        "ka": "か",
        "；": "っ",
        "zー": "〜",
        "z。": "…",
        "z「": "『",
        "kk": "っk",
        "ny": "ny",  // comment
    ])`;
  assert.deepEqual(convert(swift), [
    ['ka', 'か', ''], [';', 'っ', ''], ['z-', '〜', ''], ['z.', '…', ''], ['z[', '『', ''], ['kk', 'っ', 'k'], ['ny', '', 'ny'],
  ]);
});
