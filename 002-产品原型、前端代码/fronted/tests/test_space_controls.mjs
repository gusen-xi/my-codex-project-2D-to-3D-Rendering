import assert from 'node:assert/strict';
import {directions,snapDirection,resizeRect} from '../src/space-controls.mjs';
assert.deepEqual(directions.map(d=>d.angle),[0,45,90,135,180,225,270,315]);
assert.equal(snapDirection(359),0);
assert.equal(snapDirection(-45),315);
assert.equal(snapDirection(300),315);
const rect={x:.2,y:.3,w:.4,h:.3};
for(const handle of ['n','ne','e','se','s','sw','w','nw']){
 for(const point of [{x:0,y:0},{x:1,y:1},{x:.4,y:.4}]){
  const r=resizeRect(rect,handle,point);
  assert.ok(r.x>=0&&r.y>=0&&r.w>=.019999&&r.h>=.019999);
  assert.ok(r.x+r.w<=1.000001&&r.y+r.h<=1.000001);
  if(!handle.includes('w'))assert.equal(r.x,rect.x);
  if(!handle.includes('n'))assert.equal(r.y,rect.y);
  if(!handle.includes('e'))assert.ok(Math.abs(r.x+r.w-(rect.x+rect.w))<1e-9);
  if(!handle.includes('s'))assert.ok(Math.abs(r.y+r.h-(rect.y+rect.h))<1e-9);
 }
}
console.log('通过：八向角度、旧角度归一化、八个缩放手柄、边界约束和最小尺寸。');
