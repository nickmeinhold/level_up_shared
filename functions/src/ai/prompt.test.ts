import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemBlocks} from './prompt';

test('buildSystemBlocks puts the corpus in the last block', () => {
  const blocks = buildSystemBlocks('CORPUS_TEXT');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[blocks.length - 1].text, 'CORPUS_TEXT');
});

test('cache_control sits on the last block only (cached prefix)', () => {
  const blocks = buildSystemBlocks('CORPUS_TEXT');
  assert.equal(blocks[0].cache_control, undefined);
  assert.deepEqual(blocks[1].cache_control, {type: 'ephemeral'});
});

test('the instruction block forbids inventing drills', () => {
  const blocks = buildSystemBlocks('x');
  assert.match(blocks[0].text, /Do NOT invent/);
});
