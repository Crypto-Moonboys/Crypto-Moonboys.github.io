import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requiredNbgCourseVersion, acceptsNbgCourse } from './verify-nbg-pages-worker-course.mjs';

const source = readFileSync('game/nbg-level1.js','utf8');
const health = {
  ok:true, service:'moonboys-leaderboard',
  nbg_london_ranked_scoring_available:true,
  nbg_london_course_version_supported:2,
  database_configured:true, leaderboard_store_configured:true,
  telegram_auth_configured:true
};
test('new browser revision requires explicit live Worker support', () => {
  assert.equal(requiredNbgCourseVersion(source),2);
  assert.equal(requiredNbgCourseVersion('var WIDTH = 480;'),1);
  assert.equal(acceptsNbgCourse(health,2),true);
  assert.equal(acceptsNbgCourse({...health,nbg_london_course_version_supported:1},2),false,
    'old Worker must stop Pages before new physics publish');
  assert.equal(acceptsNbgCourse({...health,nbg_london_course_version_supported:null},2),false);
  assert.equal(acceptsNbgCourse({...health,ok:false},2),false);
  assert.equal(acceptsNbgCourse({...health,telegram_auth_configured:false},2),false);
  assert.equal(acceptsNbgCourse({...health,database_configured:false},2),false);
  assert.equal(acceptsNbgCourse({...health,leaderboard_store_configured:false},2),false);
});
test('Pages workflow fail-closed gate runs before publishing', () => {
  const yaml=readFileSync('.github/workflows/pages.yml','utf8');
  const gate=yaml.indexOf('node scripts/verify-nbg-pages-worker-course.mjs');
  const upload=yaml.indexOf('actions/upload-pages-artifact@');
  assert.ok(gate>=0 && upload>gate,
    'any main Pages publishing must verify new course on the live Worker first');
});
