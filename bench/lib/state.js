/* eslint-env node */
// Engine options for one arm of an A/B bench, and the body-state comparison the
// A/B benches use to assert that their two arms stayed bit-identical.
//
// An arm can be given engine options through a JSON env var, so the work arm can
// run an option the baseline build does not know (the baseline's `Engine.create`
// copies an unknown key onto the engine and never reads it):
//
//   WORK_OPTIONS='{"enableSolvedVelocityAndBounds":false}'
//
// The comparison covers every body field the step writes, so an arm that is
// meant to be bit-identical is held to that on all of them. With
// `enableSolvedVelocityAndBounds: false` on either arm it skips exactly the
// fields that option stops bringing up to date, and only on moving bodies:
// `velocity`, `angularVelocity`, `speed`, `angularSpeed` and `bounds`. A static
// or sleeping body is compared in full either way, which covers the bounds a
// re-frozen body hands the static index.
"use strict";

const SOLVED_FIELDS_NOTE = 'velocity, angularVelocity, speed, angularSpeed and bounds of moving bodies';

function readEngineOptions(name) {
    const raw = process.env[name];
    return raw ? JSON.parse(raw) : {};
}

function keepsSolvedState(options) {
    return options.enableSolvedVelocityAndBounds !== false;
}

// bit equality, NaN matching NaN: a tile released flush against its
// neighbours can blow up in a synthetic scene, and what is being tested is
// whether the two arms agree, not whether the scene is well behaved
function same(x, y) {
    return x === y || (x !== x && y !== y);
}

function bodyFields(body, compareSolved) {
    const fields = [
        ['position.x', body.position.x], ['position.y', body.position.y], ['angle', body.angle],
        ['positionPrev.x', body.positionPrev.x], ['positionPrev.y', body.positionPrev.y],
        ['anglePrev', body.anglePrev],
        ['positionImpulse.x', body.positionImpulse.x], ['positionImpulse.y', body.positionImpulse.y]
    ];
    for (let i = 0; i < body.vertices.length; i++) {
        fields.push(['vertices[' + i + '].x', body.vertices[i].x], ['vertices[' + i + '].y', body.vertices[i].y]);
    }
    if (compareSolved || body.isStatic || body.isSleeping) {
        fields.push(
            ['bounds.min.x', body.bounds.min.x], ['bounds.min.y', body.bounds.min.y],
            ['bounds.max.x', body.bounds.max.x], ['bounds.max.y', body.bounds.max.y],
            ['velocity.x', body.velocity.x], ['velocity.y', body.velocity.y],
            ['angularVelocity', body.angularVelocity], ['speed', body.speed],
            ['angularSpeed', body.angularSpeed]
        );
    }
    return fields;
}

/**
 * Compares two arms' bodies field by field.
 * @return {{ divergent: number, maxDelta: number, first: string|null }}
 */
function compareBodies({ baseBodies, workBodies, compareSolved }) {
    if (baseBodies.length !== workBodies.length) {
        return { divergent: Math.abs(baseBodies.length - workBodies.length), maxDelta: Infinity,
            first: 'body count ' + baseBodies.length + ' vs ' + workBodies.length };
    }
    let divergent = 0;
    let maxDelta = 0;
    let first = null;
    for (let i = 0; i < baseBodies.length; i++) {
        const a = baseBodies[i];
        const b = workBodies[i];
        if (a.isStatic !== b.isStatic || a.isSleeping !== b.isSleeping) {
            divergent++;
            maxDelta = Infinity;
            first = first || 'body ' + i + ' (id ' + a.id + ') static/sleeping state differs';
            continue;
        }
        const fieldsA = bodyFields(a, compareSolved);
        const fieldsB = bodyFields(b, compareSolved);
        let bodyDiffers = false;
        for (let f = 0; f < fieldsA.length; f++) {
            const x = fieldsA[f][1];
            const y = fieldsB[f][1];
            if (!same(x, y)) {
                bodyDiffers = true;
                // NaN against a number has no size; count it as the largest
                const delta = Math.abs(x - y);
                if (delta !== delta) {
                    maxDelta = Infinity;
                } else if (delta > maxDelta) {
                    maxDelta = delta;
                }
                first = first || 'body ' + i + ' (id ' + a.id + ') ' + fieldsA[f][0] + ' ' + x + ' vs ' + y;
            }
        }
        if (bodyDiffers) {
            divergent++;
        }
    }
    return { divergent, maxDelta, first };
}

module.exports = { readEngineOptions, keepsSolvedState, compareBodies, SOLVED_FIELDS_NOTE };
