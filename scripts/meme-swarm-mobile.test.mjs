import assert from 'node:assert/strict';
import test from 'node:test';
import {navigateChoice} from '../js/arcade/games/invaders/choice-input.js';
test('touch/keyboard directions wrap and Fire confirms the highlighted upgrade',()=>{
  let cursor=0;
  cursor=navigateChoice('ArrowLeft',cursor,3).cursor;assert.equal(cursor,2);
  assert.equal(navigateChoice(' ',cursor,3).confirmIndex,2);
  cursor=navigateChoice('ArrowRight',cursor,3).cursor;assert.equal(cursor,0);
  assert.equal(navigateChoice('2',cursor,3).confirmIndex,1);
});
test('risk choice navigation supports two options without accepting invalid digit slots',()=>{
  assert.equal(navigateChoice('ArrowRight',0,2).cursor,1);
  assert.equal(navigateChoice('Enter',1,2).confirmIndex,1);
  assert.equal(navigateChoice('3',0,2).confirmIndex,undefined);
  assert.equal(navigateChoice(' ',0,0).confirmIndex,undefined);
});
