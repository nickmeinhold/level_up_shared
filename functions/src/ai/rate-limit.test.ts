import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rateLimitDecision, WINDOW_MS} from './rate-limit';

test('first-ever call is allowed and opens a window', () => {
  const d = rateLimitDecision(1000, undefined, 3, WINDOW_MS);
  assert.equal(d.allow, true);
  assert.deepEqual(d.nextState, {windowStart: 1000, count: 1});
});

test('calls within the window increment until the cap', () => {
  const d = rateLimitDecision(1500, {windowStart: 1000, count: 2}, 3, WINDOW_MS);
  assert.equal(d.allow, true);
  assert.deepEqual(d.nextState, {windowStart: 1000, count: 3});
});

test('a call at the cap is blocked', () => {
  const d = rateLimitDecision(1500, {windowStart: 1000, count: 3}, 3, WINDOW_MS);
  assert.equal(d.allow, false);
  assert.equal(d.nextState, undefined);
});

test('a new window opens once the old one elapses, even if previously capped', () => {
  const now = 1000 + WINDOW_MS;
  const d = rateLimitDecision(now, {windowStart: 1000, count: 99}, 3, WINDOW_MS);
  assert.equal(d.allow, true);
  assert.deepEqual(d.nextState, {windowStart: now, count: 1});
});
