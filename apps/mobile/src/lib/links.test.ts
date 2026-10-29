/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toAppRoute } from './links.ts';

test('maps notification links to app routes', () => {
  assert.equal(toAppRoute('/orders/6ae0a6ef553edff45ae898cf'), '/order/6ae0a6ef553edff45ae898cf');
  assert.equal(toAppRoute('/messages/abc'), '/chat/abc');
  assert.equal(toAppRoute('/rooms/abc'), '/room/abc');
  assert.equal(toAppRoute('/c/kaiser_ml'), '/c/kaiser_ml');
  assert.equal(toAppRoute('/wallet?payment=1'), '/wallet');
  assert.equal(toAppRoute('/companion/earnings'), '/notifications');
});
