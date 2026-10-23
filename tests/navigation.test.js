import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, loginDestination } from '../public/js/navigation.js';

test('next preserves local paths, filters and fragments for both roles', () => {
  for (const next of ['/enviar', '/colecoes#album-12', '/descobrir?provincia=sofala&foto=9', '/@fotografo#envios']) {
    assert.equal(safeNext(next), next);
    for (const role of ['user', 'admin']) assert.equal(loginDestination({ role }, next), next);
  }
  assert.equal(loginDestination({ role: 'admin' }, null), '/admin');
  assert.equal(loginDestination({ role: 'user' }, null), '/descobrir');
});

test('invalid next cannot navigate off site or loop through login', () => {
  for (const next of ['https://example.com', '//example.com', '/\\example.com', '/%2fexample.com', '/%5cexample.com', '/x\n', '/%0a/x', '/entrar', '/entrar.html?next=/enviar', '/a/../entrar', '%', '', null]) {
    assert.equal(safeNext(next), null, String(next));
    assert.equal(loginDestination({ role: 'user' }, next), '/descobrir');
  }
});
