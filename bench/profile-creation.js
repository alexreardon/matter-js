/* eslint-env node, es6 */
"use strict";

// One build per process so body populations never acquire a build-order bias.
// Alternate process order when comparing builds. The direct path matches
// Page Rage's createRectangleBody; the factory path covers generic callers.
const Matter = require(process.argv[2] || '../src/module/main.js');
const updates = Number(process.env.UPDATES || 300000);
const direct = process.env.DIRECT !== '0';
let sink = 0;

function create(index) {
    const width = 12 + index % 31;
    const height = 10 + index % 17;
    if (!direct) {
        return Matter.Bodies.rectangle(index % 1000, index % 500, width, height);
    }
    return Matter.Body.create({
        label: 'Rectangle Body',
        position: { x: index % 1000, y: index % 500 },
        vertices: [{ x: 0, y: 0 }, { x: width, y: 0 },
            { x: width, y: height }, { x: 0, y: height }]
    });
}

for (let index = 0; index < 60000; index++) {
    sink += create(index).axes[0].y;
}
const start = process.hrtime.bigint();
for (let index = 0; index < updates; index++) {
    const body = create(index);
    if (body.axes.length !== 2 || !Number.isFinite(body.mass)) {
        throw new Error('invalid rectangle');
    }
    sink += body.axes[0].y;
}
console.log(JSON.stringify({ direct, nsPerBody: Number(process.hrtime.bigint() - start) / updates, sink }));
