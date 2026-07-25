/* eslint-env node */
// TEMP probe: characterises Collision.collides traffic in the game regime.
"use strict";
const Matter = require('../src/module/main.js');
const { Collision } = Matter;
const orig = Collision.collides;
const c = { calls: 0, nulls: 0, hits: 0, aaB: 0, aaA: 0, exactMiss: 0, aaBothNull: 0, rot: 0 };
function aabb(vs) {
    let minX = vs[0].x, maxX = minX, minY = vs[0].y, maxY = minY;
    for (let i = 1; i < vs.length; i++) {
        const v = vs[i];
        if (v.x < minX) minX = v.x; else if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; else if (v.y > maxY) maxY = v.y;
    }
    return { minX, maxX, minY, maxY };
}
function isAligned(axes) {
    if (axes.length !== 2) return false;
    for (const a of axes) {
        const ax = Math.abs(a.x), ay = Math.abs(a.y);
        if (!((ax === 1 && ay === 0) || (ax === 0 && ay === 1))) return false;
    }
    return true;
}
Collision.collides = function (bodyA, bodyB, pairs) {
    c.calls++;
    if (isAligned(bodyB.axes)) c.aaB++;
    if (isAligned(bodyA.axes)) c.aaA++;
    if (isAligned(bodyA.axes) && isAligned(bodyB.axes)) c.aaBothNull++;
    const a = aabb(bodyA.vertices), b = aabb(bodyB.vertices);
    const exactOverlap = !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
    const r = orig.call(this, bodyA, bodyB, pairs);
    if (r) c.hits++; else { c.nulls++; if (!exactOverlap) c.exactMiss++; }
    return r;
};
process.on('exit', () => {
    const steps = Number(process.env.UPDATES || 1500) + (process.env.SCENE === 'settle' ? 240 : 600);
    console.log('');
    console.log('collides calls/step:      ' + (c.calls / steps).toFixed(0));
    console.log('  hits                    ' + (c.hits / steps).toFixed(0) + ' (' + (100 * c.hits / c.calls).toFixed(1) + '%)');
    console.log('  nulls                   ' + (c.nulls / steps).toFixed(0) + ' (' + (100 * c.nulls / c.calls).toFixed(1) + '%)');
    console.log('  nulls exact-AABB would catch ' + (c.exactMiss / steps).toFixed(0) + ' (' + (100 * c.exactMiss / c.calls).toFixed(1) + '% of calls)');
    console.log('  bodyB axis-aligned      ' + (100 * c.aaB / c.calls).toFixed(1) + '%');
    console.log('  bodyA axis-aligned      ' + (100 * c.aaA / c.calls).toFixed(1) + '%');
    console.log('  both axis-aligned       ' + (100 * c.aaBothNull / c.calls).toFixed(1) + '%');
});
require('./profile-game.js');
