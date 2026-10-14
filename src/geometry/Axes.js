/**
* The `Matter.Axes` module contains methods for creating and manipulating sets of axes.
*
* @class Axes
*/

var Axes = {};

module.exports = Axes;

var Vector = require('../geometry/Vector');
var Common = require('../core/Common');

(function() {

    /**
     * Creates a new set of axes from the given vertices.
     * @method fromVertices
     * @param {vertices} vertices
     * @return {axes} A new axes from the given vertices
     */
    Axes.fromVertices = function(vertices) {
        if (vertices.length === 4) {
            var first = vertices[0],
                second = vertices[1],
                third = vertices[2],
                fourth = vertices[3];

            // An axis-aligned rectangle overwrites its first two normals with
            // the last two under the same gradient keys, in insertion order.
            if (first.y === second.y && second.x === third.x
                && third.y === fourth.y && fourth.x === first.x
                && first.x !== second.x && first.y !== fourth.y) {
                var horizontalNormal = Vector.normalise({
                        x: fourth.y - third.y,
                        y: third.x - fourth.x
                    }),
                    verticalNormal = Vector.normalise({
                        x: first.y - fourth.y,
                        y: fourth.x - first.x
                    });

                // Underflow or overflow can merge the gradient keys. Keep the
                // original reduction for those degenerate normalisations.
                if (horizontalNormal.y !== 0 && Number.isFinite(horizontalNormal.y)
                    && verticalNormal.x !== 0 && Number.isFinite(verticalNormal.x)) {
                    return [horizontalNormal, verticalNormal];
                }
            }
        }

        var axes = {};

        // find the unique axes, using edge normal gradients
        for (var i = 0; i < vertices.length; i++) {
            var j = (i + 1) % vertices.length, 
                normal = Vector.normalise({ 
                    x: vertices[j].y - vertices[i].y, 
                    y: vertices[i].x - vertices[j].x
                }),
                gradient = (normal.y === 0) ? Infinity : (normal.x / normal.y);
            
            // limit precision
            gradient = gradient.toFixed(3).toString();
            axes[gradient] = normal;
        }

        return Common.values(axes);
    };

    /**
     * Rotates a set of axes by the given angle.
     * @method rotate
     * @param {axes} axes
     * @param {number} angle
     */
    Axes.rotate = function(axes, angle) {
        // fused copies live in Body._transformSinglePart and
        // Body.setPositionAndAngle: change them with this
        if (angle === 0)
            return;
        
        var cos = Math.cos(angle),
            sin = Math.sin(angle);

        for (var i = 0; i < axes.length; i++) {
            var axis = axes[i],
                xx;
            xx = axis.x * cos - axis.y * sin;
            axis.y = axis.x * sin + axis.y * cos;
            axis.x = xx;
        }
    };

})();
