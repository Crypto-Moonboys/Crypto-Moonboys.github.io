import { LAYOUT_ITERATIONS, stepGraphLayout } from './graph-layout.js';

self.onmessage = ({ data: { points, edges, width, height } }) => {
  for (let step = 0; step < LAYOUT_ITERATIONS; step += 1) {
    stepGraphLayout(points, edges, width, height, 1 - step / LAYOUT_ITERATIONS);
  }
  self.postMessage(points.map(({ x, y }) => ({ x, y })));
};
