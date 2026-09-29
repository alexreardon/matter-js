/*!
 * matter-js 0.20.0-perf20 by @liabru
 * http://brm.io/matter-js/
 * License MIT
 * 
 * The MIT License (MIT)
 * 
 * Copyright (c) Liam Brummitt and contributors.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("Matter", [], factory);
	else if(typeof exports === 'object')
		exports["Matter"] = factory();
	else
		root["Matter"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 20);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

/**
* The `Matter.Common` module contains utility functions that are common to all modules.
*
* @class Common
*/

var Common = {};

module.exports = Common;

(function() {

    Common._baseDelta = 1000 / 60;
    Common._nextId = 0;
    Common._seed = 0;
    Common._nowStartTime = +(new Date());
    Common._warnedOnce = {};
    Common._decomp = null;

    /**
     * Counter bumped whenever any body's moving-vs-resting classification
     * changes: `Body.setStatic`, `Sleeping.set`, and a `Body` setter moving a
     * resting body the grid has indexed, which promotes it to a mover (see
     * `Body._promoteIfIndexed`).
     *
     * `Engine.update` and the grid broadphase both need the list of
     * moving bodies each step, and building it means touching every body in the
     * world. On a dense static page (thousands of intact tiles, a few hundred
     * movers) that walk is memory-bound and became one of the largest single
     * costs in the step. Both now cache their list and rebuild it only when this
     * counter moves (or when the world's body set itself changes), which is rare
     * in normal play.
     *
     * This lives on `Common` because it is read by modules that must not depend
     * on each other (`Engine`, `Detector`) and written by `Body` / `Sleeping`.
     *
     * Contract: code that flips `body.isStatic` or `body.isSleeping` by direct
     * assignment instead of through those methods will leave the cached lists
     * stale (the body keeps its old moving/resting role until the next genuine
     * change). Matter has always documented those flags as setter-owned.
     */
    Common._bodyStaticEpoch = 0;

    /**
     * Counter bumped by `Composite.setModified` whenever it marks a composite
     * modified, which every membership change makes: `Composite.add` /
     * `remove` / `clear`, and a caller that edits `composite.bodies` directly
     * and then calls it (the only signal such a caller gives).
     *
     * `Engine.update` hands a world with no child composites to its passes and
     * its detector as `world.bodies` ITSELF (see `Composite._ownBodies`), so
     * the array's identity no longer changes when its membership does, and the
     * two mover classifications (`Engine.update`, and the grid
     * broadphase) key on this instead. Every membership change bumps it: a
     * direct edit through `setModified`, which is the only signal such a
     * caller gives, and `Composite`'s own add and remove through
     * `_setModifiedJournaled`, which also keeps the body journal (see
     * `_journalTouch`) live.
     *
     * It is shared by every composite, so a change to one world also rebuilds
     * the other's lists: a wasted walk, never a wrong one.
     */
    Common._bodySetEpoch = 0;

    /**
     * The stamp of the last full classification walk of any grid
     * detector. One counter for every detector, so a stamp names one walk of
     * one world, which is what lets it serve as a membership generation (see
     * `_journalTouch`).
     * @private
     */
    Common._walkStamp = 0;

    /**
     * How many full classification walks have run over an array that was not
     * their detector's own world's array: a detector used on its own, a world
     * with child composites, an update's array a listener has replaced. Such
     * a walk restamps bodies some other world's journal may hold as members,
     * so every journal started before it is read no more (see
     * Detector._classifyFromJournal); the engine's own walks of a flat world
     * never count.
     * @private
     */
    Common._foreignWalks = 0;

    /**
     * Records `body` in its world's body journal, if it is a member of a world
     * that keeps one.
     *
     * The journal is how the grid broadphase learns what changed in a
     * flat world without walking every body in it. Once a detector has
     * classified a world in full, the world keeps the list of bodies whose
     * membership or moving-vs-resting role may have changed since
     * (`composite._touched`, its first `_touchedCount` entries):
     * `Composite.addBody`, `removeBodyAt` and `removeBodies` record the bodies
     * they add or remove, and `Body.setStatic`, `Sleeping.set` and the
     * promotion of a moved indexed resting body (`Body._promoteIfIndexed`)
     * record a member through this. The detector then classifies just those
     * bodies (`Detector._classifyFromJournal`).
     *
     * A body is a member while `body._sOwner` is the world and `body._sWalk`
     * is the world's `_memberGen`, the stamp of the full walk that started
     * the journal. A body in no world, or removed from one, records nothing,
     * which is what keeps a body flagged before it is added out of the lists.
     * Anything the journal cannot describe switches it off (`_journalLive`
     * false) until the next full walk: a direct edit of `composite.bodies`
     * signalled through `Composite.setModified`, `Composite.clear`, a body
     * added twice, a list too long to be worth reading.
     * @method _journalTouch
     * @private
     * @param {body} body
     */
    Common._journalTouch = function(body) {
        var owner = body._sOwner;

        if (owner !== null && owner._journalLive === true && body._sWalk === owner._memberGen) {
            Common._journalPush(owner, body);
        }
    };

    /**
     * Appends `body` to `composite`'s journal, or switches the journal off
     * once it holds a quarter of the world, where a full walk is the cheaper
     * answer. The list is filled BY INDEX up to `_touchedCount` and never
     * shrunk, so the steady state does not allocate.
     * @method _journalPush
     * @private
     * @param {composite} composite
     * @param {body} body
     */
    Common._journalPush = function(composite, body) {
        var count = composite._touchedCount;

        if (count >= 64 && count >= (composite.bodies.length >> 2)) {
            composite._journalLive = false;
            return;
        }

        composite._touched[count] = body;
        composite._touchedCount = count + 1;
    };

    /**
     * Whether the velocity solver may read `body` as the REST row: a static
     * body whose `position - positionPrev` and `angle - anglePrev` are each
     * exactly `+0` and whose `inverseInertia` is exactly `+0`.
     *
     * Such a body contributes a velocity of exactly `+0` at every contact
     * point and a `+0` inertia term to every contact share, whatever its
     * position, so `Resolver.preSolveVelocity` writes it a constant zero row
     * without reading the body (see there). Every `Body` method that writes
     * one of those fields stores the answer in `body._restStatic`, as does the
     * position correction in `Resolver`.
     *
     * Each difference must be `+0`, not merely equal to zero: `-0` is equal to
     * zero, and a `-0` velocity can reach a solved value as a `-0` where the
     * zero row gives `+0`. A non-finite position fails too, since its
     * difference is `NaN`.
     *
     * Contract: the same as `_bodyStaticEpoch` above. Code that assigns
     * `position`, `positionPrev`, `angle`, `anglePrev` or `inverseInertia` of a
     * static body directly, instead of through the `Body` methods, leaves the
     * flag stale.
     * @private
     * @method _isRestingStatic
     * @param {body} body
     * @return {boolean}
     */
    Common._isRestingStatic = function(body) {
        if (body.isStatic !== true) {
            return false;
        }

        var position = body.position,
            positionPrev = body.positionPrev,
            inverseInertia = body.inverseInertia,
            deltaX = position.x - positionPrev.x,
            deltaY = position.y - positionPrev.y,
            deltaAngle = body.angle - body.anglePrev;

        // `1 / d` is `Infinity` for `+0` only (`-Infinity` for `-0`)
        return deltaX === 0 && 1 / deltaX === Infinity
            && deltaY === 0 && 1 / deltaY === Infinity
            && deltaAngle === 0 && 1 / deltaAngle === Infinity
            && inverseInertia === 0 && 1 / inverseInertia === Infinity;
    };

    /**
     * Extends the object in the first argument using the object in the second argument.
     * @method extend
     * @param {} obj
     * @param {boolean} deep
     * @return {} obj extended
     */
    Common.extend = function(obj, deep) {
        var argsStart,
            args,
            deepClone;

        if (typeof deep === 'boolean') {
            argsStart = 2;
            deepClone = deep;
        } else {
            argsStart = 1;
            deepClone = true;
        }

        for (var i = argsStart; i < arguments.length; i++) {
            var source = arguments[i];

            if (source) {
                for (var prop in source) {
                    if (deepClone && source[prop] && source[prop].constructor === Object) {
                        if (!obj[prop] || obj[prop].constructor === Object) {
                            obj[prop] = obj[prop] || {};
                            Common.extend(obj[prop], deepClone, source[prop]);
                        } else {
                            obj[prop] = source[prop];
                        }
                    } else {
                        obj[prop] = source[prop];
                    }
                }
            }
        }
        
        return obj;
    };

    /**
     * Creates a new clone of the object, if deep is true references will also be cloned.
     * @method clone
     * @param {} obj
     * @param {bool} deep
     * @return {} obj cloned
     */
    Common.clone = function(obj, deep) {
        return Common.extend({}, deep, obj);
    };

    /**
     * Returns the list of keys for the given object.
     * @method keys
     * @param {} obj
     * @return {string[]} keys
     */
    Common.keys = function(obj) {
        if (Object.keys)
            return Object.keys(obj);

        // avoid hasOwnProperty for performance
        var keys = [];
        for (var key in obj)
            keys.push(key);
        return keys;
    };

    /**
     * Returns the list of values for the given object.
     * @method values
     * @param {} obj
     * @return {array} Array of the objects property values
     */
    Common.values = function(obj) {
        var values = [];
        
        if (Object.keys) {
            var keys = Object.keys(obj);
            for (var i = 0; i < keys.length; i++) {
                values.push(obj[keys[i]]);
            }
            return values;
        }
        
        // avoid hasOwnProperty for performance
        for (var key in obj)
            values.push(obj[key]);
        return values;
    };

    /**
     * Gets a value from `base` relative to the `path` string.
     * @method get
     * @param {} obj The base object
     * @param {string} path The path relative to `base`, e.g. 'Foo.Bar.baz'
     * @param {number} [begin] Path slice begin
     * @param {number} [end] Path slice end
     * @return {} The object at the given path
     */
    Common.get = function(obj, path, begin, end) {
        path = path.split('.').slice(begin, end);

        for (var i = 0; i < path.length; i += 1) {
            obj = obj[path[i]];
        }

        return obj;
    };

    /**
     * Sets a value on `base` relative to the given `path` string.
     * @method set
     * @param {} obj The base object
     * @param {string} path The path relative to `base`, e.g. 'Foo.Bar.baz'
     * @param {} val The value to set
     * @param {number} [begin] Path slice begin
     * @param {number} [end] Path slice end
     * @return {} Pass through `val` for chaining
     */
    Common.set = function(obj, path, val, begin, end) {
        var parts = path.split('.').slice(begin, end);
        Common.get(obj, path, 0, -1)[parts[parts.length - 1]] = val;
        return val;
    };

    /**
     * Shuffles the given array in-place.
     * The function uses a seeded random generator.
     * @method shuffle
     * @param {array} array
     * @return {array} array shuffled randomly
     */
    Common.shuffle = function(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Common.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    };

    /**
     * Randomly chooses a value from a list with equal probability.
     * The function uses a seeded random generator.
     * @method choose
     * @param {array} choices
     * @return {object} A random choice object from the array
     */
    Common.choose = function(choices) {
        return choices[Math.floor(Common.random() * choices.length)];
    };

    /**
     * Returns true if the object is a HTMLElement, otherwise false.
     * @method isElement
     * @param {object} obj
     * @return {boolean} True if the object is a HTMLElement, otherwise false
     */
    Common.isElement = function(obj) {
        if (typeof HTMLElement !== 'undefined') {
            return obj instanceof HTMLElement;
        }

        return !!(obj && obj.nodeType && obj.nodeName);
    };

    /**
     * Returns true if the object is an array.
     * @method isArray
     * @param {object} obj
     * @return {boolean} True if the object is an array, otherwise false
     */
    Common.isArray = function(obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    };

    /**
     * Returns true if the object is a function.
     * @method isFunction
     * @param {object} obj
     * @return {boolean} True if the object is a function, otherwise false
     */
    Common.isFunction = function(obj) {
        return typeof obj === "function";
    };

    /**
     * Returns true if the object is a plain object.
     * @method isPlainObject
     * @param {object} obj
     * @return {boolean} True if the object is a plain object, otherwise false
     */
    Common.isPlainObject = function(obj) {
        return typeof obj === 'object' && obj.constructor === Object;
    };

    /**
     * Returns true if the object is a string.
     * @method isString
     * @param {object} obj
     * @return {boolean} True if the object is a string, otherwise false
     */
    Common.isString = function(obj) {
        return toString.call(obj) === '[object String]';
    };
    
    /**
     * Returns the given value clamped between a minimum and maximum value.
     * @method clamp
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @return {number} The value clamped between min and max inclusive
     */
    Common.clamp = function(value, min, max) {
        if (value < min)
            return min;
        if (value > max)
            return max;
        return value;
    };
    
    /**
     * Returns the sign of the given value.
     * @method sign
     * @param {number} value
     * @return {number} -1 if negative, +1 if 0 or positive
     */
    Common.sign = function(value) {
        return value < 0 ? -1 : 1;
    };
    
    /**
     * Returns the current timestamp since the time origin (e.g. from page load).
     * The result is in milliseconds and will use high-resolution timing if available.
     * @method now
     * @return {number} the current timestamp in milliseconds
     */
    Common.now = function() {
        if (typeof window !== 'undefined' && window.performance) {
            if (window.performance.now) {
                return window.performance.now();
            } else if (window.performance.webkitNow) {
                return window.performance.webkitNow();
            }
        }

        if (Date.now) {
            return Date.now();
        }

        return (new Date()) - Common._nowStartTime;
    };
    
    /**
     * Returns a random value between a minimum and a maximum value inclusive.
     * The function uses a seeded random generator.
     * @method random
     * @param {number} min
     * @param {number} max
     * @return {number} A random number between min and max inclusive
     */
    Common.random = function(min, max) {
        min = (typeof min !== "undefined") ? min : 0;
        max = (typeof max !== "undefined") ? max : 1;
        return min + _seededRandom() * (max - min);
    };

    var _seededRandom = function() {
        // https://en.wikipedia.org/wiki/Linear_congruential_generator
        Common._seed = (Common._seed * 9301 + 49297) % 233280;
        return Common._seed / 233280;
    };

    /**
     * Converts a CSS hex colour string into an integer.
     * @method colorToNumber
     * @param {string} colorString
     * @return {number} An integer representing the CSS hex string
     */
    Common.colorToNumber = function(colorString) {
        colorString = colorString.replace('#','');

        if (colorString.length == 3) {
            colorString = colorString.charAt(0) + colorString.charAt(0)
                        + colorString.charAt(1) + colorString.charAt(1)
                        + colorString.charAt(2) + colorString.charAt(2);
        }

        return parseInt(colorString, 16);
    };

    /**
     * The console logging level to use, where each level includes all levels above and excludes the levels below.
     * The default level is 'debug' which shows all console messages.  
     *
     * Possible level values are:
     * - 0 = None
     * - 1 = Debug
     * - 2 = Info
     * - 3 = Warn
     * - 4 = Error
     * @static
     * @property logLevel
     * @type {Number}
     * @default 1
     */
    Common.logLevel = 1;

    /**
     * Shows a `console.log` message only if the current `Common.logLevel` allows it.
     * The message will be prefixed with 'matter-js' to make it easily identifiable.
     * @method log
     * @param ...objs {} The objects to log.
     */
    Common.log = function() {
        if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
            console.log.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
        }
    };

    /**
     * Shows a `console.info` message only if the current `Common.logLevel` allows it.
     * The message will be prefixed with 'matter-js' to make it easily identifiable.
     * @method info
     * @param ...objs {} The objects to log.
     */
    Common.info = function() {
        if (console && Common.logLevel > 0 && Common.logLevel <= 2) {
            console.info.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
        }
    };

    /**
     * Shows a `console.warn` message only if the current `Common.logLevel` allows it.
     * The message will be prefixed with 'matter-js' to make it easily identifiable.
     * @method warn
     * @param ...objs {} The objects to log.
     */
    Common.warn = function() {
        if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
            console.warn.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
        }
    };

    /**
     * Uses `Common.warn` to log the given message one time only.
     * @method warnOnce
     * @param ...objs {} The objects to log.
     */
    Common.warnOnce = function() {
        var message = Array.prototype.slice.call(arguments).join(' ');

        if (!Common._warnedOnce[message]) {
            Common.warn(message);
            Common._warnedOnce[message] = true;
        }
    };

    /**
     * Shows a deprecated console warning when the function on the given object is called.
     * The target function will be replaced with a new function that first shows the warning
     * and then calls the original function.
     * @method deprecated
     * @param {object} obj The object or module
     * @param {string} name The property name of the function on obj
     * @param {string} warning The one-time message to show if the function is called
     */
    Common.deprecated = function(obj, prop, warning) {
        obj[prop] = Common.chain(function() {
            Common.warnOnce('🔅 deprecated 🔅', warning);
        }, obj[prop]);
    };

    /**
     * Returns the next unique sequential ID.
     * @method nextId
     * @return {Number} Unique sequential ID
     */
    Common.nextId = function() {
        return Common._nextId++;
    };

    /**
     * A cross browser compatible indexOf implementation.
     * @method indexOf
     * @param {array} haystack
     * @param {object} needle
     * @return {number} The position of needle in haystack, otherwise -1.
     */
    Common.indexOf = function(haystack, needle) {
        if (haystack.indexOf)
            return haystack.indexOf(needle);

        for (var i = 0; i < haystack.length; i++) {
            if (haystack[i] === needle)
                return i;
        }

        return -1;
    };

    /**
     * A cross browser compatible array map implementation.
     * @method map
     * @param {array} list
     * @param {function} func
     * @return {array} Values from list transformed by func.
     */
    Common.map = function(list, func) {
        if (list.map) {
            return list.map(func);
        }

        var mapped = [];

        for (var i = 0; i < list.length; i += 1) {
            mapped.push(func(list[i]));
        }

        return mapped;
    };

    /**
     * Takes a directed graph and returns the partially ordered set of vertices in topological order.
     * Circular dependencies are allowed.
     * @method topologicalSort
     * @param {object} graph
     * @return {array} Partially ordered set of vertices in topological order.
     */
    Common.topologicalSort = function(graph) {
        // https://github.com/mgechev/javascript-algorithms
        // Copyright (c) Minko Gechev (MIT license)
        // Modifications: tidy formatting and naming
        var result = [],
            visited = [],
            temp = [];

        for (var node in graph) {
            if (!visited[node] && !temp[node]) {
                Common._topologicalSort(node, visited, temp, graph, result);
            }
        }

        return result;
    };

    Common._topologicalSort = function(node, visited, temp, graph, result) {
        var neighbors = graph[node] || [];
        temp[node] = true;

        for (var i = 0; i < neighbors.length; i += 1) {
            var neighbor = neighbors[i];

            if (temp[neighbor]) {
                // skip circular dependencies
                continue;
            }

            if (!visited[neighbor]) {
                Common._topologicalSort(neighbor, visited, temp, graph, result);
            }
        }

        temp[node] = false;
        visited[node] = true;

        result.push(node);
    };

    /**
     * Takes _n_ functions as arguments and returns a new function that calls them in order.
     * The arguments applied when calling the new function will also be applied to every function passed.
     * The value of `this` refers to the last value returned in the chain that was not `undefined`.
     * Therefore if a passed function does not return a value, the previously returned value is maintained.
     * After all passed functions have been called the new function returns the last returned value (if any).
     * If any of the passed functions are a chain, then the chain will be flattened.
     * @method chain
     * @param ...funcs {function} The functions to chain.
     * @return {function} A new function that calls the passed functions in order.
     */
    Common.chain = function() {
        var funcs = [];

        for (var i = 0; i < arguments.length; i += 1) {
            var func = arguments[i];

            if (func._chained) {
                // flatten already chained functions
                funcs.push.apply(funcs, func._chained);
            } else {
                funcs.push(func);
            }
        }

        var chain = function() {
            // https://github.com/GoogleChrome/devtools-docs/issues/53#issuecomment-51941358
            var lastResult,
                // cold arguments copy, densely filled on the next lines and discarded
                // eslint-disable-next-line no-restricted-syntax
                args = new Array(arguments.length);

            for (var i = 0, l = arguments.length; i < l; i++) {
                args[i] = arguments[i];
            }

            for (i = 0; i < funcs.length; i += 1) {
                var result = funcs[i].apply(lastResult, args);

                if (typeof result !== 'undefined') {
                    lastResult = result;
                }
            }

            return lastResult;
        };

        chain._chained = funcs;

        return chain;
    };

    /**
     * Chains a function to excute before the original function on the given `path` relative to `base`.
     * See also docs for `Common.chain`.
     * @method chainPathBefore
     * @param {} base The base object
     * @param {string} path The path relative to `base`
     * @param {function} func The function to chain before the original
     * @return {function} The chained function that replaced the original
     */
    Common.chainPathBefore = function(base, path, func) {
        return Common.set(base, path, Common.chain(
            func,
            Common.get(base, path)
        ));
    };

    /**
     * Chains a function to excute after the original function on the given `path` relative to `base`.
     * See also docs for `Common.chain`.
     * @method chainPathAfter
     * @param {} base The base object
     * @param {string} path The path relative to `base`
     * @param {function} func The function to chain after the original
     * @return {function} The chained function that replaced the original
     */
    Common.chainPathAfter = function(base, path, func) {
        return Common.set(base, path, Common.chain(
            Common.get(base, path),
            func
        ));
    };

    /**
     * Provide the [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module to enable
     * concave vertex decomposition support when using `Bodies.fromVertices` e.g. `Common.setDecomp(require('poly-decomp'))`.
     * @method setDecomp
     * @param {} decomp The [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module.
     */
    Common.setDecomp = function(decomp) {
        Common._decomp = decomp;
    };

    /**
     * Returns the [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module provided through `Common.setDecomp`,
     * otherwise returns the global `decomp` if set.
     * @method getDecomp
     * @return {} The [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module if provided.
     */
    Common.getDecomp = function() {
        // get user provided decomp if set
        var decomp = Common._decomp;

        try {
            // otherwise from window global
            if (!decomp && typeof window !== 'undefined') {
                decomp = window.decomp;
            }
    
            // otherwise from node global
            if (!decomp && typeof global !== 'undefined') {
                decomp = global.decomp;
            }
        } catch (e) {
            // decomp not available
            decomp = null;
        }

        return decomp;
    };
})();


/***/ }),
/* 1 */
/***/ (function(module, exports) {

/**
* The `Matter.Bounds` module contains methods for creating and manipulating axis-aligned bounding boxes (AABB).
*
* @class Bounds
*/

var Bounds = {};

module.exports = Bounds;

(function() {

    /**
     * Creates a new axis-aligned bounding box (AABB) for the given vertices.
     * @method create
     * @param {vertices} vertices
     * @return {bounds} A new bounds object
     */
    Bounds.create = function(vertices) {
        var bounds = { 
            min: { x: 0, y: 0 }, 
            max: { x: 0, y: 0 }
        };

        if (vertices)
            Bounds.update(bounds, vertices);
        
        return bounds;
    };

    /**
     * Updates bounds using the given vertices and extends the bounds given a velocity.
     * @method update
     * @param {bounds} bounds
     * @param {vertices} vertices
     * @param {vector} velocity
     */
    Bounds.update = function(bounds, vertices, velocity) {
        // fused copies live in Body._transformSinglePart and
        // Body.setPositionAndAngle: change them with this
        var verticesLength = vertices.length;

        if (verticesLength === 0) {
            bounds.min.x = Infinity;
            bounds.max.x = -Infinity;
            bounds.min.y = Infinity;
            bounds.max.y = -Infinity;
            return;
        }

        var vertex = vertices[0],
            minX = vertex.x,
            maxX = vertex.x,
            minY = vertex.y,
            maxY = vertex.y,
            x,
            y,
            i;

        for (i = 1; i < verticesLength; i++) {
            vertex = vertices[i];
            x = vertex.x;
            y = vertex.y;

            if (x > maxX) { maxX = x; } else if (x < minX) { minX = x; }
            if (y > maxY) { maxY = y; } else if (y < minY) { minY = y; }
        }

        if (velocity) {
            if (velocity.x > 0) {
                maxX += velocity.x;
            } else {
                minX += velocity.x;
            }

            if (velocity.y > 0) {
                maxY += velocity.y;
            } else {
                minY += velocity.y;
            }
        }

        bounds.min.x = minX;
        bounds.max.x = maxX;
        bounds.min.y = minY;
        bounds.max.y = maxY;
    };

    /**
     * Returns true if the bounds contains the given point.
     * @method contains
     * @param {bounds} bounds
     * @param {vector} point
     * @return {boolean} True if the bounds contain the point, otherwise false
     */
    Bounds.contains = function(bounds, point) {
        return point.x >= bounds.min.x && point.x <= bounds.max.x 
               && point.y >= bounds.min.y && point.y <= bounds.max.y;
    };

    /**
     * Returns true if the two bounds intersect.
     * @method overlaps
     * @param {bounds} boundsA
     * @param {bounds} boundsB
     * @return {boolean} True if the bounds overlap, otherwise false
     */
    Bounds.overlaps = function(boundsA, boundsB) {
        return (boundsA.min.x <= boundsB.max.x && boundsA.max.x >= boundsB.min.x
                && boundsA.max.y >= boundsB.min.y && boundsA.min.y <= boundsB.max.y);
    };

    /**
     * Translates the bounds by the given vector.
     * @method translate
     * @param {bounds} bounds
     * @param {vector} vector
     */
    Bounds.translate = function(bounds, vector) {
        bounds.min.x += vector.x;
        bounds.max.x += vector.x;
        bounds.min.y += vector.y;
        bounds.max.y += vector.y;
    };

    /**
     * Shifts the bounds to the given position.
     * @method shift
     * @param {bounds} bounds
     * @param {vector} position
     */
    Bounds.shift = function(bounds, position) {
        var deltaX = bounds.max.x - bounds.min.x,
            deltaY = bounds.max.y - bounds.min.y;
            
        bounds.min.x = position.x;
        bounds.max.x = position.x + deltaX;
        bounds.min.y = position.y;
        bounds.max.y = position.y + deltaY;
    };
    
})();


/***/ }),
/* 2 */
/***/ (function(module, exports) {

/**
* The `Matter.Vector` module contains methods for creating and manipulating vectors.
* Vectors are the basis of all the geometry related operations in the engine.
* A `Matter.Vector` object is of the form `{ x: 0, y: 0 }`.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Vector
*/

// TODO: consider params for reusing vector objects

var Vector = {};

module.exports = Vector;

(function() {

    /**
     * Creates a new vector.
     * @method create
     * @param {number} x
     * @param {number} y
     * @return {vector} A new vector
     */
    Vector.create = function(x, y) {
        return { x: x || 0, y: y || 0 };
    };

    /**
     * Returns a new vector with `x` and `y` copied from the given `vector`.
     * @method clone
     * @param {vector} vector
     * @return {vector} A new cloned vector
     */
    Vector.clone = function(vector) {
        return { x: vector.x, y: vector.y };
    };

    /**
     * Returns the magnitude (length) of a vector.
     * @method magnitude
     * @param {vector} vector
     * @return {number} The magnitude of the vector
     */
    Vector.magnitude = function(vector) {
        return Math.sqrt((vector.x * vector.x) + (vector.y * vector.y));
    };

    /**
     * Returns the magnitude (length) of a vector (therefore saving a `sqrt` operation).
     * @method magnitudeSquared
     * @param {vector} vector
     * @return {number} The squared magnitude of the vector
     */
    Vector.magnitudeSquared = function(vector) {
        return (vector.x * vector.x) + (vector.y * vector.y);
    };

    /**
     * Rotates the vector about (0, 0) by specified angle.
     * @method rotate
     * @param {vector} vector
     * @param {number} angle
     * @param {vector} [output]
     * @return {vector} The vector rotated about (0, 0)
     */
    Vector.rotate = function(vector, angle, output) {
        var cos = Math.cos(angle), sin = Math.sin(angle);
        if (!output) output = {};
        var x = vector.x * cos - vector.y * sin;
        output.y = vector.x * sin + vector.y * cos;
        output.x = x;
        return output;
    };

    /**
     * Rotates the vector about a specified point by specified angle.
     * @method rotateAbout
     * @param {vector} vector
     * @param {number} angle
     * @param {vector} point
     * @param {vector} [output]
     * @return {vector} A new vector rotated about the point
     */
    Vector.rotateAbout = function(vector, angle, point, output) {
        var cos = Math.cos(angle), sin = Math.sin(angle);
        if (!output) output = {};
        var x = point.x + ((vector.x - point.x) * cos - (vector.y - point.y) * sin);
        output.y = point.y + ((vector.x - point.x) * sin + (vector.y - point.y) * cos);
        output.x = x;
        return output;
    };

    /**
     * Normalises a vector (such that its magnitude is `1`).
     * @method normalise
     * @param {vector} vector
     * @return {vector} A new vector normalised
     */
    Vector.normalise = function(vector) {
        var magnitude = Vector.magnitude(vector);
        if (magnitude === 0)
            return { x: 0, y: 0 };
        return { x: vector.x / magnitude, y: vector.y / magnitude };
    };

    /**
     * Returns the dot-product of two vectors.
     * @method dot
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @return {number} The dot product of the two vectors
     */
    Vector.dot = function(vectorA, vectorB) {
        return (vectorA.x * vectorB.x) + (vectorA.y * vectorB.y);
    };

    /**
     * Returns the cross-product of two vectors.
     * @method cross
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @return {number} The cross product of the two vectors
     */
    Vector.cross = function(vectorA, vectorB) {
        return (vectorA.x * vectorB.y) - (vectorA.y * vectorB.x);
    };

    /**
     * Returns the cross-product of three vectors.
     * @method cross3
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @param {vector} vectorC
     * @return {number} The cross product of the three vectors
     */
    Vector.cross3 = function(vectorA, vectorB, vectorC) {
        return (vectorB.x - vectorA.x) * (vectorC.y - vectorA.y) - (vectorB.y - vectorA.y) * (vectorC.x - vectorA.x);
    };

    /**
     * Adds the two vectors.
     * @method add
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @param {vector} [output]
     * @return {vector} A new vector of vectorA and vectorB added
     */
    Vector.add = function(vectorA, vectorB, output) {
        if (!output) output = {};
        output.x = vectorA.x + vectorB.x;
        output.y = vectorA.y + vectorB.y;
        return output;
    };

    /**
     * Subtracts the two vectors.
     * @method sub
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @param {vector} [output]
     * @return {vector} A new vector of vectorA and vectorB subtracted
     */
    Vector.sub = function(vectorA, vectorB, output) {
        if (!output) output = {};
        output.x = vectorA.x - vectorB.x;
        output.y = vectorA.y - vectorB.y;
        return output;
    };

    /**
     * Multiplies a vector and a scalar.
     * @method mult
     * @param {vector} vector
     * @param {number} scalar
     * @return {vector} A new vector multiplied by scalar
     */
    Vector.mult = function(vector, scalar) {
        return { x: vector.x * scalar, y: vector.y * scalar };
    };

    /**
     * Divides a vector and a scalar.
     * @method div
     * @param {vector} vector
     * @param {number} scalar
     * @return {vector} A new vector divided by scalar
     */
    Vector.div = function(vector, scalar) {
        return { x: vector.x / scalar, y: vector.y / scalar };
    };

    /**
     * Returns the perpendicular vector. Set `negate` to true for the perpendicular in the opposite direction.
     * @method perp
     * @param {vector} vector
     * @param {bool} [negate=false]
     * @return {vector} The perpendicular vector
     */
    Vector.perp = function(vector, negate) {
        negate = negate === true ? -1 : 1;
        return { x: negate * -vector.y, y: negate * vector.x };
    };

    /**
     * Negates both components of a vector such that it points in the opposite direction.
     * @method neg
     * @param {vector} vector
     * @return {vector} The negated vector
     */
    Vector.neg = function(vector) {
        return { x: -vector.x, y: -vector.y };
    };

    /**
     * Returns the angle between the vector `vectorB - vectorA` and the x-axis in radians.
     * @method angle
     * @param {vector} vectorA
     * @param {vector} vectorB
     * @return {number} The angle in radians
     */
    Vector.angle = function(vectorA, vectorB) {
        return Math.atan2(vectorB.y - vectorA.y, vectorB.x - vectorA.x);
    };

    /**
     * Temporary vector pool (not thread-safe).
     * @property _temp
     * @type {vector[]}
     * @private
     */
    Vector._temp = [
        Vector.create(), Vector.create(), 
        Vector.create(), Vector.create(), 
        Vector.create(), Vector.create()
    ];

})();

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Vertices` module contains methods for creating and manipulating sets of vertices.
* A set of vertices is an array of `Matter.Vector` with additional indexing properties inserted by `Vertices.create`.
* A `Matter.Body` maintains a set of vertices to represent the shape of the object (its convex hull).
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Vertices
*/

var Vertices = {};

module.exports = Vertices;

var Vector = __webpack_require__(2);
var Common = __webpack_require__(0);

(function() {

    /**
     * Creates a new set of `Matter.Body` compatible vertices.
     * The `points` argument accepts an array of `Matter.Vector` points orientated around the origin `(0, 0)`, for example:
     *
     *     [{ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }]
     *
     * The `Vertices.create` method returns a new array of vertices, which are similar to Matter.Vector objects,
     * but with some additional references required for efficient collision detection routines.
     *
     * Vertices must be specified in clockwise order.
     *
     * Note that the `body` argument is not optional, a `Matter.Body` reference must be provided.
     *
     * @method create
     * @param {vector[]} points
     * @param {body} body
     */
    Vertices.create = function(points, body) {
        var vertices = [];

        for (var i = 0; i < points.length; i++) {
            var point = points[i],
                vertex = {
                    x: point.x,
                    y: point.y,
                    index: i,
                    body: body,
                    isInternal: false
                };

            vertices.push(vertex);
        }

        return vertices;
    };

    /**
     * Parses a string containing ordered x y pairs separated by spaces (and optionally commas), 
     * into a `Matter.Vertices` object for the given `Matter.Body`.
     * For parsing SVG paths, see `Svg.pathToVertices`.
     * @method fromPath
     * @param {string} path
     * @param {body} body
     * @return {vertices} vertices
     */
    Vertices.fromPath = function(path, body) {
        var pathPattern = /L?\s*([-\d.e]+)[\s,]*([-\d.e]+)*/ig,
            points = [];

        path.replace(pathPattern, function(match, x, y) {
            points.push({ x: parseFloat(x), y: parseFloat(y) });
        });

        return Vertices.create(points, body);
    };

    /**
     * Returns the centre (centroid) of the set of vertices.
     * @method centre
     * @param {vertices} vertices
     * @return {vector} The centre point
     */
    Vertices.centre = function(vertices) {
        var area = Vertices.area(vertices, true),
            centre = { x: 0, y: 0 },
            cross,
            temp,
            j;

        for (var i = 0; i < vertices.length; i++) {
            j = (i + 1) % vertices.length;
            cross = Vector.cross(vertices[i], vertices[j]);
            temp = Vector.mult(Vector.add(vertices[i], vertices[j]), cross);
            centre = Vector.add(centre, temp);
        }

        return Vector.div(centre, 6 * area);
    };

    /**
     * Returns the average (mean) of the set of vertices.
     * @method mean
     * @param {vertices} vertices
     * @return {vector} The average point
     */
    Vertices.mean = function(vertices) {
        var average = { x: 0, y: 0 };

        for (var i = 0; i < vertices.length; i++) {
            average.x += vertices[i].x;
            average.y += vertices[i].y;
        }

        return Vector.div(average, vertices.length);
    };

    /**
     * Returns the area of the set of vertices.
     * @method area
     * @param {vertices} vertices
     * @param {bool} signed
     * @return {number} The area
     */
    Vertices.area = function(vertices, signed) {
        var area = 0,
            j = vertices.length - 1;

        for (var i = 0; i < vertices.length; i++) {
            area += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
            j = i;
        }

        if (signed)
            return area / 2;

        return Math.abs(area) / 2;
    };

    /**
     * Returns the moment of inertia (second moment of area) of the set of vertices given the total mass.
     * @method inertia
     * @param {vertices} vertices
     * @param {number} mass
     * @return {number} The polygon's moment of inertia
     */
    Vertices.inertia = function(vertices, mass) {
        var numerator = 0,
            denominator = 0,
            v = vertices,
            cross,
            j;

        // find the polygon's moment of inertia, using second moment of area
        // from equations at http://www.physicsforums.com/showthread.php?t=25293
        for (var n = 0; n < v.length; n++) {
            j = (n + 1) % v.length;
            cross = Math.abs(Vector.cross(v[j], v[n]));
            numerator += cross * (Vector.dot(v[j], v[j]) + Vector.dot(v[j], v[n]) + Vector.dot(v[n], v[n]));
            denominator += cross;
        }

        return (mass / 6) * (numerator / denominator);
    };

    /**
     * Translates the set of vertices in-place.
     * @method translate
     * @param {vertices} vertices
     * @param {vector} vector
     * @param {number} scalar
     */
    Vertices.translate = function(vertices, vector, scalar) {
        // fused copies live in Body._transformSinglePart and
        // Body.setPositionAndAngle: change them with this
        scalar = typeof scalar !== 'undefined' ? scalar : 1;

        var verticesLength = vertices.length,
            translateX = vector.x * scalar,
            translateY = vector.y * scalar,
            i;

        // the self-projection memo describes these vertex positions
        var spBody = verticesLength > 0 ? vertices[0].body : null;
        if (spBody) {
            spBody._spValid = false;
        }

        for (i = 0; i < verticesLength; i++) {
            vertices[i].x += translateX;
            vertices[i].y += translateY;
        }

        return vertices;
    };

    /**
     * Rotates the set of vertices in-place.
     * @method rotate
     * @param {vertices} vertices
     * @param {number} angle
     * @param {vector} point
     */
    Vertices.rotate = function(vertices, angle, point) {
        // fused copies live in Body._transformSinglePart and
        // Body.setPositionAndAngle: change them with this
        if (angle === 0)
            return;

        var cos = Math.cos(angle),
            sin = Math.sin(angle),
            pointX = point.x,
            pointY = point.y,
            verticesLength = vertices.length,
            vertex,
            dx,
            dy,
            i;

        // the self-projection memo describes these vertex positions
        var spBody = verticesLength > 0 ? vertices[0].body : null;
        if (spBody) {
            spBody._spValid = false;
        }

        for (i = 0; i < verticesLength; i++) {
            vertex = vertices[i];
            dx = vertex.x - pointX;
            dy = vertex.y - pointY;
            vertex.x = pointX + (dx * cos - dy * sin);
            vertex.y = pointY + (dx * sin + dy * cos);
        }

        return vertices;
    };

    /**
     * Returns `true` if the `point` is inside the set of `vertices`.
     * @method contains
     * @param {vertices} vertices
     * @param {vector} point
     * @return {boolean} True if the vertices contains point, otherwise false
     */
    Vertices.contains = function(vertices, point) {
        var pointX = point.x,
            pointY = point.y,
            verticesLength = vertices.length,
            vertex = vertices[verticesLength - 1],
            // this iteration's start point is the previous iteration's end
            // point, so it is carried as numbers rather than re-read off the
            // vertex object every edge
            vertexX = vertex.x,
            vertexY = vertex.y,
            nextVertex,
            nextVertexX,
            nextVertexY;

        for (var i = 0; i < verticesLength; i++) {
            nextVertex = vertices[i];
            nextVertexX = nextVertex.x;
            nextVertexY = nextVertex.y;

            if ((pointX - vertexX) * (nextVertexY - vertexY)
                + (pointY - vertexY) * (vertexX - nextVertexX) > 0) {
                return false;
            }

            vertexX = nextVertexX;
            vertexY = nextVertexY;
        }

        return true;
    };

    /**
     * Scales the vertices from a point (default is centre) in-place.
     * @method scale
     * @param {vertices} vertices
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {vector} point
     */
    Vertices.scale = function(vertices, scaleX, scaleY, point) {
        if (scaleX === 1 && scaleY === 1)
            return vertices;

        point = point || Vertices.centre(vertices);

        var vertex,
            delta;

        // the self-projection memo describes these vertex positions, and the
        // box tag their shape: a scale can change both. Body.scale re-takes
        // the tag after its axes follow (see Body._updateBoxTag); a direct
        // call leaves the body on the general support search
        var spBody = vertices.length > 0 ? vertices[0].body : null;
        if (spBody) {
            spBody._spValid = false;
            spBody._boxCorners = -1;
            spBody._boxHalf0 = 0;
            spBody._boxHalf1 = 0;
        }

        for (var i = 0; i < vertices.length; i++) {
            vertex = vertices[i];
            delta = Vector.sub(vertex, point);
            vertices[i].x = point.x + delta.x * scaleX;
            vertices[i].y = point.y + delta.y * scaleY;
        }

        return vertices;
    };

    /**
     * Chamfers a set of vertices by giving them rounded corners, returns a new set of vertices.
     * The radius parameter is a single number or an array to specify the radius for each vertex.
     * @method chamfer
     * @param {vertices} vertices
     * @param {number[]} radius
     * @param {number} quality
     * @param {number} qualityMin
     * @param {number} qualityMax
     */
    Vertices.chamfer = function(vertices, radius, quality, qualityMin, qualityMax) {
        if (typeof radius === 'number') {
            radius = [radius];
        } else {
            radius = radius || [8];
        }

        // quality defaults to -1, which is auto
        quality = (typeof quality !== 'undefined') ? quality : -1;
        qualityMin = qualityMin || 2;
        qualityMax = qualityMax || 14;

        var newVertices = [];

        for (var i = 0; i < vertices.length; i++) {
            var prevVertex = vertices[i - 1 >= 0 ? i - 1 : vertices.length - 1],
                vertex = vertices[i],
                nextVertex = vertices[(i + 1) % vertices.length],
                currentRadius = radius[i < radius.length ? i : radius.length - 1];

            if (currentRadius === 0) {
                newVertices.push(vertex);
                continue;
            }

            var prevNormal = Vector.normalise({ 
                x: vertex.y - prevVertex.y, 
                y: prevVertex.x - vertex.x
            });

            var nextNormal = Vector.normalise({ 
                x: nextVertex.y - vertex.y, 
                y: vertex.x - nextVertex.x
            });

            var diagonalRadius = Math.sqrt(2 * Math.pow(currentRadius, 2)),
                radiusVector = Vector.mult(Common.clone(prevNormal), currentRadius),
                midNormal = Vector.normalise(Vector.mult(Vector.add(prevNormal, nextNormal), 0.5)),
                scaledVertex = Vector.sub(vertex, Vector.mult(midNormal, diagonalRadius));

            var precision = quality;

            if (quality === -1) {
                // automatically decide precision
                precision = Math.pow(currentRadius, 0.32) * 1.75;
            }

            precision = Common.clamp(precision, qualityMin, qualityMax);

            // use an even value for precision, more likely to reduce axes by using symmetry
            if (precision % 2 === 1)
                precision += 1;

            var alpha = Math.acos(Vector.dot(prevNormal, nextNormal)),
                theta = alpha / precision;

            for (var j = 0; j < precision; j++) {
                newVertices.push(Vector.add(Vector.rotate(radiusVector, theta * j), scaledVertex));
            }
        }

        return newVertices;
    };

    /**
     * Sorts the input vertices into clockwise order in place.
     * @method clockwiseSort
     * @param {vertices} vertices
     * @return {vertices} vertices
     */
    Vertices.clockwiseSort = function(vertices) {
        var centre = Vertices.mean(vertices);

        vertices.sort(function(vertexA, vertexB) {
            return Vector.angle(centre, vertexA) - Vector.angle(centre, vertexB);
        });

        return vertices;
    };

    /**
     * Returns true if the vertices form a convex shape (vertices must be in clockwise order).
     * @method isConvex
     * @param {vertices} vertices
     * @return {bool} `true` if the `vertices` are convex, `false` if not (or `null` if not computable).
     */
    Vertices.isConvex = function(vertices) {
        // http://paulbourke.net/geometry/polygonmesh/
        // Copyright (c) Paul Bourke (use permitted)

        var flag = 0,
            n = vertices.length,
            i,
            j,
            k,
            z;

        if (n < 3)
            return null;

        for (i = 0; i < n; i++) {
            j = (i + 1) % n;
            k = (i + 2) % n;
            z = (vertices[j].x - vertices[i].x) * (vertices[k].y - vertices[j].y);
            z -= (vertices[j].y - vertices[i].y) * (vertices[k].x - vertices[j].x);

            if (z < 0) {
                flag |= 1;
            } else if (z > 0) {
                flag |= 2;
            }

            if (flag === 3) {
                return false;
            }
        }

        if (flag !== 0){
            return true;
        } else {
            return null;
        }
    };

    /**
     * Returns the convex hull of the input vertices as a new array of points.
     * @method hull
     * @param {vertices} vertices
     * @return [vertex] vertices
     */
    Vertices.hull = function(vertices) {
        // http://geomalgorithms.com/a10-_hull-1.html

        var upper = [],
            lower = [], 
            vertex,
            i;

        // sort vertices on x-axis (y-axis for ties)
        vertices = vertices.slice(0);
        vertices.sort(function(vertexA, vertexB) {
            var dx = vertexA.x - vertexB.x;
            return dx !== 0 ? dx : vertexA.y - vertexB.y;
        });

        // build lower hull
        for (i = 0; i < vertices.length; i += 1) {
            vertex = vertices[i];

            while (lower.length >= 2 
                   && Vector.cross3(lower[lower.length - 2], lower[lower.length - 1], vertex) <= 0) {
                lower.pop();
            }

            lower.push(vertex);
        }

        // build upper hull
        for (i = vertices.length - 1; i >= 0; i -= 1) {
            vertex = vertices[i];

            while (upper.length >= 2 
                   && Vector.cross3(upper[upper.length - 2], upper[upper.length - 1], vertex) <= 0) {
                upper.pop();
            }

            upper.push(vertex);
        }

        // concatenation of the lower and upper hulls gives the convex hull
        // omit last points because they are repeated at the beginning of the other list
        upper.pop();
        lower.pop();

        return upper.concat(lower);
    };

})();


/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Body` module contains methods for creating and manipulating rigid bodies.
* For creating bodies with common configurations such as rectangles, circles and other polygons see the module `Matter.Bodies`.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).

* @class Body
*/

var Body = {};

module.exports = Body;

var Vertices = __webpack_require__(3);
var Vector = __webpack_require__(2);
// assigned after the IIFE below, see there
var Sleeping;
var Common = __webpack_require__(0);
var Bounds = __webpack_require__(1);
var Axes = __webpack_require__(11);

(function() {

    Body._timeCorrection = true;
    Body._inertiaScale = 4;
    Body._nextCollidingGroupId = 1;
    Body._nextNonCollidingGroupId = -1;
    Body._nextCategory = 0x0001;
    Body._baseDelta = 1000 / 60;

    // box tag tolerances (see Body._updateBoxTag). The axes come out of
    // Axes.fromVertices normalised, so a real box is unit and orthogonal to
    // float precision (~1e-16); the corner test is in world units, far above
    // the ~1e-11 a centred, translated rectangle carries and far below any
    // non-box shape
    Body._boxAxisTolerance = 1e-9;
    Body._boxCornerTolerance = 1e-6;

    // per-corner scratch for Body._updateBoxTag, filled before it is read
    var _boxTagOffsets0 = [0, 0, 0, 0],
        _boxTagOffsets1 = [0, 0, 0, 0];

    /**
     * Creates a new rigid body model. The options parameter is an object that specifies any properties you wish to override the defaults.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * Vertices must be specified in clockwise order.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} options
     * @return {body} body
     */
    Body.create = function(options) {
        var defaults = {
            id: Common.nextId(),
            type: 'body',
            label: 'Body',
            parts: [],
            plugin: {},
            angle: 0,
            vertices: (options && options.vertices) || Vertices.fromPath('L 0 0 L 40 0 L 40 40 L 0 40'),
            position: { x: 0, y: 0 },
            force: { x: 0, y: 0 },
            torque: 0,
            positionImpulse: { x: 0, y: 0 },
            constraintImpulse: { x: 0, y: 0, angle: 0 },
            totalContacts: 0,
            speed: 0,
            angularSpeed: 0,
            velocity: { x: 0, y: 0 },
            angularVelocity: 0,
            isSensor: false,
            motion: 0,
            sleepThreshold: 60,
            density: 0.001,
            restitution: 0,
            friction: 0.1,
            frictionStatic: 0.5,
            frictionAir: 0.01,
            collisionFilter: {
                category: 0x0001,
                mask: 0xFFFFFFFF,
                group: 0
            },
            slop: 0.05,
            timeScale: 1,
            render: {
                visible: true,
                opacity: 1,
                strokeStyle: null,
                fillStyle: null,
                lineWidth: null,
                sprite: {
                    xScale: 1,
                    yScale: 1,
                    xOffset: 0,
                    yOffset: 0
                }
            },
            events: null,
            bounds: null,
            chamfer: null,
            circleRadius: 0,
            positionPrev: null,
            anglePrev: 0,
            parent: null,
            axes: null,
            area: 0,
            mass: 0,
            // assigned by Body.setMass / setInertia / Sleeping before use, but
            // declared here so they live in-object: left out, they spill to
            // the out-of-object property backing store and every read (the
            // solver snapshots them per body per step, Pair.update per pair)
            // pays an extra indirection
            inverseMass: 0,
            inertia: 0,
            inverseInertia: 0,
            sleepCounter: 0,
            deltaTime: 1000 / 60,
            _original: null,
            // per-step scratch stamps and flags used by the grid broadphase
            // and the resolver body collection. Pre-declared so every body
            // shares one hidden class: adding any of these lazily at first use
            // splits body object shapes and degrades every hot property access
            // site engine-wide (measured 1.3-4.8x slower whole-step when
            // _solverStamp was added lazily to only pair-touched bodies).
            // RULE: any NEW per-body scratch field, from any module, must be
            // added to this block with a default of the same type it will
            // hold, never assigned onto a body for the first time elsewhere.
            //
            // Classification-walk cluster: the per-step walk in
            // Detector._collisionsGrid touches every one of these for
            // every body in the world, so they are declared adjacently
            // (declaration order fixes the in-object layout) to land on as few
            // cache lines as possible. isStatic / isSleeping live here rather
            // than with the public fields for the same reason.
            isStatic: false,
            isSleeping: false,
            // set, for good, when a pose setter moves this body while it rests
            // in a grid static index: the grid then runs it as a mover (see
            // Body._promoteIfIndexed)
            _sMoved: false,
            _sPrev: false,
            _sIndexed: false,
            _sDeparted: false,
            _sWalk: -1,
            _sWorldIndex: 0,
            _scEpoch: 0,
            _gsStamp: 0,
            // set when an engine running with `enableSolvedVelocityAndBounds`
            // false skipped this body's bounds refresh after a position
            // correction: its bounds MAY lag its vertices until integration
            // or `Body._updateStaleBounds` recomputes them. Never cleared by
            // integration (that would be a store per mover per update), which
            // is safe because the recompute is idempotent on fresh bounds.
            // (This slot held the dead grid `_ovD` flag, so reusing it
            // leaves the in-object layout of every field after it unchanged.)
            _boundsStale: false,
            _solverStamp: 0,
            // slot index into the resolver's flat solver arrays (valid only
            // while _solverStamp matches the current solver epoch; 0 is the
            // shared row of a resting static, see Resolver.preSolvePosition)
            _solverIndex: 0,
            // grid static-candidate cache (see Detector._collisionsGrid;
            // _scEpoch is up in the classification-walk cluster)
            _scStatic: false,
            // the cell span the list was built for. The span is read out of a
            // Float64Array, so these hold doubles, and they are declared as
            // doubles (NaN): with a small-integer default, the first store
            // generalizes the field in V8 and DEPRECATES the map of every body
            // built before it, each of which then keeps the old map until
            // something next reads it. Never read while `_scList` is null
            _scCx0: NaN,
            _scCx1: NaN,
            _scCy0: NaN,
            _scCy1: NaN,
            _scList: null,
            // the candidate bounds captured alongside _scList, so the per-step
            // test loop reads contiguous memory instead of dereferencing every
            // candidate's bounds objects
            _scBounds: null,
            // grid static-index membership (see
            // Detector._staticIndexInsert). _sBuckets holds the cell buckets
            // this body's reference sits in, so it can be removed from them
            // without recomputing anything; an EMPTY array means an oversized
            // static, which occupies no cells. _sIndexed is whether it is in
            // the index at all, _sWalk the stamp of the last classification
            // walk that saw it (a stale stamp means it has left the world; it
            // doubles as the body journal's membership generation, and is -1
            // for a body in no world, see Common._journalTouch),
            // _sWorldIndex its position in that walk, which is the sort key
            // that keeps bucket contents in world order, and _sDeparted a
            // one-shot set by Composite.removeBody so a body removed and
            // re-added within a single step is re-indexed at its new position.
            // (_sIndexed / _sWalk / _sWorldIndex / _sDeparted are up in the
            // classification-walk cluster.)
            _sBuckets: null,
            _sIndexedAt: -1,
            // the cell span this body was BUCKETED at. Unbucketing has to know
            // which cells it vacated in order to invalidate the movers standing
            // over them, and by then its live bounds no longer say: a released
            // tile has already been integrated by Engine._bodiesUpdate before
            // the broadphase runs
            _sCx0: 0,
            _sCx1: 0,
            _sCy0: 0,
            _sCy1: 0,
            // Box tag, read by Collision.collides to choose the fused box-box
            // SAT and the closed-form support search (see
            // Body._updateBoxTag). _boxCorners is -1 unless this body is
            // geometrically a rectangle centred on `position`; then it packs
            // which vertex sits on which side of each axis. Declared BEFORE the
            // memo so the last key is unchanged.
            _boxHalf0: 0,
            _boxHalf1: 0,
            _boxCorners: -1,
            // Collision._selfProjection memo: this body's own vertices projected
            // onto its own axes, packed flat as [min0, max0, min1, max1, ...],
            // one pair per axis. _spValid is cleared by every site that moves a
            // vertex or changes the axes (see Vertices.translate/rotate/scale,
            // Body.setVertices/setParts/scale, the fused pass in
            // Body._transformSinglePart and the inlined rotate in
            // Body.setPositionAndAngle)
            _sp: null,
            _spValid: false,
            // whether the velocity solver may take this body's row as the
            // constant REST row without reading the body: static, not moving,
            // and an inverse inertia of exactly +0 (see
            // Common._isRestingStatic). Written by every method below that
            // changes one of those, and by the position correction in
            // Resolver. Declared after every field the engine had before the
            // body journal, so each of those keeps its place
            _restStatic: false,
            // the composite whose body journal this body is recorded in (see
            // Common._journalTouch); a member while `_sWalk` also matches that
            // composite's `_memberGen`. Read only by the journal's own paths
            // and, in a full classification walk, only for a body the world's
            // last walk did not stamp (see Composite._ownedGen), so it needs no
            // place in the cluster above. Declared LAST so every field above
            // keeps its place
            _sOwner: null,
            // the grid index (a grid detector's `_sgrid`) that _sBuckets and
            // _sIndexedAt describe while _sIndexed, so a body moved to a world
            // another grid engine steps is taken out of the first one's index
            // rather than confusing the two (see Detector._staticIndexInsert).
            // Declared LAST, after _sOwner, so every field above keeps its place
            _sGrid: null
        };

        var body = Common.extend(defaults, options);

        _initProperties(body, options);

        return body;
    };

    /**
     * Returns the next unique group index for which bodies will collide.
     * If `isNonColliding` is `true`, returns the next unique group index for which bodies will _not_ collide.
     * See `body.collisionFilter` for more information.
     * @method nextGroup
     * @param {bool} [isNonColliding=false]
     * @return {Number} Unique group index
     */
    Body.nextGroup = function(isNonColliding) {
        if (isNonColliding)
            return Body._nextNonCollidingGroupId--;

        return Body._nextCollidingGroupId++;
    };

    /**
     * Returns the next unique category bitfield (starting after the initial default category `0x0001`).
     * There are 32 available. See `body.collisionFilter` for more information.
     * @method nextCategory
     * @return {Number} Unique category bitfield
     */
    Body.nextCategory = function() {
        Body._nextCategory = Body._nextCategory << 1;
        return Body._nextCategory;
    };

    /**
     * Initialises body properties.
     * @method _initProperties
     * @private
     * @param {body} body
     * @param {} [options]
     */
    // Hoisted out of `_initProperties`: it allocated a fresh five element array per body created.
    // The `Common.choose` call site is unchanged, so the RNG stream and the chosen colours are
    // identical.
    var _defaultFillStyles = ['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1'];

    var _initProperties = function(body, options) {
        options = options || {};

        // init required properties (order is important)
        Body.set(body, {
            bounds: body.bounds || Bounds.create(body.vertices),
            positionPrev: body.positionPrev || Vector.clone(body.position),
            anglePrev: body.anglePrev || body.angle,
            vertices: body.vertices,
            parts: body.parts || [body],
            isStatic: body.isStatic,
            isSleeping: body.isSleeping,
            parent: body.parent || body
        });

        Vertices.rotate(body.vertices, body.angle, body.position);
        Axes.rotate(body.axes, body.angle);
        Bounds.update(body.bounds, body.vertices, body.velocity);

        // allow options to override the automatically calculated properties
        Body.set(body, {
            axes: options.axes || body.axes,
            area: options.area || body.area,
            mass: options.mass || body.mass,
            inertia: options.inertia || body.inertia
        });

        // render properties
        var defaultFillStyle = (body.isStatic ? '#14151f' : Common.choose(_defaultFillStyles)),
            defaultStrokeStyle = body.isStatic ? '#555' : '#ccc',
            defaultLineWidth = body.isStatic && body.render.fillStyle === null ? 1 : 0;
        body.render.fillStyle = body.render.fillStyle || defaultFillStyle;
        body.render.strokeStyle = body.render.strokeStyle || defaultStrokeStyle;
        body.render.lineWidth = body.render.lineWidth || defaultLineWidth;
        body.render.sprite.xOffset += -(body.bounds.min.x - body.position.x) / (body.bounds.max.x - body.bounds.min.x);
        body.render.sprite.yOffset += -(body.bounds.min.y - body.position.y) / (body.bounds.max.y - body.bounds.min.y);
    };

    /**
     * Given a property and a value (or map of), sets the property(s) on the body, using the appropriate setter functions if they exist.
     * Prefer to use the actual setter functions in performance critical situations.
     * @method set
     * @param {body} body
     * @param {} settings A property name (or map of properties and values) to set on the body.
     * @param {} value The value to set if `settings` is a single property name.
     */
    Body.set = function(body, settings, value) {
        var property;

        if (typeof settings === 'string') {
            property = settings;
            settings = {};
            settings[property] = value;
        }

        for (property in settings) {
            if (!Object.prototype.hasOwnProperty.call(settings, property))
                continue;

            value = settings[property];
            switch (property) {

            case 'isStatic':
                Body.setStatic(body, value);
                break;
            case 'isSleeping':
                Sleeping.set(body, value);
                break;
            case 'mass':
                Body.setMass(body, value);
                break;
            case 'density':
                Body.setDensity(body, value);
                break;
            case 'inertia':
                Body.setInertia(body, value);
                break;
            case 'vertices':
                Body.setVertices(body, value);
                break;
            case 'position':
                Body.setPosition(body, value);
                break;
            case 'angle':
                Body.setAngle(body, value);
                break;
            case 'velocity':
                Body.setVelocity(body, value);
                break;
            case 'angularVelocity':
                Body.setAngularVelocity(body, value);
                break;
            case 'speed':
                Body.setSpeed(body, value);
                break;
            case 'angularSpeed':
                Body.setAngularSpeed(body, value);
                break;
            case 'parts':
                Body.setParts(body, value);
                break;
            case 'axes':
                // same assignment the default branch makes, plus the
                // self-projection memo invalidation replacing axes needs, and
                // the box tag, which is derived from the axes. `_initProperties`
                // always sets `axes` last among the geometry, so this is also
                // where a new body takes its tag on its finished geometry
                body.axes = value;
                body._spValid = false;
                Body._updateBoxTag(body);
                break;
            case 'centre':
                Body.setCentre(body, value);
                break;
            default:
                body[property] = value;

                // a plain assignment can be to a field the rest row stands
                // for (`positionPrev`, `anglePrev`, `inverseInertia`)
                if (body._restStatic === true) {
                    body._restStatic = Common._isRestingStatic(body);
                }

            }
        }
    };

    /**
     * Recomputes the bounds of every part of `body` from its current vertices
     * and velocity, if an engine running with `enableSolvedVelocityAndBounds`
     * false left them possibly stale (see `body._boundsStale`). Called before a
     * body stops being integrated, so the detector never reads a stale box.
     * @method _updateStaleBounds
     * @private
     * @param {body} body
     */
    Body._updateStaleBounds = function(body) {
        if (!body._boundsStale) {
            return;
        }

        var parts = body.parts,
            velocity = body.velocity;

        for (var i = 0; i < parts.length; i++) {
            Bounds.update(parts[i].bounds, parts[i].vertices, velocity);
        }

        body._boundsStale = false;
    };

    /**
     * Promotes `body` to a mover of the grid broadphase when it is a resting
     * body (static or asleep) that a grid detector already holds in its static
     * index, and the setter that just ran changed its bounds. Every setter that
     * moves or reshapes a body calls this after the move, with the bounds it
     * had before (`setPosition`, `setAngle`, `setPositionAndAngle`,
     * `scale`, `setVertices`, and through them `translate`, `rotate`,
     * `setParts` and `Body.set`): the index captured the body's bounds when
     * it bucketed it, and would otherwise go on answering for the old pose.
     *
     * The bounds are the whole of what the index holds of a body (the cells
     * it covers, and the bounds each mover caches with its candidates), so a
     * setter that leaves them exactly as they were (`setPosition` to where
     * the body is, `translate` by zero, `setAngle` to its angle,
     * `scale(1, 1)` about its position) promotes nothing, as
     * `setPositionAndAngle` with nothing changed never did.
     *
     * A promoted body stays a mover while it rests (`_sMoved`); a real change
     * of rest (`Body.setStatic` or `Sleeping.set` flipping its flag) ends
     * the promotion (see Body._endPromotion). The promotion is recorded
     * exactly as any change of role is: the static epoch moves, and the body
     * goes in its world's body journal (see
     * Common._bodyStaticEpoch and Common._journalTouch). A resting body moved
     * before any grid step has indexed it needs none of this, and is simply
     * indexed at its new pose; so does one removed from its world since the
     * grid last classified it (`_sDeparted`), which the next classification
     * takes out of the index whether or not it is added back.
     *
     * A body released (or woken) since the grid last classified it is still in
     * the index, and a setter can move it before the next classification. If
     * it is still moving then, that classification takes it out of the index;
     * but if it rests again first, nothing else would, and the index would go
     * on answering for the pose it was released from. So its move marks it as
     * a removal does (`_sDeparted`), and the next classification takes it out
     * and indexes it again wherever it rests. On the sweep nothing is ever
     * indexed, so this is one field read.
     * @method _promoteIfIndexed
     * @private
     * @param {body} body
     * @param {number} minX the body's `bounds.min.x` before the setter ran
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     */
    Body._promoteIfIndexed = function(body, minX, minY, maxX, maxY) {
        if (body._sIndexed !== true || body._sMoved === true || body._sDeparted === true) {
            return;
        }

        var bounds = body.bounds;

        if (bounds.min.x === minX && bounds.min.y === minY && bounds.max.x === maxX && bounds.max.y === maxY) {
            return;
        }

        // released or woken since the grid indexed it: re-indexed where it
        // rests, if it rests again before the grid next classifies it. The
        // release already journaled it, which is what reads the mark
        if (!(body.isStatic || body.isSleeping)) {
            body._sDeparted = true;
            return;
        }

        body._sMoved = true;
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Ends a grid promotion (see Body._promoteIfIndexed) on a real change of
     * rest: `Body.setStatic` or `Sleeping.set` flipping the body's flag,
     * which journals it and moves the static epoch, so the grid classifies it
     * afresh. A body promoted while it rested is a mover only while that rest
     * lasts: released it is a mover anyway, and resting again it is indexed
     * where it rests, rather than staying a mover for good (a teleported
     * sleeper, a scrolled pane piece frozen again after a release). A body
     * promoted since the grid last classified it is still in the index at the
     * pose it was promoted from, so it is marked as a removal marks a body
     * (`_sDeparted`), and the next classification takes it out and indexes
     * it again if it rests.
     * @method _endPromotion
     * @private
     * @param {body} body
     */
    Body._endPromotion = function(body) {
        if (body._sMoved !== true) {
            return;
        }

        body._sMoved = false;

        if (body._sIndexed === true) {
            body._sDeparted = true;
        }
    };

    /**
     * Ends the grid promotion a body frozen while carrying a warmed position
     * impulse took (see Body.setStatic), once the resolver has cleared that
     * impulse and so stopped moving it: the body is indexed where the drift
     * left it. Recorded as any change of role is, the static epoch moved and
     * the body journaled, since nothing else is happening to it that would.
     * A promotion a setter made ends here too, if the body also carried an
     * impulse; its next move promotes it again.
     * @method _driftEnded
     * @private
     * @param {body} body
     */
    Body._driftEnded = function(body) {
        if (body._sMoved !== true || !(body.isStatic || body.isSleeping)) {
            return;
        }

        Body._endPromotion(body);
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Sets the body as static, including isStatic flag and setting mass and inertia to Infinity.
     * @method setStatic
     * @param {body} body
     * @param {bool} isStatic
     */
    Body.setStatic = function(body, isStatic) {
        // a static body is never integrated again, so bring bounds an engine
        // deferred up to date first, while velocity still holds what they
        // would have been padded by
        if (isStatic) {
            Body._updateStaleBounds(body);
        }

        // a real change of rest ends a grid promotion (see Body._endPromotion)
        if (!body.isStatic !== !isStatic) {
            Body._endPromotion(body);
        }

        // frozen while carrying a warmed position impulse, which this does not
        // clear (upstream does not): the resolver goes on moving the body
        // until the impulse decays, about 90 updates and a few pixels (up to
        // tens), and nothing reports those moves. So the grid runs it as a
        // mover from the start, as it runs a static a setter moves, and
        // indexes it where it stops (see Body._driftEnded)
        if (isStatic && (body.positionImpulse.x !== 0 || body.positionImpulse.y !== 0)) {
            body._sMoved = true;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];

            if (isStatic) {
                if (!part.isStatic) {
                    part._original = {
                        restitution: part.restitution,
                        friction: part.friction,
                        mass: part.mass,
                        inertia: part.inertia,
                        density: part.density,
                        inverseMass: part.inverseMass,
                        inverseInertia: part.inverseInertia
                    };
                }

                part.restitution = 0;
                part.friction = 1;
                part.mass = part.inertia = part.density = Infinity;
                part.inverseMass = part.inverseInertia = 0;

                part.positionPrev.x = part.position.x;
                part.positionPrev.y = part.position.y;
                part.anglePrev = part.angle;
                // zero the cached velocity so a resting body reads as stopped
                // even though Engine no longer recomputes its velocity each step
                part.velocity.x = 0;
                part.velocity.y = 0;
                part.angularVelocity = 0;
                part.speed = 0;
                part.angularSpeed = 0;
                part.motion = 0;
            } else if (part._original) {
                part.restitution = part._original.restitution;
                part.friction = part._original.friction;
                part.mass = part._original.mass;
                part.inertia = part._original.inertia;
                part.density = part._original.density;
                part.inverseMass = part._original.inverseMass;
                part.inverseInertia = part._original.inverseInertia;

                part._original = null;
            }

            // Engine clears force buffers for moving bodies only, so a force
            // applied while this body was resting must be dropped here rather
            // than surviving into the step after a release
            part.force.x = 0;
            part.force.y = 0;
            part.torque = 0;

            part.isStatic = isStatic;

            // freezing establishes the rest row (positionPrev and anglePrev
            // were just set to position and angle, and inverseInertia to 0)
            // unless the position is not finite; releasing clears it
            part._restStatic = Common._isRestingStatic(part);
        }

        // invalidate the cached mover lists in Engine and the grid
        // broadphase (see Common._bodyStaticEpoch), and record the body in its
        // world's body journal (see Common._journalTouch)
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Sets the mass of the body. Inverse mass, density and inertia are automatically updated to reflect the change.
     * @method setMass
     * @param {body} body
     * @param {number} mass
     */
    Body.setMass = function(body, mass) {
        var moment = body.inertia / (body.mass / 6);
        body.inertia = moment * (mass / 6);
        body.inverseInertia = 1 / body.inertia;

        body.mass = mass;
        body.inverseMass = 1 / body.mass;
        body.density = body.mass / body.area;

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Sets the density of the body. Mass and inertia are automatically updated to reflect the change.
     * @method setDensity
     * @param {body} body
     * @param {number} density
     */
    Body.setDensity = function(body, density) {
        Body.setMass(body, density * body.area);
        body.density = density;
    };

    /**
     * Sets the moment of inertia of the body. This is the second moment of area in two dimensions.
     * Inverse inertia is automatically updated to reflect the change. Mass is not changed.
     * @method setInertia
     * @param {body} body
     * @param {number} inertia
     */
    Body.setInertia = function(body, inertia) {
        body.inertia = inertia;
        body.inverseInertia = 1 / body.inertia;

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Takes the box tag that `Collision.collides` reads to choose the fused
     * box-box separating-axis test (`Collision._overlapBoxes`) and the
     * closed-form support search (`Collision._findSupportsBox`): `_boxCorners`,
     * `_boxHalf0` and `_boxHalf1` (see `Body.create`).
     *
     * The tag is decided by ACTUAL geometry, never by the factory that built
     * the body: four vertices, two unit and mutually orthogonal axes, one part,
     * and every corner sitting at plus or minus the half extent on both axes
     * about `position`. That last test is what rejects a parallelogram (two
     * axes, four vertices, not a box), a compound parent (four hull corners
     * about a centre of mass that is not the hull's centre), and a body whose
     * centre was moved off its vertices by `Body.setCentre`. The vertex ring
     * must also walk the perimeter, never a diagonal, because the support
     * search reads a corner's two ring neighbours as its two box neighbours.
     *
     * Rotation and translation move the vertices, the axes and `position`
     * together, so they change none of this; only the mutators that reshape a
     * body call here.
     * @method _updateBoxTag
     * @private
     * @param {body} body
     */
    Body._updateBoxTag = function(body) {
        var vertices = body.vertices,
            axes = body.axes;

        body._boxCorners = -1;
        body._boxHalf0 = 0;
        body._boxHalf1 = 0;

        if (body.parts.length !== 1 || !vertices || vertices.length !== 4 || !axes || axes.length !== 2) {
            return;
        }

        var axis0X = axes[0].x,
            axis0Y = axes[0].y,
            axis1X = axes[1].x,
            axis1Y = axes[1].y;

        if (Math.abs(axis0X * axis0X + axis0Y * axis0Y - 1) > Body._boxAxisTolerance
            || Math.abs(axis1X * axis1X + axis1Y * axis1Y - 1) > Body._boxAxisTolerance
            || Math.abs(axis0X * axis1X + axis0Y * axis1Y) > Body._boxAxisTolerance) {
            return;
        }

        var positionX = body.position.x,
            positionY = body.position.y,
            offsets0 = _boxTagOffsets0,
            offsets1 = _boxTagOffsets1,
            min0 = 0,
            max0 = 0,
            min1 = 0,
            max1 = 0,
            k;

        for (k = 0; k < 4; k++) {
            // the support search walks neighbours by array position, the
            // general one by `vertex.index`; they must name the same vertex
            if (vertices[k].index !== k) {
                return;
            }

            var offsetX = vertices[k].x - positionX,
                offsetY = vertices[k].y - positionY,
                offset0 = offsetX * axis0X + offsetY * axis0Y,
                offset1 = offsetX * axis1X + offsetY * axis1Y;

            offsets0[k] = offset0;
            offsets1[k] = offset1;

            if (k === 0 || offset0 < min0) { min0 = offset0; }
            if (k === 0 || offset0 > max0) { max0 = offset0; }
            if (k === 0 || offset1 < min1) { min1 = offset1; }
            if (k === 0 || offset1 > max1) { max1 = offset1; }
        }

        var half0 = (max0 - min0) * 0.5,
            half1 = (max1 - min1) * 0.5,
            corners = 0,
            seen = 0,
            firstCode = 0,
            previousCode = 0;

        if (!(half0 > 0) || !(half1 > 0)) {
            return;
        }

        // the axis test above admits a shear of up to its tolerance, and a
        // parallelogram's corners project exactly to the half extents on its
        // own edge normals, so the corner test below cannot see it. What the
        // shear moves is a corner's ranking against the other axis, by about
        // the dot times the longer half extent: refuse it in world units, as
        // the corner test refuses everything else
        if ((half0 > half1 ? half0 : half1) * Math.abs(axis0X * axis1X + axis0Y * axis1Y) > Body._boxCornerTolerance) {
            return;
        }

        for (k = 0; k < 4; k++) {
            var side0 = offsets0[k],
                side1 = offsets1[k];

            if (Math.abs(Math.abs(side0) - half0) > Body._boxCornerTolerance
                || Math.abs(Math.abs(side1) - half1) > Body._boxCornerTolerance) {
                return;
            }

            var code = (side0 > 0 ? 1 : 0) | (side1 > 0 ? 2 : 0);

            // two corners in one quadrant about `position`: not a box about it
            if ((seen & (1 << code)) !== 0) {
                return;
            }

            // ring neighbours differ in exactly one side; both is a diagonal
            if (k === 0) {
                firstCode = code;
            } else if ((code ^ previousCode) === 3) {
                return;
            }

            previousCode = code;
            seen |= 1 << code;
            corners |= k << (code * 2);
        }

        if ((firstCode ^ previousCode) === 3) {
            return;
        }

        body._boxHalf0 = half0;
        body._boxHalf1 = half1;
        body._boxCorners = corners;
    };

    /**
     * Sets the body's vertices and updates body properties accordingly, including inertia, area and mass (with respect to `body.density`).
     * Vertices will be automatically transformed to be orientated around their centre of mass as the origin.
     * They are then automatically translated to world space based on `body.position`.
     *
     * The `vertices` argument should be passed as an array of `Matter.Vector` points (or a `Matter.Vertices` array).
     * Vertices must form a convex hull. Concave vertices must be decomposed into convex parts.
     * 
     * @method setVertices
     * @param {body} body
     * @param {vector[]} vertices
     */
    Body.setVertices = function(body, vertices) {
        // the bounds the grid may have indexed (see Body._promoteIfIndexed)
        var bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        // change vertices
        if (vertices[0].body === body) {
            body.vertices = vertices;
        } else {
            body.vertices = Vertices.create(vertices, body);
        }

        // update properties
        body.axes = Axes.fromVertices(body.vertices);
        // both the vertices and the axes have been replaced, so the
        // self-projection memo is stale (and possibly the wrong length)
        body._spValid = false;
        body.area = Vertices.area(body.vertices);
        Body.setMass(body, body.density * body.area);

        // orient vertices around the centre of mass at origin (0, 0)
        var centre = Vertices.centre(body.vertices);
        Vertices.translate(body.vertices, centre, -1);

        // update inertia while vertices are at origin (0, 0)
        Body.setInertia(body, Body._inertiaScale * Vertices.inertia(body.vertices, body.mass));

        // update geometry
        Vertices.translate(body.vertices, body.position);
        Bounds.update(body.bounds, body.vertices, body.velocity);

        // both the vertices and the axes have been replaced
        Body._updateBoxTag(body);

        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets the parts of the `body`. 
     * 
     * See `body.parts` for details and requirements on how parts are used.
     * 
     * See Bodies.fromVertices for a related utility.
     * 
     * This function updates `body` mass, inertia and centroid based on the parts geometry.  
     * Sets each `part.parent` to be this `body`.  
     * 
     * The convex hull is computed and set on this `body` (unless `autoHull` is `false`).  
     * Automatically ensures that the first part in `body.parts` is the `body`.
     * @method setParts
     * @param {body} body
     * @param {body[]} parts
     * @param {bool} [autoHull=true]
     */
    Body.setParts = function(body, parts, autoHull) {
        var i;

        // the hull below rebuilds this body's vertices and axes, so the
        // self-projection memo is stale (and possibly the wrong length)
        body._spValid = false;

        // add all the parts, ensuring that the first part is always the parent body
        parts = parts.slice(0);
        body.parts.length = 0;
        body.parts.push(body);
        body.parent = body;

        for (i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part !== body) {
                part.parent = body;
                body.parts.push(part);
            }
        }

        // a compound parent is never a box: its position is the parts' centre
        // of mass, not its hull's centre, even when the hull has four corners
        Body._updateBoxTag(body);

        if (body.parts.length === 1)
            return;

        autoHull = typeof autoHull !== 'undefined' ? autoHull : true;

        // find the convex hull of all parts to set on the parent body
        if (autoHull) {
            var vertices = [];
            for (i = 0; i < parts.length; i++) {
                vertices = vertices.concat(parts[i].vertices);
            }

            Vertices.clockwiseSort(vertices);

            var hull = Vertices.hull(vertices),
                hullCentre = Vertices.centre(hull);

            Body.setVertices(body, hull);
            Vertices.translate(body.vertices, hullCentre);
        }

        // sum the properties of all compound parts of the parent body
        var total = Body._totalProperties(body);

        body.area = total.area;
        body.parent = body;
        body.position.x = total.centre.x;
        body.position.y = total.centre.y;
        body.positionPrev.x = total.centre.x;
        body.positionPrev.y = total.centre.y;

        Body.setMass(body, total.mass);
        Body.setInertia(body, total.inertia);
        Body.setPosition(body, total.centre);
    };

    /**
     * Set the centre of mass of the body. 
     * The `centre` is a vector in world-space unless `relative` is set, in which case it is a translation.
     * The centre of mass is the point the body rotates about and can be used to simulate non-uniform density.
     * This is equal to moving `body.position` but not the `body.vertices`.
     * Invalid if the `centre` falls outside the body's convex hull.
     * @method setCentre
     * @param {body} body
     * @param {vector} centre
     * @param {bool} relative
     */
    Body.setCentre = function(body, centre, relative) {
        if (!relative) {
            body.positionPrev.x = centre.x - (body.position.x - body.positionPrev.x);
            body.positionPrev.y = centre.y - (body.position.y - body.positionPrev.y);
            body.position.x = centre.x;
            body.position.y = centre.y;
        } else {
            body.positionPrev.x += centre.x;
            body.positionPrev.y += centre.y;
            body.position.x += centre.x;
            body.position.y += centre.y;
        }

        // `position` no longer sits at the centre of the vertices
        Body._updateBoxTag(body);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Sets the position of the body. By default velocity is unchanged.
     * If `updateVelocity` is `true` then velocity is inferred from the change in position.
     * @method setPosition
     * @param {body} body
     * @param {vector} position
     * @param {boolean} [updateVelocity=false]
     */
    Body.setPosition = function(body, position, updateVelocity) {
        var delta = Vector.sub(position, body.position),
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        if (updateVelocity) {
            body.positionPrev.x = body.position.x;
            body.positionPrev.y = body.position.y;
            body.velocity.x = delta.x;
            body.velocity.y = delta.y;
            body.speed = Vector.magnitude(delta);
        } else {
            body.positionPrev.x += delta.x;
            body.positionPrev.y += delta.y;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];
            part.position.x += delta.x;
            part.position.y += delta.y;
            Vertices.translate(part.vertices, delta);
            Bounds.update(part.bounds, part.vertices, body.velocity);
        }

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets the angle of the body. By default angular velocity is unchanged.
     * If `updateVelocity` is `true` then angular velocity is inferred from the change in angle.
     * @method setAngle
     * @param {body} body
     * @param {number} angle
     * @param {boolean} [updateVelocity=false]
     */
    Body.setAngle = function(body, angle, updateVelocity) {
        var delta = angle - body.angle,
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;
        
        if (updateVelocity) {
            body.anglePrev = body.angle;
            body.angularVelocity = delta;
            body.angularSpeed = Math.abs(delta);
        } else {
            body.anglePrev += delta;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];
            part.angle += delta;
            Vertices.rotate(part.vertices, delta, body.position);
            Axes.rotate(part.axes, delta);
            Bounds.update(part.bounds, part.vertices, body.velocity);
            if (i > 0) {
                Vector.rotateAbout(part.position, delta, body.position, part.position);
            }
        }

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets both the position and angle of the body in a single fused pass,
     * equivalent to calling `Body.setPosition(body, { x, y })` then
     * `Body.setAngle(body, angle)` (angular/linear velocity are left unchanged).
     *
     * The stock two-call sequence walks the vertices twice and writes the bounds
     * twice, and the post-translate bounds write is dead work overwritten by the
     * post-rotate one. When BOTH axes move on a single-part body (the common
     * case for an authoritative pose writeback), this does one combined vertex
     * pass - translate, rotate about the new position, min/max scan - and one
     * bounds write, replicating the stock float ops in the stock order so the
     * resulting body state is bit-identical.
     *
     * A single-axis change (position OR angle only) and compound bodies fall
     * back to the stock setters: the fused rotate math is not bit-identical at a
     * zero angle delta (the translate-then-rotate roundtrip loses precision when
     * cos is exactly 1), and compound parts need per-part position bookkeeping.
     * @method setPositionAndAngle
     * @param {body} body
     * @param {number} x
     * @param {number} y
     * @param {number} angle
     */
    Body.setPositionAndAngle = function(body, x, y, angle) {
        var positionChanged = x !== body.position.x || y !== body.position.y,
            angleChanged = angle !== body.angle;

        if (!positionChanged || !angleChanged || body.parts.length > 1) {
            if (positionChanged) {
                Body.setPosition(body, { x: x, y: y });
            }
            if (angleChanged) {
                Body.setAngle(body, angle);
            }
            return;
        }

        // the bounds the grid may have indexed (see Body._promoteIfIndexed)
        var bounds = body.bounds,
            oldMinX = bounds.min.x,
            oldMinY = bounds.min.y,
            oldMaxX = bounds.max.x,
            oldMaxY = bounds.max.y;

        // The setPosition half: shift position and positionPrev by the delta.
        var deltaX = x - body.position.x,
            deltaY = y - body.position.y;

        body.positionPrev.x += deltaX;
        body.positionPrev.y += deltaY;
        body.position.x += deltaX;
        body.position.y += deltaY;

        // The setAngle half: shift angle and anglePrev; vertices rotate about the
        // NEW position, exactly as the stock call sequence does.
        var deltaAngle = angle - body.angle;

        body.anglePrev += deltaAngle;
        body.angle += deltaAngle;

        var cos = Math.cos(deltaAngle),
            sin = Math.sin(deltaAngle),
            pointX = body.position.x,
            pointY = body.position.y,
            vertices = body.vertices,
            verticesLength = vertices.length,
            minX = 0,
            maxX = 0,
            minY = 0,
            maxY = 0;

        // the vertex and axis writes below are inlined rather than routed
        // through Vertices.rotate / Axes.rotate, so invalidate here too
        body._spValid = false;

        for (var i = 0; i < verticesLength; i++) {
            var vertex = vertices[i],
                translatedX = vertex.x + deltaX,
                translatedY = vertex.y + deltaY,
                relativeX = translatedX - pointX,
                relativeY = translatedY - pointY,
                rotatedX = pointX + (relativeX * cos - relativeY * sin),
                rotatedY = pointY + (relativeX * sin + relativeY * cos);

            vertex.x = rotatedX;
            vertex.y = rotatedY;

            if (i === 0) {
                minX = maxX = rotatedX;
                minY = maxY = rotatedY;
                continue;
            }

            if (rotatedX > maxX) { maxX = rotatedX; } else if (rotatedX < minX) { minX = rotatedX; }
            if (rotatedY > maxY) { maxY = rotatedY; } else if (rotatedY < minY) { minY = rotatedY; }
        }

        // Axes.rotate, inlined (deltaAngle is nonzero on this path).
        var axes = body.axes,
            axesLength = axes.length;

        for (var j = 0; j < axesLength; j++) {
            var axis = axes[j],
                rotatedAxisX = axis.x * cos - axis.y * sin;

            axis.y = axis.x * sin + axis.y * cos;
            axis.x = rotatedAxisX;
        }

        // The Bounds.update speculative-contact expansion: grow toward the
        // current velocity direction, identical to the stock call.
        var velocity = body.velocity;

        if (velocity.x > 0) { maxX += velocity.x; } else { minX += velocity.x; }
        if (velocity.y > 0) { maxY += velocity.y; } else { minY += velocity.y; }

        bounds.min.x = minX;
        bounds.max.x = maxX;
        bounds.min.y = minY;
        bounds.max.y = maxY;

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, oldMinX, oldMinY, oldMaxX, oldMaxY);
    };

    /**
     * Sets the current linear velocity of the body.
     * Affects body speed.
     * @method setVelocity
     * @param {body} body
     * @param {vector} velocity
     */
    Body.setVelocity = function(body, velocity) {
        // bounds an engine deferred are padded by the velocity they were
        // deferred with, which this is about to overwrite, so bring them up
        // to date first (see Body._updateStaleBounds). `setSpeed` comes
        // through here; `setAngularVelocity` pads no bounds, and
        // `setPosition` recomputes every bound it writes a velocity for
        Body._updateStaleBounds(body);

        var timeScale = body.deltaTime / Body._baseDelta;
        body.positionPrev.x = body.position.x - velocity.x * timeScale;
        body.positionPrev.y = body.position.y - velocity.y * timeScale;
        body.velocity.x = (body.position.x - body.positionPrev.x) / timeScale;
        body.velocity.y = (body.position.y - body.positionPrev.y) / timeScale;
        body.speed = Vector.magnitude(body.velocity);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Gets the current linear velocity of the body.
     * @method getVelocity
     * @param {body} body
     * @return {vector} velocity
     */
    Body.getVelocity = function(body) {
        var timeScale = Body._baseDelta / body.deltaTime;

        return {
            x: (body.position.x - body.positionPrev.x) * timeScale,
            y: (body.position.y - body.positionPrev.y) * timeScale
        };
    };

    /**
     * Gets the current linear speed of the body.  
     * Equivalent to the magnitude of its velocity.
     * @method getSpeed
     * @param {body} body
     * @return {number} speed
     */
    Body.getSpeed = function(body) {
        return Vector.magnitude(Body.getVelocity(body));
    };

    /**
     * Sets the current linear speed of the body.  
     * Direction is maintained. Affects body velocity.
     * @method setSpeed
     * @param {body} body
     * @param {number} speed
     */
    Body.setSpeed = function(body, speed) {
        Body.setVelocity(body, Vector.mult(Vector.normalise(Body.getVelocity(body)), speed));
    };

    /**
     * Sets the current rotational velocity of the body.  
     * Affects body angular speed.
     * @method setAngularVelocity
     * @param {body} body
     * @param {number} velocity
     */
    Body.setAngularVelocity = function(body, velocity) {
        var timeScale = body.deltaTime / Body._baseDelta;
        body.anglePrev = body.angle - velocity * timeScale;
        body.angularVelocity = (body.angle - body.anglePrev) / timeScale;
        body.angularSpeed = Math.abs(body.angularVelocity);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Gets the current rotational velocity of the body.
     * @method getAngularVelocity
     * @param {body} body
     * @return {number} angular velocity
     */
    Body.getAngularVelocity = function(body) {
        return (body.angle - body.anglePrev) * Body._baseDelta / body.deltaTime;
    };

    /**
     * Gets the current rotational speed of the body.  
     * Equivalent to the magnitude of its angular velocity.
     * @method getAngularSpeed
     * @param {body} body
     * @return {number} angular speed
     */
    Body.getAngularSpeed = function(body) {
        return Math.abs(Body.getAngularVelocity(body));
    };

    /**
     * Sets the current rotational speed of the body.  
     * Direction is maintained. Affects body angular velocity.
     * @method setAngularSpeed
     * @param {body} body
     * @param {number} speed
     */
    Body.setAngularSpeed = function(body, speed) {
        Body.setAngularVelocity(body, Common.sign(Body.getAngularVelocity(body)) * speed);
    };

    /**
     * Moves a body by a given vector relative to its current position. By default velocity is unchanged.
     * If `updateVelocity` is `true` then velocity is inferred from the change in position.
     * @method translate
     * @param {body} body
     * @param {vector} translation
     * @param {boolean} [updateVelocity=false]
     */
    Body.translate = function(body, translation, updateVelocity) {
        Body.setPosition(body, Vector.add(body.position, translation), updateVelocity);
    };

    /**
     * Rotates a body by a given angle relative to its current angle. By default angular velocity is unchanged.
     * If `updateVelocity` is `true` then angular velocity is inferred from the change in angle.
     * @method rotate
     * @param {body} body
     * @param {number} rotation
     * @param {vector} [point]
     * @param {boolean} [updateVelocity=false]
     */
    Body.rotate = function(body, rotation, point, updateVelocity) {
        if (!point) {
            Body.setAngle(body, body.angle + rotation, updateVelocity);
        } else {
            var cos = Math.cos(rotation),
                sin = Math.sin(rotation),
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + (dx * cos - dy * sin),
                y: point.y + (dx * sin + dy * cos)
            }, updateVelocity);

            Body.setAngle(body, body.angle + rotation, updateVelocity);
        }
    };

    /**
     * Scales the body, including updating physical properties (mass, area, axes, inertia), from a world-space point (default is body centre).
     * @method scale
     * @param {body} body
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {vector} [point]
     */
    Body.scale = function(body, scaleX, scaleY, point) {
        var totalArea = 0,
            totalInertia = 0,
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        point = point || body.position;

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];

            // scale vertices
            Vertices.scale(part.vertices, scaleX, scaleY, point);

            // update properties
            part.axes = Axes.fromVertices(part.vertices);
            // the axes have been replaced, so the self-projection memo is stale
            // (and possibly the wrong length)
            part._spValid = false;
            part.area = Vertices.area(part.vertices);
            Body.setMass(part, body.density * part.area);

            // update inertia (requires vertices to be at origin)
            Vertices.translate(part.vertices, { x: -part.position.x, y: -part.position.y });
            Body.setInertia(part, Body._inertiaScale * Vertices.inertia(part.vertices, part.mass));
            Vertices.translate(part.vertices, { x: part.position.x, y: part.position.y });

            if (i > 0) {
                totalArea += part.area;
                totalInertia += part.inertia;
            }

            // scale position
            part.position.x = point.x + (part.position.x - point.x) * scaleX;
            part.position.y = point.y + (part.position.y - point.y) * scaleY;

            // the extents changed, and a non-uniform scale of a rotated box is
            // a parallelogram, which keeps two axes but is no longer a box
            Body._updateBoxTag(part);

            // update bounds
            Bounds.update(part.bounds, part.vertices, body.velocity);

            // scaling about any point but the position moves the position
            // without positionPrev
            part._restStatic = Common._isRestingStatic(part);
        }

        // handle parent body
        if (body.parts.length > 1) {
            body.area = totalArea;

            if (!body.isStatic) {
                Body.setMass(body, body.density * totalArea);
                Body.setInertia(body, totalInertia);
            }
        }

        // handle circles
        if (body.circleRadius) { 
            if (scaleX === scaleY) {
                body.circleRadius *= scaleX;
            } else {
                // body is no longer a circle
                body.circleRadius = null;
            }
        }

        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Performs an update by integrating the equations of motion on the `body`.
     * This is applied every update by `Matter.Engine` automatically.
     * @method update
     * @param {body} body
     * @param {number} [deltaTime=16.666]
     */
    Body.update = function(body, deltaTime) {
        deltaTime = (typeof deltaTime !== 'undefined' ? deltaTime : (1000 / 60)) * body.timeScale;

        var deltaTimeSquared = deltaTime * deltaTime,
            correction = Body._timeCorrection ? deltaTime / (body.deltaTime || deltaTime) : 1;

        // from the previous step
        var frictionAir = 1 - body.frictionAir * (deltaTime / Common._baseDelta),
            velocityPrevX = (body.position.x - body.positionPrev.x) * correction,
            velocityPrevY = (body.position.y - body.positionPrev.y) * correction;

        // update velocity with Verlet integration
        body.velocity.x = (velocityPrevX * frictionAir) + (body.force.x / body.mass) * deltaTimeSquared;
        body.velocity.y = (velocityPrevY * frictionAir) + (body.force.y / body.mass) * deltaTimeSquared;

        body.positionPrev.x = body.position.x;
        body.positionPrev.y = body.position.y;
        body.position.x += body.velocity.x;
        body.position.y += body.velocity.y;
        body.deltaTime = deltaTime;

        // update angular velocity with Verlet integration
        body.angularVelocity = ((body.angle - body.anglePrev) * frictionAir * correction) + (body.torque / body.inertia) * deltaTimeSquared;
        body.anglePrev = body.angle;
        body.angle += body.angularVelocity;

        // the engine integrates moving bodies only, so this is a direct call
        // on a static. It keeps the rest row for a finite force and torque,
        // and the check reads one false flag for every engine-driven update
        if (body._restStatic === true) {
            body._restStatic = Common._isRestingStatic(body);
        }

        // transform the body geometry
        var parts = body.parts,
            partsLength = parts.length,
            velocity = body.velocity,
            angularVelocity = body.angularVelocity,
            position = body.position;

        // single-part bodies (the common case) skip the per-part position and
        // compound-rotation bookkeeping that only applies to parts[1..]. The
        // operations and their order are identical to the general loop below,
        // so the result is bit-identical.
        if (partsLength === 1) {
            Body._transformSinglePart(parts[0], velocity, angularVelocity, position);
            return;
        }

        for (var i = 0; i < partsLength; i++) {
            var part = parts[i];

            Vertices.translate(part.vertices, velocity);

            if (i > 0) {
                part.position.x += velocity.x;
                part.position.y += velocity.y;
            }

            if (angularVelocity !== 0) {
                Vertices.rotate(part.vertices, angularVelocity, position);
                Axes.rotate(part.axes, angularVelocity);
                if (i > 0) {
                    Vector.rotateAbout(part.position, angularVelocity, position, part.position);
                }
            }

            Bounds.update(part.bounds, part.vertices, velocity);
        }
    };

    /**
     * `Body.update`'s geometry step for a single-part body. A rotating body
     * with vertices takes `Vertices.translate`, `Vertices.rotate` about the
     * integrated `position`, `Axes.rotate` and `Bounds.update` padded by
     * `velocity` in one pass over its vertices; any other body calls those
     * helpers as they are.
     *
     * SYNC: the pass is a hand-inlined copy of those four helpers and must be
     * bit-identical to calling them in turn (`test/Body.spec.js` checks it
     * with `Object.is`). Change it when they change, and keep each expression
     * exactly as they compute it: never regroup the arithmetic. The bounds
     * fold uses two independent selects where `Bounds.update` has
     * `if / else if`; both pick the same value. The premise is min <= max:
     * both start at the first vertex, and max only rises and min only falls,
     * so it holds throughout (or both are NaN), no vertex passes both tests,
     * and the second select never fires where the `else` would have
     * skipped it. A tie keeps the held value and a NaN compares false.
     * @method _transformSinglePart
     * @private
     * @param {body} part the body, which is its own only part
     * @param {vector} velocity
     * @param {number} angularVelocity
     * @param {vector} position the integrated position
     */
    Body._transformSinglePart = function(part, velocity, angularVelocity, position) {
        var vertices = part.vertices,
            verticesLength = vertices.length;

        if (angularVelocity === 0 || verticesLength === 0) {
            Vertices.translate(vertices, velocity);

            if (angularVelocity !== 0) {
                Vertices.rotate(vertices, angularVelocity, position);
                Axes.rotate(part.axes, angularVelocity);
            }

            Bounds.update(part.bounds, vertices, velocity);
            return;
        }

        var translateX = velocity.x,
            translateY = velocity.y,
            cos = Math.cos(angularVelocity),
            sin = Math.sin(angularVelocity),
            pointX = position.x,
            pointY = position.y,
            vertex = vertices[0],
            dx,
            dy,
            x,
            y,
            i;

        // the self-projection memo describes these vertex positions
        if (vertex.body) {
            vertex.body._spValid = false;
        }

        dx = (vertex.x + translateX) - pointX;
        dy = (vertex.y + translateY) - pointY;
        x = pointX + (dx * cos - dy * sin);
        y = pointY + (dx * sin + dy * cos);
        vertex.x = x;
        vertex.y = y;

        var minX = x,
            maxX = x,
            minY = y,
            maxY = y;

        for (i = 1; i < verticesLength; i++) {
            vertex = vertices[i];
            dx = (vertex.x + translateX) - pointX;
            dy = (vertex.y + translateY) - pointY;
            x = pointX + (dx * cos - dy * sin);
            y = pointY + (dx * sin + dy * cos);
            vertex.x = x;
            vertex.y = y;

            maxX = x > maxX ? x : maxX;
            minX = x < minX ? x : minX;
            maxY = y > maxY ? y : maxY;
            minY = y < minY ? y : minY;
        }

        var axes = part.axes,
            axis,
            axisX;

        for (i = 0; i < axes.length; i++) {
            axis = axes[i];
            axisX = axis.x * cos - axis.y * sin;
            axis.y = axis.x * sin + axis.y * cos;
            axis.x = axisX;
        }

        if (translateX > 0) {
            maxX += translateX;
        } else {
            minX += translateX;
        }

        if (translateY > 0) {
            maxY += translateY;
        } else {
            minY += translateY;
        }

        var bounds = part.bounds;

        bounds.min.x = minX;
        bounds.max.x = maxX;
        bounds.min.y = minY;
        bounds.max.y = maxY;
    };

    /**
     * Updates properties `body.velocity`, `body.speed`, `body.angularVelocity` and `body.angularSpeed` which are normalised in relation to `Body._baseDelta`.
     * @method updateVelocities
     * @param {body} body
     */
    Body.updateVelocities = function(body) {
        var timeScale = Body._baseDelta / body.deltaTime,
            bodyVelocity = body.velocity;

        bodyVelocity.x = (body.position.x - body.positionPrev.x) * timeScale;
        bodyVelocity.y = (body.position.y - body.positionPrev.y) * timeScale;
        body.speed = Math.sqrt((bodyVelocity.x * bodyVelocity.x) + (bodyVelocity.y * bodyVelocity.y));

        body.angularVelocity = (body.angle - body.anglePrev) * timeScale;
        body.angularSpeed = Math.abs(body.angularVelocity);
    };

    /**
     * Applies the `force` to the `body` from the force origin `position` in world-space, over a single timestep, including applying any resulting angular torque.
     * 
     * Forces are useful for effects like gravity, wind or rocket thrust, but can be difficult in practice when precise control is needed. In these cases see `Body.setVelocity` and `Body.setPosition` as an alternative.
     * 
     * The force from this function is only applied once for the duration of a single timestep, in other words the duration depends directly on the current engine update `delta` and the rate of calls to this function.
     * 
     * Therefore to account for time, you should apply the force constantly over as many engine updates as equivalent to the intended duration.
     * 
     * If all or part of the force duration is some fraction of a timestep, first multiply the force by `duration / timestep`.
     * 
     * The force origin `position` in world-space must also be specified. Passing `body.position` will result in zero angular effect as the force origin would be at the centre of mass.
     * 
     * The `body` will take time to accelerate under a force, the resulting effect depends on duration of the force, the body mass and other forces on the body including friction combined.
     * @method applyForce
     * @param {body} body
     * @param {vector} position The force origin in world-space. Pass `body.position` to avoid angular torque.
     * @param {vector} force
     */
    Body.applyForce = function(body, position, force) {
        var offset = { x: position.x - body.position.x, y: position.y - body.position.y };
        body.force.x += force.x;
        body.force.y += force.y;
        body.torque += offset.x * force.y - offset.y * force.x;
    };

    /**
     * Returns the sums of the properties of all compound parts of the parent body.
     * @method _totalProperties
     * @private
     * @param {body} body
     * @return {}
     */
    Body._totalProperties = function(body) {
        // from equations at:
        // https://ecourses.ou.edu/cgi-bin/ebook.cgi?doc=&topic=st&chap_sec=07.2&page=theory
        // http://output.to/sideway/default.asp?qno=121100087

        var properties = {
            mass: 0,
            area: 0,
            inertia: 0,
            centre: { x: 0, y: 0 }
        };

        // sum the properties of all compound parts of the parent body
        for (var i = body.parts.length === 1 ? 0 : 1; i < body.parts.length; i++) {
            var part = body.parts[i],
                mass = part.mass !== Infinity ? part.mass : 1;

            properties.mass += mass;
            properties.area += part.area;
            properties.inertia += part.inertia;
            properties.centre = Vector.add(properties.centre, Vector.mult(part.position, mass));
        }

        properties.centre = Vector.div(properties.centre, properties.mass);

        return properties;
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired when a body starts sleeping (where `this` is the body).
    *
    * @event sleepStart
    * @this {body} The body that has started sleeping
    * @param {} event An event object
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a body ends sleeping (where `this` is the body).
    *
    * @event sleepEnd
    * @this {body} The body that has ended sleeping
    * @param {} event An event object
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` uniquely identifying number generated in `Body.create` by `Common.nextId`.
     *
     * @property id
     * @type number
     */

    /**
     * _Read only_. Set by `Body.create`.
     * 
     * A `String` denoting the type of object.
     *
     * @readOnly
     * @property type
     * @type string
     * @default "body"
     */

    /**
     * An arbitrary `String` name to help the user identify and manage bodies.
     *
     * @property label
     * @type string
     * @default "Body"
     */

    /**
     * _Read only_. Use `Body.setParts` to set. 
     * 
     * See `Bodies.fromVertices` for a related utility.
     * 
     * An array of bodies (the 'parts') that make up this body (the 'parent'). The first body in this array must always be a self-reference to this `body`.  
     * 
     * The parts are fixed together and therefore perform as a single unified rigid body.
     * 
     * Parts in relation to each other are allowed to overlap, as well as form gaps or holes, so can be used to create complex concave bodies unlike when using a single part. 
     * 
     * Use properties and functions on the parent `body` rather than on parts.
     *   
     * Outside of their geometry, most properties on parts are not considered or updated.  
     * As such 'per-part' material properties among others are not currently considered.
     * 
     * Parts should be created specifically for their parent body.  
     * Parts should not be shared or reused between bodies, only one parent is supported.  
     * Parts should not have their own parts, they are not handled recursively.  
     * Parts should not be added to the world directly or any other composite.  
     * Parts own vertices must be convex and in clockwise order.   
     * 
     * A body with more than one part is sometimes referred to as a 'compound' body. 
     * 
     * Use `Body.setParts` when setting parts to ensure correct updates of all properties.  
     *
     * @readOnly
     * @property parts
     * @type body[]
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

    /**
     * _Read only_. Updated by `Body.setParts`.
     * 
     * A reference to the body that this is a part of. See `body.parts`.
     * This is a self reference if the body is not a part of another body.
     *
     * @readOnly
     * @property parent
     * @type body
     */

    /**
     * A `Number` specifying the angle of the body, in radians.
     *
     * @property angle
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setVertices` or `Body.setParts` to set. See also `Bodies.fromVertices`.
     * 
     * An array of `Vector` objects that specify the convex hull of the rigid body.
     * These should be provided about the origin `(0, 0)`. E.g.
     *
     * `[{ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }]`
     * 
     * Vertices must always be convex, in clockwise order and must not contain any duplicate points.
     * 
     * Concave vertices should be decomposed into convex `parts`, see `Bodies.fromVertices` and `Body.setParts`.
     *
     * When set the vertices are translated such that `body.position` is at the centre of mass.
     * Many other body properties are automatically calculated from these vertices when set including `density`, `area` and `inertia`.
     * 
     * The module `Matter.Vertices` contains useful methods for working with vertices.
     *
     * @readOnly
     * @property vertices
     * @type vector[]
     */

    /**
     * _Read only_. Use `Body.setPosition` to set. 
     * 
     * A `Vector` that specifies the current world-space position of the body.
     * 
     * @readOnly
     * @property position
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Vector` that accumulates the total force applied to the body for a single update.
     * Force is zeroed after every `Engine.update`, so constant forces should be applied for every update they are needed. See also `Body.applyForce`.
     * 
     * @property force
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Number` that accumulates the total torque (turning force) applied to the body for a single update. See also `Body.applyForce`.
     * Torque is zeroed after every `Engine.update`, so constant torques should be applied for every update they are needed.
     *
     * Torques result in angular acceleration on every update, which depends on body inertia and the engine update delta.
     * 
     * @property torque
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setSpeed` to set. 
     * 
     * See `Body.getSpeed` for details.
     * 
     * Equivalent to the magnitude of `body.velocity` (always positive).
     * 
     * @readOnly
     * @property speed
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setVelocity` to set. 
     * 
     * See `Body.getVelocity` for details.
     * 
     * Equivalent to the magnitude of `body.angularVelocity` (always positive).
     * 
     * @readOnly
     * @property velocity
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * _Read only_. Use `Body.setAngularSpeed` to set. 
     * 
     * See `Body.getAngularSpeed` for details.
     * 
     * 
     * @readOnly
     * @property angularSpeed
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setAngularVelocity` to set. 
     * 
     * See `Body.getAngularVelocity` for details.
     * 
     *
     * @readOnly
     * @property angularVelocity
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setStatic` to set. 
     * 
     * A flag that indicates whether a body is considered static. A static body can never change position or angle and is completely fixed.
     *
     * @readOnly
     * @property isStatic
     * @type boolean
     * @default false
     */

    /**
     * A flag that indicates whether a body is a sensor. Sensor triggers collision events, but doesn't react with colliding body physically.
     *
     * @property isSensor
     * @type boolean
     * @default false
     */

    /**
     * _Read only_. Use `Sleeping.set` to set. 
     * 
     * A flag that indicates whether the body is considered sleeping. A sleeping body acts similar to a static body, except it is only temporary and can be awoken.
     *
     * @readOnly
     * @property isSleeping
     * @type boolean
     * @default false
     */

    /**
     * _Read only_. Calculated during engine update only when sleeping is enabled.
     * 
     * A `Number` that loosely measures the amount of movement a body currently has.
     *
     * Derived from `body.speed^2 + body.angularSpeed^2`. See `Sleeping.update`.
     * 
     * @readOnly
     * @property motion
     * @type number
     * @default 0
     */

    /**
     * A `Number` that defines the length of time during which this body must have near-zero velocity before it is set as sleeping by the `Matter.Sleeping` module (if sleeping is enabled by the engine).
     * 
     * @property sleepThreshold
     * @type number
     * @default 60
     */

    /**
     * _Read only_. Use `Body.setDensity` to set. 
     * 
     * A `Number` that defines the density of the body (mass per unit area).
     * 
     * Mass will also be updated when set.
     *
     * @readOnly
     * @property density
     * @type number
     * @default 0.001
     */

    /**
     * _Read only_. Use `Body.setMass` to set. 
     * 
     * A `Number` that defines the mass of the body.
     * 
     * Density will also be updated when set.
     * 
     * @readOnly
     * @property mass
     * @type number
     */

    /**
     * _Read only_. Use `Body.setMass` to set. 
     * 
     * A `Number` that defines the inverse mass of the body (`1 / mass`).
     *
     * @readOnly
     * @property inverseMass
     * @type number
     */

    /**
     * _Read only_. Automatically calculated when vertices, mass or density are set or set through `Body.setInertia`.
     * 
     * A `Number` that defines the moment of inertia of the body. This is the second moment of area in two dimensions.
     * 
     * Can be manually set to `Infinity` to prevent rotation of the body. See `Body.setInertia`.
     * 
     * @readOnly
     * @property inertia
     * @type number
     */

    /**
     * _Read only_. Automatically calculated when vertices, mass or density are set or calculated by `Body.setInertia`.
     * 
     * A `Number` that defines the inverse moment of inertia of the body (`1 / inertia`).
     * 
     * @readOnly
     * @property inverseInertia
     * @type number
     */

    /**
     * A `Number` that defines the restitution (elasticity) of the body. The value is always positive and is in the range `(0, 1)`.
     * A value of `0` means collisions may be perfectly inelastic and no bouncing may occur. 
     * A value of `0.8` means the body may bounce back with approximately 80% of its kinetic energy.
     * Note that collision response is based on _pairs_ of bodies, and that `restitution` values are _combined_ with the following formula:
     *
     * `Math.max(bodyA.restitution, bodyB.restitution)`
     *
     * @property restitution
     * @type number
     * @default 0
     */

    /**
     * A `Number` that defines the friction of the body. The value is always positive and is in the range `(0, 1)`.
     * A value of `0` means that the body may slide indefinitely.
     * A value of `1` means the body may come to a stop almost instantly after a force is applied.
     *
     * The effects of the value may be non-linear. 
     * High values may be unstable depending on the body.
     * The engine uses a Coulomb friction model including static and kinetic friction.
     * Note that collision response is based on _pairs_ of bodies, and that `friction` values are _combined_ with the following formula:
     *
     * `Math.min(bodyA.friction, bodyB.friction)`
     *
     * @property friction
     * @type number
     * @default 0.1
     */

    /**
     * A `Number` that defines the static friction of the body (in the Coulomb friction model). 
     * A value of `0` means the body will never 'stick' when it is nearly stationary and only dynamic `friction` is used.
     * The higher the value (e.g. `10`), the more force it will take to initially get the body moving when nearly stationary.
     * This value is multiplied with the `friction` property to make it easier to change `friction` and maintain an appropriate amount of static friction.
     *
     * @property frictionStatic
     * @type number
     * @default 0.5
     */

    /**
     * A `Number` that defines the air friction of the body (air resistance). 
     * A value of `0` means the body will never slow as it moves through space.
     * The higher the value, the faster a body slows when moving through space.
     * The effects of the value are non-linear. 
     *
     * @property frictionAir
     * @type number
     * @default 0.01
     */

    /**
     * An `Object` that specifies the collision filtering properties of this body.
     *
     * Collisions between two bodies will obey the following rules:
     * - If the two bodies have the same non-zero value of `collisionFilter.group`,
     *   they will always collide if the value is positive, and they will never collide
     *   if the value is negative.
     * - If the two bodies have different values of `collisionFilter.group` or if one
     *   (or both) of the bodies has a value of 0, then the category/mask rules apply as follows:
     *
     * Each body belongs to a collision category, given by `collisionFilter.category`. This
     * value is used as a bit field and the category should have only one bit set, meaning that
     * the value of this property is a power of two in the range [1, 2^31]. Thus, there are 32
     * different collision categories available.
     *
     * Each body also defines a collision bitmask, given by `collisionFilter.mask` which specifies
     * the categories it collides with (the value is the bitwise AND value of all these categories).
     *
     * Using the category/mask rules, two bodies `A` and `B` collide if each includes the other's
     * category in its mask, i.e. `(categoryA & maskB) !== 0` and `(categoryB & maskA) !== 0`
     * are both true.
     *
     * @property collisionFilter
     * @type object
     */

    /**
     * An Integer `Number`, that specifies the collision group this body belongs to.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.group
     * @type object
     * @default 0
     */

    /**
     * A bit field that specifies the collision category this body belongs to.
     * The category value should have only one bit set, for example `0x0001`.
     * This means there are up to 32 unique collision categories available.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.category
     * @type object
     * @default 1
     */

    /**
     * A bit mask that specifies the collision categories this body may collide with.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.mask
     * @type object
     * @default -1
     */

    /**
     * A `Number` that specifies a thin boundary around the body where it is allowed to slightly sink into other bodies.
     * 
     * This is required for proper collision response, including friction and restitution effects.
     * 
     * The default should generally suffice in most cases. You may need to decrease this value for very small bodies that are nearing the default value in scale.
     *
     * @property slop
     * @type number
     * @default 0.05
     */

    /**
     * A `Number` that specifies per-body time scaling.
     *
     * @property timeScale
     * @type number
     * @default 1
     */

    /**
     * _Read only_. Updated during engine update.
     * 
     * A `Number` that records the last delta time value used to update this body.
     * Used to calculate speed and velocity.
     *
     * @readOnly
     * @property deltaTime
     * @type number
     * @default 1000 / 60
     */

    /**
     * An `Object` that defines the rendering properties to be consumed by the module `Matter.Render`.
     *
     * @property render
     * @type object
     */

    /**
     * A flag that indicates if the body should be rendered.
     *
     * @property render.visible
     * @type boolean
     * @default true
     */

    /**
     * Sets the opacity to use when rendering.
     *
     * @property render.opacity
     * @type number
     * @default 1
    */

    /**
     * An `Object` that defines the sprite properties to use when rendering, if any.
     *
     * @property render.sprite
     * @type object
     */

    /**
     * An `String` that defines the path to the image to use as the sprite texture, if any.
     *
     * @property render.sprite.texture
     * @type string
     */
     
    /**
     * A `Number` that defines the scaling in the x-axis for the sprite, if any.
     *
     * @property render.sprite.xScale
     * @type number
     * @default 1
     */

    /**
     * A `Number` that defines the scaling in the y-axis for the sprite, if any.
     *
     * @property render.sprite.yScale
     * @type number
     * @default 1
     */

    /**
      * A `Number` that defines the offset in the x-axis for the sprite (normalised by texture width).
      *
      * @property render.sprite.xOffset
      * @type number
      * @default 0
      */

    /**
      * A `Number` that defines the offset in the y-axis for the sprite (normalised by texture height).
      *
      * @property render.sprite.yOffset
      * @type number
      * @default 0
      */

    /**
     * A `Number` that defines the line width to use when rendering the body outline (if a sprite is not defined).
     * A value of `0` means no outline will be rendered.
     *
     * @property render.lineWidth
     * @type number
     * @default 0
     */

    /**
     * A `String` that defines the fill style to use when rendering the body (if a sprite is not defined).
     * It is the same as when using a canvas, so it accepts CSS style property values.
     *
     * @property render.fillStyle
     * @type string
     * @default a random colour
     */

    /**
     * A `String` that defines the stroke style to use when rendering the body outline (if a sprite is not defined).
     * It is the same as when using a canvas, so it accepts CSS style property values.
     *
     * @property render.strokeStyle
     * @type string
     * @default a random colour
     */

    /**
     * _Read only_. Calculated automatically when vertices are set.
     * 
     * An array of unique axis vectors (edge normals) used for collision detection.
     * These are automatically calculated when vertices are set.
     * They are constantly updated by `Body.update` during the simulation.
     *
     * @readOnly
     * @property axes
     * @type vector[]
     */
     
    /**
     * _Read only_. Calculated automatically when vertices are set.
     * 
     * A `Number` that measures the area of the body's convex hull.
     * 
     * @readOnly
     * @property area
     * @type string
     * @default 
     */

    /**
     * A `Bounds` object that defines the AABB region for the body.
     * It is automatically calculated when vertices are set and constantly updated by `Body.update` during simulation.
     * 
     * @property bounds
     * @type bounds
     */

    /**
     * Temporarily may hold parameters to be passed to `Vertices.chamfer` where supported by external functions.
     * 
     * See `Vertices.chamfer` for possible parameters this object may hold.
     * 
     * Currently only functions inside `Matter.Bodies` provide a utility using this property as a vertices pre-processing option.
     * 
     * Alternatively consider using `Vertices.chamfer` directly on vertices before passing them to a body creation function.
     * 
     * @property chamfer
     * @type object|null|undefined
     */

})();

// Sleeping requires Body back. Requiring it before the IIFE above makes that a
// circular require WHILE Body is still empty, and Node's CommonJS loader then
// gives Body's exports a temporary warning-proxy prototype for the rest of this
// file's load. Every `Body.x = ...` store above would take the generic
// [[Set]] path, and V8 drops an object built that way to dictionary mode at
// around its 20th property, so every `Body.update` / `Body._baseDelta` load in
// the engine became a generic LoadIC. Bundled builds were never affected; only
// a source load through Node (every A/B bench) was. `npm run audit-shapes`
// fails on any Matter module object in dictionary mode.
Sleeping = __webpack_require__(7);


/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Events` module contains methods to fire and listen to events on other objects.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Events
*/

var Events = {};

module.exports = Events;

var Common = __webpack_require__(0);

(function() {

    Events._hasOwn = Object.prototype.hasOwnProperty;

    /**
     * Subscribes a callback function to the given object's `eventName`.
     * @method on
     * @param {} object
     * @param {string} eventNames
     * @param {function} callback
     */
    Events.on = function(object, eventNames, callback) {
        var names = eventNames.split(' '),
            name;

        for (var i = 0; i < names.length; i++) {
            name = names[i];
            object.events = object.events || {};
            object.events[name] = object.events[name] || [];
            object.events[name].push(callback);
        }

        return callback;
    };

    /**
     * Removes the given event callback. If no callback, clears all callbacks in `eventNames`. If no `eventNames`, clears all events.
     * @method off
     * @param {} object
     * @param {string} eventNames
     * @param {function} callback
     */
    Events.off = function(object, eventNames, callback) {
        if (!eventNames) {
            object.events = {};
            return;
        }

        // handle Events.off(object, callback)
        if (typeof eventNames === 'function') {
            callback = eventNames;
            eventNames = Common.keys(object.events).join(' ');
        }

        var names = eventNames.split(' ');

        for (var i = 0; i < names.length; i++) {
            var callbacks = object.events[names[i]],
                newCallbacks = [];

            if (callback && callbacks) {
                for (var j = 0; j < callbacks.length; j++) {
                    if (callbacks[j] !== callback)
                        newCallbacks.push(callbacks[j]);
                }
            }

            object.events[names[i]] = newCallbacks;
        }
    };

    /**
     * Fires all the callbacks subscribed to the given object's `eventName`, in the order they subscribed, if any.
     * @method trigger
     * @param {} object
     * @param {string} eventNames
     * @param {} event
     */
    Events.trigger = function(object, eventNames, event) {
        var names,
            name,
            callbacks,
            eventClone;

        var events = object.events;

        if (!events) {
            return;
        }

        // a single event name, which is every trigger inside the library:
        // no split and no key list built only to test for emptiness. Events.on
        // only ever writes own properties, so an own entry here is exactly
        // the case the general path below reaches with a non-empty key list
        if (eventNames.indexOf(' ') === -1) {
            callbacks = events[eventNames];

            if (callbacks && callbacks.length > 0 && Events._hasOwn.call(events, eventNames)) {
                eventClone = Common.clone(event || {}, false);
                eventClone.name = eventNames;
                eventClone.source = object;

                for (var k = 0; k < callbacks.length; k++) {
                    callbacks[k].apply(object, [eventClone]);
                }
            }

            return;
        }

        if (Common.keys(events).length > 0) {
            if (!event)
                event = {};

            names = eventNames.split(' ');

            for (var i = 0; i < names.length; i++) {
                name = names[i];
                callbacks = events[name];

                if (callbacks) {
                    eventClone = Common.clone(event, false);
                    eventClone.name = name;
                    eventClone.source = object;

                    for (var j = 0; j < callbacks.length; j++) {
                        callbacks[j].apply(object, [eventClone]);
                    }
                }
            }
        }
    };

})();


/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

/**
* A composite is a collection of `Matter.Body`, `Matter.Constraint` and other `Matter.Composite` objects.
*
* They are a container that can represent complex objects made of multiple parts, even if they are not physically connected.
* A composite could contain anything from a single body all the way up to a whole world.
* 
* When making any changes to composites, use the included functions rather than changing their properties directly.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Composite
*/

var Composite = {};

module.exports = Composite;

var Events = __webpack_require__(5);
var Common = __webpack_require__(0);
var Bounds = __webpack_require__(1);
var Body = __webpack_require__(4);

(function() {

    /**
     * Creates a new composite. The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properites section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} [options]
     * @return {composite} A new composite
     */
    Composite.create = function(options) {
        return Common.extend({ 
            id: Common.nextId(),
            type: 'composite',
            parent: null,
            isModified: false,
            bodies: [], 
            constraints: [], 
            composites: [],
            label: 'Composite',
            plugin: {},
            cache: {
                allBodies: null,
                allConstraints: null,
                allComposites: null
            },
            // whether `Engine.update` is holding `bodies` itself as the
            // update's body list (see Composite._ownBodies)
            _bodiesLent: false,
            // the body journal a grid detector reads instead of
            // walking every body (see Common._journalTouch): the bodies touched
            // since it last read, filled by index up to `_touchedCount`;
            // whether the list is complete; the stamp of the full walk that
            // started it, which a member carries in `body._sWalk`; the next
            // add's `body._sWorldIndex`, which keeps that sort key increasing
            // in body order; and the body count the recorded changes account
            // for, which a direct edit that never signalled does not match
            _touched: [],
            _touchedCount: 0,
            _journalLive: false,
            _memberGen: 0,
            _nextOrdinal: 0,
            _journalLength: 0,
            // Common._foreignWalks when the journal started, and the stamp of
            // the last full walk of this composite's own array: every body
            // carrying it in `_sWalk` is owned by this composite, which lets
            // the next walk skip reading `_sOwner` for it
            _journalForeignWalks: 0,
            _ownedGen: 0
        }, options);
    };

    /**
     * Sets the composite's `isModified` flag. 
     * If `updateParents` is true, all parents will be set (default: false).
     * If `updateChildren` is true, all children will be set (default: false).
     * @private
     * @method setModified
     * @param {composite} composite
     * @param {boolean} isModified
     * @param {boolean} [updateParents=false]
     * @param {boolean} [updateChildren=false]
     */
    Composite.setModified = function(composite, isModified, updateParents, updateChildren) {
        composite.isModified = isModified;

        // the body-set signal the mover classifications key on (see
        // Common._bodySetEpoch). Here and not in add / remove, because a
        // caller that edits `composite.bodies` directly signals only here.
        // For the same reason this is the change the body journal cannot
        // describe, so it switches the journal off until the next full walk
        // (the add and remove below record what they change and signal
        // through Composite._setModifiedJournaled instead)
        if (isModified) {
            Common._bodySetEpoch++;
            composite._journalLive = false;
        }

        if (isModified && composite.cache) {
            composite.cache.allBodies = null;
            composite.cache.allConstraints = null;
            composite.cache.allComposites = null;
        }

        if (updateParents && composite.parent) {
            Composite.setModified(composite.parent, isModified, updateParents, updateChildren);
        }

        if (updateChildren) {
            for (var i = 0; i < composite.composites.length; i++) {
                var childComposite = composite.composites[i];
                Composite.setModified(childComposite, isModified, updateParents, updateChildren);
            }
        }
    };

    /**
     * Marks the composite modified exactly as `setModified(composite, true,
     * true, false)` does, for a change this composite's body journal has
     * already recorded, so the journal stays live. Its parents are marked
     * through `setModified`, which switches theirs off: a change to a child
     * reorders a parent's `allBodies`, which no journal describes.
     * @private
     * @method _setModifiedJournaled
     * @param {composite} composite
     */
    Composite._setModifiedJournaled = function(composite) {
        composite.isModified = true;
        Common._bodySetEpoch++;

        if (composite.cache) {
            composite.cache.allBodies = null;
            composite.cache.allConstraints = null;
            composite.cache.allComposites = null;
        }

        if (composite.parent) {
            Composite.setModified(composite.parent, true, true, false);
        }
    };

    /**
     * Generic single or multi-add function. Adds a single or an array of body(s), constraint(s) or composite(s) to the given composite.
     * Triggers `beforeAdd` and `afterAdd` events on the `composite`.
     * @method add
     * @param {composite} composite
     * @param {object|array} object A single or an array of body(s), constraint(s) or composite(s)
     * @return {composite} The original composite with the objects added
     */
    Composite.add = function(composite, object) {
        var objects = [].concat(object);

        Events.trigger(composite, 'beforeAdd', { object: object });

        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];

            switch (obj.type) {

            case 'body':
                // skip adding compound parts
                if (obj.parent !== obj) {
                    Common.warn('Composite.add: skipped adding a compound body part (you must add its parent instead)');
                    break;
                }

                Composite.addBody(composite, obj);
                break;
            case 'constraint':
                Composite.addConstraint(composite, obj);
                break;
            case 'composite':
                Composite.addComposite(composite, obj);
                break;
            case 'mouseConstraint':
                Composite.addConstraint(composite, obj.constraint);
                break;

            }
        }

        Events.trigger(composite, 'afterAdd', { object: object });

        return composite;
    };

    /**
     * Generic remove function. Removes one or many body(s), constraint(s) or a composite(s) to the given composite.
     * Optionally searching its children recursively.
     * Triggers `beforeRemove` and `afterRemove` events on the `composite`.
     * @method remove
     * @param {composite} composite
     * @param {object|array} object
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the objects removed
     */
    Composite.remove = function(composite, object, deep) {
        var objects = [].concat(object);

        Events.trigger(composite, 'beforeRemove', { object: object });

        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];

            switch (obj.type) {

            case 'body':
                Composite.removeBody(composite, obj, deep);
                break;
            case 'constraint':
                Composite.removeConstraint(composite, obj, deep);
                break;
            case 'composite':
                Composite.removeComposite(composite, obj, deep);
                break;
            case 'mouseConstraint':
                Composite.removeConstraint(composite, obj.constraint);
                break;

            }
        }

        Events.trigger(composite, 'afterRemove', { object: object });

        return composite;
    };

    /**
     * Adds a composite to the given composite.
     * @private
     * @method addComposite
     * @param {composite} compositeA
     * @param {composite} compositeB
     * @return {composite} The original compositeA with the objects from compositeB added
     */
    Composite.addComposite = function(compositeA, compositeB) {
        compositeA.composites.push(compositeB);
        compositeB.parent = compositeA;
        Composite.setModified(compositeA, true, true, false);
        return compositeA;
    };

    /**
     * Removes a composite from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeComposite
     * @param {composite} compositeA
     * @param {composite} compositeB
     * @param {boolean} [deep=false]
     * @return {composite} The original compositeA with the composite removed
     */
    Composite.removeComposite = function(compositeA, compositeB, deep) {
        var position = Common.indexOf(compositeA.composites, compositeB);

        if (position !== -1) {
            var bodies = Composite.allBodies(compositeB);

            Composite.removeCompositeAt(compositeA, position);

            for (var i = 0; i < bodies.length; i++) {
                bodies[i].sleepCounter = 0;
            }
        }

        if (deep) {
            for (var i = 0; i < compositeA.composites.length; i++){
                Composite.removeComposite(compositeA.composites[i], compositeB, true);
            }
        }

        return compositeA;
    };

    /**
     * Removes a composite from the given composite.
     * @private
     * @method removeCompositeAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the composite removed
     */
    Composite.removeCompositeAt = function(composite, position) {
        composite.composites.splice(position, 1);
        Composite.setModified(composite, true, true, false);
        return composite;
    };

    /**
     * Gives the composite a private `bodies` array before it is changed in
     * place, if `Engine.update` is holding the current one.
     *
     * For a world with no child composites, `Engine.update` uses
     * `world.bodies` ITSELF as the update's body list, rather than the copy
     * `Composite.allBodies` builds after every change, and the detector keeps
     * it between updates. A listener that adds or removes a body during the
     * update would otherwise change that list under the update, where the
     * copy never changed: so the change goes to a fresh array and the update
     * finishes with the membership it started with, as it always did. Outside
     * an update the array is changed in place, and the change is signalled by
     * `Composite.setModified` (see Common._bodySetEpoch).
     * @private
     * @method _ownBodies
     * @param {composite} composite
     */
    Composite._ownBodies = function(composite) {
        if (composite._bodiesLent === true) {
            composite.bodies = composite.bodies.slice(0);
            composite._bodiesLent = false;
        }
    };

    /**
     * Adds a body to the given composite.
     * @private
     * @method addBody
     * @param {composite} composite
     * @param {body} body
     * @return {composite} The original composite with the body added
     */
    Composite.addBody = function(composite, body) {
        Composite._ownBodies(composite);
        composite.bodies.push(body);

        // a body changing owner: a member of another composite's journal (a
        // body in two composites) stops being recorded there, and its stamp,
        // which vouched for its old owner, is dropped (see _ownedGen)
        var previousOwner = body._sOwner;

        if (previousOwner !== composite) {
            if (previousOwner !== null && body._sWalk === previousOwner._memberGen) {
                previousOwner._journalLive = false;
            }
            body._sWalk = -1;
        }

        // record the add in the body journal (see Common._journalTouch). The
        // body goes on the END of the array, so the next ordinal keeps
        // `_sWorldIndex` increasing in body order. A body that is already a
        // member is going in TWICE, which no membership flag can describe
        if (composite._journalLive === true) {
            if (body._sOwner === composite && body._sWalk === composite._memberGen) {
                composite._journalLive = false;
            } else {
                body._sWalk = composite._memberGen;
                body._sWorldIndex = composite._nextOrdinal++;
                composite._journalLength++;
                Common._journalPush(composite, body);
            }
        }

        body._sOwner = composite;
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes a body from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeBody
     * @param {composite} composite
     * @param {body} body
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the body removed
     */
    Composite.removeBody = function(composite, body, deep) {
        var position = Common.indexOf(composite.bodies, body);

        if (position !== -1) {
            Composite.removeBodyAt(composite, position);
            body.sleepCounter = 0;

            // Drop any warmed position impulse the body was still carrying.
            //
            // `Resolver.postSolvePosition`'s scoped path keeps a persistent
            // carry list of bodies whose impulse is still decaying, so that a
            // body whose pair ended still finishes its decay without the
            // solver having to scan the whole world. Nothing in that list is
            // otherwise told when a body LEAVES the world, so a removed body
            // stayed in it, having its vertices translated and bounds
            // recomputed every step until the impulse decayed out (~90 steps).
            // The classic all-bodies path never touched an out-of-world body,
            // so this both restores that behaviour and stops the list filling
            // with dead bodies on a world with heavy removal churn.
            body.positionImpulse.x = 0;
            body.positionImpulse.y = 0;

            // Tell the grid broadphase this body left the world. It
            // notices a departure on its own by stamping bodies as it walks
            // them, but that cannot see a body removed and added back before
            // the next walk, which keeps its place in the static index while
            // its position in the body array (and so its place in bucket
            // order) changes. See Detector._staticIndexInsert.
            body._sDeparted = true;
        }

        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.removeBody(composite.composites[i], body, true);
            }
        }

        return composite;
    };

    /**
     * Removes a body from the given composite.
     * @private
     * @method removeBodyAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the body removed
     */
    Composite.removeBodyAt = function(composite, position) {
        var body = composite.bodies[position];

        Composite._ownBodies(composite);
        composite.bodies.splice(position, 1);
        Composite._journalRemoved(composite, body);
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Records in the body journal that `body` left `composite`, and ends its
     * membership (see Common._journalTouch). Removing a body the journal does
     * not hold as a member is a change it cannot describe, so it switches off.
     * @private
     * @method _journalRemoved
     * @param {composite} composite
     * @param {body} body
     */
    Composite._journalRemoved = function(composite, body) {
        if (composite._journalLive === true) {
            if (body._sOwner === composite && body._sWalk === composite._memberGen) {
                composite._journalLength--;
                Common._journalPush(composite, body);
            } else {
                composite._journalLive = false;
            }
        }

        if (body._sOwner === composite) {
            body._sOwner = null;
            body._sWalk = -1;
        }
    };

    /**
     * Removes every body in `bodies` from the given composite in ONE
     * order-preserving pass over its body array, with everything
     * `Composite.removeBody` does to each body it removes. For a caller
     * removing many bodies at once this is O(bodies in the composite) once,
     * where a `removeBody` per body is O(bodies) each. A body listed but not
     * in the composite is left alone; a body in the composite more than once
     * is removed every time. Does not search child composites, and does not
     * trigger the `beforeRemove` / `afterRemove` events.
     *
     * Prefer this to editing `composite.bodies` and calling
     * `Composite.setModified`: it records the removals in the body journal,
     * so a grid detector need not walk every body to find them.
     *
     * `bodies` may be `composite.bodies` itself, which empties the
     * composite. An entry that is not a body throws a `TypeError` before
     * anything is changed.
     * @method removeBodies
     * @param {composite} composite
     * @param {body[]} bodies
     * @return {composite} The original composite with the bodies removed
     */
    Composite.removeBodies = function(composite, bodies) {
        // the list read by the passes below must not be the array they
        // compact: `removeBodies(composite, composite.bodies)` would truncate
        // it under the pass that restores what it marked
        if (bodies === composite.bodies) {
            bodies = bodies.slice(0);
        }

        var bodiesLength = bodies.length,
            saved = Composite._removeSaved,
            i;

        if (bodiesLength === 0) {
            return composite;
        }

        // mark the listed bodies in `_sWalk` with values no walk ever
        // writes, keeping what each held: -2 for a journal member, -3 for
        // anything else, so the pass below can tell a removal the journal can
        // describe from one it cannot. A listed body that turns out not to be
        // here gets its value back afterwards, so a body in another world
        // keeps its membership there
        var isLive = composite._journalLive === true,
            memberGen = composite._memberGen;

        for (i = 0; i < bodiesLength; i++) {
            var listed = bodies[i];

            // not a body: undo the marks made so far before throwing, so a
            // bad list leaves every body as it was (a mark left behind reads
            // as 'listed' to every later call, which then removes the body)
            if (listed === null || typeof listed !== 'object' || typeof listed._sWalk !== 'number') {
                Composite._unmarkListed(bodies, i, saved);
                throw new TypeError('Matter.Composite.removeBodies: bodies[' + i + '] is not a body');
            }

            var walk = listed._sWalk;

            if (walk <= -2) {
                // listed twice: already marked
                saved[i] = 0;
                continue;
            }

            saved[i] = walk;
            listed._sWalk = isLive && listed._sOwner === composite && walk === memberGen ? -2 : -3;
        }

        Composite._ownBodies(composite);

        var worldBodies = composite.bodies,
            worldLength = worldBodies.length,
            removed = 0,
            write = 0;

        for (i = 0; i < worldLength; i++) {
            var body = worldBodies[i],
                mark = body._sWalk;

            if (mark > -2 || mark < -4) {
                worldBodies[write++] = body;
                continue;
            }

            removed++;

            // what Composite.removeBody does to a body it removes
            body.sleepCounter = 0;
            body.positionImpulse.x = 0;
            body.positionImpulse.y = 0;
            body._sDeparted = true;

            if (mark === -2) {
                composite._journalLength--;
                if (composite._journalLive === true) {
                    Common._journalPush(composite, body);
                }
            } else if (mark === -3) {
                composite._journalLive = false;
            }

            // -4: removed, and any later copy of it in the array goes too
            body._sWalk = -4;
        }

        if (worldBodies.length !== write) {
            worldBodies.length = write;
        }

        // a removed body ends its membership here, as in
        // Composite._journalRemoved; any other listed body (one that was not
        // here, or one owned by another composite) gets its stamp back, so
        // its membership there is untouched
        for (i = 0; i < bodiesLength; i++) {
            var gone = bodies[i],
                goneWalk = gone._sWalk;

            if (goneWalk === -4 && gone._sOwner === composite) {
                gone._sWalk = -1;
                gone._sOwner = null;
            } else if (goneWalk <= -2 && goneWalk >= -4) {
                gone._sWalk = saved[i];
            }

            saved[i] = 0;
        }

        if (removed > 0) {
            Composite._setModifiedJournaled(composite);
        }

        return composite;
    };

    // scratch for Composite.removeBodies: the `_sWalk` each listed body held
    Composite._removeSaved = [];

    /**
     * Gives the first `count` bodies of a `Composite.removeBodies` list
     * back the `_sWalk` it marked them over, for a call that stops before
     * removing anything. A body listed twice holds its mark once and is given
     * its value back by its first entry.
     * @private
     * @method _unmarkListed
     * @param {body[]} bodies
     * @param {number} count
     * @param {number[]} saved
     */
    Composite._unmarkListed = function(bodies, count, saved) {
        for (var i = 0; i < count; i++) {
            var listed = bodies[i];

            if (listed._sWalk === -2 || listed._sWalk === -3) {
                listed._sWalk = saved[i];
            }

            saved[i] = 0;
        }
    };

    /**
     * Adds a constraint to the given composite.
     * @private
     * @method addConstraint
     * @param {composite} composite
     * @param {constraint} constraint
     * @return {composite} The original composite with the constraint added
     */
    Composite.addConstraint = function(composite, constraint) {
        composite.constraints.push(constraint);
        // no body changed, so the body journal stays live
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes a constraint from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeConstraint
     * @param {composite} composite
     * @param {constraint} constraint
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the constraint removed
     */
    Composite.removeConstraint = function(composite, constraint, deep) {
        var position = Common.indexOf(composite.constraints, constraint);
        
        if (position !== -1) {
            Composite.removeConstraintAt(composite, position);
        }

        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.removeConstraint(composite.composites[i], constraint, true);
            }
        }

        return composite;
    };

    /**
     * Removes a body from the given composite.
     * @private
     * @method removeConstraintAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the constraint removed
     */
    Composite.removeConstraintAt = function(composite, position) {
        composite.constraints.splice(position, 1);
        // no body changed, so the body journal stays live
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes all bodies, constraints and composites from the given composite.
     * Optionally clearing its children recursively.
     * @method clear
     * @param {composite} composite
     * @param {boolean} keepStatic
     * @param {boolean} [deep=false]
     */
    Composite.clear = function(composite, keepStatic, deep) {
        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.clear(composite.composites[i], keepStatic, true);
            }
        }
        
        Composite._ownBodies(composite);

        // same reason as Composite.removeBody: a body leaving the world must not
        // stay in the resolver's warmed-impulse carry list
        for (var b = 0; b < composite.bodies.length; b++) {
            var clearedBody = composite.bodies[b];
            if (!keepStatic || !clearedBody.isStatic) {
                clearedBody.positionImpulse.x = 0;
                clearedBody.positionImpulse.y = 0;
                clearedBody._sDeparted = true;
            }
        }

        if (keepStatic) {
            composite.bodies = composite.bodies.filter(function(body) { return body.isStatic; });
        } else {
            composite.bodies.length = 0;
        }

        composite.constraints.length = 0;
        composite.composites.length = 0;

        Composite.setModified(composite, true, true, false);

        return composite;
    };

    /**
     * Returns all bodies in the given composite, including all bodies in its children, recursively.
     * @method allBodies
     * @param {composite} composite
     * @return {body[]} All the bodies
     */
    Composite.allBodies = function(composite) {
        if (composite.cache && composite.cache.allBodies) {
            return composite.cache.allBodies;
        }

        var bodies = [].concat(composite.bodies);

        for (var i = 0; i < composite.composites.length; i++)
            bodies = bodies.concat(Composite.allBodies(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allBodies = bodies;
        }

        return bodies;
    };

    /**
     * Returns all constraints in the given composite, including all constraints in its children, recursively.
     * @method allConstraints
     * @param {composite} composite
     * @return {constraint[]} All the constraints
     */
    Composite.allConstraints = function(composite) {
        if (composite.cache && composite.cache.allConstraints) {
            return composite.cache.allConstraints;
        }

        var constraints = [].concat(composite.constraints);

        for (var i = 0; i < composite.composites.length; i++)
            constraints = constraints.concat(Composite.allConstraints(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allConstraints = constraints;
        }

        return constraints;
    };

    /**
     * Returns all composites in the given composite, including all composites in its children, recursively.
     * @method allComposites
     * @param {composite} composite
     * @return {composite[]} All the composites
     */
    Composite.allComposites = function(composite) {
        if (composite.cache && composite.cache.allComposites) {
            return composite.cache.allComposites;
        }

        var composites = [].concat(composite.composites);

        for (var i = 0; i < composite.composites.length; i++)
            composites = composites.concat(Composite.allComposites(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allComposites = composites;
        }

        return composites;
    };

    /**
     * Searches the composite recursively for an object matching the type and id supplied, null if not found.
     * @method get
     * @param {composite} composite
     * @param {number} id
     * @param {string} type
     * @return {object} The requested object, if found
     */
    Composite.get = function(composite, id, type) {
        var objects,
            object;

        switch (type) {
        case 'body':
            objects = Composite.allBodies(composite);
            break;
        case 'constraint':
            objects = Composite.allConstraints(composite);
            break;
        case 'composite':
            objects = Composite.allComposites(composite).concat(composite);
            break;
        }

        if (!objects)
            return null;

        object = objects.filter(function(object) { 
            return object.id.toString() === id.toString(); 
        });

        return object.length === 0 ? null : object[0];
    };

    /**
     * Moves the given object(s) from compositeA to compositeB (equal to a remove followed by an add).
     * @method move
     * @param {compositeA} compositeA
     * @param {object[]} objects
     * @param {compositeB} compositeB
     * @return {composite} Returns compositeA
     */
    Composite.move = function(compositeA, objects, compositeB) {
        Composite.remove(compositeA, objects);
        Composite.add(compositeB, objects);
        return compositeA;
    };

    /**
     * Assigns new ids for all objects in the composite, recursively.
     * @method rebase
     * @param {composite} composite
     * @return {composite} Returns composite
     */
    Composite.rebase = function(composite) {
        var objects = Composite.allBodies(composite)
            .concat(Composite.allConstraints(composite))
            .concat(Composite.allComposites(composite));

        for (var i = 0; i < objects.length; i++) {
            objects[i].id = Common.nextId();
        }

        return composite;
    };

    /**
     * Translates all children in the composite by a given vector relative to their current positions, 
     * without imparting any velocity.
     * @method translate
     * @param {composite} composite
     * @param {vector} translation
     * @param {bool} [recursive=true]
     */
    Composite.translate = function(composite, translation, recursive) {
        var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            Body.translate(bodies[i], translation);
        }

        return composite;
    };

    /**
     * Rotates all children in the composite by a given angle about the given point, without imparting any angular velocity.
     * @method rotate
     * @param {composite} composite
     * @param {number} rotation
     * @param {vector} point
     * @param {bool} [recursive=true]
     */
    Composite.rotate = function(composite, rotation, point, recursive) {
        var cos = Math.cos(rotation),
            sin = Math.sin(rotation),
            bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + (dx * cos - dy * sin),
                y: point.y + (dx * sin + dy * cos)
            });

            Body.rotate(body, rotation);
        }

        return composite;
    };

    /**
     * Scales all children in the composite, including updating physical properties (mass, area, axes, inertia), from a world-space point.
     * @method scale
     * @param {composite} composite
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {vector} point
     * @param {bool} [recursive=true]
     */
    Composite.scale = function(composite, scaleX, scaleY, point, recursive) {
        var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + dx * scaleX,
                y: point.y + dy * scaleY
            });

            Body.scale(body, scaleX, scaleY);
        }

        return composite;
    };

    /**
     * Returns the union of the bounds of all of the composite's bodies.
     * @method bounds
     * @param {composite} composite The composite.
     * @returns {bounds} The composite bounds.
     */
    Composite.bounds = function(composite) {
        var bodies = Composite.allBodies(composite),
            vertices = [];

        for (var i = 0; i < bodies.length; i += 1) {
            var body = bodies[i];
            vertices.push(body.bounds.min, body.bounds.max);
        }

        return Bounds.create(vertices);
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired when a call to `Composite.add` is made, before objects have been added.
    *
    * @event beforeAdd
    * @param {} event An event object
    * @param {} event.object The object(s) to be added (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.add` is made, after objects have been added.
    *
    * @event afterAdd
    * @param {} event An event object
    * @param {} event.object The object(s) that have been added (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.remove` is made, before objects have been removed.
    *
    * @event beforeRemove
    * @param {} event An event object
    * @param {} event.object The object(s) to be removed (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.remove` is made, after objects have been removed.
    *
    * @event afterRemove
    * @param {} event An event object
    * @param {} event.object The object(s) that have been removed (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` uniquely identifying number generated in `Composite.create` by `Common.nextId`.
     *
     * @property id
     * @type number
     */

    /**
     * A `String` denoting the type of object.
     *
     * @property type
     * @type string
     * @default "composite"
     * @readOnly
     */

    /**
     * An arbitrary `String` name to help the user identify and manage composites.
     *
     * @property label
     * @type string
     * @default "Composite"
     */

    /**
     * A flag that specifies whether the composite has been modified during the current step.
     * This is automatically managed when bodies, constraints or composites are added or removed.
     *
     * @property isModified
     * @type boolean
     * @default false
     */

    /**
     * The `Composite` that is the parent of this composite. It is automatically managed by the `Matter.Composite` methods.
     *
     * @property parent
     * @type composite
     * @default null
     */

    /**
     * An array of `Body` that are _direct_ children of this composite.
     * To add or remove bodies you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allBodies` method.
     *
     * @property bodies
     * @type body[]
     * @default []
     */

    /**
     * An array of `Constraint` that are _direct_ children of this composite.
     * To add or remove constraints you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allConstraints` method.
     *
     * @property constraints
     * @type constraint[]
     * @default []
     */

    /**
     * An array of `Composite` that are _direct_ children of this composite.
     * To add or remove composites you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allComposites` method.
     *
     * @property composites
     * @type composite[]
     * @default []
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

    /**
     * An object used for storing cached results for performance reasons.
     * This is used internally only and is automatically managed.
     *
     * @private
     * @property cache
     * @type {}
     */

})();


/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Sleeping` module contains methods to manage the sleeping state of bodies.
*
* @class Sleeping
*/

var Sleeping = {};

module.exports = Sleeping;

var Body = __webpack_require__(4);
var Events = __webpack_require__(5);
var Common = __webpack_require__(0);

(function() {

    Sleeping._motionWakeThreshold = 0.18;
    Sleeping._motionSleepThreshold = 0.08;
    Sleeping._minBias = 0.9;

    /**
     * Puts bodies to sleep or wakes them up depending on their motion.
     * @method update
     * @param {body[]} bodies
     * @param {number} delta
     */
    Sleeping.update = function(bodies, delta) {
        var timeScale = delta / Common._baseDelta,
            motionSleepThreshold = Sleeping._motionSleepThreshold;
        
        // update bodies sleeping status
        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                speed = Body.getSpeed(body),
                angularSpeed = Body.getAngularSpeed(body),
                motion = speed * speed + angularSpeed * angularSpeed;

            // wake up bodies if they have a force applied
            if (body.force.x !== 0 || body.force.y !== 0) {
                Sleeping.set(body, false);
                continue;
            }

            var minMotion = Math.min(body.motion, motion),
                maxMotion = Math.max(body.motion, motion);
        
            // biased average motion estimation between frames
            body.motion = Sleeping._minBias * minMotion + (1 - Sleeping._minBias) * maxMotion;

            if (body.sleepThreshold > 0 && body.motion < motionSleepThreshold) {
                body.sleepCounter += 1;
                
                if (body.sleepCounter >= body.sleepThreshold / timeScale) {
                    Sleeping.set(body, true);
                }
            } else if (body.sleepCounter > 0) {
                body.sleepCounter -= 1;
            }
        }
    };

    /**
     * Given a set of colliding pairs, wakes the sleeping bodies involved.
     * @method afterCollisions
     * @param {pair[]} pairs
     */
    Sleeping.afterCollisions = function(pairs) {
        var motionSleepThreshold = Sleeping._motionSleepThreshold;

        // wake up bodies involved in collisions
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i];
            
            // don't wake inactive pairs
            if (!pair.isActive)
                continue;

            var collision = pair.collision,
                bodyA = collision.bodyA.parent, 
                bodyB = collision.bodyB.parent;
        
            // don't wake if at least one body is static
            if ((bodyA.isSleeping && bodyB.isSleeping) || bodyA.isStatic || bodyB.isStatic)
                continue;
        
            if (bodyA.isSleeping || bodyB.isSleeping) {
                var sleepingBody = (bodyA.isSleeping && !bodyA.isStatic) ? bodyA : bodyB,
                    movingBody = sleepingBody === bodyA ? bodyB : bodyA;

                if (!sleepingBody.isStatic && movingBody.motion > motionSleepThreshold) {
                    Sleeping.set(sleepingBody, false);
                }
            }
        }
    };
  
    /**
     * Set a body as sleeping or awake.
     * @method set
     * @param {body} body
     * @param {boolean} isSleeping
     */
    Sleeping.set = function(body, isSleeping) {
        var wasSleeping = body.isSleeping;

        if (wasSleeping !== isSleeping) {
            // invalidate the cached mover lists in Engine and the grid
            // broadphase (see Common._bodyStaticEpoch), and record the body in
            // its world's body journal (see Common._journalTouch). Recorded
            // before the flag flips, which is fine: the reader reads the flag
            // when it reads the journal
            Common._bodyStaticEpoch++;
            Common._journalTouch(body);

            // a real change of rest ends a grid promotion (see
            // Body._endPromotion)
            Body._endPromotion(body);

            // Engine clears force buffers for moving bodies only, so a force
            // applied while this body was asleep must be dropped here rather
            // than surviving into the step after it wakes
            body.force.x = 0;
            body.force.y = 0;
            body.torque = 0;
        }

        if (isSleeping) {
            // a sleeping body is not integrated, so bring bounds an engine
            // deferred up to date first, while velocity still holds what they
            // would have been padded by (see Body.setStatic)
            Body._updateStaleBounds(body);

            body.isSleeping = true;
            body.sleepCounter = body.sleepThreshold;

            body.positionImpulse.x = 0;
            body.positionImpulse.y = 0;

            body.positionPrev.x = body.position.x;
            body.positionPrev.y = body.position.y;

            body.anglePrev = body.angle;
            // zero the cached velocity so a resting body reads as stopped
            // even though Engine no longer recomputes its velocity each step
            body.velocity.x = 0;
            body.velocity.y = 0;
            body.speed = 0;
            body.angularSpeed = 0;
            body.motion = 0;

            if (!wasSleeping) {
                Events.trigger(body, 'sleepStart');
            }
        } else {
            body.isSleeping = false;
            body.sleepCounter = 0;

            if (wasSleeping) {
                Events.trigger(body, 'sleepEnd');
            }
        }
    };

})();


/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Collision` module contains methods for detecting collisions between a given pair of bodies.
*
* For efficient detection between a list of bodies, see `Matter.Detector` and `Matter.Query`.
*
* See `Matter.Engine` for collision events.
*
* @class Collision
*/

var Collision = {};

module.exports = Collision;

var Vertices = __webpack_require__(3);
var Pair = __webpack_require__(9);

(function() {
    var _supports = [];

    // Below this depth margin (world units) two box corners are treated as
    // LEVEL along a support direction, and `Collision._findSupportsBox` makes
    // the general search's own comparisons instead of reading the answer off
    // the axes. It must sit far above the float error of those comparisons
    // (~1e-11 at page coordinates) and far below any real corner separation
    // (a box is at least a pixel on a side).
    var _boxSupportTolerance = 1e-6;

    var _overlapAB = {
        overlap: 0,
        axis: null
    };

    var _overlapBA = {
        overlap: 0,
        axis: null
    };

    /**
     * Creates a new collision record.
     * @method create
     * @param {body} bodyA The first body part represented by the collision record
     * @param {body} bodyB The second body part represented by the collision record
     * @return {collision} A new collision record
     */
    Collision.create = function(bodyA, bodyB) {
        return { 
            pair: null,
            collided: false,
            bodyA: bodyA,
            bodyB: bodyB,
            parentA: bodyA.parent,
            parentB: bodyB.parent,
            depth: 0,
            normal: { x: 0, y: 0 },
            supports: [null, null],
            supportCount: 0
        };
    };

    /**
     * Detect collision between two bodies.
     * @method collides
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {pairs} [pairs] Optionally reuse collision records from existing pairs.
     * @return {collision|null} A collision record if detected, otherwise null
     */
    Collision.collides = function(bodyA, bodyB, pairs) {
        // both sides tagged by Body._updateBoxTag: the fused box-box test and
        // the closed-form support search replace the general polygon ones
        var isBoxPair = bodyA._boxCorners >= 0 && bodyB._boxCorners >= 0;

        if (isBoxPair) {
            Collision._overlapBoxes(_overlapAB, _overlapBA, bodyA, bodyB);

            // `_overlapBA` is not written when `_overlapAB` already separates
            if (_overlapAB.overlap <= 0 || _overlapBA.overlap <= 0) {
                return null;
            }
        } else {
            Collision._overlapAxes(_overlapAB, bodyA, bodyB.vertices, bodyA.axes);

            if (_overlapAB.overlap <= 0) {
                return null;
            }

            Collision._overlapAxes(_overlapBA, bodyB, bodyA.vertices, bodyB.axes);

            if (_overlapBA.overlap <= 0) {
                return null;
            }
        }

        // Reuse collision records for gc efficiency. The live pair's record is
        // probed out of the pairs structure's open-addressing record table
        // (see Pairs.create), which is authoritative: a key hit always means
        // the pair is live and the value is the record the rest of this
        // function overwrites in full. `Pairs.update` maintains the table, so
        // a miss means these bodies have no live pair and a fresh record is
        // built for them.
        var collision = null,
            pairId = 0;

        if (pairs) {
            var idA = bodyA.id,
                idB = bodyB.id;

            pairId = idA < idB ? idA * Pair._idShift + idB : idB * Pair._idShift + idA;

            var recordKeys = pairs._recordKeys,
                recordMask = pairs._recordMask,
                recordSlot = Pair.hash(idA, idB) & recordMask,
                recordKey;

            // linear probe to the first empty slot; deletion shifts entries
            // back rather than leaving tombstones, so every key walked is live
            while ((recordKey = recordKeys[recordSlot]) !== 0) {
                if (recordKey === pairId) {
                    collision = pairs._recordValues[recordSlot];
                    break;
                }

                recordSlot = (recordSlot + 1) & recordMask;
            }
        }

        if (collision === null) {
            collision = Collision.create(bodyA, bodyB);
            collision.collided = true;
            collision.bodyA = bodyA.id < bodyB.id ? bodyA : bodyB;
            collision.bodyB = bodyA.id < bodyB.id ? bodyB : bodyA;
            collision.parentA = collision.bodyA.parent;
            collision.parentB = collision.bodyB.parent;
        }

        bodyA = collision.bodyA;
        bodyB = collision.bodyB;

        var minOverlap;

        if (_overlapAB.overlap < _overlapBA.overlap) {
            minOverlap = _overlapAB;
        } else {
            minOverlap = _overlapBA;
        }

        var normal = collision.normal,
            supports = collision.supports,
            depth = minOverlap.overlap,
            minAxis = minOverlap.axis,
            normalX = minAxis.x,
            normalY = minAxis.y,
            deltaX = bodyB.position.x - bodyA.position.x,
            deltaY = bodyB.position.y - bodyA.position.y;

        // ensure normal is facing away from bodyA
        if (normalX * deltaX + normalY * deltaY >= 0) {
            normalX = -normalX;
            normalY = -normalY;
        }

        normal.x = normalX;
        normal.y = normalY;

        collision.depth = depth;

        // find support points, there is always either exactly one or two
        var supportsB = isBoxPair
                ? Collision._findSupportsBox(bodyA, bodyB, normal, 1)
                : Collision._findSupports(bodyA, bodyB, normal, 1),
            supportCount = 0;

        // find the supports from bodyB that are inside bodyA. Both points are
        // always tested against the same vertex set, so one fused walk shares
        // every edge's loads and deltas between them
        var containsB = Collision._containsPair(bodyA.vertices, supportsB[0], supportsB[1]);

        if ((containsB & 1) !== 0) {
            supports[supportCount++] = supportsB[0];
        }

        if ((containsB & 2) !== 0) {
            supports[supportCount++] = supportsB[1];
        }

        // find the supports from bodyA that are inside bodyB
        if (supportCount < 2) {
            var supportsA = isBoxPair
                ? Collision._findSupportsBox(bodyB, bodyA, normal, -1)
                : Collision._findSupports(bodyB, bodyA, normal, -1);

            if (supportCount === 0) {
                // nothing the first test can do takes the count to 2, so the
                // second test always runs and the fused walk is free here too
                var containsA = Collision._containsPair(bodyB.vertices, supportsA[0], supportsA[1]);

                if ((containsA & 1) !== 0) {
                    supports[supportCount++] = supportsA[0];
                }

                if ((containsA & 2) !== 0) {
                    supports[supportCount++] = supportsA[1];
                }
            } else {
                // entering with one support already, the second test can be
                // skipped outright, which beats sharing the walk with it
                if (Vertices.contains(bodyB.vertices, supportsA[0])) {
                    supports[supportCount++] = supportsA[0];
                }

                if (supportCount < 2 && Vertices.contains(bodyB.vertices, supportsA[1])) {
                    supports[supportCount++] = supportsA[1];
                }
            }
        }

        // account for the edge case of overlapping but no vertex containment
        if (supportCount === 0) {
            supports[supportCount++] = supportsB[0];
        }

        // update support count
        collision.supportCount = supportCount;

        return collision;
    };

    /**
     * The separating-axis test for two boxes (both tagged by
     * `Body._updateBoxTag`), fused over their four axes.
     *
     * The general test projects every corner of the other body onto each axis.
     * For a box that projection is closed form: centred on the body's
     * `position`, with radius `half0 * |axis . axis0| + half1 * |axis . axis1|`.
     * So the overlap on axis `i` of A is
     * `halfA_i + (halfB0 * |R[i][0]| + halfB1 * |R[i][1]|) - |delta . axisA_i|`,
     * where `R[i][j] = axisA_i . axisB_j` is shared by all four tests, and no
     * vertex is read at all.
     *
     * Writes the same `{ overlap, axis }` results two `_overlapAxes` calls
     * write: the same axis objects, the same tie rule (the lower axis index
     * wins a tie), and the same early out (`resultBA` is not written when
     * `resultAB` already separates). The overlap itself differs from the
     * general reduction in its last bits, because it is computed from
     * `position` and the half extents rather than from the vertices, so this is
     * a RE-BASELINE and not a bit-identical rewrite.
     *
     * A box never reads or fills the `_selfProjection` memo on this path; the
     * memo stays for every pair with a side that is not a box.
     * @method _overlapBoxes
     * @private
     * @param {object} resultAB B projected onto the axes of A
     * @param {object} resultBA A projected onto the axes of B
     * @param {body} bodyA
     * @param {body} bodyB
     */
    Collision._overlapBoxes = function(resultAB, resultBA, bodyA, bodyB) {
        var axesA = bodyA.axes,
            axesB = bodyB.axes,
            axisA0 = axesA[0],
            axisA1 = axesA[1],
            axisB0 = axesB[0],
            axisB1 = axesB[1],
            axisA0X = axisA0.x,
            axisA0Y = axisA0.y,
            axisA1X = axisA1.x,
            axisA1Y = axisA1.y,
            axisB0X = axisB0.x,
            axisB0Y = axisB0.y,
            axisB1X = axisB1.x,
            axisB1Y = axisB1.y,
            halfA0 = bodyA._boxHalf0,
            halfA1 = bodyA._boxHalf1,
            halfB0 = bodyB._boxHalf0,
            halfB1 = bodyB._boxHalf1,
            deltaX = bodyB.position.x - bodyA.position.x,
            deltaY = bodyB.position.y - bodyA.position.y,
            r00 = Math.abs(axisA0X * axisB0X + axisA0Y * axisB0Y),
            r01 = Math.abs(axisA0X * axisB1X + axisA0Y * axisB1Y),
            r10 = Math.abs(axisA1X * axisB0X + axisA1Y * axisB0Y),
            r11 = Math.abs(axisA1X * axisB1X + axisA1Y * axisB1Y),
            overlap0 = halfA0 + (halfB0 * r00 + halfB1 * r01) - Math.abs(deltaX * axisA0X + deltaY * axisA0Y),
            overlap1;

        if (overlap0 <= 0) {
            resultAB.axis = axisA0;
            resultAB.overlap = overlap0;
            return;
        }

        overlap1 = halfA1 + (halfB0 * r10 + halfB1 * r11) - Math.abs(deltaX * axisA1X + deltaY * axisA1Y);

        if (overlap1 < overlap0) {
            resultAB.axis = axisA1;
            resultAB.overlap = overlap1;

            if (overlap1 <= 0) {
                return;
            }
        } else {
            resultAB.axis = axisA0;
            resultAB.overlap = overlap0;
        }

        overlap0 = halfB0 + (halfA0 * r00 + halfA1 * r10) - Math.abs(deltaX * axisB0X + deltaY * axisB0Y);

        if (overlap0 <= 0) {
            resultBA.axis = axisB0;
            resultBA.overlap = overlap0;
            return;
        }

        overlap1 = halfB1 + (halfA0 * r01 + halfA1 * r11) - Math.abs(deltaX * axisB1X + deltaY * axisB1Y);

        if (overlap1 < overlap0) {
            resultBA.axis = axisB1;
            resultBA.overlap = overlap1;
        } else {
            resultBA.axis = axisB0;
            resultBA.overlap = overlap0;
        }
    };

    /**
     * Project a body's own vertices onto its own axes, memoised on the body.
     *
     * Both `Collision._overlapAxes` calls in `Collision.collides` pass the body
     * that OWNS the axes as the A side, so this reduction is pair-independent:
     * without a memo it is recomputed once per pair the body takes part in,
     * every step, and again next step even for a static whose vertices have not
     * moved.
     *
     * The result is packed flat into `body._sp` as
     * `[min0, max0, min1, max1, ...]`, one pair per axis, and is valid while
     * `body._spValid` is `true`. Every site that moves a vertex or changes the
     * axes clears that flag.
     * @method _selfProjection
     * @private
     * @param {body} body
     * @return {number[]} The filled `body._sp`
     */
    Collision._selfProjection = function(body) {
        var vertices = body.vertices,
            verticesLength = vertices.length,
            axes = body.axes,
            axesLength = axes.length,
            sp = body._sp,
            i;

        // `new Array(n)` on its own is HOLEY and reads slow, so fill it
        if (!sp || sp.length !== axesLength * 2) {
            sp = body._sp = new Array(axesLength * 2).fill(0);
        }

        // both branches below seed from vertex 0 and use the same comparison
        // structure and operand order the inline projections used, so the
        // memoised values are bit-identical to computing them in place
        if (verticesLength === 4) {
            var v0 = vertices[0], v1 = vertices[1], v2 = vertices[2], v3 = vertices[3],
                v0x = v0.x, v0y = v0.y, v1x = v1.x, v1y = v1.y,
                v2x = v2.x, v2y = v2.y, v3x = v3.x, v3y = v3.y;

            for (i = 0; i < axesLength; i++) {
                var quadAxis = axes[i],
                    quadAxisX = quadAxis.x,
                    quadAxisY = quadAxis.y,
                    q0 = v0x * quadAxisX + v0y * quadAxisY,
                    q1 = v1x * quadAxisX + v1y * quadAxisY,
                    q2 = v2x * quadAxisX + v2y * quadAxisY,
                    q3 = v3x * quadAxisX + v3y * quadAxisY,
                    quadMin = q0, quadMax = q0;

                if (q1 > quadMax) { quadMax = q1; } else if (q1 < quadMin) { quadMin = q1; }
                if (q2 > quadMax) { quadMax = q2; } else if (q2 < quadMin) { quadMin = q2; }
                if (q3 > quadMax) { quadMax = q3; } else if (q3 < quadMin) { quadMin = q3; }

                sp[i * 2] = quadMin;
                sp[i * 2 + 1] = quadMax;
            }

            body._spValid = true;
            return sp;
        }

        var firstX = vertices[0].x,
            firstY = vertices[0].y,
            dot,
            j;

        for (i = 0; i < axesLength; i++) {
            var selfAxis = axes[i],
                selfAxisX = selfAxis.x,
                selfAxisY = selfAxis.y,
                min = firstX * selfAxisX + firstY * selfAxisY,
                max = min;

            for (j = 1; j < verticesLength; j += 1) {
                dot = vertices[j].x * selfAxisX + vertices[j].y * selfAxisY;

                if (dot > max) {
                    max = dot;
                } else if (dot < min) {
                    min = dot;
                }
            }

            sp[i * 2] = min;
            sp[i * 2 + 1] = max;
        }

        body._spValid = true;
        return sp;
    };

    /**
     * Find the overlap between a body and a set of vertices along the body's axes.
     *
     * `bodyA` must be the body that owns `axes`: its side of the projection is
     * read from the `Collision._selfProjection` memo, which is indexed by the
     * body's own axis order.
     * @method _overlapAxes
     * @private
     * @param {object} result
     * @param {body} bodyA
     * @param {vertices} verticesB
     * @param {axes} axes
     */
    Collision._overlapAxes = function(result, bodyA, verticesB, axes) {
        var sp = bodyA._spValid ? bodyA._sp : Collision._selfProjection(bodyA),
            verticesBLength = verticesB.length,
            axesLength = axes.length,
            overlapMin = Number.MAX_VALUE,
            overlapAxisNumber = 0,
            overlap,
            overlapAB,
            overlapBA,
            dot,
            i,
            j;

        // unrolled fast path for the box/quad common case (the other body has
        // four vertices). min/max of a fixed set is order-independent, so this
        // produces bit-identical projections to the general loop below.
        if (verticesBLength === 4) {
            var b0 = verticesB[0], b1 = verticesB[1], b2 = verticesB[2], b3 = verticesB[3],
                b0x = b0.x, b0y = b0.y, b1x = b1.x, b1y = b1.y,
                b2x = b2.x, b2y = b2.y, b3x = b3.x, b3y = b3.y;

            for (i = 0; i < axesLength; i++) {
                var qAxis = axes[i],
                    qAxisX = qAxis.x,
                    qAxisY = qAxis.y,
                    qMinA = sp[i * 2],
                    qMaxA = sp[i * 2 + 1],
                    qb0 = b0x * qAxisX + b0y * qAxisY,
                    qb1 = b1x * qAxisX + b1y * qAxisY,
                    qb2 = b2x * qAxisX + b2y * qAxisY,
                    qb3 = b3x * qAxisX + b3y * qAxisY,
                    qMinB = qb0, qMaxB = qb0;

                if (qb1 > qMaxB) { qMaxB = qb1; } else if (qb1 < qMinB) { qMinB = qb1; }
                if (qb2 > qMaxB) { qMaxB = qb2; } else if (qb2 < qMinB) { qMinB = qb2; }
                if (qb3 > qMaxB) { qMaxB = qb3; } else if (qb3 < qMinB) { qMinB = qb3; }

                overlapAB = qMaxA - qMinB;
                overlapBA = qMaxB - qMinA;
                overlap = overlapAB < overlapBA ? overlapAB : overlapBA;

                if (overlap < overlapMin) {
                    overlapMin = overlap;
                    overlapAxisNumber = i;

                    if (overlap <= 0) {
                        break;
                    }
                }
            }

            result.axis = axes[overlapAxisNumber];
            result.overlap = overlapMin;
            return;
        }

        var verticesBX = verticesB[0].x,
            verticesBY = verticesB[0].y;

        for (i = 0; i < axesLength; i++) {
            var axis = axes[i],
                axisX = axis.x,
                axisY = axis.y,
                minA = sp[i * 2],
                maxA = sp[i * 2 + 1],
                minB = verticesBX * axisX + verticesBY * axisY,
                maxB = minB;

            for (j = 1; j < verticesBLength; j += 1) {
                dot = verticesB[j].x * axisX + verticesB[j].y * axisY;

                if (dot > maxB) {
                    maxB = dot;
                } else if (dot < minB) {
                    minB = dot;
                }
            }

            overlapAB = maxA - minB;
            overlapBA = maxB - minA;
            overlap = overlapAB < overlapBA ? overlapAB : overlapBA;

            if (overlap < overlapMin) {
                overlapMin = overlap;
                overlapAxisNumber = i;

                if (overlap <= 0) {
                    // can not be intersecting
                    break;
                }
            }
        }

        result.axis = axes[overlapAxisNumber];
        result.overlap = overlapMin;
    };

    /**
     * Finds supporting vertices given two bodies along a given direction using hill-climbing.
     * @method _findSupports
     * @private
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {vector} normal
     * @param {number} direction
     * @return [vector]
     */
    Collision._findSupports = function(bodyA, bodyB, normal, direction) {
        var vertices = bodyB.vertices,
            verticesLength = vertices.length,
            bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            normalX = normal.x * direction,
            normalY = normal.y * direction,
            vertexA = vertices[0],
            vertexB = vertexA,
            nearestDistance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y),
            vertexC,
            distance,
            j;

        // find deepest vertex relative to the axis
        for (j = 1; j < verticesLength; j += 1) {
            vertexB = vertices[j];
            distance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y);

            // convex hill-climbing
            if (distance < nearestDistance) {
                nearestDistance = distance;
                vertexA = vertexB;
            }
        }

        // adjacent vertices, wrapping at the ends (cheaper than a modulo and
        // selects the identical indices the modulo did)
        var vertexAIndex = vertexA.index,
            prevIndex = vertexAIndex === 0 ? verticesLength - 1 : vertexAIndex - 1,
            nextIndex = vertexAIndex + 1 === verticesLength ? 0 : vertexAIndex + 1;

        // measure next vertex
        vertexC = vertices[prevIndex];
        nearestDistance = normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y);

        // compare with previous vertex
        vertexB = vertices[nextIndex];
        if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y) < nearestDistance) {
            _supports[0] = vertexA;
            _supports[1] = vertexB;

            return _supports;
        }

        _supports[0] = vertexA;
        _supports[1] = vertexC;

        return _supports;
    };

    /**
     * The support search for a box (tagged by `Body._updateBoxTag`) in closed
     * form. It returns the SAME two vertex objects, in the SAME order, as
     * `Collision._findSupports`, so contacts, their identity matching in
     * `Pair.update`, and the solver's contact order are all unchanged.
     *
     * Along the search direction `n`, each side of axis `k` moves a corner
     * `half_k * (n . axis_k)` deeper, so the deepest corner is on the positive
     * side of both dot products, and its deeper neighbour is across the axis
     * whose side costs less depth (`margin_k = half_k * |n . axis_k|`). The
     * vertex a side pair names is read from `_boxCorners`.
     *
     * That reading is trusted only where the hill-climb's own float
     * comparisons cannot disagree with it. A margin under
     * `_boxSupportTolerance` is a tie the general search settles by
     * rounding and by vertex index, so there this makes the general search's
     * own comparisons on the two candidates alone. That is every contact whose
     * normal is this box's own face normal, where the two corners of the face
     * are level along it.
     * @method _findSupportsBox
     * @private
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {vector} normal
     * @param {number} direction
     * @return [vector]
     */
    Collision._findSupportsBox = function(bodyA, bodyB, normal, direction) {
        var axes = bodyB.axes,
            axis0 = axes[0],
            axis1 = axes[1],
            normalX = normal.x * direction,
            normalY = normal.y * direction,
            dot0 = normalX * axis0.x + normalY * axis0.y,
            dot1 = normalX * axis1.x + normalY * axis1.y,
            margin0 = bodyB._boxHalf0 * (dot0 < 0 ? -dot0 : dot0),
            margin1 = bodyB._boxHalf1 * (dot1 < 0 ? -dot1 : dot1),
            tolerance = _boxSupportTolerance,
            corners = bodyB._boxCorners,
            side0 = dot0 > 0 ? 1 : 0,
            side1 = dot1 > 0 ? 2 : 0,
            vertices = bodyB.vertices,
            deepestIndex,
            partnerIndex;

        if (margin0 > tolerance && margin1 > tolerance) {
            deepestIndex = (corners >> ((side0 | side1) << 1)) & 3;

            if (margin0 + tolerance < margin1) {
                partnerIndex = (corners >> (((side0 ^ 1) | side1) << 1)) & 3;
            } else if (margin1 + tolerance < margin0) {
                partnerIndex = (corners >> ((side0 | (side1 ^ 2)) << 1)) & 3;
            } else {
                // both neighbours are level with each other
                return Collision._supportsBesideDeepest(bodyA, vertices, deepestIndex, normalX, normalY);
            }

            _supports[0] = vertices[deepestIndex];
            _supports[1] = vertices[partnerIndex];

            return _supports;
        }

        if (margin1 > tolerance) {
            // the two corners across axis 0 are level
            return Collision._supportsFromLevelPair(bodyA, vertices,
                (corners >> (side1 << 1)) & 3, (corners >> ((1 | side1) << 1)) & 3, normalX, normalY);
        }

        if (margin0 > tolerance) {
            // the two corners across axis 1 are level
            return Collision._supportsFromLevelPair(bodyA, vertices,
                (corners >> (side0 << 1)) & 3, (corners >> ((side0 | 2) << 1)) & 3, normalX, normalY);
        }

        // both margins inside the tolerance: a box too small to reason about
        return Collision._findSupports(bodyA, bodyB, normal, direction);
    };

    /**
     * The general search's last step, verbatim, for a deepest vertex already
     * known: of its two neighbours, the next one wins only when strictly
     * deeper.
     * @method _supportsBesideDeepest
     * @private
     * @param {body} bodyA
     * @param {vertices} vertices
     * @param {number} deepestIndex
     * @param {number} normalX
     * @param {number} normalY
     * @return [vector]
     */
    Collision._supportsBesideDeepest = function(bodyA, vertices, deepestIndex, normalX, normalY) {
        var bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            vertexA = vertices[deepestIndex],
            vertexB = vertices[(deepestIndex + 1) & 3],
            vertexC = vertices[(deepestIndex + 3) & 3];

        _supports[0] = vertexA;

        if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y)
            < normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y)) {
            _supports[1] = vertexB;
        } else {
            _supports[1] = vertexC;
        }

        return _supports;
    };

    /**
     * Two level corners, one of which the general search picks as deepest and
     * the other as its partner. The search scans in index order and replaces
     * only on a strictly smaller distance, so the deeper one wins by the
     * search's own distance expression and the lower index wins an exact tie.
     * @method _supportsFromLevelPair
     * @private
     * @param {body} bodyA
     * @param {vertices} vertices
     * @param {number} indexA
     * @param {number} indexB
     * @param {number} normalX
     * @param {number} normalY
     * @return [vector]
     */
    Collision._supportsFromLevelPair = function(bodyA, vertices, indexA, indexB, normalX, normalY) {
        var bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            lower = vertices[indexA < indexB ? indexA : indexB],
            upper = vertices[indexA < indexB ? indexB : indexA];

        if (normalX * (bodyAPositionX - upper.x) + normalY * (bodyAPositionY - upper.y)
            < normalX * (bodyAPositionX - lower.x) + normalY * (bodyAPositionY - lower.y)) {
            _supports[0] = upper;
            _supports[1] = lower;
        } else {
            _supports[0] = lower;
            _supports[1] = upper;
        }

        return _supports;
    };

    /**
     * Tests TWO points against the same vertex set in one walk of its edges.
     *
     * Each edge contributes two terms that do not depend on the point being
     * tested, `nextVertex.y - vertex.y` and `vertex.x - nextVertex.x`, plus the
     * element and property loads that produce them. Testing the points
     * separately does all of that twice. A point drops out of the arithmetic on
     * the first edge it fails, exactly as `Vertices.contains` returns early, so
     * the per-point work is unchanged and only the shared edge setup is saved.
     * @method _containsPair
     * @private
     * @param {vertices} vertices
     * @param {vector} pointA
     * @param {vector} pointB
     * @return {number} Bit 1 set if `pointA` is inside, bit 2 if `pointB` is
     */
    Collision._containsPair = function(vertices, pointA, pointB) {
        var pointAX = pointA.x,
            pointAY = pointA.y,
            pointBX = pointB.x,
            pointBY = pointB.y,
            verticesLength = vertices.length,
            vertex = vertices[verticesLength - 1],
            vertexX = vertex.x,
            vertexY = vertex.y,
            inside = 3,
            nextVertex,
            nextVertexX,
            nextVertexY,
            edgeDeltaY,
            edgeDeltaX;

        for (var i = 0; i < verticesLength; i++) {
            nextVertex = vertices[i];
            nextVertexX = nextVertex.x;
            nextVertexY = nextVertex.y;
            // the two exact subexpressions `Vertices.contains` forms per edge
            edgeDeltaY = nextVertexY - vertexY;
            edgeDeltaX = vertexX - nextVertexX;

            if ((inside & 1) !== 0
                && (pointAX - vertexX) * edgeDeltaY + (pointAY - vertexY) * edgeDeltaX > 0) {
                inside &= ~1;

                if (inside === 0) {
                    return 0;
                }
            }

            if ((inside & 2) !== 0
                && (pointBX - vertexX) * edgeDeltaY + (pointBY - vertexY) * edgeDeltaX > 0) {
                inside &= ~2;

                if (inside === 0) {
                    return 0;
                }
            }

            vertexX = nextVertexX;
            vertexY = nextVertexY;
        }

        return inside;
    };

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * A reference to the pair using this collision record, if there is one.
     *
     * @property pair
     * @type {pair|null}
     * @default null
     */

    /**
     * A flag that indicates if the bodies were colliding when the collision was last updated.
     * 
     * @property collided
     * @type boolean
     * @default false
     */

    /**
     * The first body part represented by the collision (see also `collision.parentA`).
     * 
     * @property bodyA
     * @type body
     */

    /**
     * The second body part represented by the collision (see also `collision.parentB`).
     * 
     * @property bodyB
     * @type body
     */

    /**
     * The first body represented by the collision (i.e. `collision.bodyA.parent`).
     * 
     * @property parentA
     * @type body
     */

    /**
     * The second body represented by the collision (i.e. `collision.bodyB.parent`).
     * 
     * @property parentB
     * @type body
     */

    /**
     * A `Number` that represents the minimum separating distance between the bodies along the collision normal.
     *
     * @readOnly
     * @property depth
     * @type number
     * @default 0
     */

    /**
     * A normalised `Vector` that represents the direction between the bodies that provides the minimum separating distance.
     *
     * @property normal
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * An array of body vertices that represent the support points in the collision.
     * 
     * _Note:_ Only the first `collision.supportCount` items of `collision.supports` are active.
     * Therefore use `collision.supportCount` instead of `collision.supports.length` when iterating the active supports.
     * 
     * These are the deepest vertices (along the collision normal) of each body that are contained by the other body's vertices.
     *
     * @property supports
     * @type vector[]
     * @default []
     */

    /**
     * The number of active supports for this collision found in `collision.supports`.
     * 
     * _Note:_ Only the first `collision.supportCount` items of `collision.supports` are active.
     * Therefore use `collision.supportCount` instead of `collision.supports.length` when iterating the active supports.
     *
     * @property supportCount
     * @type number
     * @default 0
     */

})();


/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Pair` module contains methods for creating and manipulating collision pairs.
*
* @class Pair
*/

var Pair = {};

module.exports = Pair;

var Contact = __webpack_require__(16);

(function() {

    // Multiplier used by `Pair.id` to pack two body ids into one numeric key.
    // Keeps keys unique and exactly representable for integer body ids below it.
    Pair._idShift = 1 << 26;

    /**
     * Creates a pair.
     * @method create
     * @param {collision} collision
     * @param {number} timestamp
     * @return {pair} A new pair
     */
    Pair.create = function(collision, timestamp) {
        var bodyA = collision.bodyA,
            bodyB = collision.bodyB;

        var pair = {
            id: Pair.id(bodyA, bodyB),
            bodyA: bodyA,
            bodyB: bodyB,
            collision: collision,
            contacts: [Contact.create(), Contact.create()],
            contactCount: 0,
            separation: 0,
            isActive: true,
            isSensor: bodyA.isSensor || bodyB.isSensor,
            timeCreated: timestamp,
            timeUpdated: timestamp,
            inverseMass: 0,
            friction: 0,
            frictionStatic: 0,
            restitution: 0,
            slop: 0
        };

        Pair.update(pair, collision, timestamp);

        return pair;
    };

    /**
     * Updates a pair given a collision.
     * @method update
     * @param {pair} pair
     * @param {collision} collision
     * @param {number} timestamp
     */
    Pair.update = function(pair, collision, timestamp) {
        var supports = collision.supports,
            supportCount = collision.supportCount,
            contacts = pair.contacts,
            parentA = collision.parentA,
            parentB = collision.parentB;
        
        pair.isActive = true;
        pair.timeUpdated = timestamp;
        pair.collision = collision;
        pair.separation = collision.depth;
        pair.inverseMass = parentA.inverseMass + parentB.inverseMass;
        pair.friction = parentA.friction < parentB.friction ? parentA.friction : parentB.friction;
        pair.frictionStatic = parentA.frictionStatic > parentB.frictionStatic ? parentA.frictionStatic : parentB.frictionStatic;
        pair.restitution = parentA.restitution > parentB.restitution ? parentA.restitution : parentB.restitution;
        pair.slop = parentA.slop > parentB.slop ? parentA.slop : parentB.slop;

        pair.contactCount = supportCount;
        collision.pair = pair;

        var supportA = supports[0],
            contactA = contacts[0],
            supportB = supports[1],
            contactB = contacts[1];

        // match contacts to supports
        if (contactB.vertex === supportA || contactA.vertex === supportB) {
            contacts[1] = contactA;
            contacts[0] = contactA = contactB;
            contactB = contacts[1];
        }

        // update contacts
        contactA.vertex = supportA;
        contactB.vertex = supportB;
    };
    
    /**
     * Set a pair as active or inactive.
     * @method setActive
     * @param {pair} pair
     * @param {bool} isActive
     * @param {number} timestamp
     */
    Pair.setActive = function(pair, isActive, timestamp) {
        if (isActive) {
            pair.isActive = true;
            pair.timeUpdated = timestamp;
        } else {
            pair.isActive = false;
            pair.contactCount = 0;
        }
    };

    /**
     * Get the id for the given pair.
     * @method id
     * @param {body} bodyA
     * @param {body} bodyB
     * @return {number} Unique pairId
     */
    Pair.id = function(bodyA, bodyB) {
        // Numeric composite key into the pairs table `Map`. Avoids the string
        // allocation a string key would force on every broadphase lookup.
        // Assumes integer body ids below `Pair._idShift` (engine-assigned ids).
        return bodyA.id < bodyB.id
            ? bodyA.id * Pair._idShift + bodyB.id
            : bodyB.id * Pair._idShift + bodyA.id;
    };

    /**
     * Hashes the two body ids of a pair for the collision record table (see
     * `Pairs.create`). Mixes both ids: the packed `Pair.id` has the lower id
     * entirely in its high bits, so masking it directly would drop every pair a
     * body has into one slot. Sorts before mixing, because the mix is
     * asymmetric and callers cannot all guarantee the same argument order.
     * @method hash
     * @param {number} idA
     * @param {number} idB
     * @return {number} An order-independent hash of the id pair
     */
    Pair.hash = function(idA, idB) {
        if (idB < idA) {
            var swap = idA;
            idA = idB;
            idB = swap;
        }

        var mixed = (Math.imul(idA, 0x9E3779B1) ^ Math.imul(idB, 0x85EBCA77)) | 0;
        return (mixed ^ (mixed >>> 15)) | 0;
    };

})();


/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Constraint` module contains methods for creating and manipulating constraints.
* Constraints are used for specifying that a fixed distance must be maintained between two bodies (or a body and a fixed world-space position).
* The stiffness of constraints can be modified to create springs or elastic.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Constraint
*/

var Constraint = {};

module.exports = Constraint;

var Vertices = __webpack_require__(3);
var Vector = __webpack_require__(2);
var Sleeping = __webpack_require__(7);
var Bounds = __webpack_require__(1);
var Axes = __webpack_require__(11);
var Common = __webpack_require__(0);

(function() {

    Constraint._warming = 0.4;
    Constraint._torqueDampen = 1;
    Constraint._minLength = 0.000001;

    /**
     * Creates a new constraint.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * To simulate a revolute constraint (or pin joint) set `length: 0` and a high `stiffness` value (e.g. `0.7` or above).
     * If the constraint is unstable, try lowering the `stiffness` value and / or increasing `engine.constraintIterations`.
     * For compound bodies, constraints must be applied to the parent body (not one of its parts).
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} options
     * @return {constraint} constraint
     */
    Constraint.create = function(options) {
        var constraint = options;

        // if bodies defined but no points, use body centre
        if (constraint.bodyA && !constraint.pointA)
            constraint.pointA = { x: 0, y: 0 };
        if (constraint.bodyB && !constraint.pointB)
            constraint.pointB = { x: 0, y: 0 };

        // calculate static length using initial world space points
        var initialPointA = constraint.bodyA ? Vector.add(constraint.bodyA.position, constraint.pointA) : constraint.pointA,
            initialPointB = constraint.bodyB ? Vector.add(constraint.bodyB.position, constraint.pointB) : constraint.pointB,
            length = Vector.magnitude(Vector.sub(initialPointA, initialPointB));
    
        constraint.length = typeof constraint.length !== 'undefined' ? constraint.length : length;

        // option defaults
        constraint.id = constraint.id || Common.nextId();
        constraint.label = constraint.label || 'Constraint';
        constraint.type = 'constraint';
        constraint.stiffness = constraint.stiffness || (constraint.length > 0 ? 1 : 0.7);
        constraint.damping = constraint.damping || 0;
        constraint.angularStiffness = constraint.angularStiffness || 0;
        constraint.angleA = constraint.bodyA ? constraint.bodyA.angle : constraint.angleA;
        constraint.angleB = constraint.bodyB ? constraint.bodyB.angle : constraint.angleB;
        constraint.plugin = {};

        // render
        var render = {
            visible: true,
            lineWidth: 2,
            strokeStyle: '#ffffff',
            type: 'line',
            anchors: true
        };

        if (constraint.length === 0 && constraint.stiffness > 0.1) {
            render.type = 'pin';
            render.anchors = false;
        } else if (constraint.stiffness < 0.9) {
            render.type = 'spring';
        }

        constraint.render = Common.extend(render, constraint.render);

        return constraint;
    };

    /**
     * Prepares for solving by constraint warming.
     * @private
     * @method preSolveAll
     * @param {body[]} bodies
     */
    Constraint.preSolveAll = function(bodies) {
        for (var i = 0; i < bodies.length; i += 1) {
            var body = bodies[i],
                impulse = body.constraintImpulse;

            if (body.isStatic || (impulse.x === 0 && impulse.y === 0 && impulse.angle === 0)) {
                continue;
            }

            body.position.x += impulse.x;
            body.position.y += impulse.y;
            body.angle += impulse.angle;
        }
    };

    /**
     * Solves all constraints in a list of collisions.
     * @private
     * @method solveAll
     * @param {constraint[]} constraints
     * @param {number} delta
     */
    Constraint.solveAll = function(constraints, delta) {
        var timeScale = Common.clamp(delta / Common._baseDelta, 0, 1);

        // Solve fixed constraints first.
        for (var i = 0; i < constraints.length; i += 1) {
            var constraint = constraints[i],
                fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic),
                fixedB = !constraint.bodyB || (constraint.bodyB && constraint.bodyB.isStatic);

            if (fixedA || fixedB) {
                Constraint.solve(constraints[i], timeScale);
            }
        }

        // Solve free constraints last.
        for (i = 0; i < constraints.length; i += 1) {
            constraint = constraints[i];
            fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
            fixedB = !constraint.bodyB || (constraint.bodyB && constraint.bodyB.isStatic);

            if (!fixedA && !fixedB) {
                Constraint.solve(constraints[i], timeScale);
            }
        }
    };

    /**
     * Solves a distance constraint with Gauss-Siedel method.
     * @private
     * @method solve
     * @param {constraint} constraint
     * @param {number} timeScale
     */
    Constraint.solve = function(constraint, timeScale) {
        var bodyA = constraint.bodyA,
            bodyB = constraint.bodyB,
            pointA = constraint.pointA,
            pointB = constraint.pointB;

        if (!bodyA && !bodyB)
            return;

        // update reference angle
        if (bodyA && !bodyA.isStatic) {
            Vector.rotate(pointA, bodyA.angle - constraint.angleA, pointA);
            constraint.angleA = bodyA.angle;
        }
        
        // update reference angle
        if (bodyB && !bodyB.isStatic) {
            Vector.rotate(pointB, bodyB.angle - constraint.angleB, pointB);
            constraint.angleB = bodyB.angle;
        }

        var pointAWorld = pointA,
            pointBWorld = pointB;

        if (bodyA) pointAWorld = Vector.add(bodyA.position, pointA);
        if (bodyB) pointBWorld = Vector.add(bodyB.position, pointB);

        if (!pointAWorld || !pointBWorld)
            return;

        var delta = Vector.sub(pointAWorld, pointBWorld),
            currentLength = Vector.magnitude(delta);

        // prevent singularity
        if (currentLength < Constraint._minLength) {
            currentLength = Constraint._minLength;
        }

        // solve distance constraint with Gauss-Siedel method
        var difference = (currentLength - constraint.length) / currentLength,
            isRigid = constraint.stiffness >= 1 || constraint.length === 0,
            stiffness = isRigid ? constraint.stiffness * timeScale 
                : constraint.stiffness * timeScale * timeScale,
            damping = constraint.damping * timeScale,
            force = Vector.mult(delta, difference * stiffness),
            massTotal = (bodyA ? bodyA.inverseMass : 0) + (bodyB ? bodyB.inverseMass : 0),
            inertiaTotal = (bodyA ? bodyA.inverseInertia : 0) + (bodyB ? bodyB.inverseInertia : 0),
            resistanceTotal = massTotal + inertiaTotal,
            torque,
            share,
            normal,
            normalVelocity,
            relativeVelocity;
    
        if (damping > 0) {
            var zero = Vector.create();
            normal = Vector.div(delta, currentLength);

            relativeVelocity = Vector.sub(
                bodyB && Vector.sub(bodyB.position, bodyB.positionPrev) || zero,
                bodyA && Vector.sub(bodyA.position, bodyA.positionPrev) || zero
            );

            normalVelocity = Vector.dot(normal, relativeVelocity);
        }

        if (bodyA && !bodyA.isStatic) {
            share = bodyA.inverseMass / massTotal;

            // keep track of applied impulses for post solving
            bodyA.constraintImpulse.x -= force.x * share;
            bodyA.constraintImpulse.y -= force.y * share;

            // apply forces
            bodyA.position.x -= force.x * share;
            bodyA.position.y -= force.y * share;

            // apply damping
            if (damping > 0) {
                bodyA.positionPrev.x -= damping * normal.x * normalVelocity * share;
                bodyA.positionPrev.y -= damping * normal.y * normalVelocity * share;
            }

            // apply torque
            torque = (Vector.cross(pointA, force) / resistanceTotal) * Constraint._torqueDampen * bodyA.inverseInertia * (1 - constraint.angularStiffness);
            bodyA.constraintImpulse.angle -= torque;
            bodyA.angle -= torque;
        }

        if (bodyB && !bodyB.isStatic) {
            share = bodyB.inverseMass / massTotal;

            // keep track of applied impulses for post solving
            bodyB.constraintImpulse.x += force.x * share;
            bodyB.constraintImpulse.y += force.y * share;
            
            // apply forces
            bodyB.position.x += force.x * share;
            bodyB.position.y += force.y * share;

            // apply damping
            if (damping > 0) {
                bodyB.positionPrev.x += damping * normal.x * normalVelocity * share;
                bodyB.positionPrev.y += damping * normal.y * normalVelocity * share;
            }

            // apply torque
            torque = (Vector.cross(pointB, force) / resistanceTotal) * Constraint._torqueDampen * bodyB.inverseInertia * (1 - constraint.angularStiffness);
            bodyB.constraintImpulse.angle += torque;
            bodyB.angle += torque;
        }

    };

    /**
     * Performs body updates required after solving constraints.
     * @private
     * @method postSolveAll
     * @param {body[]} bodies
     */
    Constraint.postSolveAll = function(bodies) {
        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                impulse = body.constraintImpulse;

            if (body.isStatic || (impulse.x === 0 && impulse.y === 0 && impulse.angle === 0)) {
                continue;
            }

            Sleeping.set(body, false);

            // update geometry and reset
            for (var j = 0; j < body.parts.length; j++) {
                var part = body.parts[j];
                
                Vertices.translate(part.vertices, impulse);

                if (j > 0) {
                    part.position.x += impulse.x;
                    part.position.y += impulse.y;
                }

                if (impulse.angle !== 0) {
                    Vertices.rotate(part.vertices, impulse.angle, body.position);
                    Axes.rotate(part.axes, impulse.angle);
                    if (j > 0) {
                        Vector.rotateAbout(part.position, impulse.angle, body.position, part.position);
                    }
                }

                Bounds.update(part.bounds, part.vertices, body.velocity);
            }

            // dampen the cached impulse for warming next step
            impulse.angle *= Constraint._warming;
            impulse.x *= Constraint._warming;
            impulse.y *= Constraint._warming;
        }
    };

    /**
     * Returns the world-space position of `constraint.pointA`, accounting for `constraint.bodyA`.
     * @method pointAWorld
     * @param {constraint} constraint
     * @returns {vector} the world-space position
     */
    Constraint.pointAWorld = function(constraint) {
        return {
            x: (constraint.bodyA ? constraint.bodyA.position.x : 0) 
                + (constraint.pointA ? constraint.pointA.x : 0),
            y: (constraint.bodyA ? constraint.bodyA.position.y : 0) 
                + (constraint.pointA ? constraint.pointA.y : 0)
        };
    };

    /**
     * Returns the world-space position of `constraint.pointB`, accounting for `constraint.bodyB`.
     * @method pointBWorld
     * @param {constraint} constraint
     * @returns {vector} the world-space position
     */
    Constraint.pointBWorld = function(constraint) {
        return {
            x: (constraint.bodyB ? constraint.bodyB.position.x : 0) 
                + (constraint.pointB ? constraint.pointB.x : 0),
            y: (constraint.bodyB ? constraint.bodyB.position.y : 0) 
                + (constraint.pointB ? constraint.pointB.y : 0)
        };
    };

    /**
     * Returns the current length of the constraint. 
     * This is the distance between both of the constraint's end points.
     * See `constraint.length` for the target rest length.
     * @method currentLength
     * @param {constraint} constraint
     * @returns {number} the current length
     */
    Constraint.currentLength = function(constraint) {
        var pointAX = (constraint.bodyA ? constraint.bodyA.position.x : 0) 
            + (constraint.pointA ? constraint.pointA.x : 0);

        var pointAY = (constraint.bodyA ? constraint.bodyA.position.y : 0) 
            + (constraint.pointA ? constraint.pointA.y : 0);

        var pointBX = (constraint.bodyB ? constraint.bodyB.position.x : 0) 
            + (constraint.pointB ? constraint.pointB.x : 0);
            
        var pointBY = (constraint.bodyB ? constraint.bodyB.position.y : 0) 
            + (constraint.pointB ? constraint.pointB.y : 0);

        var deltaX = pointAX - pointBX;
        var deltaY = pointAY - pointBY;

        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    };

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` uniquely identifying number generated in `Composite.create` by `Common.nextId`.
     *
     * @property id
     * @type number
     */

    /**
     * A `String` denoting the type of object.
     *
     * @property type
     * @type string
     * @default "constraint"
     * @readOnly
     */

    /**
     * An arbitrary `String` name to help the user identify and manage bodies.
     *
     * @property label
     * @type string
     * @default "Constraint"
     */

    /**
     * An `Object` that defines the rendering properties to be consumed by the module `Matter.Render`.
     *
     * @property render
     * @type object
     */

    /**
     * A flag that indicates if the constraint should be rendered.
     *
     * @property render.visible
     * @type boolean
     * @default true
     */

    /**
     * A `Number` that defines the line width to use when rendering the constraint outline.
     * A value of `0` means no outline will be rendered.
     *
     * @property render.lineWidth
     * @type number
     * @default 2
     */

    /**
     * A `String` that defines the stroke style to use when rendering the constraint outline.
     * It is the same as when using a canvas, so it accepts CSS style property values.
     *
     * @property render.strokeStyle
     * @type string
     * @default a random colour
     */

    /**
     * A `String` that defines the constraint rendering type. 
     * The possible values are 'line', 'pin', 'spring'.
     * An appropriate render type will be automatically chosen unless one is given in options.
     *
     * @property render.type
     * @type string
     * @default 'line'
     */

    /**
     * A `Boolean` that defines if the constraint's anchor points should be rendered.
     *
     * @property render.anchors
     * @type boolean
     * @default true
     */

    /**
     * The first possible `Body` that this constraint is attached to.
     *
     * @property bodyA
     * @type body
     * @default null
     */

    /**
     * The second possible `Body` that this constraint is attached to.
     *
     * @property bodyB
     * @type body
     * @default null
     */

    /**
     * A `Vector` that specifies the offset of the constraint from center of the `constraint.bodyA` if defined, otherwise a world-space position.
     *
     * @property pointA
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Vector` that specifies the offset of the constraint from center of the `constraint.bodyB` if defined, otherwise a world-space position.
     *
     * @property pointB
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Number` that specifies the stiffness of the constraint, i.e. the rate at which it returns to its resting `constraint.length`.
     * A value of `1` means the constraint should be very stiff.
     * A value of `0.2` means the constraint acts like a soft spring.
     *
     * @property stiffness
     * @type number
     * @default 1
     */

    /**
     * A `Number` that specifies the damping of the constraint, 
     * i.e. the amount of resistance applied to each body based on their velocities to limit the amount of oscillation.
     * Damping will only be apparent when the constraint also has a very low `stiffness`.
     * A value of `0.1` means the constraint will apply heavy damping, resulting in little to no oscillation.
     * A value of `0` means the constraint will apply no damping.
     *
     * @property damping
     * @type number
     * @default 0
     */

    /**
     * A `Number` that specifies the target resting length of the constraint. 
     * It is calculated automatically in `Constraint.create` from initial positions of the `constraint.bodyA` and `constraint.bodyB`.
     *
     * @property length
     * @type number
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

})();


/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Axes` module contains methods for creating and manipulating sets of axes.
*
* @class Axes
*/

var Axes = {};

module.exports = Axes;

var Vector = __webpack_require__(2);
var Common = __webpack_require__(0);

(function() {

    /**
     * Creates a new set of axes from the given vertices.
     * @method fromVertices
     * @param {vertices} vertices
     * @return {axes} A new axes from the given vertices
     */
    Axes.fromVertices = function(vertices) {
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


/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Bodies` module contains factory methods for creating rigid body models 
* with commonly used body configurations (such as rectangles, circles and other polygons).
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Bodies
*/

// TODO: true circle bodies

var Bodies = {};

module.exports = Bodies;

var Vertices = __webpack_require__(3);
var Common = __webpack_require__(0);
var Body = __webpack_require__(4);
var Bounds = __webpack_require__(1);
var Vector = __webpack_require__(2);

(function() {

    /**
     * Creates a new rigid body model with a rectangle hull. 
     * The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
     * @method rectangle
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @return {body} A new rectangle body
     */
    Bodies.rectangle = function(x, y, width, height, options) {
        options = options || {};

        // The four corners built directly. This used to concatenate an SVG-ish path string and parse
        // it back with a global regex (`Vertices.fromPath`), for a rectangle whose corners are
        // already known numbers. It is also strictly more correct: the path pattern's `[-\d.e]+`
        // class omits `+`, so any dimension `String()` renders in exponent form (`1e+21`) parsed to
        // NaN and produced a NaN body.
        var rectangle = { 
            label: 'Rectangle Body',
            position: { x: x, y: y },
            vertices: [
                { x: 0, y: 0 },
                { x: width, y: 0 },
                { x: width, y: height },
                { x: 0, y: height }
            ]
        };

        if (options.chamfer) {
            var chamfer = options.chamfer;
            rectangle.vertices = Vertices.chamfer(Vertices.create(rectangle.vertices, null), chamfer.radius, 
                chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
            // the key must be ABSENT for Common.extend (an undefined value would still copy
            // the key onto the body and change its shape); options is a throwaway per call
            // eslint-disable-next-line no-restricted-syntax
            delete options.chamfer;
        }

        // Shallow merge, not `Common.extend`: `Body.create` deep-merges these into its own fresh
        // defaults regardless, so the outer deep clone only ever built garbage. Nothing here can
        // alias the caller's nested objects for the same reason.
        for (var prop in options) {
            rectangle[prop] = options[prop];
        }

        return Body.create(rectangle);
    };
    
    /**
     * Creates a new rigid body model with a trapezoid hull. 
     * The `slope` is parameterised as a fraction of `width` and must be < 1 to form a valid trapezoid. 
     * The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
     * @method trapezoid
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} slope Must be a number < 1.
     * @param {object} [options]
     * @return {body} A new trapezoid body
     */
    Bodies.trapezoid = function(x, y, width, height, slope, options) {
        options = options || {};

        if (slope >= 1) {
            Common.warn('Bodies.trapezoid: slope parameter must be < 1.');
        }

        slope *= 0.5;
        var roof = (1 - (slope * 2)) * width;
        
        var x1 = width * slope,
            x2 = x1 + roof,
            x3 = x2 + x1,
            verticesPath;

        if (slope < 0.5) {
            verticesPath = 'L 0 0 L ' + x1 + ' ' + (-height) + ' L ' + x2 + ' ' + (-height) + ' L ' + x3 + ' 0';
        } else {
            verticesPath = 'L 0 0 L ' + x2 + ' ' + (-height) + ' L ' + x3 + ' 0';
        }

        var trapezoid = { 
            label: 'Trapezoid Body',
            position: { x: x, y: y },
            vertices: Vertices.fromPath(verticesPath)
        };

        if (options.chamfer) {
            var chamfer = options.chamfer;
            trapezoid.vertices = Vertices.chamfer(trapezoid.vertices, chamfer.radius, 
                chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
            // the key must be ABSENT for Common.extend (an undefined value would still copy
            // the key onto the body and change its shape); options is a throwaway per call
            // eslint-disable-next-line no-restricted-syntax
            delete options.chamfer;
        }

        return Body.create(Common.extend({}, trapezoid, options));
    };

    /**
     * Creates a new rigid body model with a circle hull. 
     * The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
     * @method circle
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {object} [options]
     * @param {number} [maxSides]
     * @return {body} A new circle body
     */
    Bodies.circle = function(x, y, radius, options, maxSides) {
        options = options || {};

        var circle = {
            label: 'Circle Body',
            circleRadius: radius
        };
        
        // approximate circles with polygons until true circles implemented in SAT
        maxSides = maxSides || 25;
        var sides = Math.ceil(Math.max(10, Math.min(maxSides, radius)));

        // optimisation: always use even number of sides (half the number of unique axes)
        if (sides % 2 === 1)
            sides += 1;

        return Bodies.polygon(x, y, sides, radius, Common.extend({}, circle, options));
    };

    /**
     * Creates a new rigid body model with a regular polygon hull with the given number of sides. 
     * The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
     * @method polygon
     * @param {number} x
     * @param {number} y
     * @param {number} sides
     * @param {number} radius
     * @param {object} [options]
     * @return {body} A new regular polygon body
     */
    Bodies.polygon = function(x, y, sides, radius, options) {
        options = options || {};

        if (sides < 3)
            return Bodies.circle(x, y, radius, options);

        var theta = 2 * Math.PI / sides,
            path = '',
            offset = theta * 0.5;

        for (var i = 0; i < sides; i += 1) {
            var angle = offset + (i * theta),
                xx = Math.cos(angle) * radius,
                yy = Math.sin(angle) * radius;

            path += 'L ' + xx.toFixed(3) + ' ' + yy.toFixed(3) + ' ';
        }

        var polygon = { 
            label: 'Polygon Body',
            position: { x: x, y: y },
            vertices: Vertices.fromPath(path)
        };

        if (options.chamfer) {
            var chamfer = options.chamfer;
            polygon.vertices = Vertices.chamfer(polygon.vertices, chamfer.radius, 
                chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
            // the key must be ABSENT for Common.extend (an undefined value would still copy
            // the key onto the body and change its shape); options is a throwaway per call
            // eslint-disable-next-line no-restricted-syntax
            delete options.chamfer;
        }

        return Body.create(Common.extend({}, polygon, options));
    };

    /**
     * Utility to create a compound body based on set(s) of vertices.
     * 
     * _Note:_ To optionally enable automatic concave vertices decomposition the [poly-decomp](https://github.com/schteppe/poly-decomp.js) 
     * package must be first installed and provided see `Common.setDecomp`, otherwise the convex hull of each vertex set will be used.
     * 
     * The resulting vertices are reorientated about their centre of mass,
     * and offset such that `body.position` corresponds to this point.
     * 
     * The resulting offset may be found if needed by subtracting `body.bounds` from the original input bounds.
     * To later move the centre of mass see `Body.setCentre`.
     * 
     * Note that automatic conconcave decomposition results are not always optimal. 
     * For best results, simplify the input vertices as much as possible first.
     * By default this function applies some addtional simplification to help.
     * 
     * Some outputs may also require further manual processing afterwards to be robust.
     * In particular some parts may need to be overlapped to avoid collision gaps.
     * Thin parts and sharp points should be avoided or removed where possible.
     *
     * The options parameter object specifies any `Matter.Body` properties you wish to override the defaults.
     * 
     * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
     * @method fromVertices
     * @param {number} x
     * @param {number} y
     * @param {array} vertexSets One or more arrays of vertex points e.g. `[[{ x: 0, y: 0 }...], ...]`.
     * @param {object} [options] The body options.
     * @param {bool} [flagInternal=false] Optionally marks internal edges with `isInternal`.
     * @param {number} [removeCollinear=0.01] Threshold when simplifying vertices along the same edge.
     * @param {number} [minimumArea=10] Threshold when removing small parts.
     * @param {number} [removeDuplicatePoints=0.01] Threshold when simplifying nearby vertices.
     * @return {body}
     */
    Bodies.fromVertices = function(x, y, vertexSets, options, flagInternal, removeCollinear, minimumArea, removeDuplicatePoints) {
        var decomp = Common.getDecomp(),
            canDecomp,
            body,
            parts,
            isConvex,
            isConcave,
            vertices,
            i,
            j,
            k,
            v,
            z;

        // check decomp is as expected
        canDecomp = Boolean(decomp && decomp.quickDecomp);

        options = options || {};
        parts = [];

        flagInternal = typeof flagInternal !== 'undefined' ? flagInternal : false;
        removeCollinear = typeof removeCollinear !== 'undefined' ? removeCollinear : 0.01;
        minimumArea = typeof minimumArea !== 'undefined' ? minimumArea : 10;
        removeDuplicatePoints = typeof removeDuplicatePoints !== 'undefined' ? removeDuplicatePoints : 0.01;

        // ensure vertexSets is an array of arrays
        if (!Common.isArray(vertexSets[0])) {
            vertexSets = [vertexSets];
        }

        for (v = 0; v < vertexSets.length; v += 1) {
            vertices = vertexSets[v];
            isConvex = Vertices.isConvex(vertices);
            isConcave = !isConvex;

            if (isConcave && !canDecomp) {
                Common.warnOnce(
                    'Bodies.fromVertices: Install the \'poly-decomp\' library and use Common.setDecomp or provide \'decomp\' as a global to decompose concave vertices.'
                );
            }

            if (isConvex || !canDecomp) {
                if (isConvex) {
                    vertices = Vertices.clockwiseSort(vertices);
                } else {
                    // fallback to convex hull when decomposition is not possible
                    vertices = Vertices.hull(vertices);
                }

                parts.push({
                    position: { x: x, y: y },
                    vertices: vertices
                });
            } else {
                // initialise a decomposition
                var concave = vertices.map(function(vertex) {
                    return [vertex.x, vertex.y];
                });

                // vertices are concave and simple, we can decompose into parts
                decomp.makeCCW(concave);
                if (removeCollinear !== false)
                    decomp.removeCollinearPoints(concave, removeCollinear);
                if (removeDuplicatePoints !== false && decomp.removeDuplicatePoints)
                    decomp.removeDuplicatePoints(concave, removeDuplicatePoints);

                // use the quick decomposition algorithm (Bayazit)
                var decomposed = decomp.quickDecomp(concave);

                // for each decomposed chunk
                for (i = 0; i < decomposed.length; i++) {
                    var chunk = decomposed[i];

                    // convert vertices into the correct structure
                    var chunkVertices = chunk.map(function(vertices) {
                        return {
                            x: vertices[0],
                            y: vertices[1]
                        };
                    });

                    // skip small chunks
                    if (minimumArea > 0 && Vertices.area(chunkVertices) < minimumArea)
                        continue;

                    // create a compound part
                    parts.push({
                        position: Vertices.centre(chunkVertices),
                        vertices: chunkVertices
                    });
                }
            }
        }

        // create body parts
        for (i = 0; i < parts.length; i++) {
            parts[i] = Body.create(Common.extend(parts[i], options));
        }

        // flag internal edges (coincident part edges)
        if (flagInternal) {
            var coincident_max_dist = 5;

            for (i = 0; i < parts.length; i++) {
                var partA = parts[i];

                for (j = i + 1; j < parts.length; j++) {
                    var partB = parts[j];

                    if (Bounds.overlaps(partA.bounds, partB.bounds)) {
                        var pav = partA.vertices,
                            pbv = partB.vertices;

                        // iterate vertices of both parts
                        for (k = 0; k < partA.vertices.length; k++) {
                            for (z = 0; z < partB.vertices.length; z++) {
                                // find distances between the vertices
                                var da = Vector.magnitudeSquared(Vector.sub(pav[(k + 1) % pav.length], pbv[z])),
                                    db = Vector.magnitudeSquared(Vector.sub(pav[k], pbv[(z + 1) % pbv.length]));

                                // if both vertices are very close, consider the edge concident (internal)
                                if (da < coincident_max_dist && db < coincident_max_dist) {
                                    pav[k].isInternal = true;
                                    pbv[z].isInternal = true;
                                }
                            }
                        }

                    }
                }
            }
        }

        if (parts.length > 1) {
            // create the parent body to be returned, that contains generated compound parts
            body = Body.create(Common.extend({ parts: parts.slice(0) }, options));

            // offset such that body.position is at the centre off mass
            Body.setPosition(body, { x: x, y: y });

            return body;
        } else {
            return parts[0];
        }
    };

})();


/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Detector` module contains methods for efficiently detecting collisions between a list of bodies using a broadphase algorithm.
*
* @class Detector
*/

var Detector = {};

module.exports = Detector;

var Common = __webpack_require__(0);
var Collision = __webpack_require__(8);

(function() {

    /**
     * The grid broadphase's visit stamp, written to `body._gsStamp` (and to
     * the flat mover stamps) to mark a body already seen by one pass: a
     * candidate collected once however many of a mover's cells hold it, a
     * journal entry read once however often it was recorded. ONE counter for
     * every grid detector, so every stamp is fresh for every body: with a
     * counter per detector, a stamp another detector left on a body could
     * equal the one a pass took, and the pass skipped that body as already
     * seen (a released static left out of the mover lists, a static left out
     * of a mover's candidates).
     *
     * Known limit, unchanged by sharing the counter (one detector takes the
     * same stamps either way): past `2^31` stamps, about 33 hours of a
     * 300-mover world at 60 updates a second, the flat mover stamps (an
     * `Int32Array`) wrap and stop deduping a mover reached through several
     * cells, so its pair is emitted more than once, and `_gsStamp` leaves the
     * small-integer range, which changes the field's representation on every
     * body once.
     * @private
     */
    var gridStamp = 0;

    /**
     * Creates a new collision detector.
     *
     * The broadphase is chosen per detector, with `broadphase` (`'sweep'`, the
     * default, or `'grid'`) and, for the grid, `cellSize`. To run an engine on
     * the grid, give it a detector made for it:
     *
     *     Engine.create({ detector: Detector.create({ broadphase: 'grid' }) })
     *
     * Any other `broadphase` throws, here and on every `Detector.collisions`.
     * @method create
     * @param {} options
     * @return {detector} A new collision detector
     */
    Detector.create = function(options) {
        var defaults = {
            bodies: [],
            collisions: [],
            pairs: null,
            // which broadphase `Detector.collisions` runs (see there)
            broadphase: 'sweep',
            // the grid's cell size in pixels, read by the grid broadphase only.
            // Tune it to roughly the typical static body's size
            cellSize: Detector._defaultCellSize,
            // whether `bodies` is a private copy the sweep may sort in place
            // (see Detector.setBodies)
            _bodiesOwned: true,
            // the world whose own body array `bodies` is, set by
            // `Engine.update` for a flat world: the grid broadphase then reads
            // that world's body journal instead of walking every body (see
            // Common._journalTouch). Null for a detector used on its own
            _world: null,
            // the grid broadphase's state, made on its first step (see
            // Detector._collisionsGrid)
            _sgrid: null
        };

        var detector = Common.extend(defaults, options);

        // Common.extend copies an option given as `undefined`, so a cell size
        // left unset that way takes the default like an absent one. The
        // broadphase does not: an unset broadphase quietly running the sweep
        // is the failure the check below exists to rule out
        if (detector.cellSize === undefined) {
            detector.cellSize = Detector._defaultCellSize;
        }

        if (!Detector._isBroadphase(detector.broadphase)) {
            throw Detector._broadphaseError(detector.broadphase);
        }

        if (!Detector._isCellSize(detector.cellSize)) {
            throw Detector._cellSizeError(detector.cellSize);
        }

        return detector;
    };

    /**
     * The grid's cell size when a detector is not given one.
     * @private
     * @property _defaultCellSize
     * @type number
     */
    Detector._defaultCellSize = 32;

    /**
     * Whether `broadphase` names a broadphase `Detector.collisions` runs.
     * @private
     * @method _isBroadphase
     * @param {} broadphase
     * @return {boolean}
     */
    Detector._isBroadphase = function(broadphase) {
        return broadphase === 'sweep' || broadphase === 'grid';
    };

    /**
     * Whether `cellSize` is a cell size the grid can use: a finite number of
     * pixels above zero whose inverse is finite too. The grid maps a
     * coordinate to its cell by multiplying by that inverse, and an infinite
     * one (a denormal cell size such as `1e-310`) puts every body in cell
     * `Infinity`, whose cell loop never ends.
     * @private
     * @method _isCellSize
     * @param {} cellSize
     * @return {boolean}
     */
    Detector._isCellSize = function(cellSize) {
        return typeof cellSize === 'number' && cellSize > 0 && cellSize < Infinity && 1 / cellSize < Infinity;
    };

    /**
     * Throws if `detector` names no broadphase, or names the grid with a cell
     * size it cannot use: the checks `Detector.collisions` and the grid make
     * when they run, made up front. `Engine.update` calls this before it
     * changes anything, so an update that throws on its configuration leaves
     * the engine, the world and every body as they were.
     * @private
     * @method _assertConfig
     * @param {detector} detector
     */
    Detector._assertConfig = function(detector) {
        var broadphase = detector.broadphase;

        if (broadphase === 'grid') {
            if (!Detector._isCellSize(detector.cellSize)) {
                throw Detector._cellSizeError(detector.cellSize);
            }
            return;
        }

        if (broadphase !== 'sweep') {
            throw Detector._broadphaseError(broadphase);
        }
    };

    /**
     * The error for a detector whose `broadphase` names no broadphase.
     * @private
     * @method _broadphaseError
     * @param {} broadphase
     * @return {Error}
     */
    Detector._broadphaseError = function(broadphase) {
        return new Error('Matter.Detector: unknown broadphase ' + String(broadphase)
            + ", expected 'sweep' or 'grid' (e.g. Detector.create({ broadphase: 'grid' }))");
    };

    /**
     * The error for a detector whose `cellSize` the grid cannot use.
     * @private
     * @method _cellSizeError
     * @param {} cellSize
     * @return {Error}
     */
    Detector._cellSizeError = function(cellSize) {
        return new Error('Matter.Detector: cellSize must be a finite number above 0 with a finite inverse, got '
            + String(cellSize));
    };

    /**
     * Sets the list of bodies in the detector.
     * @method setBodies
     * @param {detector} detector
     * @param {body[]} bodies
     */
    Detector.setBodies = function(detector, bodies) {
        // only the sweep reorders detector.bodies (it sorts in place), so only
        // it needs a private copy. The grid modes reference the caller's array
        // directly, which for `Engine.update` on a flat world is `world.bodies`
        // itself: its identity does NOT change when its membership does, so the
        // classification cache keys on Common._bodySetEpoch as well. The copy
        // for the sweep is taken lazily in _collisionsSweep, so a detector
        // flipped to sweep after this call stays correct, and the caller's
        // array is never reordered.
        detector.bodies = bodies;
        detector._bodiesOwned = false;
        // whose array this is, `Engine.update` says again after this call
        detector._world = null;
    };

    /**
     * Clears the detector including its list of bodies.
     * @method clear
     * @param {detector} detector
     */
    Detector.clear = function(detector) {
        detector.bodies = [];
        detector.collisions = [];
    };

    /**
     * Efficiently finds all collisions among all the bodies in `detector.bodies` using a broadphase algorithm.
     * 
     * _Note:_ The specific ordering of collisions returned is not guaranteed between releases and may change for performance reasons.
     * If a specific ordering is required then apply a sort to the resulting array.
     * @method collisions
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector._collisionsSweep = function(detector) {
        var pairs = detector.pairs,
            bodies = detector.bodies,
            bodiesLength = bodies.length,
            canCollide = Detector.canCollide,
            collides = Collision.collides,
            collisions = detector.collisions,
            collisionIndex = 0,
            i,
            j;

        // the sweep sorts in place, so it must own the array: setBodies hands
        // over the caller's array by reference (the grid modes never reorder
        // it) and the copy is taken here, only when the sweep actually runs
        if (!detector._bodiesOwned) {
            bodies = detector.bodies = detector.bodies.slice(0);
            detector._bodiesOwned = true;
        }

        // sort bodies by bounds.min.x for sweep-and-prune. Uses the engine's
        // stable O(n log n) sort: callers rebuild `detector.bodies` from
        // Composite.allBodies (add order) every step via Detector.setBodies, so
        // the input is NOT nearly-sorted between frames. A hand-rolled insertion
        // sort degrades to O(n^2) on that input (~34ms at n=7300 when the array
        // is row-major), whereas this stays sub-millisecond regardless of order.
        bodies.sort(Detector._compareBoundsX);

        for (i = 0; i < bodiesLength; i++) {
            var bodyA = bodies[i],
                boundsA = bodyA.bounds,
                boundXMax = bodyA.bounds.max.x,
                boundYMax = bodyA.bounds.max.y,
                boundYMin = bodyA.bounds.min.y,
                bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
                partsALength = bodyA.parts.length,
                partsASingle = partsALength === 1;

            for (j = i + 1; j < bodiesLength; j++) {
                var bodyB = bodies[j],
                    boundsB = bodyB.bounds;

                if (boundsB.min.x > boundXMax) {
                    break;
                }

                if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) {
                    continue;
                }

                if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) {
                    continue;
                }

                if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) {
                    continue;
                }

                var partsBLength = bodyB.parts.length;

                if (partsASingle && partsBLength === 1) {
                    var collision = collides(bodyA, bodyB, pairs);

                    if (collision) {
                        collisions[collisionIndex++] = collision;
                    }
                } else {
                    var partsAStart = partsALength > 1 ? 1 : 0,
                        partsBStart = partsBLength > 1 ? 1 : 0;
                    
                    for (var k = partsAStart; k < partsALength; k++) {
                        var partA = bodyA.parts[k],
                            boundsA = partA.bounds;

                        for (var z = partsBStart; z < partsBLength; z++) {
                            var partB = bodyB.parts[z],
                                boundsB = partB.bounds;

                            if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x
                                || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) {
                                continue;
                            }

                            var collision = collides(partA, partB, pairs);

                            if (collision) {
                                collisions[collisionIndex++] = collision;
                            }
                        }
                    }
                }
            }
        }

        if (collisions.length !== collisionIndex) {
            collisions.length = collisionIndex;
        }

        return collisions;
    };

    /**
     * Finds all collisions among `detector.bodies` using the detector's
     * broadphase, `detector.broadphase`:
     *
     * - `'sweep'` is upstream's sort-and-sweep, and the default.
     * - `'grid'` indexes static and sleeping bodies once and keeps the index
     *   as bodies come and go, so each step costs about the MOVING bodies, not
     *   the world (see `Detector._collisionsGrid`). It emits collisions in a
     *   different but still deterministic order, so it is a re-baseline of the
     *   simulation, not bit-identical to the sweep.
     *
     * Anything else throws, on every call rather than only at
     * `Detector.create`: the config is a plain field a caller can assign, and a
     * detector quietly falling back to the sweep is the failure this exists to
     * rule out. Two string compares per step are free.
     * @method collisions
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector.collisions = function(detector) {
        var broadphase = detector.broadphase;

        if (broadphase === 'grid') {
            return Detector._collisionsGrid(detector);
        }

        if (broadphase === 'sweep') {
            return Detector._collisionsSweep(detector);
        }

        throw Detector._broadphaseError(broadphase);
    };

    /**
     * Tests a candidate body pair and appends any resulting collision, handling
     * compound multi-part bodies exactly as the sweep does. Returns the new
     * collision index. Shared by the grid path.
     * @private
     * @method _testPair
     */
    Detector._testPair = function(bodyA, bodyB, pairs, collisions, collisionIndex) {
        var partsALength = bodyA.parts.length,
            partsBLength = bodyB.parts.length;

        if (partsALength === 1 && partsBLength === 1) {
            var collision = Collision.collides(bodyA, bodyB, pairs);

            if (collision) {
                collisions[collisionIndex++] = collision;
            }

            return collisionIndex;
        }

        var partsAStart = partsALength > 1 ? 1 : 0,
            partsBStart = partsBLength > 1 ? 1 : 0;

        for (var k = partsAStart; k < partsALength; k++) {
            var partA = bodyA.parts[k],
                partABounds = partA.bounds;

            for (var z = partsBStart; z < partsBLength; z++) {
                var partB = bodyB.parts[z],
                    partBBounds = partB.bounds;

                if (partABounds.min.x > partBBounds.max.x || partABounds.max.x < partBBounds.min.x
                    || partABounds.max.y < partBBounds.min.y || partABounds.min.y > partBBounds.max.y) {
                    continue;
                }

                var partCollision = Collision.collides(partA, partB, pairs);

                if (partCollision) {
                    collisions[collisionIndex++] = partCollision;
                }
            }
        }

        return collisionIndex;
    };

    /**
     * Creates an open-addressing hash table mapping packed cell keys to bucket
     * arrays, replacing `Map` for the grid's cell indexes. Linear probing
     * over two flat parallel arrays: `keys` (Float64Array; the packed cell key
     * `(cx + offset) * stride + (cy + offset)` is always positive within the
     * coordinate contract, so `0` marks an empty slot) and `vals` (the bucket
     * arrays). Keys are never deleted (buckets persist per cell, matching the
     * previous Map behaviour), so no tombstones are needed. Lookup order never
     * affects emission order, so this is purely mechanical: bit-identical.
     * @private
     * @method _createCellTable
     */
    Detector._createCellTable = function() {
        return {
            keys: new Float64Array(2048),
            // pre-filled so the backing store stays packed: a bare
            // `new Array(n)` is HOLEY and every probe read pays for it
            vals: new Array(2048).fill(null),
            mask: 2047,
            count: 0
        };
    };

    /**
     * Looks up the bucket for a packed cell key, or `undefined` when the cell
     * has never been touched. `hash` is the caller-computed cell hash.
     * @private
     * @method _cellGet
     */
    Detector._cellGet = function(table, key, hash) {
        var keys = table.keys,
            mask = table.mask,
            probe = hash & mask,
            stored = keys[probe];
        while (stored !== key && stored !== 0) {
            probe = (probe + 1) & mask;
            stored = keys[probe];
        }
        if (stored === key) {
            return table.vals[probe];
        }
        return undefined;
    };

    /**
     * Computes the hash for a cell from its OFFSET coordinates (the
     * `cx + keyOffset` / `cy + keyOffset` values, so a rehash can re-derive it
     * from the packed key alone).
     * @private
     * @method _cellHash
     */
    Detector._cellHash = function(cxOffset, cyOffset) {
        // Fibonacci-style mixing; the xor-fold spreads high bits into the
        // masked low bits
        var mixed = (Math.imul(cxOffset, 0x9E3779B1) ^ Math.imul(cyOffset, 0x85EBCA77)) | 0;
        return (mixed ^ (mixed >>> 15)) | 0;
    };

    /**
     * Per-axis cap on the mover cell index (see the insert pass in
     * `_collisionsGrid`): `1 << _maxCellShift` cells, so the flat index is
     * never larger than `1 << (2 * _maxCellShift)` slots. A mover spread wider
     * than this wraps into the same slots, which stays correct because chain
     * entries carry their cell key.
     */
    Detector._maxCellShift = 7;

    /**
     * Returns a `Float64Array` of at least `minLength` holding `existing`'s
     * values. Used to grow a mover's captured static-candidate bounds while its
     * candidate list is being collected.
     * @private
     * @method _growFloats
     */
    Detector._growFloats = function(existing, minLength) {
        var grown = new Float64Array(Math.max(minLength, existing.length * 2));
        grown.set(existing);
        return grown;
    };

    /**
     * Smallest shift `s` (capped at `_maxCellShift`) with `1 << s >= extent`,
     * i.e. the power-of-two axis size that covers `extent` cells.
     * @private
     * @method _cellShiftFor
     */
    Detector._cellShiftFor = function(extent) {
        var maxShift = Detector._maxCellShift,
            shift = 0;

        while (shift < maxShift && (1 << shift) < extent) {
            shift++;
        }

        return shift;
    };

    /**
     * Doubles a cell table's capacity and reinserts every live key (hashes are
     * re-derived from the packed keys). Rare: only on load-factor growth.
     * @private
     * @method _cellTableGrow
     */
    Detector._cellTableGrow = function(table) {
        var oldKeys = table.keys,
            oldVals = table.vals,
            oldCapacity = oldKeys.length,
            newCapacity = oldCapacity * 2,
            newKeys = new Float64Array(newCapacity),
            newVals = new Array(newCapacity).fill(null),
            newMask = newCapacity - 1,
            keyStride = 0x200000;

        for (var slot = 0; slot < oldCapacity; slot++) {
            var liveKey = oldKeys[slot];
            if (liveKey === 0) {
                continue;
            }
            var cxOffset = Math.floor(liveKey / keyStride),
                cyOffset = liveKey - cxOffset * keyStride,
                probe = Detector._cellHash(cxOffset, cyOffset) & newMask;
            while (newKeys[probe] !== 0) {
                probe = (probe + 1) & newMask;
            }
            newKeys[probe] = liveKey;
            newVals[probe] = oldVals[slot];
        }

        table.keys = newKeys;
        table.vals = newVals;
        table.mask = newMask;
    };

    /**
     * Looks up the bucket for a packed cell key, creating (and inserting) an
     * empty bucket when the cell is new. Grows the table at half load.
     * @private
     * @method _cellGetOrCreate
     */
    Detector._cellGetOrCreate = function(table, key, hash) {
        var keys = table.keys,
            mask = table.mask,
            probe = hash & mask,
            stored = keys[probe];
        while (stored !== key && stored !== 0) {
            probe = (probe + 1) & mask;
            stored = keys[probe];
        }
        if (stored === key) {
            return table.vals[probe];
        }

        if ((table.count + 1) * 2 > mask + 1) {
            Detector._cellTableGrow(table);
            keys = table.keys;
            mask = table.mask;
            probe = hash & mask;
            while (keys[probe] !== 0) {
                probe = (probe + 1) & mask;
            }
        }

        var bucket = [];
        keys[probe] = key;
        table.vals[probe] = bucket;
        table.count++;
        return bucket;
    };

    /**
     * Inserts a static body into the cell buckets it occupies, in world order.
     *
     * Bucket contents are kept sorted by `_sWorldIndex` so they read back in the
     * same order a full rebuild (a walk of `detector.bodies`) would produce.
     * Restamping every body's index on each classification walk keeps that key
     * meaningful: `Composite` add and remove preserve the relative order of
     * everything else, so an already-sorted bucket stays sorted across them.
     * @private
     * @method _staticIndexInsert
     */
    Detector._staticIndexInsert = function(g, body, cellSize, invCell, maxCells) {
        var bounds = body.bounds,
            cx0 = Math.floor(bounds.min.x * invCell),
            cx1 = Math.floor(bounds.max.x * invCell),
            cy0 = Math.floor(bounds.min.y * invCell),
            cy1 = Math.floor(bounds.max.y * invCell),
            worldIndex = body._sWorldIndex,
            buckets = body._sBuckets,
            keyOffset = 0x100000,
            keyStride = 0x200000,
            cx,
            cy,
            at;

        if (buckets === null) {
            buckets = body._sBuckets = [];
        } else {
            // popped rather than `length = 0`, as the candidate list in
            // `_collisionsGrid` is: no StoreIC call, capacity kept
            while (buckets.length !== 0) {
                buckets.pop();
            }
        }

        body._sIndexed = true;
        body._sGrid = g;
        body._sIndexedAt = g.indexed.length;
        g.indexed.push(body);
        g.sFlatValid = false;

        // an oversized static spans too many cells to bucket; it goes on the
        // list every mover scans instead, and holds no buckets (which is what
        // an empty `_sBuckets` means). It needs no cell bookkeeping either:
        // `sOver` is re-scanned by every mover every step, never cached
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > maxCells) {
            at = g.sOver.length;
            while (at > 0 && g.sOver[at - 1]._sWorldIndex > worldIndex) {
                at--;
            }
            g.sOver.splice(at, 0, body);
            return;
        }

        // remember the span so unbucketing can report the same cells back
        body._sCx0 = cx0;
        body._sCx1 = cx1;
        body._sCy0 = cy0;
        body._sCy1 = cy1;

        // and report them as changed, so the movers standing over them drop
        // their cached static-candidate lists. Skipped during a full rebuild
        // (`built` is only set at the end of one), which bumps the epoch and so
        // invalidates every cached list at once
        if (g.built) {
            // filled BY INDEX up to `g.changedCount`, never cleared (see the
            // invalidation sweep in `_collisionsGrid`)
            var changed = g.changedCells,
                changedAt = g.changedCount;
            for (cx = cx0; cx <= cx1; cx++) {
                for (cy = cy0; cy <= cy1; cy++) {
                    changed[changedAt++] = cx;
                    changed[changedAt++] = cy;
                }
            }
            g.changedCount = changedAt;
        }

        for (cx = cx0; cx <= cx1; cx++) {
            var keyX = (cx + keyOffset) * keyStride,
                cxOffset = cx + keyOffset;

            for (cy = cy0; cy <= cy1; cy++) {
                // store the body reference, not its index into detector.bodies:
                // any add or remove reorders and shrinks that array, so a
                // stored index can dangle
                var bucket = Detector._cellGetOrCreate(
                    g.sTable, keyX + (cy + keyOffset), Detector._cellHash(cxOffset, cy + keyOffset)
                );

                at = bucket.length;
                while (at > 0 && bucket[at - 1]._sWorldIndex > worldIndex) {
                    at--;
                }

                if (at === bucket.length) {
                    bucket.push(body);
                } else {
                    bucket.splice(at, 0, body);
                }

                buckets.push(bucket);
            }
        }
    };

    /**
     * Removes a static body's reference from every bucket it was inserted into.
     * Splicing (rather than a swap-remove) is what keeps the remaining contents
     * in world order.
     * @private
     * @method _staticIndexUnbucket
     */
    Detector._staticIndexUnbucket = function(g, body) {
        var buckets = body._sBuckets,
            i,
            at;

        g.sFlatValid = false;

        if (buckets === null) {
            return;
        }

        // no buckets means an oversized static, which lives on the list every
        // mover scans instead of in cells
        if (buckets.length === 0) {
            at = g.sOver.indexOf(body);
            if (at !== -1) {
                g.sOver.splice(at, 1);
            }
            return;
        }

        // report the vacated cells from the span the body was BUCKETED at, not
        // from its live bounds: a released tile has already been integrated by
        // `Engine._bodiesUpdate` this step, so its bounds describe where it is
        // now, not the cells it is being pulled out of
        var changed = g.changedCells,
            changedAt = g.changedCount,
            ucx,
            ucy,
            ucx1 = body._sCx1,
            ucy1 = body._sCy1;

        for (ucx = body._sCx0; ucx <= ucx1; ucx++) {
            for (ucy = body._sCy0; ucy <= ucy1; ucy++) {
                changed[changedAt++] = ucx;
                changed[changedAt++] = ucy;
            }
        }

        g.changedCount = changedAt;

        for (i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            at = bucket.indexOf(body);
            if (at !== -1) {
                bucket.splice(at, 1);
            }
        }

        // popped rather than `length = 0` (see `_staticIndexInsert`)
        while (buckets.length !== 0) {
            buckets.pop();
        }
    };

    /**
     * Removes a static body from the index entirely: out of the membership
     * list, and out of every bucket it was inserted into. From the index of
     * the grid that holds it (`body._sGrid`), which is `g` unless the body
     * came from a world another grid engine steps: its buckets and slot
     * describe that grid's index, and it is taken out of that one.
     *
     * That is how a body moved between two grid worlds leaves the first
     * index. The removal marks it departed (Composite.removeBody), and
     * whichever grid classifies it first takes it out of the index that holds
     * it: the old grid, finding it gone from its world, or the new one,
     * finding it departed. Either way the index that held it loses it whole,
     * list, buckets and changed-cell report, and the new grid then indexes it
     * afresh. Before, the old grid unbucketed it through the buckets the new
     * one had given it.
     * @private
     * @method _staticIndexRemove
     */
    Detector._staticIndexRemove = function(g, body) {
        var owner = body._sGrid === null ? g : body._sGrid,
            indexed = owner.indexed,
            slot = body._sIndexedAt;

        // swap-remove from the membership list. Its order carries no meaning
        // (bucket order is what the simulation depends on, and sFlat is rebuilt
        // from the body array), so this stays O(1) and keeps a release off any
        // whole-list walk
        if (slot >= 0 && indexed[slot] === body) {
            var last = indexed[indexed.length - 1];
            indexed[slot] = last;
            last._sIndexedAt = slot;
            indexed.length--;
        }

        body._sIndexed = false;
        body._sIndexedAt = -1;
        body._sGrid = null;

        Detector._staticIndexUnbucket(owner, body);
    };

    /**
     * Builds the static index from scratch. Only runs on the first step and
     * after a cell-size change (which invalidates every bucket key); every other
     * membership change is applied as a difference by `_staticIndexApply`.
     * @private
     * @method _staticIndexRebuild
     */
    Detector._staticIndexRebuild = function(g, bodies, n, cellSize, invCell, maxCells) {
        var table = g.sTable,
            keys = table.keys,
            vals = table.vals,
            i;

        // empty every live bucket. Walking the table (rather than a maintained
        // list of touched buckets) costs one pass over its slots, which is fine
        // for a path this rare and means the incremental path never has to keep
        // such a list in sync
        for (i = 0; i < keys.length; i++) {
            if (keys[i] !== 0) {
                vals[i].length = 0;
            }
        }

        g.sOver.length = 0;
        g.sFlat.length = 0;
        g.sFlatValid = false;

        // every body the old index held lets go of it, including one that
        // has left the world since (the loop below reaches only members)
        for (i = 0; i < g.indexed.length; i++) {
            var held = g.indexed[i];
            if (held._sGrid === g) {
                held._sIndexed = false;
                held._sIndexedAt = -1;
                held._sGrid = null;
            }
        }

        g.indexed.length = 0;
        // the epoch bump below invalidates every cached candidate list, so
        // per-cell reports from this rebuild would be a pure cost
        g.changedCount = 0;

        for (i = 0; i < n; i++) {
            var body = bodies[i];

            body._sIndexed = false;

            if (!(body.isStatic || body.isSleeping) || body._sMoved === true) {
                continue;
            }

            Detector._staticIndexInsert(g, body, cellSize, invCell, maxCells);
        }

        g.built = true;
        g.epoch += 1;
    };

    /**
     * Applies this step's static membership difference to the index: bodies that
     * left the world or stopped being static are removed, bodies that became
     * static or entered the world are inserted.
     * @private
     * @method _staticIndexApply
     */
    Detector._staticIndexApply = function(g, cellSize, invCell, maxCells, staticCount) {
        var indexed = g.indexed,
            pendingAdd = g.pendingAdd,
            pendingAddLength = pendingAdd.length,
            walkStamp = g.walkStamp,
            i;

        // A static that LEFT the world is the one change no per-body flag can
        // report, and finding it costs a walk of the whole membership list. But
        // it always shows up as a count mismatch first: releases already
        // unindexed themselves during the classification walk, so once this
        // step's insertions land, the membership list should be exactly the
        // statics the walk counted. Only when it is not does anything need
        // searching for.
        if (indexed.length + pendingAddLength !== staticCount) {
            var keep = 0,
                indexedLength = indexed.length;

            for (i = 0; i < indexedLength; i++) {
                var body = indexed[i];

                if (body._sWalk !== walkStamp) {
                    // gone from the world. Removing by hand rather than through
                    // _staticIndexRemove, since this loop is already compacting
                    // the membership list it would swap-remove from
                    Detector._staticIndexUnbucket(g, body);
                    body._sIndexed = false;
                    body._sIndexedAt = -1;
                    body._sGrid = null;
                    continue;
                }

                indexed[keep] = body;
                body._sIndexedAt = keep;
                keep++;
            }

            if (indexed.length !== keep) {
                indexed.length = keep;
            }
        }

        for (i = 0; i < pendingAddLength; i++) {
            Detector._staticIndexInsert(g, pendingAdd[i], cellSize, invCell, maxCells);
        }

        pendingAdd.length = 0;

        // NOTE: no epoch bump. The epoch invalidates EVERY mover's cached
        // static-candidate list, and this path runs on every step of a page
        // being destroyed, which drove that cache's hit rate to zero. The
        // changes are reported per CELL instead (`g.changedCells`), and only the
        // movers standing over one lose their list. The epoch is now bumped
        // only by a full rebuild, where every bucket really does change.
    };

    /**
     * The largest share of a world's bodies that may be movers for the
     * grid broadphase (and so the engine) to read the body journal
     * rather than walk. Above it the full walks run, as before the journal.
     *
     * The journal removes the same work at any share, and the phase timers
     * say so (at the storm bench shape, 45 percent movers, the two
     * classifications cost 21 to 25 us less per update). But there the WHOLE
     * update measured slower, in most runs and in functions the journal never
     * touches (`Pairs.update`, the narrowphase, `Body.update`), by a median 4
     * percent over 32 interleaved runs with the velocity option off, while the
     * same code with the journal never read measured flat. Where the walks
     * dominate, at a few movers in a large static world (the traversal shape,
     * 2.6 percent movers), the update is 24 percent faster. Tests set this to 1
     * to run the journal at every share.
     * @private
     * @property _journalMoverShare
     * @type number
     */
    Detector._journalMoverShare = 0.25;

    /**
     * Starts `world`'s body journal from the full classification walk that
     * just stamped every body in it with `walkStamp` (see
     * Common._journalTouch): that stamp becomes the membership generation, the
     * list starts empty, and the next add's sort key follows the `n` the walk
     * wrote.
     * @private
     * @method _journalStart
     */
    Detector._journalStart = function(g, world, walkStamp, n) {
        var touched = world._touched,
            touchedCount = world._touchedCount;

        // drop the references a switched-off journal may still hold
        for (var i = 0; i < touchedCount; i++) {
            touched[i] = null;
        }

        world._touchedCount = 0;
        world._journalLive = true;
        world._memberGen = walkStamp;
        world._nextOrdinal = n;
        world._journalLength = n;
        world._journalForeignWalks = Common._foreignWalks;
        g.journalUsed = false;
        g.journalWorld = world;
        g.journalGen = walkStamp;
    };

    /**
     * Classifies from `world`'s body journal: the answer the full walk in
     * `_collisionsGrid` gives, from the bodies that changed since the
     * last classification rather than from every body in the world.
     *
     * Each journal entry is re-read against the body's state NOW, so the
     * order and number of its entries do not matter. A member is classified
     * exactly as the walk classifies it, with the same writes. A body that is
     * no longer a member leaves the index, which is exactly what the walk's
     * departure scan does to an indexed body its walk did not stamp; a
     * departure the journal missed would still be found by that scan, since
     * every member carries the walk stamp the scan tests against.
     *
     * The mover list keeps BODY order because `_sWorldIndex` stays increasing
     * along the body array between walks: the walk writes it, each add gives
     * a body going on the end the next ordinal, and a removal keeps the
     * relative order of what remains. The static count is what the walk's
     * count is, every body in the world that is not a mover.
     * @private
     * @method _classifyFromJournal
     * @param {object} g
     * @param {composite} world
     * @param {number} n
     */
    Detector._classifyFromJournal = function(g, world, n) {
        var touched = world._touched,
            touchedCount = world._touchedCount,
            memberGen = world._memberGen,
            movers = g.movers,
            moversLength = movers.length,
            pendingAdd = g.pendingAdd,
            arrivals = g.arrivals,
            indexed = g.indexed,
            // marks this pass's entries, so a body listed twice is classified
            // once and the mover list below can drop every one of them. From
            // the grid's one counter, whose every stamp is fresh (see
            // gridStamp)
            stamp = ++gridStamp,
            staticDirty = false,
            arrivalCount = 0,
            moverCount = 0,
            i;

        pendingAdd.length = 0;

        for (i = 0; i < touchedCount; i++) {
            var body = touched[i];

            touched[i] = null;

            if (body._gsStamp === stamp) {
                continue;
            }

            body._gsStamp = stamp;

            if (body._sOwner !== world || body._sWalk !== memberGen) {
                // no longer a member: what the departure scan does to an
                // indexed body the walk did not stamp. Only a body in THIS
                // index, as the scan only reads this index; the mover list
                // below drops it either way
                if (body._sIndexed && body._sGrid === g) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
                continue;
            }

            // from here, the full walk's classification of one body, write for
            // write (see there)
            var isStaticNow = (body.isStatic || body.isSleeping) && body._sMoved !== true;

            if (body._sDeparted) {
                body._sDeparted = false;
                body._scEpoch = -1;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }

            if (body._sPrev !== isStaticNow) {
                body._sPrev = isStaticNow;
                body._scEpoch = -1;
                staticDirty = true;
            }

            if (isStaticNow) {
                if (!body._sIndexed) {
                    pendingAdd.push(body);
                    staticDirty = true;
                }
            } else {
                arrivals[arrivalCount++] = body;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }
        }

        world._touchedCount = 0;

        if (touchedCount > 0) {
            // drop every body this pass read from the mover list, keeping the
            // rest in order, then merge the ones that are movers now back in by
            // their sort key
            for (i = 0; i < moversLength; i++) {
                var kept = movers[i];
                if (kept._gsStamp !== stamp) {
                    movers[moverCount++] = kept;
                }
            }

            // arrivals are few: insertion sort by the key
            for (i = 1; i < arrivalCount; i++) {
                var arriving = arrivals[i],
                    arrivingKey = arriving._sWorldIndex,
                    at = i;
                while (at > 0 && arrivals[at - 1]._sWorldIndex > arrivingKey) {
                    arrivals[at] = arrivals[at - 1];
                    at--;
                }
                arrivals[at] = arriving;
            }

            var total = moverCount + arrivalCount,
                from = moverCount - 1,
                take = arrivalCount - 1,
                write = total - 1;

            // grown by push so the list stays packed, then merged from the end
            while (movers.length < total) {
                movers.push(null);
            }

            while (take >= 0) {
                var arrival = arrivals[take];
                if (from >= 0 && movers[from]._sWorldIndex > arrival._sWorldIndex) {
                    movers[write--] = movers[from--];
                } else {
                    movers[write--] = arrival;
                    arrivals[take--] = null;
                }
            }

            if (movers.length !== total) {
                movers.length = total;
            }
        }

        g.staticCount = n - movers.length;
        g.classifyDirty = staticDirty;
    };

    /**
     * Builds `Engine.update`'s mover list (every body in `world` that is
     * neither static nor sleeping, in body order) into `moverBodies` from
     * what the grid classification already knows, instead of walking
     * every body, and returns whether it could.
     *
     * The detector's mover list is exact for the world as its last
     * classification saw it, and every change since is in the world's body
     * journal, not yet read (see _classifyFromJournal). A body not in the
     * journal keeps its role, so the engine's movers among those are the
     * detector's movers that are neither static nor sleeping (the detector
     * also counts a resting body promoted by a move, `_sMoved`); each body in
     * the journal is read as it is now, and merged in by `_sWorldIndex` like
     * the detector's own. The journal is only read here, never emptied: the
     * detector reads it later in the same update.
     *
     * It can only when the journal describes every change since that
     * classification, which are the conditions under which the detector reads
     * it itself, and when `world.bodies` is still the array that
     * classification read. The journal describes the WORLD as it is now, and
     * `Engine.update` steps the array it took at its start: a listener that
     * adds or removes a body during the update (a `sleepStart` listener,
     * say, which runs before this) gives the world a fresh array the update
     * does not step, and a caller that replaces `world.bodies` without
     * signalling changes the world under a journal that never saw it. Either
     * leaves the world an array the last classification never read, and the
     * update then walks. Outside those, the array keeps its identity (an add
     * or a remove between updates edits it in place), so the test costs the
     * common case nothing.
     * @private
     * @method _moversFromJournal
     * @param {detector} detector
     * @param {composite} world
     * @param {body[]} moverBodies
     * @return {boolean}
     */
    Detector._moversFromJournal = function(detector, world, moverBodies) {
        var g = detector._sgrid;

        if (g === undefined || g === null || !g.built || g.journalWorld !== world
            || g.classifyBodies !== world.bodies
            || world._journalLive !== true || g.journalGen !== world._memberGen
            || world._journalLength !== world.bodies.length
            || world._journalForeignWalks !== Common._foreignWalks) {
            return false;
        }

        var touched = world._touched,
            touchedCount = world._touchedCount,
            memberGen = world._memberGen,
            movers = g.movers,
            moversLength = movers.length,
            arrivals = g.arrivals,
            stamp = ++gridStamp,
            arrivalCount = 0,
            moverCount = 0,
            i;

        for (i = 0; i < touchedCount; i++) {
            var body = touched[i];

            if (body._gsStamp === stamp) {
                continue;
            }

            body._gsStamp = stamp;

            if (body._sOwner === world && body._sWalk === memberGen
                && !(body.isStatic || body.isSleeping)) {
                arrivals[arrivalCount++] = body;
            }
        }

        for (i = 0; i < moversLength; i++) {
            var kept = movers[i];
            if (kept._gsStamp !== stamp && !(kept.isStatic || kept.isSleeping)) {
                moverBodies[moverCount++] = kept;
            }
        }

        // arrivals are few: insertion sort by the key
        for (i = 1; i < arrivalCount; i++) {
            var arriving = arrivals[i],
                arrivingKey = arriving._sWorldIndex,
                at = i;
            while (at > 0 && arrivals[at - 1]._sWorldIndex > arrivingKey) {
                arrivals[at] = arrivals[at - 1];
                at--;
            }
            arrivals[at] = arriving;
        }

        var total = moverCount + arrivalCount,
            from = moverCount - 1,
            take = arrivalCount - 1,
            write = total - 1;

        // grown by push so the list stays packed, then merged from the end
        while (moverBodies.length < total) {
            moverBodies.push(null);
        }

        while (take >= 0) {
            var arrival = arrivals[take];
            if (from >= 0 && moverBodies[from]._sWorldIndex > arrival._sWorldIndex) {
                moverBodies[write--] = moverBodies[from--];
            } else {
                moverBodies[write--] = arrival;
                arrivals[take--] = null;
            }
        }

        if (moverBodies.length !== total) {
            moverBodies.length = total;
        }

        return true;
    };

    /**
     * Stamps every body in `bodies` with `walkStamp` and makes `liveWorld` its
     * owner, the check a full walk runs before it restarts the world's body
     * journal, and returns whether the array holds any body twice (which no
     * journal can describe). A body the world's last walk stamped (`ownedGen`)
     * is owned by it already (see Composite._ownedGen), so for every body but
     * the few that came in since this is one comparison and `_sOwner`, which
     * lies past the cache line the walk touches, is never read. A body taken
     * from a composite whose journal held it switches that journal off.
     * @private
     * @method _claimBodies
     * @param {body[]} bodies
     * @param {number} n
     * @param {composite} liveWorld
     * @param {number} ownedGen
     * @param {number} walkStamp
     * @return {boolean}
     */
    Detector._claimBodies = function(bodies, n, liveWorld, ownedGen, walkStamp) {
        var duplicate = false;

        for (var i = 0; i < n; i++) {
            var body = bodies[i],
                lastWalk = body._sWalk;

            if (lastWalk !== ownedGen) {
                if (lastWalk === walkStamp) {
                    // seen already in this pass: the array holds it twice
                    duplicate = true;
                } else {
                    // not known to be owned by this world (it came in by a
                    // direct edit, say)
                    var owner = body._sOwner;
                    if (owner !== liveWorld) {
                        if (owner !== null) {
                            owner._journalLive = false;
                        }
                        body._sOwner = liveWorld;
                    }
                }
            }

            body._sWalk = walkStamp;
        }

        return duplicate;
    };

    /**
     * The full classification walk of `_collisionsGrid`: every body in
     * `bodies` classified as a mover or a static, the static index told what
     * changed, and the body journal restarted from the walk when it can be.
     * Writes `g.movers`, `g.pendingAdd`, `g.staticCount`, and in
     * `g.classifyDirty` whether the static set changed. The fallback to the
     * body journal's own pass, `_classifyFromJournal`, which writes the same.
     * @private
     * @method _classifyWalk
     * @param {object} g
     * @param {body[]} bodies
     * @param {number} n
     * @param {composite|null} world the world `Engine.update` named, if any
     * @param {composite|null} liveWorld `world` when `bodies` is its own array
     */
    Detector._classifyWalk = function(g, bodies, n, world, liveWorld) {
        var movers = g.movers,
            staticDirty = false,
            staticCount,
            // an array the named world no longer holds: the one Engine.update
            // lent, which a listener replaced during this update by adding or
            // removing a body (see Composite._ownBodies). A body it removed
            // and added back is re-indexed below where it sits in THIS array,
            // but it sits elsewhere in the world's new one, which the next
            // classification walks; so it keeps its departure mark for that
            // walk to re-index it again (otherwise its buckets keep the order
            // of the array it left, not the one a rebuild would give)
            keepDeparted = world !== null && liveWorld === null && world.bodies !== bodies,
            i;

        // `movers` is filled BY INDEX and trimmed once below, rather than
        // cleared with `movers.length = 0` and re-pushed. Clearing to zero
        // drops the backing store, so every rebuild regrows it from empty
        // and allocates; writing in place reuses it. This is the idiom the
        // engine's own mover classification already uses (`Engine.update`)
        var moverCount = 0,
            duplicate = false;
        staticCount = 0;

        // this walk is also where the static index learns what changed, so
        // it stamps every body it sees. A body still in the index whose
        // stamp is stale on the next pass has LEFT the world, which is the
        // one kind of change no per-body flag can report. The stamp is
        // unique across every detector, since it also serves as the body
        // journal's membership generation (see Common._journalTouch)
        var walkStamp = g.walkStamp = ++Common._walkStamp,
            ownedGen = liveWorld !== null ? liveWorld._ownedGen : 0,
            // whether this walk checks the world for a body journal
            // to start (no body twice, every body owned by the world): only
            // where the journal would be read (see Detector._journalMoverShare)
            verify = liveWorld !== null && movers.length <= n * Detector._journalMoverShare,
            pendingAdd = g.pendingAdd;
        pendingAdd.length = 0;

        // A journal switched off before it was ever read is the mark
        // of a caller that edits the body array directly and signals
        // `Composite.setModified` on every update, for whom the check
        // is a pure cost; after each such journal the check waits for
        // twice as many walks, up to 63
        if (verify) {
            if (g.journalWorld === liveWorld) {
                g.journalFailures = g.journalUsed ? 0 : Math.min(g.journalFailures + 1, 6);
                g.journalSkip = (1 << g.journalFailures) - 1;
            }
            if (g.journalSkip > 0) {
                g.journalSkip--;
                verify = false;
            }
        }

        // a walk of any array that is not its world's own replaces
        // stamps some journal may count on, which is recorded once here
        // rather than looked up per body (see Common._foreignWalks)
        if (liveWorld === null) {
            Common._foreignWalks++;
        }

        // the check is a pass of its own, ahead of the walk, so the walk below
        // is the same loop as before the journal. Folded into the walk as a
        // branch, it measured 2 to 3 percent slower on a whole traversal step
        // even on the updates where the branch was never taken
        if (verify) {
            duplicate = Detector._claimBodies(bodies, n, liveWorld, ownedGen, walkStamp);
        }

        for (i = 0; i < n; i++) {
            var body = bodies[i],
                // a resting body a setter moved after it was indexed (e.g. an
                // inner-scroll surface that is static but moves each tick, see
                // Body._promoteIfIndexed) is a mover, so it is re-bucketed
                // every step and never goes stale in the static index
                isStaticNow = (body.isStatic || body.isSleeping) && body._sMoved !== true;

            body._sWalk = walkStamp;
            body._sWorldIndex = i;

            // removed from the world and added back before this walk ran,
            // so it is still indexed but may now sit at a different place in
            // the body array. Drop it from the index and let the pass below
            // re-insert it at its new position, or bucket order would no
            // longer match the order a full rebuild produces
            if (body._sDeparted) {
                body._sDeparted = keepDeparted;
                // out of the world it was in no mover index, so the
                // per-cell invalidation sweep could not reach it
                body._scEpoch = -1;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }

            if (body._sPrev !== isStaticNow) {
                body._sPrev = isStaticNow;
                // same reason: while it was static it was not a mover, so
                // any cell that changed under it went unreported to it
                body._scEpoch = -1;
                staticDirty = true;
            }

            if (isStaticNow) {
                staticCount++;
                if (!body._sIndexed) {
                    pendingAdd.push(body);
                    staticDirty = true;
                }
            } else {
                movers[moverCount++] = body;
                if (body._sIndexed) {
                    // released into a mover: unindex it here, so the apply
                    // pass below never has to walk the membership list
                    // looking for it
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }
        }

        // the trim is NOT optional. The ONE read of `movers.length` below
        // (snapshotted into `moversLength`) is what bounds every consumer
        // of it, so a slot left over from a longer previous list is read
        // as a live mover. Held by Detector.spec's shrinking-mover-set
        // test, which is the only gate that can see it: every other one
        // either builds a fresh detector per scene or only ever shrinks
        // the STATIC set
        if (movers.length !== moverCount) {
            movers.length = moverCount;
        }

        g.staticCount = staticCount;

        // every body in the world is now stamped by this walk and owned
        // by the world. Start the body journal from the walk, when it
        // walked a flat world's own array and found no body twice;
        // otherwise the world's journal no longer matches the stamps
        // this walk wrote
        if (verify) {
            liveWorld._ownedGen = walkStamp;
        }

        if (verify && !duplicate) {
            Detector._journalStart(g, liveWorld, walkStamp, n);
        } else {
            if (world !== null) {
                world._journalLive = false;
            }
            g.journalWorld = null;
        }

        g.classifyDirty = staticDirty;
    };

    /**
     * The grid broadphase (`detector.broadphase === 'grid'`): a uniform grid
     * with a static index. The static field (intact page) is bucketed ONCE and
     * reused; only dynamic bodies (movers) are re-bucketed each step, and only
     * movers drive candidate generation. Static-static pairs are never visited (no resolved collision
     * can be static-static), so a calm page costs ~O(movers) per step instead of
     * O(all bodies) like the sweep. Re-baseline: emission order differs from the
     * sweep but is deterministic.
     *
     * The static index is rebuilt only when the static membership changes
     * (detected per body via a cached `_sPrev` flag plus a `staticCount` guard),
     * e.g. on release. A resting body that MOVES while staying at rest (an
     * inner-scroll surface) is promoted to a mover by the `Body` setter that
     * moved it, once the index holds it (see Body._promoteIfIndexed), and is a
     * mover from then on; nothing has to tag it.
     *
     * The static buckets (and the oversized-static list) hold body REFERENCES,
     * not indices into `detector.bodies`. The index outlives a step, but Matter
     * changes `detector.bodies` on any add or remove (a flat world's own array,
     * edited in place), which reorders and shrinks it. Since the rebuild
     * fires only on static-membership changes, a stored index could point at the
     * wrong body or past the array end on a later step; a reference cannot.
     *
     * The consumer greps its built bundle for this function's NAME to prove it
     * shipped this fork rather than upstream, so renaming it breaks that
     * build, loudly and on purpose.
     *
     * Every per-body field this path writes (`_sPrev`, `_gsStamp`,
     * `_sMoved`, `_sc*`, `_s*` index membership) is pre-declared in
     * `Body.create`; see the rule there before introducing a new one (a lazily
     * added field splits body hidden classes and slows the whole engine,
     * measured 1.3-4.8x).
     *
     * Because that state lives on the BODY rather than on the detector, a body
     * belongs to one grid detector at a time. It can MOVE between worlds that
     * two grid engines step (removed from one, added to the other): the index
     * state names the grid that holds it (`_sGrid`), and the removal takes it
     * out of that index whole (see _staticIndexRemove). A body indexed by two
     * grids at once (two stepped worlds holding it, or a second grid detector
     * run over a world another grid engine steps) is unsupported: the last to
     * index it holds it, and the other answers wrongly for it.
     * @private
     * @method _collisionsGrid
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector._collisionsGrid = function(detector) {
        var bodies = detector.bodies,
            n = bodies.length,
            pairs = detector.pairs,
            canCollide = Detector.canCollide,
            collisions = detector.collisions,
            collisionIndex = 0,
            cellSize = detector.cellSize,
            invCell = 1 / cellSize,
            keyOffset = 0x100000,
            keyStride = 0x200000,
            maxCells = 24,
            i, cx, cy, u, key;

        var g = detector._sgrid;
        if (!g) {
            g = detector._sgrid = {
                // static index: an open-addressing cell table (see
                // _createCellTable) holding body REFERENCES per cell, kept in
                // world order, and maintained as a difference across steps
                // (see _staticIndexApply) rather than rebuilt
                sTable: Detector._createCellTable(), sOver: [], sFlat: [],
                // every body currently in the index, so a departure from the
                // world (which no per-body flag can report) is found by
                // scanning for a stale walk stamp; plus this step's insertions
                indexed: [], pendingAdd: [], walkStamp: 0,
                // the world whose body journal this index follows, and the
                // stamp of the full walk that started it (see
                // _classifyFromJournal); the journal pass's scratch list of
                // bodies joining the movers, and whether it changed the statics
                journalWorld: null, journalGen: -1, arrivals: [], classifyDirty: false,
                // whether the journal this index started has been read since,
                // and the back-off for one that keeps being switched off unread
                // (see the full walk below)
                journalUsed: false, journalFailures: 0, journalSkip: 0,
                // sFlat is the flat list of non-oversized statics that only an
                // OVERSIZED MOVER reads, so it is rebuilt lazily, on the rare
                // steps one exists, instead of maintained on every change
                sFlatValid: false,
                movers: [], built: false, indexedStaticCount: -1,
                // classification cache: the movers list and static count are
                // only recomputed when the body set or any body's
                // moving-vs-resting role actually changed
                classifyBodies: null, classifyLength: -1, classifyEpoch: -1,
                classifySetEpoch: -1,
                staticCount: 0,
                // mover cell index, rebuilt every step: per-cell chain heads
                // over a flat entry list (`dNext` / `dItem` / `dKey`) addressed
                // by arithmetic over the movers' bounding cell rectangle, plus
                // the per-mover cell spans `dSpan` shared by its two passes.
                // Reused buffers, so the steady state does not allocate
                dHead: new Int32Array(0), dNext: new Int32Array(0),
                dItem: new Int32Array(0), dKey: new Float64Array(0),
                dSpan: new Float64Array(0), dOver: [],
                // the movers' own bounds and visited stamps, flattened off the
                // body objects so the generation pass tests candidates against
                // contiguous memory
                mBounds: new Float64Array(0), mStamp: new Int32Array(0),
                mOver: new Int32Array(0),
                // each mover's FIRST entry index in the chain arrays. Its
                // remaining cells are the following slots, in the same order
                // both passes walk them, which is what lets the generation pass
                // start a chain walk past its own entry (see below)
                mEntry: new Int32Array(0),
                // static-index build epoch: bumped on every full REBUILD (where
                // every bucket changes) so each mover's cached static-candidate
                // list can be validated cheaply. An incremental change reports
                // the cells it touched here instead, as flat (cx, cy) pairs
                // consumed once per step by the invalidation sweep below.
                // Only the first `changedCount` values are live (see there)
                epoch: 0, changedCells: [], changedCount: 0,
                // the cell size the index was built at. NaN, which no cell size
                // equals, so the first step checks the detector's like any change
                cellSize: NaN
            };
        }

        var cellHash = Detector._cellHash,
            cellGet = Detector._cellGet,
            cellGetOrCreate = Detector._cellGetOrCreate;

        // a cell-size change invalidates every bucket key, including the
        // persistent static index built under the old size; force a rebuild
        // (without this, live cell-size tuning queries stale static buckets
        // and silently misses mover-vs-static collisions). A cell size is
        // checked here, where one is first seen (the first step included, as
        // the seed is NaN), so a bad one assigned to `detector.cellSize`
        // throws rather than indexing nothing or looping forever
        if (g.cellSize !== cellSize) {
            if (!Detector._isCellSize(cellSize)) {
                throw Detector._cellSizeError(cellSize);
            }
            g.cellSize = cellSize;
            g.built = false;
        }

        // 1) classify bodies into movers (dynamic) vs static, detecting any
        // change to the static set (release, add, remove) so the static index
        // is only rebuilt when it actually changed.
        //
        // This walk touches every body in the world, and on a dense static page
        // (thousands of intact tiles) it is memory-bound and one of the largest
        // single costs in the step, while its ANSWER almost never changes: the
        // mover set only moves when the body set changes (add / remove, each of
        // which bumps Common._bodySetEpoch) or when some body's
        // moving-vs-resting role flips (`Body.setStatic`, `Sleeping.set`, and
        // a setter promoting a moved indexed resting body, each of which bumps
        // the static epoch). So cache the result and rebuild only on those
        // signals.
        //
        // And when it has to be rebuilt, the change is usually a handful of
        // bodies in a world of thousands, which is where the body journal comes
        // in (see Common._journalTouch): for a flat world stepped by an engine,
        // the rebuild classifies just the bodies the journal records
        // (`_classifyFromJournal`), and the full walk below runs only when the
        // journal cannot describe the change.
        //
        // The body-set signal is that epoch AND the identity and length of
        // `detector.bodies`, rather than a flag set by `setBodies`. The epoch
        // is what sees a change to `world.bodies` in place (the array
        // `Engine.update` hands over for a flat world, whose identity never
        // changes), including one made between updates and read by a direct
        // call here; the identity and length keep a caller that assigns the
        // array directly correct. The cached movers list describes the array,
        // so a stale one keeps a body that left it or misses one that joined.
        var movers = g.movers,
            staticDirty = !g.built,
            staticCount = g.staticCount,
            classifyEpoch = Common._bodyStaticEpoch,
            classifySetEpoch = Common._bodySetEpoch;

        if (g.classifyBodies !== bodies || g.classifyLength !== n || g.classifyEpoch !== classifyEpoch
            || g.classifySetEpoch !== classifySetEpoch) {
            // whether this is the array the last classification read. A flat
            // world keeps its array through every add and remove made between
            // updates; a new one is a copy a listener's change made during an
            // update (which the journal recorded), or an array a caller put in
            // the world's place without a signal (which the journal cannot
            // have seen, and which keeps its length if it swapped a body). The
            // two look alike from here, so a new array is walked: one walk
            // after a listener's change, none in a world changed between updates
            var sameArray = g.classifyBodies === bodies;
            g.classifyBodies = bodies;
            g.classifyLength = n;
            g.classifyEpoch = classifyEpoch;
            g.classifySetEpoch = classifySetEpoch;

            // the world whose body array this is, when `Engine.update` handed
            // it over as the world's own (see Detector.setBodies). Only then can
            // the world's body journal say what changed in it, and the
            // classification reads that instead of walking every body
            // (a detector made as a plain object rather than by
            // Detector.create has no `_world` at all, and is used on its own)
            var world = detector._world === undefined ? null : detector._world,
                liveWorld = world !== null && world.bodies === bodies ? world : null;

            // the journal is read only while it describes every change since
            // this index's last full walk: started by that walk, still live,
            // over the same array, and accounting for the array's length (a
            // caller that edits the array without signalling changes that first)
            if (liveWorld !== null && sameArray && g.built && liveWorld._journalLive === true
                && g.journalWorld === liveWorld && g.journalGen === liveWorld._memberGen
                && liveWorld._journalLength === n && liveWorld._journalForeignWalks === Common._foreignWalks
                && movers.length <= n * Detector._journalMoverShare) {
                Detector._classifyFromJournal(g, liveWorld, n);
                g.journalUsed = true;
                staticCount = g.staticCount;
                if (g.classifyDirty) {
                    staticDirty = true;
                }
            } else {
                Detector._classifyWalk(g, bodies, n, world, liveWorld);
                staticCount = g.staticCount;
                if (g.classifyDirty) {
                    staticDirty = true;
                }
            }

            // A change in static count means a static body was added to or
            // removed from the world (windowing add/remove, etc.). A removal is
            // invisible to every per-body flag above, so the count is what says
            // the indexed list needs re-scanning for departures.
            if (staticCount !== g.indexedStaticCount) {
                staticDirty = true;
            }
        }

        // 2) maintain the persistent static index.
        //
        // The index is only ever WRONG for the statics that actually changed:
        // one released tile, one windowed add or remove. Everything else sits in
        // exactly the buckets it was already in. So instead of clearing every
        // bucket and re-filling it from a full walk of the world, apply just the
        // difference.
        //
        // This is what makes destruction affordable. A full rebuild is triggered
        // by ANY static membership change, which on a page being actively
        // destroyed is EVERY step, and it costs a cell-span computation plus a
        // hash and probe of a table far larger than L2 for every (static, cell)
        // pair in the world. Measured on `bench/profile-churn.js` it was 781us
        // of a 1427us step, with the answer already correct for 99.8% of the
        // statics it recomputed.
        //
        // Bucket contents stay in `detector.bodies` order (the order a full
        // rebuild produces, and so the candidate emission order the simulation
        // is baselined on) because inserts go in at the position given by
        // `_sWorldIndex`, restamped for every body by the classification walk
        // above whenever the body array can have changed. Removals splice, which
        // preserves the order of what remains.
        if (staticDirty && !g.built) {
            Detector._staticIndexRebuild(g, bodies, n, cellSize, invCell, maxCells);
        } else if (staticDirty) {
            Detector._staticIndexApply(g, cellSize, invCell, maxCells, staticCount);

            // Safety net. `indexed` should hold exactly the bodies counted as
            // static by the walk above; if the two ever disagree, some mutation
            // reached the world by a route this pass cannot see, so fall back to
            // a full rebuild on the next step rather than querying a wrong
            // index (which would silently drop collisions).
            if (g.indexed.length !== staticCount) {
                g.built = false;
            }
        }

        g.indexedStaticCount = staticCount;

        // 3) rebuild the mover cell index each step.
        //
        // Unlike the static index this one is thrown away and rebuilt every
        // step, so its per-insert cost is paid ~movers * cellsPerMover times per
        // step and was one of the larger single costs in a calm scene. It is
        // therefore NOT a hash table: the movers of one step occupy a small
        // bounding rectangle of cells, so the index is a flat array of per-cell
        // chain heads addressed by plain arithmetic, with the chains threaded
        // through parallel entry arrays. No hashing, no probing, no per-cell
        // bucket array, no touched-key list.
        //
        // The rectangle is masked to a power of two per axis and capped, so a
        // pathological spread (one mover at the top of a very long page, one at
        // the bottom) wraps into the same slots instead of allocating a huge
        // grid; each entry therefore carries its packed cell key and chain walks
        // verify it. Unwrapped (the normal case) every check passes.
        var dOver = g.dOver,
            moversLength = movers.length;
        dOver.length = 0;

        // pass A: per-mover cell span, oversize classification, and the bounding
        // cell rectangle. Spans are kept in a scratch array so the insert pass
        // does not recompute them. It must hold floats: a body with NaN bounds
        // yields a NaN span whose cell loops iterate zero times, and coercing
        // that to an integer would index real cells instead.
        var dSpan = g.dSpan,
            mBounds = g.mBounds,
            mStamp = g.mStamp,
            mOver = g.mOver,
            mEntry = g.mEntry;

        if (dSpan.length < moversLength * 4) {
            var moverCapacity = (moversLength + 16) * 2;
            dSpan = g.dSpan = new Float64Array(moverCapacity * 4);
            // the movers' own bounds, flattened. The generation pass below runs
            // every bounds test against these instead of chasing
            // body -> bounds -> min / max, so it reaches a body object only for
            // a candidate that survives its bounds test
            mBounds = g.mBounds = new Float64Array(moverCapacity * 4);
            // the visited stamp that dedups a mover reached through several
            // cells, likewise flattened off the body
            mStamp = g.mStamp = new Int32Array(moverCapacity);
            mOver = g.mOver = new Int32Array(moverCapacity);
            mEntry = g.mEntry = new Int32Array(moverCapacity);
        }

        var minCx = Infinity,
            maxCx = -Infinity,
            minCy = Infinity,
            maxCy = -Infinity,
            dEntryCount = 0,
            mIns,
            spanBase;

        for (mIns = 0; mIns < moversLength; mIns++) {
            var dbody = movers[mIns],
                dBounds = dbody.bounds,
                dMinX = dBounds.min.x,
                dMaxX = dBounds.max.x,
                dMinY = dBounds.min.y,
                dMaxY = dBounds.max.y,
                dcx0 = Math.floor(dMinX * invCell),
                dcx1 = Math.floor(dMaxX * invCell),
                dcy0 = Math.floor(dMinY * invCell),
                dcy1 = Math.floor(dMaxY * invCell);

            spanBase = mIns * 4;
            mBounds[spanBase] = dMinX;
            mBounds[spanBase + 1] = dMaxX;
            mBounds[spanBase + 2] = dMinY;
            mBounds[spanBase + 3] = dMaxY;
            mStamp[mIns] = -1;

            if ((dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) > maxCells) {
                mOver[mIns] = 1;
                dOver.push(mIns);
                // an unwalkable span, so the insert pass skips this mover
                // without having to re-read the oversize flag
                dSpan[spanBase] = NaN;
                continue;
            }

            mOver[mIns] = 0;
            dSpan[spanBase] = dcx0;
            dSpan[spanBase + 1] = dcx1;
            dSpan[spanBase + 2] = dcy0;
            dSpan[spanBase + 3] = dcy1;

            // NaN spans fail every comparison, so they neither widen the
            // rectangle nor contribute entries, matching the zero cell loops
            // they produce below
            if (dcx0 < minCx) { minCx = dcx0; }
            if (dcx1 > maxCx) { maxCx = dcx1; }
            if (dcy0 < minCy) { minCy = dcy0; }
            if (dcy1 > maxCy) { maxCy = dcy1; }
            dEntryCount += (dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) || 0;
        }

        var dShiftW = 0,
            dShiftH = 0;

        if (dEntryCount > 0) {
            dShiftW = Detector._cellShiftFor(maxCx - minCx + 1);
            dShiftH = Detector._cellShiftFor(maxCy - minCy + 1);
        }

        var dMaskW = (1 << dShiftW) - 1,
            dMaskH = (1 << dShiftH) - 1,
            dSlots = 1 << (dShiftW + dShiftH),
            dHead = g.dHead,
            dNext = g.dNext,
            dItem = g.dItem,
            dKeyArr = g.dKey;

        if (dHead.length < dSlots) {
            dHead = g.dHead = new Int32Array(dSlots);
        }
        if (dNext.length < dEntryCount) {
            var entryCapacity = (dEntryCount + 64) * 2;
            dNext = g.dNext = new Int32Array(entryCapacity);
            dItem = g.dItem = new Int32Array(entryCapacity);
            dKeyArr = g.dKey = new Float64Array(entryCapacity);
        }

        dHead.fill(-1, 0, dSlots);

        // pass B: insert. Walked in DESCENDING mover order and pushed onto the
        // front of each chain, so a chain reads back in ascending mover order,
        // exactly the order the previous per-cell bucket arrays produced.
        var dEntry = 0;
        for (mIns = moversLength - 1; mIns >= 0; mIns--) {
            // where this mover's own entries start. A mover with a NaN span
            // contributes none, and the value is then never read (its cell
            // loops iterate zero times in the generation pass too)
            mEntry[mIns] = dEntry;
            spanBase = mIns * 4;
            var iSpanCx1 = dSpan[spanBase + 1],
                iSpanCy0 = dSpan[spanBase + 2],
                iSpanCy1 = dSpan[spanBase + 3];

            for (cx = dSpan[spanBase]; cx <= iSpanCx1; cx++) {
                var iKeyX = (cx + keyOffset) * keyStride,
                    iSlotX = (cx - minCx) & dMaskW;

                for (cy = iSpanCy0; cy <= iSpanCy1; cy++) {
                    var iSlot = iSlotX | (((cy - minCy) & dMaskH) << dShiftW);
                    dKeyArr[dEntry] = iKeyX + (cy + keyOffset);
                    // the mover's ORDINAL in `movers`, not its index in
                    // `bodies`: it addresses the flat mover arrays directly and
                    // orders identically (movers are collected in body order)
                    dItem[dEntry] = mIns;
                    dNext[dEntry] = dHead[iSlot];
                    dHead[iSlot] = dEntry;
                    dEntry++;
                }
            }
        }

        // 3b) invalidate the static-candidate cache of every mover standing over
        // a cell whose static occupants changed this step.
        //
        // A mover's cached list is built from exactly the cells in its span, so
        // the mover index just built is the reverse lookup this needs: resolve
        // each reported cell to its chain and stamp the movers on it. A cell
        // outside the movers' bounding rectangle wraps to some slot whose
        // entries all fail the key test, which is the right answer (no mover
        // covers it). Typical cost is a few dozen cells against the thousands of
        // list rebuilds the old global epoch bump forced.
        //
        // `changedCells` is filled BY INDEX and bounded by `g.changedCount`,
        // never by its length, so a step's reports are dropped by zeroing the
        // count: no length store (a StoreIC call in TurboFan) and no backing
        // store dropped and regrown every step. Slots past the count are stale
        // cells from a longer earlier step and nothing reads them
        var changedCells = g.changedCells,
            changedLength = g.changedCount;

        if (changedLength > 0) {
            if (dEntryCount > 0) {
                for (i = 0; i < changedLength; i += 2) {
                    var dcx = changedCells[i],
                        dcy = changedCells[i + 1],
                        dcKey = (dcx + keyOffset) * keyStride + (dcy + keyOffset),
                        dcSlot = ((dcx - minCx) & dMaskW) | (((dcy - minCy) & dMaskH) << dShiftW);

                    for (var dce = dHead[dcSlot]; dce !== -1; dce = dNext[dce]) {
                        if (dKeyArr[dce] !== dcKey) {
                            continue;
                        }
                        movers[dItem[dce]]._scEpoch = -1;
                    }
                }
            }

            g.changedCount = 0;
        }

        // 4) candidate generation: each mover is an outer body; pair it with
        // static occupants (mover-static) and higher-index movers (mover-mover).
        // No static body is ever an outer, so static-static is never generated.
        var sOver = g.sOver,
            sOverLength = sOver.length,
            sFlat = g.sFlat,
            dOverLength = dOver.length;

        // sFlat is read by nothing but the oversized-mover branch below, so it
        // is built here, only on a step that actually has one, rather than
        // being kept in sync by every index change. It is built in body order,
        // which is the order the branch needs
        if (dOverLength > 0 && !g.sFlatValid) {
            sFlat.length = 0;
            for (i = 0; i < n; i++) {
                var flatBody = bodies[i];
                if (flatBody._sIndexed && flatBody._sGrid === g && flatBody._sBuckets.length > 0) {
                    sFlat.push(flatBody);
                }
            }
            g.sFlatValid = true;
        }

        var sFlatLength = sFlat.length;
        for (var mGen = 0; mGen < moversLength; mGen++) {
            var mBoundsBase = mGen * 4,
                m = movers[mGen],
                mMinX = mBounds[mBoundsBase], mMaxX = mBounds[mBoundsBase + 1],
                mMinY = mBounds[mBoundsBase + 2], mMaxY = mBounds[mBoundsBase + 3],
                mFilter = m.collisionFilter,
                // a moved static promoted to a mover must still not generate
                // static-static pairs (the sweep skips those)
                mStatic = m.isStatic || m.isSleeping,
                localStamp = ++gridStamp,
                mIsOver = mOver[mGen] === 1;

            // Oversized mover: its bounds span more than maxCells cells, so it
            // was NOT inserted into the dynamic index. Walking its full cell
            // span here is unbounded: a runaway-velocity body can span thousands
            // of cells, and an Infinity bound makes `mcx1`/`mcy1` Infinity, so
            // `for (cx = ...; cx <= Infinity; cx++)` would never terminate (the
            // hang this guard fixes). Scan the flat
            // static list for normal statics it overlaps, a bounded O(statics).
            // Normal movers find THIS body via their own oversized pass (it is
            // in dOver); oversized statics/movers are handled by the sOver/dOver
            // passes below. Skipped for a static (promoted, moving) mover, since
            // static-static never resolves.
            if (mIsOver) {
                // not in the mover index, so the sweep above cannot reach it;
                // drop its cached list rather than let it survive an oversized
                // spell and validate against cells that changed meanwhile
                m._scEpoch = -1;

                if (!mStatic) {
                    for (var sfi = 0; sfi < sFlatLength; sfi++) {
                        var fsBody = sFlat[sfi],
                            fsBounds = fsBody.bounds;
                        if (mMaxX < fsBounds.min.x || mMinX > fsBounds.max.x || mMaxY < fsBounds.min.y || mMinY > fsBounds.max.y) {
                            continue;
                        }
                        if (!canCollide(mFilter, fsBody.collisionFilter)) {
                            continue;
                        }
                        collisionIndex = Detector._testPair(m, fsBody, pairs, collisions, collisionIndex);
                    }
                }
            } else {
                // the insert pass already floored this mover's cell span from
                // the same flattened bounds, so reuse it (an oversized mover's
                // span slots are unusable, but that branch never reads them)
                var mcx0 = dSpan[mBoundsBase],
                    mcx1 = dSpan[mBoundsBase + 1],
                    mcy0 = dSpan[mBoundsBase + 2],
                    mcy1 = dSpan[mBoundsBase + 3];

                // static-candidate cache: while this mover's cell span, its
                // static-vs-static role and the static index are all
                // unchanged, the set of statics sharing cells with it cannot
                // change either, so the per-cell static bucket lookups are
                // skipped and the cached candidate list is re-tested directly
                // (bounds overlap and collision filters are still evaluated
                // every step). Resting debris hits this cache nearly every
                // step; a fast mover (bullet) misses and pays the same fused
                // walk it always did. Emission order is movers-then-statics on
                // BOTH paths so a cache hit and a miss produce the identical
                // collision order (a cache-state-dependent order would fork
                // trajectories).
                var scList = m._scList,
                    scValid = scList !== null
                        && m._scEpoch === g.epoch
                        && m._scStatic === mStatic
                        && m._scCx0 === mcx0 && m._scCx1 === mcx1
                        && m._scCy0 === mcy0 && m._scCy1 === mcy1;

                if (!scValid) {
                    if (scList === null) {
                        scList = m._scList = [];
                    }
                    // popped, not `scList.length = 0`: TurboFan compiles a length
                    // store to a StoreIC call, and a store to zero also drops the
                    // backing store the pushes below then regrow. The inlined pop
                    // loop has neither. 291 of these per storm step
                    while (scList.length !== 0) {
                        scList.pop();
                    }
                    if (m._scBounds === null) {
                        m._scBounds = new Float64Array(32);
                    }
                    m._scEpoch = g.epoch;
                    m._scStatic = mStatic;
                    m._scCx0 = mcx0;
                    m._scCx1 = mcx1;
                    m._scCy0 = mcy0;
                    m._scCy1 = mcy1;
                }

                // this mover's own chain entry for the cell about to be walked.
                // Pass B inserted movers in DESCENDING ordinal and head-pushed,
                // so a chain reads back ASCENDING and everything at or before
                // this mover's own entry is rejected by the `dj <= mGen` test
                // below. Starting at `dNext[own]` therefore emits the identical
                // subsequence in the identical order while skipping the whole
                // lower prefix, and costs no `dHead` load: the mover's entries
                // are contiguous from `mEntry[mGen]` in the same cell order
                // this loop walks
                var selfEntry = mEntry[mGen];

                for (cx = mcx0; cx <= mcx1; cx++) {
                    var mKeyX = (cx + keyOffset) * keyStride,
                        mCxOffset = cx + keyOffset;

                    for (cy = mcy0; cy <= mcy1; cy++) {
                        var cyOffset = cy + keyOffset;
                        key = mKeyX + cyOffset;

                        // collect static candidates on a cache miss (tested
                        // from the list after the walk; skipped when the outer
                        // body is itself static, as a promoted moving static vs
                        // the static page is static-static and never resolves).
                        // The cell hash is only needed here, so a mover holding
                        // its cached list pays no hashing at all
                        if (!scValid) {
                            var sOcc = mStatic ? undefined : cellGet(g.sTable, key, cellHash(mCxOffset, cyOffset));
                            if (sOcc !== undefined) {
                                for (var si = 0; si < sOcc.length; si++) {
                                    var sBody = sOcc[si];
                                    if (sBody._gsStamp === localStamp) {
                                        continue;
                                    }
                                    sBody._gsStamp = localStamp;

                                    // capture the candidate's bounds alongside
                                    // it, so the per-step test loop never
                                    // dereferences a static that misses
                                    var scSlot = scList.length * 4,
                                        scStore = m._scBounds;
                                    if (scStore.length <= scSlot) {
                                        scStore = m._scBounds = Detector._growFloats(scStore, scSlot + 4);
                                    }
                                    var scSourceBounds = sBody.bounds;
                                    scStore[scSlot] = scSourceBounds.min.x;
                                    scStore[scSlot + 1] = scSourceBounds.max.x;
                                    scStore[scSlot + 2] = scSourceBounds.min.y;
                                    scStore[scSlot + 3] = scSourceBounds.max.y;
                                    scList.push(sBody);
                                }
                            }
                        }

                        // mover vs mover (dedup by ordinal, so emit only once).
                        // Chain entries carry their cell key because the slot
                        // address wraps on a pathological mover spread. Every
                        // test here reads the flat mover arrays, so a candidate
                        // that fails costs no body access at all
                        for (var dgi = dNext[selfEntry++]; dgi !== -1; dgi = dNext[dgi]) {
                            if (dKeyArr[dgi] !== key) {
                                continue;
                            }
                            var dj = dItem[dgi];
                            // still required: two of THIS mover's own cells can
                            // alias to one slot, putting an earlier entry of its
                            // own ahead of it in the chain
                            if (dj <= mGen || mStamp[dj] === localStamp) {
                                continue;
                            }
                            mStamp[dj] = localStamp;
                            var dBoundsBase = dj * 4;
                            if (mMaxX < mBounds[dBoundsBase] || mMinX > mBounds[dBoundsBase + 1]
                                || mMaxY < mBounds[dBoundsBase + 2] || mMinY > mBounds[dBoundsBase + 3]) {
                                continue;
                            }
                            var dBody = movers[dj];
                            if (mStatic && (dBody.isStatic || dBody.isSleeping)) {
                                continue;
                            }
                            if (!canCollide(mFilter, dBody.collisionFilter)) {
                                continue;
                            }
                            collisionIndex = Detector._testPair(m, dBody, pairs, collisions, collisionIndex);
                        }
                    }
                }

                // mover vs its static candidates (cached or just collected).
                // Their bounds were captured with the list: a body in the static
                // index does not move (a setter that moves one promotes it to
                // a mover instead, see Body._promoteIfIndexed), so
                // the test runs off contiguous memory and only a candidate that
                // overlaps is ever dereferenced
                if (!mStatic) {
                    var scBounds = m._scBounds;
                    for (var sci = 0, scListLength = scList.length; sci < scListLength; sci++) {
                        var scBase = sci * 4;
                        if (mMaxX < scBounds[scBase] || mMinX > scBounds[scBase + 1]
                            || mMaxY < scBounds[scBase + 2] || mMinY > scBounds[scBase + 3]) {
                            continue;
                        }
                        var scBody = scList[sci];
                        if (!canCollide(mFilter, scBody.collisionFilter)) {
                            continue;
                        }
                        collisionIndex = Detector._testPair(m, scBody, pairs, collisions, collisionIndex);
                    }
                }
            }

            // mover vs oversized statics (walls, big images: not bucketed).
            // Skipped when the outer body is itself static (static-static).
            if (!mStatic) {
                for (var soi = 0; soi < sOverLength; soi++) {
                    var soBody = sOver[soi],
                        soBounds = soBody.bounds;
                    if (mMaxX < soBounds.min.x || mMinX > soBounds.max.x || mMaxY < soBounds.min.y || mMinY > soBounds.max.y) {
                        continue;
                    }
                    if (!canCollide(mFilter, soBody.collisionFilter)) {
                        continue;
                    }
                    collisionIndex = Detector._testPair(m, soBody, pairs, collisions, collisionIndex);
                }
            }

            // mover vs oversized movers. The ordinal dedup (emit an
            // oversized-oversized pair once, from the lower-ordinal outer)
            // applies ONLY when the outer is itself oversized. A non-oversized
            // mover never appears in dOver, so the pair is emitted here exactly
            // once with it as the outer; without the oversize guard a normal
            // mover ordered after an oversized one would wrongly skip the pair,
            // and it would be lost entirely (the oversized mover no longer
            // cell-walks to find normal movers).
            for (var doi = 0; doi < dOverLength; doi++) {
                var doOrdinal = dOver[doi];
                if (mIsOver && doOrdinal <= mGen) {
                    continue;
                }
                var doBoundsBase = doOrdinal * 4;
                if (mMaxX < mBounds[doBoundsBase] || mMinX > mBounds[doBoundsBase + 1]
                    || mMaxY < mBounds[doBoundsBase + 2] || mMinY > mBounds[doBoundsBase + 3]) {
                    continue;
                }
                var doBody = movers[doOrdinal];
                if (mStatic && (doBody.isStatic || doBody.isSleeping)) {
                    continue;
                }
                if (!canCollide(mFilter, doBody.collisionFilter)) {
                    continue;
                }
                collisionIndex = Detector._testPair(m, doBody, pairs, collisions, collisionIndex);
            }
        }

        if (collisions.length !== collisionIndex) {
            collisions.length = collisionIndex;
        }

        return collisions;
    };

    /**
     * Returns `true` if both supplied collision filters will allow a collision to occur.
     * See `body.collisionFilter` for more information.
     * @method canCollide
     * @param {} filterA
     * @param {} filterB
     * @return {bool} `true` if collision can occur
     */
    Detector.canCollide = function(filterA, filterB) {
        if (filterA.group === filterB.group && filterA.group !== 0)
            return filterA.group > 0;

        return (filterA.mask & filterB.category) !== 0 && (filterB.mask & filterA.category) !== 0;
    };

    /**
     * The comparison function used in the broadphase algorithm.
     * Returns the signed delta of the bodies bounds on the x-axis.
     * @private
     * @method _sortCompare
     * @param {body} bodyA
     * @param {body} bodyB
     * @return {number} The signed delta used for sorting
     */
    Detector._compareBoundsX = function(bodyA, bodyB) {
        return bodyA.bounds.min.x - bodyB.bounds.min.x;
    };

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * The array of `Matter.Body` between which the detector finds collisions.
     * 
     * _Note:_ The order of bodies in this array _is not fixed_ and will be continually managed by the detector.
     * @property bodies
     * @type body[]
     * @default []
     */

    /**
     * The array of `Matter.Collision` found in the last call to `Detector.collisions` on this detector.
     * @property collisions
     * @type collision[]
     * @default []
     */

    /**
     * Optional. A `Matter.Pairs` object from which previous collision objects may be reused. Intended for internal `Matter.Engine` usage.
     * @property pairs
     * @type {pairs|null}
     * @default null
     */

    /**
     * The broadphase `Detector.collisions` runs: `'sweep'` (upstream's sort and
     * sweep) or `'grid'` (a static index, for worlds of mostly static bodies).
     * Anything else throws. It may be changed between updates.
     * @property broadphase
     * @type string
     * @default 'sweep'
     */

    /**
     * The grid broadphase's cell size in pixels: a finite number above `0`,
     * tuned to roughly the typical static body's size. It may be changed
     * between updates, which rebuilds the grid's static index once.
     * @property cellSize
     * @type number
     * @default 32
     */

})();


/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Mouse` module contains methods for creating and manipulating mouse inputs.
*
* @class Mouse
*/

var Mouse = {};

module.exports = Mouse;

var Common = __webpack_require__(0);

(function() {

    /**
     * Creates a mouse input.
     * @method create
     * @param {HTMLElement} element
     * @return {mouse} A new mouse
     */
    Mouse.create = function(element) {
        var mouse = {};

        if (!element) {
            Common.log('Mouse.create: element was undefined, defaulting to document.body', 'warn');
        }
        
        mouse.element = element || document.body;
        mouse.absolute = { x: 0, y: 0 };
        mouse.position = { x: 0, y: 0 };
        mouse.mousedownPosition = { x: 0, y: 0 };
        mouse.mouseupPosition = { x: 0, y: 0 };
        mouse.offset = { x: 0, y: 0 };
        mouse.scale = { x: 1, y: 1 };
        mouse.wheelDelta = 0;
        mouse.button = -1;
        mouse.pixelRatio = parseInt(mouse.element.getAttribute('data-pixel-ratio'), 10) || 1;

        mouse.sourceEvents = {
            mousemove: null,
            mousedown: null,
            mouseup: null,
            mousewheel: null
        };
        
        mouse.mousemove = function(event) { 
            var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                touches = event.changedTouches;

            if (touches) {
                mouse.button = 0;
                event.preventDefault();
            }

            mouse.absolute.x = position.x;
            mouse.absolute.y = position.y;
            mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
            mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
            mouse.sourceEvents.mousemove = event;
        };
        
        mouse.mousedown = function(event) {
            var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                touches = event.changedTouches;

            if (touches) {
                mouse.button = 0;
                event.preventDefault();
            } else {
                mouse.button = event.button;
            }

            mouse.absolute.x = position.x;
            mouse.absolute.y = position.y;
            mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
            mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
            mouse.mousedownPosition.x = mouse.position.x;
            mouse.mousedownPosition.y = mouse.position.y;
            mouse.sourceEvents.mousedown = event;
        };
        
        mouse.mouseup = function(event) {
            var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                touches = event.changedTouches;

            if (touches) {
                event.preventDefault();
            }
            
            mouse.button = -1;
            mouse.absolute.x = position.x;
            mouse.absolute.y = position.y;
            mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
            mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
            mouse.mouseupPosition.x = mouse.position.x;
            mouse.mouseupPosition.y = mouse.position.y;
            mouse.sourceEvents.mouseup = event;
        };

        mouse.mousewheel = function(event) {
            mouse.wheelDelta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail));
            event.preventDefault();
            mouse.sourceEvents.mousewheel = event;
        };

        Mouse.setElement(mouse, mouse.element);

        return mouse;
    };

    /**
     * Sets the element the mouse is bound to (and relative to).
     * @method setElement
     * @param {mouse} mouse
     * @param {HTMLElement} element
     */
    Mouse.setElement = function(mouse, element) {
        mouse.element = element;

        element.addEventListener('mousemove', mouse.mousemove, { passive: true });
        element.addEventListener('mousedown', mouse.mousedown, { passive: true });
        element.addEventListener('mouseup', mouse.mouseup, { passive: true });
        
        element.addEventListener('wheel', mouse.mousewheel, { passive: false });
        
        element.addEventListener('touchmove', mouse.mousemove, { passive: false });
        element.addEventListener('touchstart', mouse.mousedown, { passive: false });
        element.addEventListener('touchend', mouse.mouseup, { passive: false });
    };

    /**
     * Clears all captured source events.
     * @method clearSourceEvents
     * @param {mouse} mouse
     */
    Mouse.clearSourceEvents = function(mouse) {
        mouse.sourceEvents.mousemove = null;
        mouse.sourceEvents.mousedown = null;
        mouse.sourceEvents.mouseup = null;
        mouse.sourceEvents.mousewheel = null;
        mouse.wheelDelta = 0;
    };

    /**
     * Sets the mouse position offset.
     * @method setOffset
     * @param {mouse} mouse
     * @param {vector} offset
     */
    Mouse.setOffset = function(mouse, offset) {
        mouse.offset.x = offset.x;
        mouse.offset.y = offset.y;
        mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
        mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
    };

    /**
     * Sets the mouse position scale.
     * @method setScale
     * @param {mouse} mouse
     * @param {vector} scale
     */
    Mouse.setScale = function(mouse, scale) {
        mouse.scale.x = scale.x;
        mouse.scale.y = scale.y;
        mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
        mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
    };
    
    /**
     * Gets the mouse position relative to an element given a screen pixel ratio.
     * @method _getRelativeMousePosition
     * @private
     * @param {} event
     * @param {} element
     * @param {number} pixelRatio
     * @return {}
     */
    Mouse._getRelativeMousePosition = function(event, element, pixelRatio) {
        var elementBounds = element.getBoundingClientRect(),
            rootNode = (document.documentElement || document.body.parentNode || document.body),
            scrollX = (window.pageXOffset !== undefined) ? window.pageXOffset : rootNode.scrollLeft,
            scrollY = (window.pageYOffset !== undefined) ? window.pageYOffset : rootNode.scrollTop,
            touches = event.changedTouches,
            x, y;
        
        if (touches) {
            x = touches[0].pageX - elementBounds.left - scrollX;
            y = touches[0].pageY - elementBounds.top - scrollY;
        } else {
            x = event.pageX - elementBounds.left - scrollX;
            y = event.pageY - elementBounds.top - scrollY;
        }

        return { 
            x: x / (element.clientWidth / (element.width || element.clientWidth) * pixelRatio),
            y: y / (element.clientHeight / (element.height || element.clientHeight) * pixelRatio)
        };
    };

})();


/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Plugin` module contains functions for registering and installing plugins on modules.
*
* @class Plugin
*/

var Plugin = {};

module.exports = Plugin;

var Common = __webpack_require__(0);

(function() {

    Plugin._registry = {};

    /**
     * Registers a plugin object so it can be resolved later by name.
     * @method register
     * @param plugin {} The plugin to register.
     * @return {object} The plugin.
     */
    Plugin.register = function(plugin) {
        if (!Plugin.isPlugin(plugin)) {
            Common.warn('Plugin.register:', Plugin.toString(plugin), 'does not implement all required fields.');
        }

        if (plugin.name in Plugin._registry) {
            var registered = Plugin._registry[plugin.name],
                pluginVersion = Plugin.versionParse(plugin.version).number,
                registeredVersion = Plugin.versionParse(registered.version).number;

            if (pluginVersion > registeredVersion) {
                Common.warn('Plugin.register:', Plugin.toString(registered), 'was upgraded to', Plugin.toString(plugin));
                Plugin._registry[plugin.name] = plugin;
            } else if (pluginVersion < registeredVersion) {
                Common.warn('Plugin.register:', Plugin.toString(registered), 'can not be downgraded to', Plugin.toString(plugin));
            } else if (plugin !== registered) {
                Common.warn('Plugin.register:', Plugin.toString(plugin), 'is already registered to different plugin object');
            }
        } else {
            Plugin._registry[plugin.name] = plugin;
        }

        return plugin;
    };

    /**
     * Resolves a dependency to a plugin object from the registry if it exists. 
     * The `dependency` may contain a version, but only the name matters when resolving.
     * @method resolve
     * @param dependency {string} The dependency.
     * @return {object} The plugin if resolved, otherwise `undefined`.
     */
    Plugin.resolve = function(dependency) {
        return Plugin._registry[Plugin.dependencyParse(dependency).name];
    };

    /**
     * Returns a pretty printed plugin name and version.
     * @method toString
     * @param plugin {} The plugin.
     * @return {string} Pretty printed plugin name and version.
     */
    Plugin.toString = function(plugin) {
        return typeof plugin === 'string' ? plugin : (plugin.name || 'anonymous') + '@' + (plugin.version || plugin.range || '0.0.0');
    };

    /**
     * Returns `true` if the object meets the minimum standard to be considered a plugin.
     * This means it must define the following properties:
     * - `name`
     * - `version`
     * - `install`
     * @method isPlugin
     * @param obj {} The obj to test.
     * @return {boolean} `true` if the object can be considered a plugin otherwise `false`.
     */
    Plugin.isPlugin = function(obj) {
        return obj && obj.name && obj.version && obj.install;
    };

    /**
     * Returns `true` if a plugin with the given `name` been installed on `module`.
     * @method isUsed
     * @param module {} The module.
     * @param name {string} The plugin name.
     * @return {boolean} `true` if a plugin with the given `name` been installed on `module`, otherwise `false`.
     */
    Plugin.isUsed = function(module, name) {
        return module.used.indexOf(name) > -1;
    };

    /**
     * Returns `true` if `plugin.for` is applicable to `module` by comparing against `module.name` and `module.version`.
     * If `plugin.for` is not specified then it is assumed to be applicable.
     * The value of `plugin.for` is a string of the format `'module-name'` or `'module-name@version'`.
     * @method isFor
     * @param plugin {} The plugin.
     * @param module {} The module.
     * @return {boolean} `true` if `plugin.for` is applicable to `module`, otherwise `false`.
     */
    Plugin.isFor = function(plugin, module) {
        var parsed = plugin.for && Plugin.dependencyParse(plugin.for);
        return !plugin.for || (module.name === parsed.name && Plugin.versionSatisfies(module.version, parsed.range));
    };

    /**
     * Installs the plugins by calling `plugin.install` on each plugin specified in `plugins` if passed, otherwise `module.uses`.
     * For installing plugins on `Matter` see the convenience function `Matter.use`.
     * Plugins may be specified either by their name or a reference to the plugin object.
     * Plugins themselves may specify further dependencies, but each plugin is installed only once.
     * Order is important, a topological sort is performed to find the best resulting order of installation.
     * This sorting attempts to satisfy every dependency's requested ordering, but may not be exact in all cases.
     * This function logs the resulting status of each dependency in the console, along with any warnings.
     * - A green tick ✅ indicates a dependency was resolved and installed.
     * - An orange diamond 🔶 indicates a dependency was resolved but a warning was thrown for it or one if its dependencies.
     * - A red cross ❌ indicates a dependency could not be resolved.
     * Avoid calling this function multiple times on the same module unless you intend to manually control installation order.
     * @method use
     * @param module {} The module install plugins on.
     * @param [plugins=module.uses] {} The plugins to install on module (optional, defaults to `module.uses`).
     */
    Plugin.use = function(module, plugins) {
        module.uses = (module.uses || []).concat(plugins || []);

        if (module.uses.length === 0) {
            Common.warn('Plugin.use:', Plugin.toString(module), 'does not specify any dependencies to install.');
            return;
        }

        var dependencies = Plugin.dependencies(module),
            sortedDependencies = Common.topologicalSort(dependencies),
            status = [];

        for (var i = 0; i < sortedDependencies.length; i += 1) {
            if (sortedDependencies[i] === module.name) {
                continue;
            }

            var plugin = Plugin.resolve(sortedDependencies[i]);

            if (!plugin) {
                status.push('❌ ' + sortedDependencies[i]);
                continue;
            }

            if (Plugin.isUsed(module, plugin.name)) {
                continue;
            }

            if (!Plugin.isFor(plugin, module)) {
                Common.warn('Plugin.use:', Plugin.toString(plugin), 'is for', plugin.for, 'but installed on', Plugin.toString(module) + '.');
                plugin._warned = true;
            }

            if (plugin.install) {
                plugin.install(module);
            } else {
                Common.warn('Plugin.use:', Plugin.toString(plugin), 'does not specify an install function.');
                plugin._warned = true;
            }

            if (plugin._warned) {
                status.push('🔶 ' + Plugin.toString(plugin));
                // cold plugin bookkeeping, runs once at use-time
                // eslint-disable-next-line no-restricted-syntax
                delete plugin._warned;
            } else {
                status.push('✅ ' + Plugin.toString(plugin));
            }

            module.used.push(plugin.name);
        }

        if (status.length > 0) {
            Common.info(status.join('  '));
        }
    };

    /**
     * Recursively finds all of a module's dependencies and returns a flat dependency graph.
     * @method dependencies
     * @param module {} The module.
     * @return {object} A dependency graph.
     */
    Plugin.dependencies = function(module, tracked) {
        var parsedBase = Plugin.dependencyParse(module),
            name = parsedBase.name;

        tracked = tracked || {};

        if (name in tracked) {
            return;
        }

        module = Plugin.resolve(module) || module;

        tracked[name] = Common.map(module.uses || [], function(dependency) {
            if (Plugin.isPlugin(dependency)) {
                Plugin.register(dependency);
            }

            var parsed = Plugin.dependencyParse(dependency),
                resolved = Plugin.resolve(dependency);

            if (resolved && !Plugin.versionSatisfies(resolved.version, parsed.range)) {
                Common.warn(
                    'Plugin.dependencies:', Plugin.toString(resolved), 'does not satisfy',
                    Plugin.toString(parsed), 'used by', Plugin.toString(parsedBase) + '.'
                );

                resolved._warned = true;
                module._warned = true;
            } else if (!resolved) {
                Common.warn(
                    'Plugin.dependencies:', Plugin.toString(dependency), 'used by',
                    Plugin.toString(parsedBase), 'could not be resolved.'
                );

                module._warned = true;
            }

            return parsed.name;
        });

        for (var i = 0; i < tracked[name].length; i += 1) {
            Plugin.dependencies(tracked[name][i], tracked);
        }

        return tracked;
    };

    /**
     * Parses a dependency string into its components.
     * The `dependency` is a string of the format `'module-name'` or `'module-name@version'`.
     * See documentation for `Plugin.versionParse` for a description of the format.
     * This function can also handle dependencies that are already resolved (e.g. a module object).
     * @method dependencyParse
     * @param dependency {string} The dependency of the format `'module-name'` or `'module-name@version'`.
     * @return {object} The dependency parsed into its components.
     */
    Plugin.dependencyParse = function(dependency) {
        if (Common.isString(dependency)) {
            var pattern = /^[\w-]+(@(\*|[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z-+]+)?))?$/;

            if (!pattern.test(dependency)) {
                Common.warn('Plugin.dependencyParse:', dependency, 'is not a valid dependency string.');
            }

            return {
                name: dependency.split('@')[0],
                range: dependency.split('@')[1] || '*'
            };
        }

        return {
            name: dependency.name,
            range: dependency.range || dependency.version
        };
    };

    /**
     * Parses a version string into its components.  
     * Versions are strictly of the format `x.y.z` (as in [semver](http://semver.org/)).
     * Versions may optionally have a prerelease tag in the format `x.y.z-alpha`.
     * Ranges are a strict subset of [npm ranges](https://docs.npmjs.com/misc/semver#advanced-range-syntax).
     * Only the following range types are supported:
     * - Tilde ranges e.g. `~1.2.3`
     * - Caret ranges e.g. `^1.2.3`
     * - Greater than ranges e.g. `>1.2.3`
     * - Greater than or equal ranges e.g. `>=1.2.3`
     * - Exact version e.g. `1.2.3`
     * - Any version `*`
     * @method versionParse
     * @param range {string} The version string.
     * @return {object} The version range parsed into its components.
     */
    Plugin.versionParse = function(range) {
        var pattern = /^(\*)|(\^|~|>=|>)?\s*((\d+)\.(\d+)\.(\d+))(-[0-9A-Za-z-+]+)?$/;

        if (!pattern.test(range)) {
            Common.warn('Plugin.versionParse:', range, 'is not a valid version or range.');
        }

        var parts = pattern.exec(range);
        var major = Number(parts[4]);
        var minor = Number(parts[5]);
        var patch = Number(parts[6]);

        return {
            isRange: Boolean(parts[1] || parts[2]),
            version: parts[3],
            range: range,
            operator: parts[1] || parts[2] || '',
            major: major,
            minor: minor,
            patch: patch,
            parts: [major, minor, patch],
            prerelease: parts[7],
            number: major * 1e8 + minor * 1e4 + patch
        };
    };

    /**
     * Returns `true` if `version` satisfies the given `range`.
     * See documentation for `Plugin.versionParse` for a description of the format.
     * If a version or range is not specified, then any version (`*`) is assumed to satisfy.
     * @method versionSatisfies
     * @param version {string} The version string.
     * @param range {string} The range string.
     * @return {boolean} `true` if `version` satisfies `range`, otherwise `false`.
     */
    Plugin.versionSatisfies = function(version, range) {
        range = range || '*';

        var r = Plugin.versionParse(range),
            v = Plugin.versionParse(version);

        if (r.isRange) {
            if (r.operator === '*' || version === '*') {
                return true;
            }

            if (r.operator === '>') {
                return v.number > r.number;
            }

            if (r.operator === '>=') {
                return v.number >= r.number;
            }

            if (r.operator === '~') {
                return v.major === r.major && v.minor === r.minor && v.patch >= r.patch;
            }

            if (r.operator === '^') {
                if (r.major > 0) {
                    return v.major === r.major && v.number >= r.number;
                }

                if (r.minor > 0) {
                    return v.minor === r.minor && v.patch >= r.patch;
                }

                return v.patch === r.patch;
            }
        }

        return version === range || version === '*';
    };

})();


/***/ }),
/* 16 */
/***/ (function(module, exports) {

/**
* The `Matter.Contact` module contains methods for creating and manipulating collision contacts.
*
* @class Contact
*/

var Contact = {};

module.exports = Contact;

(function() {

    /**
     * Creates a new contact.
     * @method create
     * @param {vertex} [vertex]
     * @return {contact} A new contact
     */
    Contact.create = function(vertex) {
        return {
            vertex: vertex,
            normalImpulse: 0,
            tangentImpulse: 0
        };
    };

})();


/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Engine` module contains methods for creating and manipulating engines.
* An engine is a controller that manages updating the simulation of the world.
* See `Matter.Runner` for an optional game loop utility.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Engine
*/

var Engine = {};

module.exports = Engine;

var Sleeping = __webpack_require__(7);
var Resolver = __webpack_require__(18);
var Detector = __webpack_require__(13);
var Pairs = __webpack_require__(19);
var Events = __webpack_require__(5);
var Composite = __webpack_require__(6);
var Constraint = __webpack_require__(10);
var Common = __webpack_require__(0);
var Body = __webpack_require__(4);

(function() {

    Engine._deltaMax = 1000 / 60;

    /**
     * Creates a new engine. The options parameter is an object that specifies any properties you wish to override the defaults.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {object} [options]
     * @return {engine} engine
     */
    Engine.create = function(options) {
        options = options || {};

        // the broadphase and its cell size are the DETECTOR's (see
        // Detector.create). An engine option named `broadphase` is overwritten
        // by the back-compatibility `engine.broadphase` below, and one named
        // `cellSize` is read by nothing, so either would be silently ignored.
        // The suggested code is a literal, never the value given: that may be
        // the name of no broadphase at all
        if (typeof options.broadphase === 'string' || options.cellSize !== undefined) {
            throw new Error('Matter.Engine: the broadphase and cellSize are set on the detector, not the engine '
                + '(got broadphase ' + String(options.broadphase) + ', cellSize ' + String(options.cellSize) + '), e.g. '
                + "Engine.create({ detector: Detector.create({ broadphase: 'grid', cellSize: 32 }) })");
        }

        var defaults = {
            positionIterations: 6,
            velocityIterations: 4,
            constraintIterations: 2,
            enableSleeping: false,
            enableSolvedVelocityAndBounds: true,
            events: [],
            plugin: {},
            gravity: {
                x: 0,
                y: 1,
                scale: 0.001
            },
            timing: {
                timestamp: 0,
                timeScale: 1,
                lastDelta: 0,
                lastElapsed: 0,
                lastUpdatesPerFrame: 0
            }
        };

        var engine = Common.extend(defaults, options);

        engine.world = options.world || Composite.create({ label: 'World' });
        engine.pairs = options.pairs || Pairs.create();
        engine.detector = options.detector || Detector.create();
        engine.detector.pairs = engine.pairs;

        // mover-list cache (see the classification pass in Engine.update);
        // declared here so the engine object's shape is stable
        engine._moverBodies = [];
        engine._moverSource = null;
        engine._moverSourceLength = -1;
        engine._moverEpoch = -1;
        engine._moverSetEpoch = -1;

        // for temporary back compatibility only: upstream's stubs for the
        // `Matter.Grid` module it deleted. They are unrelated to the grid
        // broadphase, which is `engine.detector.broadphase === 'grid'`, and
        // nothing reads them
        engine.grid = { buckets: [] };
        engine.world.gravity = engine.gravity;
        engine.broadphase = engine.grid;
        engine.metrics = {};
        
        return engine;
    };

    /**
     * Moves the simulation forward in time by `delta` milliseconds.
     * Triggers `beforeUpdate`, `beforeSolve` and `afterUpdate` events.
     * Triggers `collisionStart`, `collisionActive` and `collisionEnd` events.
     *
     * `engine.pairs.collisionStart` is filled on every update. `engine.pairs.collisionActive`
     * and `engine.pairs.collisionEnd` are filled only while their event has a listener
     * when the update reaches collision detection, and are otherwise left empty. So a
     * `collisionActive` or `collisionEnd` listener added during an update (from a
     * `beforeSolve` or `collisionStart` listener, say) is first called on the next update.
     * @method update
     * @param {engine} engine
     * @param {number} [delta=16.666]
     */
    Engine.update = function(engine, delta) {
        var startTime = Common.now();

        var world = engine.world,
            detector = engine.detector,
            pairs = engine.pairs,
            timing = engine.timing,
            timestamp = timing.timestamp,
            i;

        // a detector configured with no broadphase, or a grid cell size it
        // cannot use, throws here, before this update changes anything, rather
        // than from the broadphase half way through it (see
        // Detector._assertConfig)
        Detector._assertConfig(detector);

        // warn if high delta
        if (delta > Engine._deltaMax) {
            Common.warnOnce(
                'Matter.Engine.update: delta argument is recommended to be less than or equal to', Engine._deltaMax.toFixed(3), 'ms.'
            );
        }

        delta = typeof delta !== 'undefined' ? delta : Common._baseDelta;
        delta *= timing.timeScale;

        // increment timestamp
        timing.timestamp += delta;
        timing.lastDelta = delta;

        // the timestamp every per-update event reports, fixed here as the
        // event object used to be, so a listener that moves the clock does
        // not change what a later event of this update reads
        var eventTimestamp = timing.timestamp;

        // each per-update event is triggered, and its payload built, only
        // when it has a listener: Events.trigger would no-op without one, but
        // only after the payload was allocated. Each listener receives its
        // own copy of the payload, so building one per event is equivalent
        // to sharing one
        if (Engine._hasListener(engine, 'beforeUpdate')) {
            Events.trigger(engine, 'beforeUpdate', { timestamp: eventTimestamp, delta: delta });
        }

        // get all bodies and all constraints in the world. A world with no
        // child composites is its own body list, so it is used as it is
        // rather than through `Composite.allBodies`, which builds a fresh copy
        // after every membership change (every update, on a page being
        // destroyed). The world is marked as lending it until the last read
        // below, so a listener that adds or removes a body meanwhile changes a
        // copy and this update keeps the membership it started with (see
        // Composite._ownBodies). The detector keeps the array between updates;
        // a change then is made in place and signalled by
        // `Composite.setModified`, which is why the classifications key on
        // Common._bodySetEpoch as well as on the array
        var lendsBodies = world.composites.length === 0,
            allBodies = lendsBodies ? world.bodies : Composite.allBodies(world),
            allConstraints = Composite.allConstraints(world);

        if (lendsBodies) {
            world._bodiesLent = true;
        }

        // if the world has changed
        if (world.isModified) {
            // update the detector bodies
            Detector.setBodies(detector, allBodies);

            // reset all composite modified flags
            Composite.setModified(world, false, false, true);
        }

        // a flat world's own array: its body journal describes changes to it,
        // which the grid broadphase reads instead of walking every body
        // (see Common._journalTouch)
        detector._world = lendsBodies ? world : null;

        // update sleeping if enabled
        if (engine.enableSleeping)
            Sleeping.update(allBodies, delta);

        // classify the moving bodies once per step into a persistent scratch
        // array, so the per-body passes below (gravity, integration, velocity
        // recompute) iterate only movers instead of flag-scanning every static
        // in the world each time. The passes keep their own static/sleeping
        // guards, so a body set static mid-update is still skipped; a body
        // released mid-update (static to dynamic inside an event callback)
        // joins the passes on the next step, when callers have set its
        // velocity explicitly anyway. Force clearing deliberately stays a
        // full-body pass (a stale force on a static body must not survive
        // into a later release).
        // The walk itself touches every body in the world, so on a dense static
        // page it is memory-bound and one of the largest single costs in the
        // step, while its answer almost never changes. Rebuild it only when it
        // can have changed: a bumped body-set epoch (any membership change, see
        // Common._bodySetEpoch), a different `allBodies` array or length (a
        // caller that swaps the array without signalling), or a bumped static
        // epoch (`Body.setStatic` / `Sleeping.set`; see Common._bodyStaticEpoch).
        var moverBodies = engine._moverBodies || (engine._moverBodies = []),
            staticEpoch = Common._bodyStaticEpoch,
            setEpoch = Common._bodySetEpoch,
            allBodiesLength = allBodies.length;

        if (engine._moverSource !== allBodies
            || engine._moverSourceLength !== allBodiesLength
            || engine._moverEpoch !== staticEpoch
            || engine._moverSetEpoch !== setEpoch) {
            engine._moverSource = allBodies;
            engine._moverSourceLength = allBodiesLength;
            engine._moverEpoch = staticEpoch;
            engine._moverSetEpoch = setEpoch;

            // for a flat world the grid classification and the body
            // journal usually say what changed, which spares the walk (see
            // Detector._moversFromJournal)
            if (!(lendsBodies && Detector._moversFromJournal(detector, world, moverBodies))) {
                var moverCount = 0;

                for (i = 0; i < allBodiesLength; i++) {
                    var classifyBody = allBodies[i];
                    if (!(classifyBody.isStatic || classifyBody.isSleeping)) {
                        moverBodies[moverCount++] = classifyBody;
                    }
                }
                if (moverBodies.length !== moverCount) {
                    moverBodies.length = moverCount;
                }
            }
        }

        // apply gravity to all moving bodies
        Engine._bodiesApplyGravity(moverBodies, engine.gravity);

        // whether this update ends with the moving bodies' velocity
        // properties and bounds up to date with the solve (see the option)
        var keepSolved = engine.enableSolvedVelocityAndBounds !== false;

        // update all body position and rotation by integration
        if (delta > 0) {
            Engine._bodiesUpdate(moverBodies, delta);
        } else if (!keepSolved) {
            // nothing is integrated, so the detector and the solve below would
            // read what the last update left. Bring deferred bounds up to date
            // first, padded by the velocity they were deferred with, then
            // recompute velocity from the positions exactly as the skipped
            // end-of-update pass would have
            for (i = 0; i < moverBodies.length; i++) {
                Body._updateStaleBounds(moverBodies[i]);
            }
            Engine._bodiesUpdateVelocities(moverBodies);
        }

        if (Engine._hasListener(engine, 'beforeSolve')) {
            Events.trigger(engine, 'beforeSolve', { timestamp: eventTimestamp, delta: delta });
        }

        // with no constraints in the world every body's constraintImpulse is
        // zero, so the pre/post passes (full-body scans) and the solve loop
        // are all no-ops; skip them entirely. Caveat: a body whose constraint
        // was removed while its warmed impulse was still non-zero keeps that
        // residual impulse frozen until a constraint exists again, instead of
        // applying it for a few more decaying steps.
        var hasConstraints = allConstraints.length > 0;

        // update all constraints (first pass)
        if (hasConstraints) {
            Constraint.preSolveAll(allBodies);
            for (i = 0; i < engine.constraintIterations; i++) {
                Constraint.solveAll(allConstraints, delta);
            }
            Constraint.postSolveAll(allBodies);
        }

        // find all collisions
        var collisions = Detector.collisions(detector);

        // update collision pairs. The active and ended lists are filled only
        // for a listener of their event: the active list takes one entry per
        // touching pair per update, and nothing in the engine reads either
        Pairs.update(pairs, collisions, timestamp,
            Engine._hasListener(engine, 'collisionActive'),
            Engine._hasListener(engine, 'collisionEnd'));

        // wake up bodies involved in collisions
        if (engine.enableSleeping)
            Sleeping.afterCollisions(pairs.list);

        // trigger collision events. Each payload literal is gated on a
        // listener actually existing: Events.trigger would no-op without one,
        // but only after the caller allocated the payload
        var engineEvents = engine.events;

        if (pairs.collisionStart.length > 0 && engineEvents && engineEvents.collisionStart && engineEvents.collisionStart.length > 0) {
            Events.trigger(engine, 'collisionStart', {
                pairs: pairs.collisionStart,
                timestamp: timing.timestamp,
                delta: delta
            });
        }

        // iteratively resolve position between collisions
        var positionDamping = Common.clamp(20 / engine.positionIterations, 0, 1);
        
        // pass the pairs container so the resolver can collect the touched
        // bodies and apply position impulses to only those (plus any bodies
        // still decaying a warmed impulse), not the whole world. The container
        // also carries the flat solver snapshot the position iterations run
        // over (built in preSolvePosition, written back in postSolvePosition)
        Resolver.preSolvePosition(pairs.list, pairs);
        for (i = 0; i < engine.positionIterations; i++) {
            Resolver.solvePosition(pairs.list, delta, positionDamping, pairs);
        }
        Resolver.postSolvePosition(allBodies, pairs, !keepSolved);

        // update all constraints (second pass)
        if (hasConstraints) {
            Constraint.preSolveAll(allBodies);
            for (i = 0; i < engine.constraintIterations; i++) {
                Constraint.solveAll(allConstraints, delta);
            }
            Constraint.postSolveAll(allBodies);
        }

        // iteratively resolve velocity between collisions, over the flat
        // snapshot built by preSolveVelocity and written back afterwards
        Resolver.preSolveVelocity(pairs.list, pairs);
        for (i = 0; i < engine.velocityIterations; i++) {
            Resolver.solveVelocity(pairs.list, delta, pairs);
        }
        Resolver.postSolveVelocity(pairs);

        // update body speed and velocity properties. Nothing in the engine
        // reads them before the next integration overwrites velocity and
        // angular velocity, so an engine that opted out skips the pass
        if (keepSolved) {
            Engine._bodiesUpdateVelocities(moverBodies);
        }

        // trigger collision events, gated the same way as collisionStart
        if (pairs.collisionActive.length > 0 && engineEvents && engineEvents.collisionActive && engineEvents.collisionActive.length > 0) {
            Events.trigger(engine, 'collisionActive', {
                pairs: pairs.collisionActive,
                timestamp: timing.timestamp,
                delta: delta
            });
        }

        if (pairs.collisionEnd.length > 0 && engineEvents && engineEvents.collisionEnd && engineEvents.collisionEnd.length > 0) {
            Events.trigger(engine, 'collisionEnd', {
                pairs: pairs.collisionEnd,
                timestamp: timing.timestamp,
                delta: delta
            });
        }

        // Clear force buffers. Movers only when sleeping is disabled: a resting
        // body is not integrated, so its buffer cannot reach the simulation, and
        // `Body.setStatic` / `Sleeping.set` zero it on both transitions so
        // nothing applied while resting survives into a release. Clearing every
        // body meant a scattered write per intact tile of a dense static page.
        //
        // With sleeping ENABLED the full pass is kept, because `Sleeping.update`
        // reads a resting body's force to decide whether to wake it: it is the
        // one place the buffer is observable while a body rests, and leaving a
        // value there would hold that body awake.
        Engine._bodiesClearForces(engine.enableSleeping ? allBodies : moverBodies);

        // the last read of `allBodies`: from here a change is made in place
        if (lendsBodies) {
            world._bodiesLent = false;
        }

        if (Engine._hasListener(engine, 'afterUpdate')) {
            Events.trigger(engine, 'afterUpdate', { timestamp: eventTimestamp, delta: delta });
        }

        // log the time elapsed computing this update
        engine.timing.lastElapsed = Common.now() - startTime;

        return engine;
    };
    
    /**
     * Merges two engines by keeping the configuration of `engineA` but replacing the world with the one from `engineB`.
     * @method merge
     * @param {engine} engineA
     * @param {engine} engineB
     */
    Engine.merge = function(engineA, engineB) {
        Common.extend(engineA, engineB);
        
        if (engineB.world) {
            engineA.world = engineB.world;

            Engine.clear(engineA);

            var bodies = Composite.allBodies(engineA.world);

            for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i];
                Sleeping.set(body, false);
                body.id = Common.nextId();
            }
        }
    };

    /**
     * Clears the engine pairs and detector.
     * @method clear
     * @param {engine} engine
     */
    Engine.clear = function(engine) {
        Pairs.clear(engine.pairs);
        Detector.clear(engine.detector);
    };

    /**
     * Whether `name` has at least one listener on `engine`, read at the call
     * so a listener added or removed earlier in the same update is seen.
     * @method _hasListener
     * @private
     * @param {engine} engine
     * @param {string} name
     * @return {boolean}
     */
    Engine._hasListener = function(engine, name) {
        var events = engine.events,
            callbacks = events && events[name];

        return Boolean(callbacks) && callbacks.length > 0;
    };

    /**
     * Zeroes the `body.force` and `body.torque` force buffers.
     * @method _bodiesClearForces
     * @private
     * @param {body[]} bodies
     */
    Engine._bodiesClearForces = function(bodies) {
        var bodiesLength = bodies.length;

        for (var i = 0; i < bodiesLength; i++) {
            var body = bodies[i];

            // reset force buffers
            body.force.x = 0;
            body.force.y = 0;
            body.torque = 0;
        }
    };

    /**
     * Applies gravitational acceleration to all `bodies`.
     * This models a [uniform gravitational field](https://en.wikipedia.org/wiki/Gravity_of_Earth), similar to near the surface of a planet.
     * 
     * @method _bodiesApplyGravity
     * @private
     * @param {body[]} bodies
     * @param {vector} gravity
     */
    Engine._bodiesApplyGravity = function(bodies, gravity) {
        var gravityScale = typeof gravity.scale !== 'undefined' ? gravity.scale : 0.001,
            bodiesLength = bodies.length;

        if ((gravity.x === 0 && gravity.y === 0) || gravityScale === 0) {
            return;
        }
        
        for (var i = 0; i < bodiesLength; i++) {
            var body = bodies[i];

            if (body.isStatic || body.isSleeping)
                continue;

            // add the resultant force of gravity
            body.force.y += body.mass * gravity.y * gravityScale;
            body.force.x += body.mass * gravity.x * gravityScale;
        }
    };

    /**
     * Applies `Body.update` to all given `bodies`.
     * @method _bodiesUpdate
     * @private
     * @param {body[]} bodies
     * @param {number} delta The amount of time elapsed between updates
     */
    Engine._bodiesUpdate = function(bodies, delta) {
        var bodiesLength = bodies.length;

        for (var i = 0; i < bodiesLength; i++) {
            var body = bodies[i];

            if (body.isStatic || body.isSleeping)
                continue;

            Body.update(body, delta);
        }
    };

    /**
     * Applies `Body.updateVelocities` to all given `bodies`.
     * @method _bodiesUpdateVelocities
     * @private
     * @param {body[]} bodies
     */
    Engine._bodiesUpdateVelocities = function(bodies) {
        var bodiesLength = bodies.length;

        for (var i = 0; i < bodiesLength; i++) {
            var body = bodies[i];

            // a static or sleeping body does not move, so its velocity is
            // constant and was set when it came to rest (see Body.setStatic and
            // Sleeping.set); skip the redundant recompute, matching the way
            // _bodiesApplyGravity and _bodiesUpdate already skip resting bodies
            if (body.isStatic || body.isSleeping) {
                continue;
            }

            Body.updateVelocities(body);
        }
    };

    /**
     * A deprecated alias for `Runner.run`, use `Matter.Runner.run(engine)` instead and see `Matter.Runner` for more information.
     * @deprecated use Matter.Runner.run(engine) instead
     * @method run
     * @param {engine} engine
     */

    /**
    * Fired just before an update
    *
    * @event beforeUpdate
    * @param {object} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /**
    * Fired after bodies updated based on their velocity and forces, but before any collision detection, constraints and resolving etc.
    *
    * @event beforeSolve
    * @param {object} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /**
    * Fired after engine update and all collision events
    *
    * @event afterUpdate
    * @param {object} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /**
    * Fired after engine update, provides a list of all pairs that have started to collide in the current tick (if any)
    *
    * @event collisionStart
    * @param {object} event An event object
    * @param {pair[]} event.pairs List of affected pairs
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /**
    * Fired after engine update, provides a list of all pairs that are colliding in the current tick (if any)
    *
    * @event collisionActive
    * @param {object} event An event object
    * @param {pair[]} event.pairs List of affected pairs
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /**
    * Fired after engine update, provides a list of all pairs that have ended collision in the current tick (if any)
    *
    * @event collisionEnd
    * @param {object} event An event object
    * @param {pair[]} event.pairs List of affected pairs
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {number} event.delta The delta time in milliseconds value used in the update
    * @param {engine} event.source The source object of the event
    * @param {string} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` that specifies the number of position iterations to perform each update.
     * The higher the value, the higher quality the simulation will be at the expense of performance.
     *
     * @property positionIterations
     * @type number
     * @default 6
     */

    /**
     * An integer `Number` that specifies the number of velocity iterations to perform each update.
     * The higher the value, the higher quality the simulation will be at the expense of performance.
     *
     * @property velocityIterations
     * @type number
     * @default 4
     */

    /**
     * An integer `Number` that specifies the number of constraint iterations to perform each update.
     * The higher the value, the higher quality the simulation will be at the expense of performance.
     * The default value of `2` is usually very adequate.
     *
     * @property constraintIterations
     * @type number
     * @default 2
     */

    /**
     * A flag that specifies whether the engine should allow sleeping via the `Matter.Sleeping` module.
     * Sleeping can improve stability and performance, but often at the expense of accuracy.
     *
     * @property enableSleeping
     * @type boolean
     * @default false
     */

    /**
     * A flag that specifies whether each update ends by bringing every moving body's `velocity`,
     * `angularVelocity`, `speed`, `angularSpeed` and `bounds` up to date with the collision solve.
     *
     * The engine itself never reads these on a moving body between updates (integration recomputes
     * velocity from `position` and `positionPrev`, and bounds from the vertices), so a consumer that
     * does not read them, or that derives what it needs from `position`, `positionPrev`, `angle`,
     * `anglePrev` and `deltaTime` the way `Body.updateVelocities` does, can set this to `false` and
     * skip that work.
     *
     * When `false`, between updates a moving body's `velocity` and `angularVelocity` hold the values
     * integration set before the solve, its `speed` and `angularSpeed` are not kept, and its `bounds`
     * can lag its last position correction. Bounds recomputed between updates (`Body.setPosition`,
     * `Body.setAngle`) are padded by that velocity. `Body.setStatic` and `Sleeping.set` bring a body's
     * bounds up to date from its current vertices and velocity before it stops moving, and an update
     * that integrates nothing (a `delta` of `0`, e.g. `timing.timeScale` of `0`) brings the bounds and
     * then the four velocity properties up to date before it detects and solves, so the collision
     * detector never reads a stale box. Keep this `true` if anything reads those properties between
     * updates, such as `Render`'s velocity and bounds views, `Query`, `MouseConstraint` or your own
     * code.
     *
     * Positions are otherwise the same either way, with one known exception: with `enableSleeping`
     * also on, a run that includes updates with a `delta` of `0` can drift from the same run with
     * this `true` (by about 1e-4 px within a few hundred updates in a measured scene).
     *
     * A `collisionActive` or `collisionEnd` listener added part way through an update misses that
     * update either way (see `Engine.update`).
     *
     * @property enableSolvedVelocityAndBounds
     * @type boolean
     * @default true
     */

    /**
     * An `Object` containing properties regarding the timing systems of the engine. 
     *
     * @property timing
     * @type object
     */

    /**
     * A `Number` that specifies the global scaling factor of time for all bodies.
     * A value of `0` freezes the simulation.
     * A value of `0.1` gives a slow-motion effect.
     * A value of `1.2` gives a speed-up effect.
     *
     * @property timing.timeScale
     * @type number
     * @default 1
     */

    /**
     * A `Number` that specifies the current simulation-time in milliseconds starting from `0`. 
     * It is incremented on every `Engine.update` by the given `delta` argument. 
     * 
     * @property timing.timestamp
     * @type number
     * @default 0
     */

    /**
     * A `Number` that represents the total execution time elapsed during the last `Engine.update` in milliseconds.
     * It is updated by timing from the start of the last `Engine.update` call until it ends.
     *
     * This value will also include the total execution time of all event handlers directly or indirectly triggered by the engine update.
     * 
     * @property timing.lastElapsed
     * @type number
     * @default 0
     */

    /**
     * A `Number` that represents the `delta` value used in the last engine update.
     * 
     * @property timing.lastDelta
     * @type number
     * @default 0
     */

    /**
     * A `Matter.Detector` instance. Pass one as `options.detector` to choose
     * the broadphase: `Engine.create({ detector: Detector.create({ broadphase: 'grid' }) })`
     * (see `Detector.create`).
     *
     * @property detector
     * @type detector
     * @default a Matter.Detector instance
     */

    /**
     * A `Matter.Grid` instance. An upstream back-compatibility stub, unrelated
     * to the grid broadphase (`engine.detector.broadphase`); nothing reads it.
     *
     * @deprecated replaced by `engine.detector`
     * @property grid
     * @type grid
     * @default a Matter.Grid instance
     */

    /**
     * Replaced by and now alias for `engine.grid`. Not the detector's
     * `broadphase`, which chooses the broadphase (see `Detector.create`).
     *
     * @deprecated replaced by `engine.detector`
     * @property broadphase
     * @type grid
     * @default a Matter.Grid instance
     */

    /**
     * The root `Matter.Composite` instance that will contain all bodies, constraints and other composites to be simulated by this engine.
     *
     * @property world
     * @type composite
     * @default a Matter.Composite instance
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

    /**
     * An optional gravitational acceleration applied to all bodies in `engine.world` on every update.
     * 
     * This models a [uniform gravitational field](https://en.wikipedia.org/wiki/Gravity_of_Earth), similar to near the surface of a planet. For gravity in other contexts, disable this and apply forces as needed.
     * 
     * To disable set the `scale` component to `0`.
     * 
     * This is split into three components for ease of use:  
     * a normalised direction (`x` and `y`) and magnitude (`scale`).
     *
     * @property gravity
     * @type object
     */

    /**
     * The gravitational direction normal `x` component, to be multiplied by `gravity.scale`.
     * 
     * @property gravity.x
     * @type object
     * @default 0
     */

    /**
     * The gravitational direction normal `y` component, to be multiplied by `gravity.scale`.
     *
     * @property gravity.y
     * @type object
     * @default 1
     */

    /**
     * The magnitude of the gravitational acceleration.
     * 
     * @property gravity.scale
     * @type object
     * @default 0.001
     */

})();


/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Resolver` module contains methods for resolving collision pairs.
*
* @class Resolver
*/

var Resolver = {};

module.exports = Resolver;

var Vertices = __webpack_require__(3);
var Common = __webpack_require__(0);
var Bounds = __webpack_require__(1);
var Body = __webpack_require__(4);

(function() {

    Resolver._restingThresh = 2;
    Resolver._restingThreshTangent = Math.sqrt(6);
    Resolver._positionDampen = 0.9;
    Resolver._positionWarming = 0.8;
    Resolver._frictionNormalMultiplier = 5;
    Resolver._frictionMaxStatic = Number.MAX_VALUE;

    /**
     * Prepare pairs for position solving.
     *
     * When the optional `container` (the engine's `pairs` structure) is given,
     * the bodies touched by active pairs are also collected into a persistent
     * per-engine scratch list (`container._solverBodies`), and each body's
     * `totalContacts` is zeroed on first touch here rather than by a full
     * all-bodies reset in `postSolvePosition`. This lets `postSolvePosition`
     * visit only the bodies the solver can have affected instead of scanning
     * the whole world (dense static pages make that scan the cost).
     *
     * A resting static with an impulse of exactly +0 is stamped (its
     * `totalContacts` is kept) but takes no slot of its own and no list entry:
     * it reads the shared constant row in slot 0, so neither snapshot nor
     * write-back visits it. On a dense page most touched bodies are such
     * statics.
     *
     * `_solverStamp` is pre-declared in `Body.create`; see the rule there
     * before adding any new per-body scratch field (a lazily added field
     * splits body hidden classes and slows the whole engine).
     * @method preSolvePosition
     * @param {pair[]} pairs
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.preSolvePosition = function(pairs, container) {
        var i,
            pair,
            contactCount,
            pairsLength = pairs.length;

        if (container) {
            var solverBodies = container._solverBodies || (container._solverBodies = []),
                epoch = (container._solverEpoch || 0) + 1,
                solverBodyCount = 0;

            container._solverEpoch = epoch;

            // flat (structure-of-arrays) snapshot of the active non-sensor
            // pairs, built once per step so the position iterations read and
            // write compact numeric arrays instead of chasing
            // pair -> collision -> parent -> positionImpulse chains six times
            // over. Arrays persist on the container and are reused each step.
            var soa = container._soa || (container._soa = {
                    idxA: [], idxB: [], nx: [], ny: [], depth: [], slop: [],
                    mul2: [], sep: [], pairRefs: [],
                    impX: [], impY: [], tc: [], canMove: [],
                    share: [], shareDampen: 0, shareEpoch: -1,
                    pairCount: 0, slotCount: 0, epoch: 0,
                    sepValid: false, dirty: false
                }),
                soaIdxA = soa.idxA,
                soaIdxB = soa.idxB,
                soaNx = soa.nx,
                soaNy = soa.ny,
                soaDepth = soa.depth,
                soaSlop = soa.slop,
                soaMul2 = soa.mul2,
                soaPairRefs = soa.pairRefs,
                soaPairCount = 0;

            // find total contacts on each body, collecting each touched body
            // once (epoch stamp) and zeroing its contact count on first touch.
            //
            // Slot 0 is SHARED by every resting static (see
            // Common._isRestingStatic) carrying an impulse of exactly +0: its
            // row in both snapshots is the constant one such a body would get
            // anyway (impulse +0, immovable, and the zero velocity row
            // preSolveVelocity writes for a resting static), and nothing
            // between the two snapshots can move a static (postSolvePosition
            // applies a zero impulse to nothing, and the constraint passes
            // skip statics). So such a body takes no slot of its own, is not
            // in _solverBodies, and no pass snapshots or writes back its row.
            // Every other touched body takes slot k and sits at
            // _solverBodies[k - 1]. No engine path writes a -0 impulse (the
            // factory and every clear write +0, and a sum is -0 only when both
            // terms are), so the sign test (`1 / x > 0`, false for -0, whose
            // reciprocal is -Infinity) is for a caller that wrote one
            for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];

                if (!pair.isActive)
                    continue;

                contactCount = pair.contactCount;

                var collision = pair.collision,
                    parentA = collision.parentA,
                    parentB = collision.parentB;

                if (parentA._solverStamp !== epoch) {
                    parentA._solverStamp = epoch;
                    parentA.totalContacts = 0;
                    var impulseA = parentA.positionImpulse;
                    if (parentA._restStatic === true && impulseA.x === 0 && impulseA.y === 0
                        && 1 / impulseA.x > 0 && 1 / impulseA.y > 0) {
                        parentA._solverIndex = 0;
                    } else {
                        solverBodies[solverBodyCount++] = parentA;
                        parentA._solverIndex = solverBodyCount;
                    }
                }

                if (parentB._solverStamp !== epoch) {
                    parentB._solverStamp = epoch;
                    parentB.totalContacts = 0;
                    var impulseB = parentB.positionImpulse;
                    if (parentB._restStatic === true && impulseB.x === 0 && impulseB.y === 0
                        && 1 / impulseB.x > 0 && 1 / impulseB.y > 0) {
                        parentB._solverIndex = 0;
                    } else {
                        solverBodies[solverBodyCount++] = parentB;
                        parentB._solverIndex = solverBodyCount;
                    }
                }

                parentA.totalContacts += contactCount;
                parentB.totalContacts += contactCount;

                // sensor pairs contribute contacts above but are never solved
                if (pair.isSensor)
                    continue;

                var normal = collision.normal;
                soaIdxA[soaPairCount] = parentA._solverIndex;
                soaIdxB[soaPairCount] = parentB._solverIndex;
                soaNx[soaPairCount] = normal.x;
                soaNy[soaPairCount] = normal.y;
                soaDepth[soaPairCount] = collision.depth;
                soaSlop[soaPairCount] = pair.slop;
                soaMul2[soaPairCount] = (parentA.isStatic || parentB.isStatic) ? 2 : 1;
                soaPairRefs[soaPairCount] = pair;
                soaPairCount++;
            }

            if (solverBodies.length !== solverBodyCount) {
                solverBodies.length = solverBodyCount;
            }
            if (soaPairRefs.length !== soaPairCount) {
                soaPairRefs.length = soaPairCount;
            }

            // per-body snapshot: warm-start impulses, contact totals and the
            // can-move flag (totalContacts is only final after the pair loop)
            var soaImpX = soa.impX,
                soaImpY = soa.impY,
                soaTc = soa.tc,
                soaCanMove = soa.canMove;

            // the shared resting-static row (slot 0)
            soaImpX[0] = 0;
            soaImpY[0] = 0;
            soaTc[0] = 0;
            soaCanMove[0] = 0;

            for (i = 0; i < solverBodyCount; i++) {
                var solverBody = solverBodies[i],
                    solverBodyImpulse = solverBody.positionImpulse,
                    solverSlot = i + 1;
                soaImpX[solverSlot] = solverBodyImpulse.x;
                soaImpY[solverSlot] = solverBodyImpulse.y;
                soaTc[solverSlot] = solverBody.totalContacts;
                soaCanMove[solverSlot] = (solverBody.isStatic || solverBody.isSleeping) ? 0 : 1;
            }

            soa.pairCount = soaPairCount;
            // slots, counting the shared one
            soa.slotCount = solverBodyCount + 1;
            soa.epoch = epoch;
            soa.sepValid = false;
            soa.dirty = false;

            return;
        }

        // find total contacts on each body
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            contactCount = pair.contactCount;
            pair.collision.parentA.totalContacts += contactCount;
            pair.collision.parentB.totalContacts += contactCount;
        }
    };

    /**
     * Find a solution for pair positions.
     *
     * When the optional `container` (the engine's `pairs` structure, prepared
     * by `preSolvePosition`) is given, the iteration runs over the flat
     * structure-of-arrays snapshot built there: identical math in identical
     * order over compact numeric arrays, with the results written back to the
     * pairs and bodies in `postSolvePosition`.
     * @method solvePosition
     * @param {pair[]} pairs
     * @param {number} delta
     * @param {number} [damping=1]
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.solvePosition = function(pairs, delta, damping, container) {
        var i,
            pair,
            collision,
            bodyA,
            bodyB,
            normal,
            contactShare,
            positionImpulse,
            positionDampen = Resolver._positionDampen * (damping || 1),
            slopDampen = Common.clamp(delta / Common._baseDelta, 0, 1),
            pairsLength = pairs.length;

        var soa = container && container._soa;
        if (soa && soa.epoch === container._solverEpoch) {
            var pairCount = soa.pairCount,
                idxA = soa.idxA,
                idxB = soa.idxB,
                nxArr = soa.nx,
                nyArr = soa.ny,
                depthArr = soa.depth,
                slopArr = soa.slop,
                mul2Arr = soa.mul2,
                sepArr = soa.sep,
                impX = soa.impX,
                impY = soa.impY,
                tcArr = soa.tc,
                canMove = soa.canMove,
                shareArr = soa.share,
                p,
                ia,
                ib;

            // each body's contact share is constant across the six iterations,
            // so the divide is done once per body per step instead of once per
            // pair side per iteration. The saved value is the identical
            // quotient of the identical operands, not a reciprocal, so the
            // impulse arithmetic below is unchanged bit for bit.
            if (soa.shareEpoch !== soa.epoch || soa.shareDampen !== positionDampen) {
                soa.shareEpoch = soa.epoch;
                soa.shareDampen = positionDampen;

                var shareSlotCount = soa.slotCount;

                // immovable slots are written 0 rather than skipped, so the
                // array stays packed (a hole would put it in dictionary mode)
                for (var shareIndex = 0; shareIndex < shareSlotCount; shareIndex++) {
                    shareArr[shareIndex] = canMove[shareIndex] === 1 ? positionDampen / tcArr[shareIndex] : 0;
                }
            }

            // get current separation between body edges involved in collision
            for (p = 0; p < pairCount; p++) {
                ia = idxA[p];
                ib = idxB[p];
                sepArr[p] = depthArr[p]
                    + nxArr[p] * (impX[ib] - impX[ia])
                    + nyArr[p] * (impY[ib] - impY[ia]);
            }

            soa.sepValid = true;
            soa.dirty = true;

            // find impulses required to resolve penetration
            for (p = 0; p < pairCount; p++) {
                ia = idxA[p];
                ib = idxB[p];

                // multiplying by the pre-snapshotted 1-or-2 static factor is
                // exact, so this matches the classic conditional doubling
                var soaImpulse = (sepArr[p] - slopArr[p] * slopDampen) * mul2Arr[p],
                    soaNormalX = nxArr[p],
                    soaNormalY = nyArr[p];

                if (canMove[ia] === 1) {
                    contactShare = shareArr[ia];
                    impX[ia] += soaNormalX * soaImpulse * contactShare;
                    impY[ia] += soaNormalY * soaImpulse * contactShare;
                }

                if (canMove[ib] === 1) {
                    contactShare = shareArr[ib];
                    impX[ib] -= soaNormalX * soaImpulse * contactShare;
                    impY[ib] -= soaNormalY * soaImpulse * contactShare;
                }
            }

            return;
        }

        // find impulses required to resolve penetration
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;

            collision = pair.collision;
            bodyA = collision.parentA;
            bodyB = collision.parentB;
            normal = collision.normal;

            // get current separation between body edges involved in collision
            pair.separation = 
                collision.depth + normal.x * (bodyB.positionImpulse.x - bodyA.positionImpulse.x)
                + normal.y * (bodyB.positionImpulse.y - bodyA.positionImpulse.y);
        }
        
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];

            if (!pair.isActive || pair.isSensor)
                continue;
            
            collision = pair.collision;
            bodyA = collision.parentA;
            bodyB = collision.parentB;
            normal = collision.normal;
            positionImpulse = pair.separation - pair.slop * slopDampen;

            if (bodyA.isStatic || bodyB.isStatic)
                positionImpulse *= 2;
            
            if (!(bodyA.isStatic || bodyA.isSleeping)) {
                contactShare = positionDampen / bodyA.totalContacts;
                bodyA.positionImpulse.x += normal.x * positionImpulse * contactShare;
                bodyA.positionImpulse.y += normal.y * positionImpulse * contactShare;
            }

            if (!(bodyB.isStatic || bodyB.isSleeping)) {
                contactShare = positionDampen / bodyB.totalContacts;
                bodyB.positionImpulse.x -= normal.x * positionImpulse * contactShare;
                bodyB.positionImpulse.y -= normal.y * positionImpulse * contactShare;
            }
        }
    };

    /**
     * Applies the accumulated position impulse to a single body and either
     * clears it or decays it to warm the next step. Identical math to the
     * classic full-scan path; shared by both `postSolvePosition` modes.
     * @private
     * @method _postSolveBody
     * @param {body} body
     * @param {boolean} [deferBounds=false] Leave a moving body's bounds to its next integration
     * @return {boolean} `true` when the body still carries a non-zero impulse
     */
    Resolver._postSolveBody = function(body, deferBounds) {
        var positionImpulse = body.positionImpulse,
            positionImpulseX = positionImpulse.x,
            positionImpulseY = positionImpulse.y,
            velocity = body.velocity;

        if (positionImpulseX === 0 && positionImpulseY === 0) {
            return false;
        }

        // a moving body's bounds are recomputed by its next integration before
        // the detector reads them, so an engine that opted out defers them and
        // marks the body (see Body._updateStaleBounds); a static or sleeping
        // body is not integrated, so its bounds are always kept current here
        var skipBounds = deferBounds === true && !(body.isStatic || body.isSleeping);

        // update body geometry
        for (var j = 0; j < body.parts.length; j++) {
            var part = body.parts[j];
            Vertices.translate(part.vertices, positionImpulse);
            if (!skipBounds) {
                Bounds.update(part.bounds, part.vertices, velocity);
            }
            part.position.x += positionImpulseX;
            part.position.y += positionImpulseY;
        }

        if (skipBounds) {
            body._boundsStale = true;
        }

        // move the body without changing velocity
        body.positionPrev.x += positionImpulseX;
        body.positionPrev.y += positionImpulseY;

        // a static carrying an impulse (frozen while it held one) moves
        // position and positionPrev together, which keeps the rest row for a
        // finite impulse; a moving body reads one false flag here
        if (body._restStatic === true) {
            body._restStatic = Common._isRestingStatic(body);
        }

        if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
            // reset cached impulse if the body has velocity along it
            positionImpulse.x = 0;
            positionImpulse.y = 0;

            // a body frozen while it carried the impulse has stopped moving
            // (see Body._driftEnded)
            if (body._sMoved === true) {
                Body._driftEnded(body);
            }

            return false;
        }

        // warm the next iteration
        positionImpulse.x *= Resolver._positionWarming;
        positionImpulse.y *= Resolver._positionWarming;

        // the warming decay only asymptotes towards zero; below this magnitude
        // the remaining translation is far under any observable simulation
        // scale, so clear it outright to let carried bodies retire
        if (positionImpulse.x < 1e-9 && positionImpulse.x > -1e-9
            && positionImpulse.y < 1e-9 && positionImpulse.y > -1e-9) {
            positionImpulse.x = 0;
            positionImpulse.y = 0;

            // as above
            if (body._sMoved === true) {
                Body._driftEnded(body);
            }

            return false;
        }

        return true;
    };

    /**
     * Apply position resolution.
     *
     * When the optional `container` (the engine's `pairs` structure, as passed
     * to `preSolvePosition`) is given, only the bodies collected there plus any
     * bodies still carrying a warmed impulse from earlier steps are visited,
     * instead of scanning every body in the world. A body whose pair ended but
     * whose warmed impulse is still decaying stays in a persistent carry list
     * until the impulse clears, preserving the classic path's decay behaviour.
     *
     * With `deferBounds` a moving body's bounds are not recomputed after its
     * position correction: its next integration recomputes them before the
     * detector reads them, and the body is marked so that anything which stops
     * it being integrated first brings them up to date (see
     * `Body._updateStaleBounds`). `Engine.update` passes it when
     * `enableSolvedVelocityAndBounds` is `false`.
     * @method postSolvePosition
     * @param {body[]} bodies
     * @param {pairs} [container] The engine's pairs structure for scratch state
     * @param {boolean} [deferBounds=false] Leave moving bodies' bounds to their next integration
     */
    Resolver.postSolvePosition = function(bodies, container, deferBounds) {
        var positionWarming = Resolver._positionWarming,
            verticesTranslate = Vertices.translate,
            boundsUpdate = Bounds.update,
            i;

        if (container) {
            var solverBodies = container._solverBodies || (container._solverBodies = []),
                solverBodiesLength = solverBodies.length,
                carry = container._impulseCarry || (container._impulseCarry = []),
                carryLength = carry.length,
                epoch = container._solverEpoch,
                postSolveBody = Resolver._postSolveBody,
                carryCount = 0;

            // write the flat solver snapshot's body impulses back before the
            // per-body impulse application below reads them. Only when the
            // SoA path actually ran this step (dirty): a caller that ran the
            // classic solvePosition instead has already mutated the real
            // objects, and stale array values must not clobber that.
            //
            // The pair separations are NOT written back to `pair.separation`:
            // the velocity solve reads them from the snapshot (see
            // preSolveVelocity), and `Pair.update` overwrites every active
            // pair's separation with its depth before anything reads it again
            var soaBack = container._soa;
            if (soaBack && soaBack.dirty && soaBack.epoch === epoch) {
                var backImpX = soaBack.impX,
                    backImpY = soaBack.impY,
                    backSlotCount = soaBack.slotCount,
                    back;

                // a body the position solve could not move (static or
                // sleeping) has an unchanged snapshot, so its write-back is a
                // no-op by value; skip it
                var backCanMove = soaBack.canMove;
                // slot 0 is the shared resting-static row, never movable
                for (back = 1; back < backSlotCount; back++) {
                    if (backCanMove[back] === 0) {
                        continue;
                    }

                    var backImpulse = solverBodies[back - 1].positionImpulse;
                    backImpulse.x = backImpX[back];
                    backImpulse.y = backImpY[back];
                }
            }

            // bodies from earlier steps still decaying a warmed impulse, first:
            // this loop compacts the carry list in place, and must finish its
            // reads before the solver-bodies loop below appends into the same
            // array. Bodies also touched by this step's pairs are skipped here
            // (the stamp matches) and handled in the second loop instead.
            for (i = 0; i < carryLength; i++) {
                var carryBody = carry[i];
                if (carryBody._solverStamp === epoch) {
                    continue;
                }
                // the zero-impulse early-return of _postSolveBody, inlined to
                // skip the call (a removed body's impulse is zeroed in place)
                var carryImpulse = carryBody.positionImpulse;
                if ((carryImpulse.x !== 0 || carryImpulse.y !== 0) && postSolveBody(carryBody, deferBounds)) {
                    // in-place compaction: carryCount <= i always holds here
                    carry[carryCount++] = carryBody;
                }
            }

            // bodies touched by this step's pairs; append any that finish the
            // step still carrying a warmed impulse. The zero-impulse check is
            // inlined to skip the call for a body with no impulse to apply.
            for (i = 0; i < solverBodiesLength; i++) {
                var solverBody = solverBodies[i],
                    solverImpulse = solverBody.positionImpulse;
                if ((solverImpulse.x !== 0 || solverImpulse.y !== 0) && postSolveBody(solverBody, deferBounds)) {
                    carry[carryCount++] = solverBody;
                }
            }

            if (carry.length !== carryCount) {
                carry.length = carryCount;
            }

            return;
        }

        var bodiesLength = bodies.length;

        for (i = 0; i < bodiesLength; i++) {
            var body = bodies[i],
                positionImpulse = body.positionImpulse,
                positionImpulseX = positionImpulse.x,
                positionImpulseY = positionImpulse.y,
                velocity = body.velocity;

            // reset contact count
            body.totalContacts = 0;

            if (positionImpulseX !== 0 || positionImpulseY !== 0) {
                // see _postSolveBody for the deferral
                var skipBounds = deferBounds === true && !(body.isStatic || body.isSleeping);

                // update body geometry
                for (var j = 0; j < body.parts.length; j++) {
                    var part = body.parts[j];
                    verticesTranslate(part.vertices, positionImpulse);
                    if (!skipBounds) {
                        boundsUpdate(part.bounds, part.vertices, velocity);
                    }
                    part.position.x += positionImpulseX;
                    part.position.y += positionImpulseY;
                }

                if (skipBounds) {
                    body._boundsStale = true;
                }

                // move the body without changing velocity
                body.positionPrev.x += positionImpulseX;
                body.positionPrev.y += positionImpulseY;

                // see _postSolveBody
                if (body._restStatic === true) {
                    body._restStatic = Common._isRestingStatic(body);
                }

                if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
                    // reset cached impulse if the body has velocity along it
                    positionImpulse.x = 0;
                    positionImpulse.y = 0;

                    // see _postSolveBody. This path never clears a decayed
                    // impulse, so a frozen body it moves only by decay stays a
                    // mover for the grid: correct, if costlier, and
                    // Engine.update never takes this path
                    if (body._sMoved === true) {
                        Body._driftEnded(body);
                    }
                } else {
                    // warm the next iteration
                    positionImpulse.x *= positionWarming;
                    positionImpulse.y *= positionWarming;
                }
            }
        }
    };

    /**
     * Prepare pairs for velocity solving.
     *
     * When the optional `container` (the engine's `pairs` structure, already
     * prepared by `preSolvePosition` this step) is given, a flat
     * structure-of-arrays snapshot of the velocity solve is built here: body
     * state per `_solverIndex` slot, per-pair constants (normal, tangent,
     * friction products, restitution, separation, contact share) and per-
     * contact state (vertex, warm-start impulses). The warm-start application
     * below then runs against the flat arrays, `solveVelocity` iterates them,
     * and `postSolveVelocity` writes the mutated state back. Everything the
     * iterations read besides `positionPrev` / `anglePrev` and the contact
     * impulses is constant across them, which is what makes the snapshot
     * sound; the math is identical in identical order.
     * @method preSolveVelocity
     * @param {pair[]} pairs
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.preSolveVelocity = function(pairs, container) {
        var pairsLength = pairs.length,
            i,
            j;

        // the velocity snapshot is built over the position snapshot: the pair
        // list, solver slots, normals and separations were already collected
        // by preSolvePosition this step, so they are aliased rather than
        // re-derived from another walk of pairs.list. A container without a
        // same-step position snapshot falls through to the classic path (the
        // engine always runs preSolvePosition first, so only external callers
        // can get there).
        var soa = container && container._soa;

        if (soa && soa.epoch === container._solverEpoch) {
            var soaV = container._soaV || (container._soaV = {
                    idxA: [], idxB: [], nx: [], ny: [],
                    frictionTimesStatic: [], friction: [],
                    restitutionPlus1: [], separation: [], contactCounts: [],
                    // per-contact constants of the iterations, hoisted here:
                    // contact offsets from both body centres, and the share
                    // factor whose divide otherwise runs once per contact per
                    // iteration (all inputs are fixed across the iterations)
                    cOffAX: [], cOffAY: [], cOffBX: [], cOffBY: [], cShare: [],
                    cNormalImpulse: [], cTangentImpulse: [], cRefs: [],
                    bPosX: [], bPosY: [], bPosPrevX: [], bPosPrevY: [],
                    bAngle: [], bAnglePrev: [], bInvMass: [], bInvInertia: [], bCanMove: [],
                    pairCount: 0, contactTotal: 0, slotCount: 0, epoch: 0, dirty: false
                }),
                solverBodies = container._solverBodies || (container._solverBodies = []),
                bodyCount = solverBodies.length,
                aPairRefs = soa.pairRefs,
                aPairCount = soa.pairCount,
                aIdxA = soa.idxA,
                aIdxB = soa.idxB,
                aNx = soa.nx,
                aNy = soa.ny,
                aSep = soa.sep,
                aSepValid = soa.sepValid,
                vFrictionTimesStatic = soaV.frictionTimesStatic,
                vFriction = soaV.friction,
                vRestitutionPlus1 = soaV.restitutionPlus1,
                vContactCounts = soaV.contactCounts,
                cOffAX = soaV.cOffAX,
                cOffAY = soaV.cOffAY,
                cOffBX = soaV.cOffBX,
                cOffBY = soaV.cOffBY,
                cShare = soaV.cShare,
                cNormalImpulse = soaV.cNormalImpulse,
                cTangentImpulse = soaV.cTangentImpulse,
                cRefs = soaV.cRefs,
                bPosX = soaV.bPosX,
                bPosY = soaV.bPosY,
                bPosPrevX = soaV.bPosPrevX,
                bPosPrevY = soaV.bPosPrevY,
                bAngle = soaV.bAngle,
                bAnglePrev = soaV.bAnglePrev,
                bInvMass = soaV.bInvMass,
                bInvInertia = soaV.bInvInertia,
                bCanMove = soaV.bCanMove,
                vContactIndex = 0;

            // pair-parallel arrays that the position snapshot already holds are
            // shared by reference; nothing on the velocity side writes them
            soaV.idxA = aIdxA;
            soaV.idxB = aIdxB;
            soaV.nx = aNx;
            soaV.ny = aNy;

            // the position solve wrote every active pair's separation into its
            // own snapshot in this same slot order, so alias that too. Only a
            // step whose position solve never ran needs the per-pair copy off
            // the pair objects (the depth `Pair.update` set this step), and
            // that path takes a private array back.
            var vSeparation;
            if (aSepValid) {
                vSeparation = soaV.separation = aSep;
            } else {
                vSeparation = soaV.separation;
                if (vSeparation === aSep) {
                    vSeparation = soaV.separation = [];
                }
                for (i = 0; i < aPairCount; i++) {
                    vSeparation[i] = aPairRefs[i].separation;
                }
            }

            // per-body snapshot into the slots assigned by preSolvePosition
            // (same epoch; slot k holds _solverBodies[k - 1]). This one is NOT
            // aliased: positions moved during the position solve, and a
            // constraint pass can wake bodies between the phases.
            //
            // First the shared resting-static row (slot 0; see
            // preSolvePosition), the row the branch below writes for one
            bPosX[0] = 0;
            bPosY[0] = 0;
            bPosPrevX[0] = 0;
            bPosPrevY[0] = 0;
            bAngle[0] = 0;
            bAnglePrev[0] = 0;
            bInvMass[0] = 0;
            bInvInertia[0] = 0;
            bCanMove[0] = 0;

            for (var slot = 1; slot <= bodyCount; slot++) {
                var vBody = solverBodies[slot - 1];

                // a resting static (see Common._isRestingStatic) with a slot of
                // its own (its impulse is not +0) gets the constant zero row
                // instead of a read of the body. Its real row has a velocity of
                // exactly +0 and an inverse inertia of exactly +0, and every
                // read of the row is either gated by bCanMove (0 here) or
                // multiplies an offset by that +0 angular velocity or inertia.
                // The zero position makes those offsets absolute rather than
                // relative, which changes nothing: a finite offset times +0 is
                // a zero the +0 velocity absorbs, and a non-finite one is NaN
                // in both. (The two part only where a coordinate is within a
                // factor of two of the largest double, where the relative
                // offset overflows.) bInvMass is read only under bCanMove, but
                // is still written: skipping it could leave a hole in the array
                if (vBody._restStatic === true) {
                    bPosX[slot] = 0;
                    bPosY[slot] = 0;
                    bPosPrevX[slot] = 0;
                    bPosPrevY[slot] = 0;
                    bAngle[slot] = 0;
                    bAnglePrev[slot] = 0;
                    bInvMass[slot] = 0;
                    bInvInertia[slot] = 0;
                    bCanMove[slot] = 0;
                    continue;
                }

                var vBodyPosition = vBody.position,
                    vBodyPositionPrev = vBody.positionPrev;
                bPosX[slot] = vBodyPosition.x;
                bPosY[slot] = vBodyPosition.y;
                bPosPrevX[slot] = vBodyPositionPrev.x;
                bPosPrevY[slot] = vBodyPositionPrev.y;
                bAngle[slot] = vBody.angle;
                bAnglePrev[slot] = vBody.anglePrev;
                bInvMass[slot] = vBody.inverseMass;
                bInvInertia[slot] = vBody.inverseInertia;
                bCanMove[slot] = (vBody.isStatic || vBody.isSleeping) ? 0 : 1;
            }

            // per-pair and per-contact snapshot, with the classic warm-start
            // application fused in (identical order: pair by pair, contact by
            // contact, mutating the flat body state)
            for (i = 0; i < aPairCount; i++) {
                var vPair = aPairRefs[i],
                    vContacts = vPair.contacts,
                    vContactCount = vPair.contactCount,
                    slotA = aIdxA[i],
                    slotB = aIdxB[i],
                    vNormalX = aNx[i],
                    vNormalY = aNy[i],
                    // the tangent is the normal turned a quarter (an exact
                    // negation and swap), which is how it is derived everywhere
                    vTangentX = -vNormalY,
                    vTangentY = vNormalX;

                // `1 / vContactCount` without the divide, and without a branch.
                // An active pair's count is the collision's support count,
                // always 1 or 2 (Collision.collides), and 1.5 - 0.5 * count is
                // exactly 1 and exactly 0.5 there, so this is the identical
                // value. A count of 0 (a pair re-activated without an update)
                // runs no contact below, so its share is never read. NOT
                // `count === 1 ? 1 : 0.5`: the count is close to a coin flip per
                // pair, and that branch measured slower than the divide
                var vInverseMassTotal = vPair.inverseMass,
                    vPairContactShare = 1.5 - 0.5 * vContactCount,
                    vInvInertiaA = bInvInertia[slotA],
                    vInvInertiaB = bInvInertia[slotB],
                    vPosAX = bPosX[slotA],
                    vPosAY = bPosY[slotA],
                    vPosBX = bPosX[slotB],
                    vPosBY = bPosY[slotB];

                // first factor of the classic left-associated triple product
                vFrictionTimesStatic[i] = vPair.friction * vPair.frictionStatic;
                vFriction[i] = vPair.friction;
                vRestitutionPlus1[i] = 1 + vPair.restitution;
                vContactCounts[i] = vContactCount;

                for (j = 0; j < vContactCount; j++) {
                    var vContact = vContacts[j],
                        vContactVertex = vContact.vertex,
                        vNormalImpulse = vContact.normalImpulse,
                        vTangentImpulse = vContact.tangentImpulse,
                        vOffsetAX = vContactVertex.x - vPosAX,
                        vOffsetAY = vContactVertex.y - vPosAY,
                        vOffsetBX = vContactVertex.x - vPosBX,
                        vOffsetBY = vContactVertex.y - vPosBY,
                        vOAcN = vOffsetAX * vNormalY - vOffsetAY * vNormalX,
                        vOBcN = vOffsetBX * vNormalY - vOffsetBY * vNormalX;

                    cOffAX[vContactIndex] = vOffsetAX;
                    cOffAY[vContactIndex] = vOffsetAY;
                    cOffBX[vContactIndex] = vOffsetBX;
                    cOffBY[vContactIndex] = vOffsetBY;
                    // identical association to the classic in-iteration form
                    cShare[vContactIndex] = vPairContactShare / (vInverseMassTotal
                        + vInvInertiaA * vOAcN * vOAcN
                        + vInvInertiaB * vOBcN * vOBcN);
                    cNormalImpulse[vContactIndex] = vNormalImpulse;
                    cTangentImpulse[vContactIndex] = vTangentImpulse;
                    cRefs[vContactIndex] = vContact;

                    if (vNormalImpulse !== 0 || vTangentImpulse !== 0) {
                        // total impulse from contact
                        var vImpulseX = vNormalX * vNormalImpulse + vTangentX * vTangentImpulse,
                            vImpulseY = vNormalY * vNormalImpulse + vTangentY * vTangentImpulse;

                        // apply impulse from contact; the offsets are the same
                        // vertex-minus-position subtractions the classic form
                        // wrote inline
                        if (bCanMove[slotA] === 1) {
                            bPosPrevX[slotA] += vImpulseX * bInvMass[slotA];
                            bPosPrevY[slotA] += vImpulseY * bInvMass[slotA];
                            bAnglePrev[slotA] += bInvInertia[slotA] * (
                                vOffsetAX * vImpulseY - vOffsetAY * vImpulseX
                            );
                        }

                        if (bCanMove[slotB] === 1) {
                            bPosPrevX[slotB] -= vImpulseX * bInvMass[slotB];
                            bPosPrevY[slotB] -= vImpulseY * bInvMass[slotB];
                            bAnglePrev[slotB] -= bInvInertia[slotB] * (
                                vOffsetBX * vImpulseY - vOffsetBY * vImpulseX
                            );
                        }
                    }

                    vContactIndex++;
                }
            }

            if (cRefs.length !== vContactIndex) {
                cRefs.length = vContactIndex;
            }

            soaV.pairCount = aPairCount;
            soaV.contactTotal = vContactIndex;
            // slots, counting the shared one
            soaV.slotCount = bodyCount + 1;
            soaV.epoch = container._solverEpoch;
            soaV.dirty = true;

            return;
        }

        for (i = 0; i < pairsLength; i++) {
            var pair = pairs[i];

            if (!pair.isActive || pair.isSensor)
                continue;

            var contacts = pair.contacts,
                contactCount = pair.contactCount,
                collision = pair.collision,
                bodyA = collision.parentA,
                bodyB = collision.parentB,
                normal = collision.normal,
                // the normal turned a quarter: an exact negation and swap
                tangentX = -normal.y,
                tangentY = normal.x;

            // resolve each contact
            for (j = 0; j < contactCount; j++) {
                var contact = contacts[j],
                    contactVertex = contact.vertex,
                    normalImpulse = contact.normalImpulse,
                    tangentImpulse = contact.tangentImpulse;

                if (normalImpulse !== 0 || tangentImpulse !== 0) {
                    // total impulse from contact
                    var impulseX = normal.x * normalImpulse + tangentX * tangentImpulse,
                        impulseY = normal.y * normalImpulse + tangentY * tangentImpulse;

                    // apply impulse from contact
                    if (!(bodyA.isStatic || bodyA.isSleeping)) {
                        bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                        bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                        bodyA.anglePrev += bodyA.inverseInertia * (
                            (contactVertex.x - bodyA.position.x) * impulseY
                            - (contactVertex.y - bodyA.position.y) * impulseX
                        );
                    }

                    if (!(bodyB.isStatic || bodyB.isSleeping)) {
                        bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                        bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                        bodyB.anglePrev -= bodyB.inverseInertia * (
                            (contactVertex.x - bodyB.position.x) * impulseY
                            - (contactVertex.y - bodyB.position.y) * impulseX
                        );
                    }
                }
            }
        }
    };

    /**
     * Applies the velocity-solve results captured in the flat snapshot back to
     * the bodies (positionPrev, anglePrev) and contacts (warm-start impulses).
     * Only meaningful after a container-path `preSolveVelocity` /
     * `solveVelocity` sequence; a no-op otherwise.
     * @method postSolveVelocity
     * @param {pairs} container The engine's pairs structure for scratch state
     */
    Resolver.postSolveVelocity = function(container) {
        var soaV = container._soaV;

        if (!soaV || !soaV.dirty || soaV.epoch !== container._solverEpoch) {
            return;
        }

        var solverBodies = container._solverBodies,
            slotCount = soaV.slotCount,
            bPosPrevX = soaV.bPosPrevX,
            bPosPrevY = soaV.bPosPrevY,
            bAnglePrev = soaV.bAnglePrev,
            contactTotal = soaV.contactTotal,
            cRefs = soaV.cRefs,
            cNormalImpulse = soaV.cNormalImpulse,
            cTangentImpulse = soaV.cTangentImpulse,
            i;

        soaV.dirty = false;

        // a body the velocity solve could not move (static or sleeping, per
        // the snapshot flag; nothing wakes bodies between the snapshot and
        // here) has unchanged values, so its write-back is skipped outright
        var bCanMove = soaV.bCanMove;

        // slot 0 is the shared resting-static row (see preSolvePosition)
        for (i = 1; i < slotCount; i++) {
            if (bCanMove[i] === 0) {
                continue;
            }

            var writeBody = solverBodies[i - 1],
                writeBodyPositionPrev = writeBody.positionPrev;
            writeBodyPositionPrev.x = bPosPrevX[i];
            writeBodyPositionPrev.y = bPosPrevY[i];
            writeBody.anglePrev = bAnglePrev[i];
        }

        for (i = 0; i < contactTotal; i++) {
            var writeContact = cRefs[i];
            writeContact.normalImpulse = cNormalImpulse[i];
            writeContact.tangentImpulse = cTangentImpulse[i];
        }
    };

    /**
     * Find a solution for pair velocities.
     *
     * When the optional `container` (prepared by the container-path
     * `preSolveVelocity` this step) is given, the iteration runs over the flat
     * snapshot built there; `postSolveVelocity` writes the results back.
     * @method solveVelocity
     * @param {pair[]} pairs
     * @param {number} delta
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.solveVelocity = function(pairs, delta, container) {
        var timeScale = delta / Common._baseDelta,
            timeScaleSquared = timeScale * timeScale,
            timeScaleCubed = timeScaleSquared * timeScale,
            restingThresh = -Resolver._restingThresh * timeScale,
            restingThreshTangent = Resolver._restingThreshTangent,
            frictionNormalMultiplier = Resolver._frictionNormalMultiplier * timeScale,
            frictionMaxStatic = Resolver._frictionMaxStatic,
            pairsLength = pairs.length,
            tangentImpulse,
            maxFriction,
            i,
            j;

        var soaV = container && container._soaV;
        if (soaV && soaV.dirty && soaV.epoch === container._solverEpoch) {
            var pairCount = soaV.pairCount,
                vIdxA = soaV.idxA,
                vIdxB = soaV.idxB,
                vNx = soaV.nx,
                vNy = soaV.ny,
                vFrictionTimesStatic = soaV.frictionTimesStatic,
                vFriction = soaV.friction,
                vRestitutionPlus1 = soaV.restitutionPlus1,
                vSeparation = soaV.separation,
                vContactCounts = soaV.contactCounts,
                cOffAX = soaV.cOffAX,
                cOffAY = soaV.cOffAY,
                cOffBX = soaV.cOffBX,
                cOffBY = soaV.cOffBY,
                cShare = soaV.cShare,
                cNormalImpulse = soaV.cNormalImpulse,
                cTangentImpulse = soaV.cTangentImpulse,
                bPosX = soaV.bPosX,
                bPosY = soaV.bPosY,
                bPosPrevX = soaV.bPosPrevX,
                bPosPrevY = soaV.bPosPrevY,
                bAngle = soaV.bAngle,
                bAnglePrev = soaV.bAnglePrev,
                bInvMass = soaV.bInvMass,
                bInvInertia = soaV.bInvInertia,
                bCanMove = soaV.bCanMove;

            // the contact block of pair p follows pair p-1's, exactly as
            // preSolveVelocity laid them down, so the start index is carried
            // rather than stored per pair
            var contactStart = 0;

            for (var p = 0; p < pairCount; p++) {
                var ia = vIdxA[p],
                    ib = vIdxB[p],
                    normalX = vNx[p],
                    normalY = vNy[p],
                    // exactly the values preSolveVelocity derived, from the
                    // same normal, so the negation reproduces them bit for bit
                    tangentX = -normalY,
                    tangentY = normalX,
                    friction = vFrictionTimesStatic[p] * frictionNormalMultiplier,
                    pairSeparation = vSeparation[p],
                    pairFriction = vFriction[p],
                    restitutionPlus1 = vRestitutionPlus1[p],
                    contactEnd = contactStart + vContactCounts[p];

                // cache body properties that are invariant across the contact loop
                var bodyAPositionX = bPosX[ia],
                    bodyAPositionY = bPosY[ia],
                    bodyBPositionX = bPosX[ib],
                    bodyBPositionY = bPosY[ib],
                    bodyAInverseMass = bInvMass[ia],
                    bodyBInverseMass = bInvMass[ib],
                    bodyAInverseInertia = bInvInertia[ia],
                    bodyBInverseInertia = bInvInertia[ib],
                    bodyACanMove = bCanMove[ia] === 1,
                    bodyBCanMove = bCanMove[ib] === 1;

                // get body velocities
                var bodyAVelocityX = bodyAPositionX - bPosPrevX[ia],
                    bodyAVelocityY = bodyAPositionY - bPosPrevY[ia],
                    bodyAAngularVelocity = bAngle[ia] - bAnglePrev[ia],
                    bodyBVelocityX = bodyBPositionX - bPosPrevX[ib],
                    bodyBVelocityY = bodyBPositionY - bPosPrevY[ib],
                    bodyBAngularVelocity = bAngle[ib] - bAnglePrev[ib];

                // resolve each contact
                for (var c = contactStart; c < contactEnd; c++) {
                    // offsets and the share divide are constants of the
                    // iterations, precomputed in preSolveVelocity
                    var offsetAX = cOffAX[c],
                        offsetAY = cOffAY[c],
                        offsetBX = cOffBX[c],
                        offsetBY = cOffBY[c];

                    var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                        velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                        velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                        velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;

                    var relativeVelocityX = velocityPointAX - velocityPointBX,
                        relativeVelocityY = velocityPointAY - velocityPointBY;

                    var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                        tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                    // coulomb friction
                    var normalOverlap = pairSeparation + normalVelocity;
                    var normalForce = normalOverlap < 1 ? normalOverlap : 1;
                    normalForce = normalOverlap < 0 ? 0 : normalForce;

                    var frictionLimit = normalForce * friction;

                    if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                        maxFriction = (tangentVelocity > 0 ? tangentVelocity : -tangentVelocity);
                        tangentImpulse = pairFriction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;

                        if (tangentImpulse < -maxFriction) {
                            tangentImpulse = -maxFriction;
                        } else if (tangentImpulse > maxFriction) {
                            tangentImpulse = maxFriction;
                        }
                    } else {
                        tangentImpulse = tangentVelocity;
                        maxFriction = frictionMaxStatic;
                    }

                    // raw impulses (share was precomputed with the identical
                    // mass, inertia and contact offset association)
                    var share = cShare[c];
                    var normalImpulse = restitutionPlus1 * normalVelocity * share;
                    tangentImpulse *= share;

                    // handle high velocity and resting collisions separately
                    if (normalVelocity < restingThresh) {
                        // high normal velocity so clear cached contact normal impulse
                        cNormalImpulse[c] = 0;
                    } else {
                        // solve resting collision constraints using Erin Catto's method (GDC08)
                        // impulse constraint tends to 0
                        var contactNormalImpulse = cNormalImpulse[c];
                        cNormalImpulse[c] = contactNormalImpulse + normalImpulse;
                        if (cNormalImpulse[c] > 0) cNormalImpulse[c] = 0;
                        normalImpulse = cNormalImpulse[c] - contactNormalImpulse;
                    }

                    // handle high velocity and resting collisions separately
                    if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                        // high tangent velocity so clear cached contact tangent impulse
                        cTangentImpulse[c] = 0;
                    } else {
                        // solve resting collision constraints using Erin Catto's method (GDC08)
                        // tangent impulse tends to -tangentSpeed or +tangentSpeed
                        var contactTangentImpulse = cTangentImpulse[c];
                        cTangentImpulse[c] = contactTangentImpulse + tangentImpulse;
                        if (cTangentImpulse[c] < -maxFriction) cTangentImpulse[c] = -maxFriction;
                        if (cTangentImpulse[c] > maxFriction) cTangentImpulse[c] = maxFriction;
                        tangentImpulse = cTangentImpulse[c] - contactTangentImpulse;
                    }

                    // total impulse from contact
                    var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                        impulseY = normalY * normalImpulse + tangentY * tangentImpulse;

                    // apply impulse from contact
                    if (bodyACanMove) {
                        bPosPrevX[ia] += impulseX * bodyAInverseMass;
                        bPosPrevY[ia] += impulseY * bodyAInverseMass;
                        bAnglePrev[ia] += (offsetAX * impulseY - offsetAY * impulseX) * bodyAInverseInertia;
                    }

                    if (bodyBCanMove) {
                        bPosPrevX[ib] -= impulseX * bodyBInverseMass;
                        bPosPrevY[ib] -= impulseY * bodyBInverseMass;
                        bAnglePrev[ib] -= (offsetBX * impulseY - offsetBY * impulseX) * bodyBInverseInertia;
                    }
                }

                contactStart = contactEnd;
            }

            return;
        }

        for (i = 0; i < pairsLength; i++) {
            var pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;
            
            var collision = pair.collision,
                bodyA = collision.parentA,
                bodyB = collision.parentB,
                normalX = collision.normal.x,
                normalY = collision.normal.y,
                // the normal turned a quarter: an exact negation and swap
                tangentX = -normalY,
                tangentY = normalX,
                inverseMassTotal = pair.inverseMass,
                friction = pair.friction * pair.frictionStatic * frictionNormalMultiplier,
                contacts = pair.contacts,
                contactCount = pair.contactCount,
                contactShare = 1 / contactCount;

            // cache body properties that are invariant across the contact loop
            var bodyAPositionX = bodyA.position.x,
                bodyAPositionY = bodyA.position.y,
                bodyBPositionX = bodyB.position.x,
                bodyBPositionY = bodyB.position.y,
                bodyAInverseMass = bodyA.inverseMass,
                bodyBInverseMass = bodyB.inverseMass,
                bodyAInverseInertia = bodyA.inverseInertia,
                bodyBInverseInertia = bodyB.inverseInertia,
                bodyACanMove = !(bodyA.isStatic || bodyA.isSleeping),
                bodyBCanMove = !(bodyB.isStatic || bodyB.isSleeping);

            // get body velocities
            var bodyAVelocityX = bodyAPositionX - bodyA.positionPrev.x,
                bodyAVelocityY = bodyAPositionY - bodyA.positionPrev.y,
                bodyAAngularVelocity = bodyA.angle - bodyA.anglePrev,
                bodyBVelocityX = bodyBPositionX - bodyB.positionPrev.x,
                bodyBVelocityY = bodyBPositionY - bodyB.positionPrev.y,
                bodyBAngularVelocity = bodyB.angle - bodyB.anglePrev;

            // resolve each contact
            for (j = 0; j < contactCount; j++) {
                var contact = contacts[j],
                    contactVertex = contact.vertex;

                var offsetAX = contactVertex.x - bodyAPositionX,
                    offsetAY = contactVertex.y - bodyAPositionY,
                    offsetBX = contactVertex.x - bodyBPositionX,
                    offsetBY = contactVertex.y - bodyBPositionY;
 
                var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                    velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                    velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                    velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;

                var relativeVelocityX = velocityPointAX - velocityPointBX,
                    relativeVelocityY = velocityPointAY - velocityPointBY;

                var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                    tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                // coulomb friction
                var normalOverlap = pair.separation + normalVelocity;
                var normalForce = normalOverlap < 1 ? normalOverlap : 1;
                normalForce = normalOverlap < 0 ? 0 : normalForce;

                var frictionLimit = normalForce * friction;

                if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                    maxFriction = (tangentVelocity > 0 ? tangentVelocity : -tangentVelocity);
                    tangentImpulse = pair.friction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;
                    
                    if (tangentImpulse < -maxFriction) {
                        tangentImpulse = -maxFriction;
                    } else if (tangentImpulse > maxFriction) {
                        tangentImpulse = maxFriction;
                    }
                } else {
                    tangentImpulse = tangentVelocity;
                    maxFriction = frictionMaxStatic;
                }

                // account for mass, inertia and contact offset
                var oAcN = offsetAX * normalY - offsetAY * normalX,
                    oBcN = offsetBX * normalY - offsetBY * normalX,
                    share = contactShare / (inverseMassTotal + bodyAInverseInertia * oAcN * oAcN + bodyBInverseInertia * oBcN * oBcN);

                // raw impulses
                var normalImpulse = (1 + pair.restitution) * normalVelocity * share;
                tangentImpulse *= share;

                // handle high velocity and resting collisions separately
                if (normalVelocity < restingThresh) {
                    // high normal velocity so clear cached contact normal impulse
                    contact.normalImpulse = 0;
                } else {
                    // solve resting collision constraints using Erin Catto's method (GDC08)
                    // impulse constraint tends to 0
                    var contactNormalImpulse = contact.normalImpulse;
                    contact.normalImpulse += normalImpulse;
                    if (contact.normalImpulse > 0) contact.normalImpulse = 0;
                    normalImpulse = contact.normalImpulse - contactNormalImpulse;
                }

                // handle high velocity and resting collisions separately
                if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                    // high tangent velocity so clear cached contact tangent impulse
                    contact.tangentImpulse = 0;
                } else {
                    // solve resting collision constraints using Erin Catto's method (GDC08)
                    // tangent impulse tends to -tangentSpeed or +tangentSpeed
                    var contactTangentImpulse = contact.tangentImpulse;
                    contact.tangentImpulse += tangentImpulse;
                    if (contact.tangentImpulse < -maxFriction) contact.tangentImpulse = -maxFriction;
                    if (contact.tangentImpulse > maxFriction) contact.tangentImpulse = maxFriction;
                    tangentImpulse = contact.tangentImpulse - contactTangentImpulse;
                }

                // total impulse from contact
                var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                    impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
                
                // apply impulse from contact
                if (bodyACanMove) {
                    bodyA.positionPrev.x += impulseX * bodyAInverseMass;
                    bodyA.positionPrev.y += impulseY * bodyAInverseMass;
                    bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyAInverseInertia;
                }

                if (bodyBCanMove) {
                    bodyB.positionPrev.x -= impulseX * bodyBInverseMass;
                    bodyB.positionPrev.y -= impulseY * bodyBInverseMass;
                    bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyBInverseInertia;
                }
            }
        }
    };

})();


/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Pairs` module contains methods for creating and manipulating collision pair sets.
*
* @class Pairs
*/

var Pairs = {};

module.exports = Pairs;

var Pair = __webpack_require__(9);
var Common = __webpack_require__(0);

(function() {

    /**
     * Creates a new pairs structure.
     * @method create
     * @param {object} options
     * @return {pairs} A new pairs structure
     */
    /**
     * Initial slot count of the collision record table (see `Pairs.create`).
     * A power of two so the hash masks; the table grows past half load.
     */
    Pairs._initialSize = 4096;

    Pairs.create = function(options) {
        return Common.extend({
            list: [],
            collisionStart: [],
            collisionActive: [],
            collisionEnd: [],
            // Open-addressing table from pair id to the LIVE pair's collision
            // record, probed by `Collision.collides` on every overlapping
            // candidate. It is authoritative (it replaced a `Map` plus a
            // direct-mapped hint cache in front of it): a present key always
            // means the pair is live and its record is the value, so a probe
            // hit is the record reuse and a miss means a fresh record.
            //
            // Keys: 0 is empty; a real pair id is always >= 1. Linear probing
            // with BACKWARD-SHIFT deletion (`Pairs._recordRemove`), so there
            // are no tombstones: every non-zero key is a live pair. Values are
            // pre-filled with null so the backing store stays packed.
            _recordKeys: new Float64Array(Pairs._initialSize),
            _recordValues: new Array(Pairs._initialSize).fill(null),
            _recordMask: Pairs._initialSize - 1,
            // live entries, which with no tombstones is also every occupied
            // slot; the table doubles when it would pass half load
            _recordLive: 0
        }, options);
    };

    /**
     * Inserts a live pair's collision record into the record table.
     * @method _recordInsert
     * @param {pairs} pairs
     * @param {number} pairId
     * @param {collision} collision
     */
    Pairs._recordInsert = function(pairs, pairId, collision) {
        if ((pairs._recordLive + 1) * 2 > pairs._recordMask + 1) {
            Pairs._recordGrow(pairs);
        }

        var keys = pairs._recordKeys,
            mask = pairs._recordMask,
            slot = Pair.hash(collision.bodyA.id, collision.bodyB.id) & mask,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                pairs._recordValues[slot] = collision;
                return;
            }

            slot = (slot + 1) & mask;
        }

        keys[slot] = pairId;
        pairs._recordValues[slot] = collision;
        pairs._recordLive += 1;
    };

    /**
     * Removes an ended pair's record from the record table by backward-shift
     * deletion: every later entry of the same probe cluster that may legally
     * sit in the vacated slot moves back into it, and the last slot vacated
     * that way is emptied. No tombstone is left, so probe chains never walk
     * over dead slots and the table never needs a same-size purge (which on a
     * page being destroyed was a ~262 KB reallocation every ~53 steps).
     * @method _recordRemove
     * @param {pairs} pairs
     * @param {number} pairId
     * @param {pair} pair
     */
    Pairs._recordRemove = function(pairs, pairId, pair) {
        var keys = pairs._recordKeys,
            values = pairs._recordValues,
            mask = pairs._recordMask,
            slot = Pair.hash(pair.bodyA.id, pair.bodyB.id) & mask,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                var gap = slot,
                    next = (slot + 1) & mask,
                    nextKey;

                while ((nextKey = keys[next]) !== 0) {
                    var record = values[next],
                        home = Pair.hash(record.bodyA.id, record.bodyB.id) & mask;

                    // an entry may move back into the gap only if its home
                    // slot is not cyclically inside (gap, next], i.e. it sits
                    // at least as far from its home as the gap is from it.
                    // Moving one whose home is after the gap would put it
                    // before its home, where a probe can never reach it
                    if (((next - home) & mask) >= ((next - gap) & mask)) {
                        keys[gap] = nextKey;
                        values[gap] = record;
                        gap = next;
                    }

                    next = (next + 1) & mask;
                }

                keys[gap] = 0;
                values[gap] = null;
                pairs._recordLive -= 1;
                return;
            }

            slot = (slot + 1) & mask;
        }
    };

    /**
     * Doubles the record table and re-inserts every entry. Only a table past
     * half load of LIVE pairs reaches here, since deletion leaves no
     * tombstones to purge.
     * @method _recordGrow
     * @param {pairs} pairs
     */
    Pairs._recordGrow = function(pairs) {
        var oldKeys = pairs._recordKeys,
            oldValues = pairs._recordValues,
            oldSize = oldKeys.length,
            size = oldSize * 2,
            mask = size - 1,
            keys = new Float64Array(size),
            values = new Array(size).fill(null),
            used = 0;

        for (var i = 0; i < oldSize; i += 1) {
            var key = oldKeys[i];

            if (key === 0) {
                continue;
            }

            var record = oldValues[i],
                slot = Pair.hash(record.bodyA.id, record.bodyB.id) & mask;

            while (keys[slot] !== 0) {
                slot = (slot + 1) & mask;
            }

            keys[slot] = key;
            values[slot] = record;
            used += 1;
        }

        pairs._recordKeys = keys;
        pairs._recordValues = values;
        pairs._recordMask = mask;
        pairs._recordLive = used;
    };

    /**
     * Updates pairs given a list of collisions.
     *
     * `pairs.collisionStart` is always filled. `pairs.collisionActive` and
     * `pairs.collisionEnd` are filled unless `collectActive` / `collectEnd` is
     * `false`, in which case the list is left empty (the engine passes `false`
     * for an event with no listener; see `Engine.update`).
     * @method update
     * @param {object} pairs
     * @param {collision[]} collisions
     * @param {number} timestamp
     * @param {boolean} [collectActive=true] Whether to fill `pairs.collisionActive`
     * @param {boolean} [collectEnd=true] Whether to fill `pairs.collisionEnd`
     */
    Pairs.update = function(pairs, collisions, timestamp, collectActive, collectEnd) {
        collectActive = collectActive !== false;
        collectEnd = collectEnd !== false;

        var pairUpdate = Pair.update,
            pairCreate = Pair.create,
            pairSetActive = Pair.setActive,
            pairsList = pairs.list,
            pairsListLength = pairsList.length,
            pairsListIndex = pairsListLength,
            collisionStart = pairs.collisionStart,
            collisionEnd = pairs.collisionEnd,
            collisionActive = pairs.collisionActive,
            collisionsLength = collisions.length,
            collisionStartIndex = 0,
            collisionEndIndex = 0,
            collisionActiveIndex = 0,
            collision,
            pair,
            i;

        for (i = 0; i < collisionsLength; i++) {
            collision = collisions[i];
            pair = collision.pair;

            if (pair) {
                // pair already exists (but may or may not be active)
                if (collectActive && pair.isActive) {
                    // pair exists and is active
                    collisionActive[collisionActiveIndex++] = pair;
                }

                // update the pair
                pairUpdate(pair, collision, timestamp);
            } else {
                // pair did not exist, create a new pair
                pair = pairCreate(collision, timestamp);
                Pairs._recordInsert(pairs, pair.id, collision);

                // add the new pair
                collisionStart[collisionStartIndex++] = pair;
                pairsList[pairsListIndex++] = pair;
            }
        }

        // find pairs that are no longer active
        pairsListIndex = 0;
        pairsListLength = pairsList.length;

        for (i = 0; i < pairsListLength; i++) {
            pair = pairsList[i];
            
            // pair is active if updated this timestep
            if (pair.timeUpdated >= timestamp) {
                // keep active pairs
                pairsList[pairsListIndex++] = pair;
            } else {
                pairSetActive(pair, false, timestamp);

                // keep inactive pairs if both bodies may be sleeping
                if (pair.collision.bodyA.sleepCounter > 0 && pair.collision.bodyB.sleepCounter > 0) {
                    pairsList[pairsListIndex++] = pair;
                } else {
                    // remove inactive pairs if either body awake
                    if (collectEnd) {
                        collisionEnd[collisionEndIndex++] = pair;
                    }
                    Pairs._recordRemove(pairs, pair.id, pair);
                    // the record can outlive the pair in solver scratch, so
                    // drop the back reference or the next `Pairs.update` would
                    // take it for a live pair and never re-add it
                    pair.collision.pair = null;
                }
            }
        }

        // update array lengths if changed
        if (pairsList.length !== pairsListIndex) {
            pairsList.length = pairsListIndex;
        }

        if (collisionStart.length !== collisionStartIndex) {
            collisionStart.length = collisionStartIndex;
        }

        if (collisionEnd.length !== collisionEndIndex) {
            collisionEnd.length = collisionEndIndex;
        }

        if (collisionActive.length !== collisionActiveIndex) {
            collisionActive.length = collisionActiveIndex;
        }
    };

    /**
     * Clears the given pairs structure.
     * @method clear
     * @param {pairs} pairs
     * @return {pairs} pairs
     */
    Pairs.clear = function(pairs) {
        pairs._recordKeys.fill(0);
        pairs._recordValues.fill(null);
        pairs._recordLive = 0;
        pairs.list.length = 0;
        pairs.collisionStart.length = 0;
        pairs.collisionActive.length = 0;
        pairs.collisionEnd.length = 0;

        // solver scratch hung off the container by Resolver.preSolvePosition /
        // postSolvePosition. Clearing the pairs means the solver is starting
        // over, so it must not keep holding bodies from the previous world
        if (pairs._impulseCarry) {
            pairs._impulseCarry.length = 0;
        }

        if (pairs._solverBodies) {
            pairs._solverBodies.length = 0;
        }

        return pairs;
    };

})();


/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

var Matter = module.exports = __webpack_require__(21);

Matter.Axes = __webpack_require__(11);
Matter.Bodies = __webpack_require__(12);
Matter.Body = __webpack_require__(4);
Matter.Bounds = __webpack_require__(1);
Matter.Collision = __webpack_require__(8);
Matter.Common = __webpack_require__(0);
Matter.Composite = __webpack_require__(6);
Matter.Composites = __webpack_require__(22);
Matter.Constraint = __webpack_require__(10);
Matter.Contact = __webpack_require__(16);
Matter.Detector = __webpack_require__(13);
Matter.Engine = __webpack_require__(17);
Matter.Events = __webpack_require__(5);
Matter.Grid = __webpack_require__(23);
Matter.Mouse = __webpack_require__(14);
Matter.MouseConstraint = __webpack_require__(24);
Matter.Pair = __webpack_require__(9);
Matter.Pairs = __webpack_require__(19);
Matter.Plugin = __webpack_require__(15);
Matter.Query = __webpack_require__(25);
Matter.Render = __webpack_require__(26);
Matter.Resolver = __webpack_require__(18);
Matter.Runner = __webpack_require__(27);
Matter.SAT = __webpack_require__(28);
Matter.Sleeping = __webpack_require__(7);
Matter.Svg = __webpack_require__(29);
Matter.Vector = __webpack_require__(2);
Matter.Vertices = __webpack_require__(3);
Matter.World = __webpack_require__(30);

// temporary back compatibility
Matter.Engine.run = Matter.Runner.run;
Matter.Common.deprecated(Matter.Engine, 'run', 'Engine.run ➤ use Matter.Runner.run(engine) instead');


/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter` module is the top level namespace. It also includes a function for installing plugins on top of the library.
*
* @class Matter
*/

var Matter = {};

module.exports = Matter;

var Plugin = __webpack_require__(15);
var Common = __webpack_require__(0);

(function() {

    /**
     * The library name.
     * @property name
     * @readOnly
     * @type {String}
     */
    Matter.name = 'matter-js';

    /**
     * The library version.
     * @property version
     * @readOnly
     * @type {String}
     */
    Matter.version =  true ? "0.20.0-perf20" : undefined;

    /**
     * A list of plugin dependencies to be installed. These are normally set and installed through `Matter.use`.
     * Alternatively you may set `Matter.uses` manually and install them by calling `Plugin.use(Matter)`.
     * @property uses
     * @type {Array}
     */
    Matter.uses = [];

    /**
     * The plugins that have been installed through `Matter.Plugin.install`. Read only.
     * @property used
     * @readOnly
     * @type {Array}
     */
    Matter.used = [];

    /**
     * Installs the given plugins on the `Matter` namespace.
     * This is a short-hand for `Plugin.use`, see it for more information.
     * Call this function once at the start of your code, with all of the plugins you wish to install as arguments.
     * Avoid calling this function multiple times unless you intend to manually control installation order.
     * @method use
     * @param ...plugin {Function} The plugin(s) to install on `base` (multi-argument).
     */
    Matter.use = function() {
        Plugin.use(Matter, Array.prototype.slice.call(arguments));
    };

    /**
     * Chains a function to excute before the original function on the given `path` relative to `Matter`.
     * See also docs for `Common.chain`.
     * @method before
     * @param {string} path The path relative to `Matter`
     * @param {function} func The function to chain before the original
     * @return {function} The chained function that replaced the original
     */
    Matter.before = function(path, func) {
        path = path.replace(/^Matter./, '');
        return Common.chainPathBefore(Matter, path, func);
    };

    /**
     * Chains a function to excute after the original function on the given `path` relative to `Matter`.
     * See also docs for `Common.chain`.
     * @method after
     * @param {string} path The path relative to `Matter`
     * @param {function} func The function to chain after the original
     * @return {function} The chained function that replaced the original
     */
    Matter.after = function(path, func) {
        path = path.replace(/^Matter./, '');
        return Common.chainPathAfter(Matter, path, func);
    };

})();


/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Composites` module contains factory methods for creating composite bodies
* with commonly used configurations (such as stacks and chains).
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Composites
*/

var Composites = {};

module.exports = Composites;

var Composite = __webpack_require__(6);
var Constraint = __webpack_require__(10);
var Common = __webpack_require__(0);
var Body = __webpack_require__(4);
var Bodies = __webpack_require__(12);
var deprecated = Common.deprecated;

(function() {

    /**
     * Create a new composite containing bodies created in the callback in a grid arrangement.
     * This function uses the body's bounds to prevent overlaps.
     * @method stack
     * @param {number} x Starting position in X.
     * @param {number} y Starting position in Y.
     * @param {number} columns
     * @param {number} rows
     * @param {number} columnGap
     * @param {number} rowGap
     * @param {function} callback
     * @return {composite} A new composite containing objects created in the callback
     */
    Composites.stack = function(x, y, columns, rows, columnGap, rowGap, callback) {
        var stack = Composite.create({ label: 'Stack' }),
            currentX = x,
            currentY = y,
            lastBody,
            i = 0;

        for (var row = 0; row < rows; row++) {
            var maxHeight = 0;
            
            for (var column = 0; column < columns; column++) {
                var body = callback(currentX, currentY, column, row, lastBody, i);
                    
                if (body) {
                    var bodyHeight = body.bounds.max.y - body.bounds.min.y,
                        bodyWidth = body.bounds.max.x - body.bounds.min.x; 

                    if (bodyHeight > maxHeight)
                        maxHeight = bodyHeight;
                    
                    Body.translate(body, { x: bodyWidth * 0.5, y: bodyHeight * 0.5 });

                    currentX = body.bounds.max.x + columnGap;

                    Composite.addBody(stack, body);
                    
                    lastBody = body;
                    i += 1;
                } else {
                    currentX += columnGap;
                }
            }
            
            currentY += maxHeight + rowGap;
            currentX = x;
        }

        return stack;
    };
    
    /**
     * Chains all bodies in the given composite together using constraints.
     * @method chain
     * @param {composite} composite
     * @param {number} xOffsetA
     * @param {number} yOffsetA
     * @param {number} xOffsetB
     * @param {number} yOffsetB
     * @param {object} options
     * @return {composite} A new composite containing objects chained together with constraints
     */
    Composites.chain = function(composite, xOffsetA, yOffsetA, xOffsetB, yOffsetB, options) {
        var bodies = composite.bodies;
        
        for (var i = 1; i < bodies.length; i++) {
            var bodyA = bodies[i - 1],
                bodyB = bodies[i],
                bodyAHeight = bodyA.bounds.max.y - bodyA.bounds.min.y,
                bodyAWidth = bodyA.bounds.max.x - bodyA.bounds.min.x, 
                bodyBHeight = bodyB.bounds.max.y - bodyB.bounds.min.y,
                bodyBWidth = bodyB.bounds.max.x - bodyB.bounds.min.x;
        
            var defaults = {
                bodyA: bodyA,
                pointA: { x: bodyAWidth * xOffsetA, y: bodyAHeight * yOffsetA },
                bodyB: bodyB,
                pointB: { x: bodyBWidth * xOffsetB, y: bodyBHeight * yOffsetB }
            };
            
            var constraint = Common.extend(defaults, options);
        
            Composite.addConstraint(composite, Constraint.create(constraint));
        }

        composite.label += ' Chain';
        
        return composite;
    };

    /**
     * Connects bodies in the composite with constraints in a grid pattern, with optional cross braces.
     * @method mesh
     * @param {composite} composite
     * @param {number} columns
     * @param {number} rows
     * @param {boolean} crossBrace
     * @param {object} options
     * @return {composite} The composite containing objects meshed together with constraints
     */
    Composites.mesh = function(composite, columns, rows, crossBrace, options) {
        var bodies = composite.bodies,
            row,
            col,
            bodyA,
            bodyB,
            bodyC;
        
        for (row = 0; row < rows; row++) {
            for (col = 1; col < columns; col++) {
                bodyA = bodies[(col - 1) + (row * columns)];
                bodyB = bodies[col + (row * columns)];
                Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyA, bodyB: bodyB }, options)));
            }

            if (row > 0) {
                for (col = 0; col < columns; col++) {
                    bodyA = bodies[col + ((row - 1) * columns)];
                    bodyB = bodies[col + (row * columns)];
                    Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyA, bodyB: bodyB }, options)));

                    if (crossBrace && col > 0) {
                        bodyC = bodies[(col - 1) + ((row - 1) * columns)];
                        Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB: bodyB }, options)));
                    }

                    if (crossBrace && col < columns - 1) {
                        bodyC = bodies[(col + 1) + ((row - 1) * columns)];
                        Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB: bodyB }, options)));
                    }
                }
            }
        }

        composite.label += ' Mesh';
        
        return composite;
    };
    
    /**
     * Create a new composite containing bodies created in the callback in a pyramid arrangement.
     * This function uses the body's bounds to prevent overlaps.
     * @method pyramid
     * @param {number} x Starting position in X.
     * @param {number} y Starting position in Y.
     * @param {number} columns
     * @param {number} rows
     * @param {number} columnGap
     * @param {number} rowGap
     * @param {function} callback
     * @return {composite} A new composite containing objects created in the callback
     */
    Composites.pyramid = function(x, y, columns, rows, columnGap, rowGap, callback) {
        return Composites.stack(x, y, columns, rows, columnGap, rowGap, function(stackX, stackY, column, row, lastBody, i) {
            var actualRows = Math.min(rows, Math.ceil(columns / 2)),
                lastBodyWidth = lastBody ? lastBody.bounds.max.x - lastBody.bounds.min.x : 0;
            
            if (row > actualRows)
                return;
            
            // reverse row order
            row = actualRows - row;
            
            var start = row,
                end = columns - 1 - row;

            if (column < start || column > end)
                return;
            
            // retroactively fix the first body's position, since width was unknown
            if (i === 1) {
                Body.translate(lastBody, { x: (column + (columns % 2 === 1 ? 1 : -1)) * lastBodyWidth, y: 0 });
            }

            var xOffset = lastBody ? column * lastBodyWidth : 0;
            
            return callback(x + xOffset + column * columnGap, stackY, column, row, lastBody, i);
        });
    };

    /**
     * This has now moved to the [newtonsCradle example](https://github.com/liabru/matter-js/blob/master/examples/newtonsCradle.js), follow that instead as this function is deprecated here.
     * @deprecated moved to newtonsCradle example
     * @method newtonsCradle
     * @param {number} x Starting position in X.
     * @param {number} y Starting position in Y.
     * @param {number} number
     * @param {number} size
     * @param {number} length
     * @return {composite} A new composite newtonsCradle body
     */
    Composites.newtonsCradle = function(x, y, number, size, length) {
        var newtonsCradle = Composite.create({ label: 'Newtons Cradle' });

        for (var i = 0; i < number; i++) {
            var separation = 1.9,
                circle = Bodies.circle(x + i * (size * separation), y + length, size, 
                    { inertia: Infinity, restitution: 1, friction: 0, frictionAir: 0.0001, slop: 1 }),
                constraint = Constraint.create({ pointA: { x: x + i * (size * separation), y: y }, bodyB: circle });

            Composite.addBody(newtonsCradle, circle);
            Composite.addConstraint(newtonsCradle, constraint);
        }

        return newtonsCradle;
    };

    deprecated(Composites, 'newtonsCradle', 'Composites.newtonsCradle ➤ moved to newtonsCradle example');
    
    /**
     * This has now moved to the [car example](https://github.com/liabru/matter-js/blob/master/examples/car.js), follow that instead as this function is deprecated here.
     * @deprecated moved to car example
     * @method car
     * @param {number} x Starting position in X.
     * @param {number} y Starting position in Y.
     * @param {number} width
     * @param {number} height
     * @param {number} wheelSize
     * @return {composite} A new composite car body
     */
    Composites.car = function(x, y, width, height, wheelSize) {
        var group = Body.nextGroup(true),
            wheelBase = 20,
            wheelAOffset = -width * 0.5 + wheelBase,
            wheelBOffset = width * 0.5 - wheelBase,
            wheelYOffset = 0;
    
        var car = Composite.create({ label: 'Car' }),
            body = Bodies.rectangle(x, y, width, height, { 
                collisionFilter: {
                    group: group
                },
                chamfer: {
                    radius: height * 0.5
                },
                density: 0.0002
            });
    
        var wheelA = Bodies.circle(x + wheelAOffset, y + wheelYOffset, wheelSize, { 
            collisionFilter: {
                group: group
            },
            friction: 0.8
        });
                    
        var wheelB = Bodies.circle(x + wheelBOffset, y + wheelYOffset, wheelSize, { 
            collisionFilter: {
                group: group
            },
            friction: 0.8
        });
                    
        var axelA = Constraint.create({
            bodyB: body,
            pointB: { x: wheelAOffset, y: wheelYOffset },
            bodyA: wheelA,
            stiffness: 1,
            length: 0
        });
                        
        var axelB = Constraint.create({
            bodyB: body,
            pointB: { x: wheelBOffset, y: wheelYOffset },
            bodyA: wheelB,
            stiffness: 1,
            length: 0
        });
        
        Composite.addBody(car, body);
        Composite.addBody(car, wheelA);
        Composite.addBody(car, wheelB);
        Composite.addConstraint(car, axelA);
        Composite.addConstraint(car, axelB);

        return car;
    };

    deprecated(Composites, 'car', 'Composites.car ➤ moved to car example');

    /**
     * This has now moved to the [softBody example](https://github.com/liabru/matter-js/blob/master/examples/softBody.js)
     * and the [cloth example](https://github.com/liabru/matter-js/blob/master/examples/cloth.js), follow those instead as this function is deprecated here.
     * @deprecated moved to softBody and cloth examples
     * @method softBody
     * @param {number} x Starting position in X.
     * @param {number} y Starting position in Y.
     * @param {number} columns
     * @param {number} rows
     * @param {number} columnGap
     * @param {number} rowGap
     * @param {boolean} crossBrace
     * @param {number} particleRadius
     * @param {} particleOptions
     * @param {} constraintOptions
     * @return {composite} A new composite softBody
     */
    Composites.softBody = function(x, y, columns, rows, columnGap, rowGap, crossBrace, particleRadius, particleOptions, constraintOptions) {
        particleOptions = Common.extend({ inertia: Infinity }, particleOptions);
        constraintOptions = Common.extend({ stiffness: 0.2, render: { type: 'line', anchors: false } }, constraintOptions);

        var softBody = Composites.stack(x, y, columns, rows, columnGap, rowGap, function(stackX, stackY) {
            return Bodies.circle(stackX, stackY, particleRadius, particleOptions);
        });

        Composites.mesh(softBody, columns, rows, crossBrace, constraintOptions);

        softBody.label = 'Soft Body';

        return softBody;
    };

    deprecated(Composites, 'softBody', 'Composites.softBody ➤ moved to softBody and cloth examples');
})();


/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

/**
* This module has now been replaced by `Matter.Detector`.
*
* All usage should be migrated to `Matter.Detector` or another alternative.
* For back-compatibility purposes this module will remain for a short term and then later removed in a future release.
*
* The `Matter.Grid` module contains methods for creating and manipulating collision broadphase grid structures.
*
* @class Grid
* @deprecated
*/

var Grid = {};

module.exports = Grid;

var Pair = __webpack_require__(9);
var Common = __webpack_require__(0);
var deprecated = Common.deprecated;

(function() {

    /**
     * Creates a new grid.
     * @deprecated replaced by Matter.Detector
     * @method create
     * @param {} options
     * @return {grid} A new grid
     */
    Grid.create = function(options) {
        var defaults = {
            buckets: {},
            pairs: {},
            pairsList: [],
            bucketWidth: 48,
            bucketHeight: 48
        };

        return Common.extend(defaults, options);
    };

    /**
     * The width of a single grid bucket.
     *
     * @property bucketWidth
     * @type number
     * @default 48
     */

    /**
     * The height of a single grid bucket.
     *
     * @property bucketHeight
     * @type number
     * @default 48
     */

    /**
     * Updates the grid.
     * @deprecated replaced by Matter.Detector
     * @method update
     * @param {grid} grid
     * @param {body[]} bodies
     * @param {engine} engine
     * @param {boolean} forceUpdate
     */
    Grid.update = function(grid, bodies, engine, forceUpdate) {
        var i, col, row,
            world = engine.world,
            buckets = grid.buckets,
            bucket,
            bucketId,
            gridChanged = false;

        for (i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (body.isSleeping && !forceUpdate)
                continue;

            // temporary back compatibility bounds check
            if (world.bounds && (body.bounds.max.x < world.bounds.min.x || body.bounds.min.x > world.bounds.max.x
                || body.bounds.max.y < world.bounds.min.y || body.bounds.min.y > world.bounds.max.y))
                continue;

            var newRegion = Grid._getRegion(grid, body);

            // if the body has changed grid region
            if (!body.region || newRegion.id !== body.region.id || forceUpdate) {

                if (!body.region || forceUpdate)
                    body.region = newRegion;

                var union = Grid._regionUnion(newRegion, body.region);

                // update grid buckets affected by region change
                // iterate over the union of both regions
                for (col = union.startCol; col <= union.endCol; col++) {
                    for (row = union.startRow; row <= union.endRow; row++) {
                        bucketId = Grid._getBucketId(col, row);
                        bucket = buckets[bucketId];

                        var isInsideNewRegion = (col >= newRegion.startCol && col <= newRegion.endCol
                                                && row >= newRegion.startRow && row <= newRegion.endRow);

                        var isInsideOldRegion = (col >= body.region.startCol && col <= body.region.endCol
                                                && row >= body.region.startRow && row <= body.region.endRow);

                        // remove from old region buckets
                        if (!isInsideNewRegion && isInsideOldRegion) {
                            if (isInsideOldRegion) {
                                if (bucket)
                                    Grid._bucketRemoveBody(grid, bucket, body);
                            }
                        }

                        // add to new region buckets
                        if (body.region === newRegion || (isInsideNewRegion && !isInsideOldRegion) || forceUpdate) {
                            if (!bucket)
                                bucket = Grid._createBucket(buckets, bucketId);
                            Grid._bucketAddBody(grid, bucket, body);
                        }
                    }
                }

                // set the new region
                body.region = newRegion;

                // flag changes so we can update pairs
                gridChanged = true;
            }
        }

        // update pairs list only if pairs changed (i.e. a body changed region)
        if (gridChanged)
            grid.pairsList = Grid._createActivePairsList(grid);
    };

    deprecated(Grid, 'update', 'Grid.update ➤ replaced by Matter.Detector');

    /**
     * Clears the grid.
     * @deprecated replaced by Matter.Detector
     * @method clear
     * @param {grid} grid
     */
    Grid.clear = function(grid) {
        grid.buckets = {};
        grid.pairs = {};
        grid.pairsList = [];
    };

    deprecated(Grid, 'clear', 'Grid.clear ➤ replaced by Matter.Detector');

    /**
     * Finds the union of two regions.
     * @method _regionUnion
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} regionA
     * @param {} regionB
     * @return {} region
     */
    Grid._regionUnion = function(regionA, regionB) {
        var startCol = Math.min(regionA.startCol, regionB.startCol),
            endCol = Math.max(regionA.endCol, regionB.endCol),
            startRow = Math.min(regionA.startRow, regionB.startRow),
            endRow = Math.max(regionA.endRow, regionB.endRow);

        return Grid._createRegion(startCol, endCol, startRow, endRow);
    };

    /**
     * Gets the region a given body falls in for a given grid.
     * @method _getRegion
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} grid
     * @param {} body
     * @return {} region
     */
    Grid._getRegion = function(grid, body) {
        var bounds = body.bounds,
            startCol = Math.floor(bounds.min.x / grid.bucketWidth),
            endCol = Math.floor(bounds.max.x / grid.bucketWidth),
            startRow = Math.floor(bounds.min.y / grid.bucketHeight),
            endRow = Math.floor(bounds.max.y / grid.bucketHeight);

        return Grid._createRegion(startCol, endCol, startRow, endRow);
    };

    /**
     * Creates a region.
     * @method _createRegion
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} startCol
     * @param {} endCol
     * @param {} startRow
     * @param {} endRow
     * @return {} region
     */
    Grid._createRegion = function(startCol, endCol, startRow, endRow) {
        return { 
            id: startCol + ',' + endCol + ',' + startRow + ',' + endRow,
            startCol: startCol, 
            endCol: endCol, 
            startRow: startRow, 
            endRow: endRow 
        };
    };

    /**
     * Gets the bucket id at the given position.
     * @method _getBucketId
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} column
     * @param {} row
     * @return {string} bucket id
     */
    Grid._getBucketId = function(column, row) {
        return 'C' + column + 'R' + row;
    };

    /**
     * Creates a bucket.
     * @method _createBucket
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} buckets
     * @param {} bucketId
     * @return {} bucket
     */
    Grid._createBucket = function(buckets, bucketId) {
        var bucket = buckets[bucketId] = [];
        return bucket;
    };

    /**
     * Adds a body to a bucket.
     * @method _bucketAddBody
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} grid
     * @param {} bucket
     * @param {} body
     */
    Grid._bucketAddBody = function(grid, bucket, body) {
        var gridPairs = grid.pairs,
            pairId = Pair.id,
            bucketLength = bucket.length,
            i;

        // add new pairs
        for (i = 0; i < bucketLength; i++) {
            var bodyB = bucket[i];

            if (body.id === bodyB.id || (body.isStatic && bodyB.isStatic))
                continue;

            // keep track of the number of buckets the pair exists in
            // important for Grid.update to work
            var id = pairId(body, bodyB),
                pair = gridPairs[id];

            if (pair) {
                pair[2] += 1;
            } else {
                gridPairs[id] = [body, bodyB, 1];
            }
        }

        // add to bodies (after pairs, otherwise pairs with self)
        bucket.push(body);
    };

    /**
     * Removes a body from a bucket.
     * @method _bucketRemoveBody
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} grid
     * @param {} bucket
     * @param {} body
     */
    Grid._bucketRemoveBody = function(grid, bucket, body) {
        var gridPairs = grid.pairs,
            pairId = Pair.id,
            i;

        // remove from bucket
        bucket.splice(Common.indexOf(bucket, body), 1);

        var bucketLength = bucket.length;

        // update pair counts
        for (i = 0; i < bucketLength; i++) {
            // keep track of the number of buckets the pair exists in
            // important for _createActivePairsList to work
            var pair = gridPairs[pairId(body, bucket[i])];

            if (pair)
                pair[2] -= 1;
        }
    };

    /**
     * Generates a list of the active pairs in the grid.
     * @method _createActivePairsList
     * @deprecated replaced by Matter.Detector
     * @private
     * @param {} grid
     * @return [] pairs
     */
    Grid._createActivePairsList = function(grid) {
        var pair,
            gridPairs = grid.pairs,
            pairKeys = Common.keys(gridPairs),
            pairKeysLength = pairKeys.length,
            pairs = [],
            k;

        // iterate over grid.pairs
        for (k = 0; k < pairKeysLength; k++) {
            pair = gridPairs[pairKeys[k]];

            // if pair exists in at least one bucket
            // it is a pair that needs further collision testing so push it
            if (pair[2] > 0) {
                pairs.push(pair);
            } else {
                // legacy Grid module (the game never runs it); key absence is its bucket semantics
                // eslint-disable-next-line no-restricted-syntax
                delete gridPairs[pairKeys[k]];
            }
        }

        return pairs;
    };
    
})();


/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.MouseConstraint` module contains methods for creating mouse constraints.
* Mouse constraints are used for allowing user interaction, providing the ability to move bodies via the mouse or touch.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class MouseConstraint
*/

var MouseConstraint = {};

module.exports = MouseConstraint;

var Vertices = __webpack_require__(3);
var Sleeping = __webpack_require__(7);
var Mouse = __webpack_require__(14);
var Events = __webpack_require__(5);
var Detector = __webpack_require__(13);
var Constraint = __webpack_require__(10);
var Composite = __webpack_require__(6);
var Common = __webpack_require__(0);
var Bounds = __webpack_require__(1);

(function() {

    /**
     * Creates a new mouse constraint.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {engine} engine
     * @param {} options
     * @return {MouseConstraint} A new MouseConstraint
     */
    MouseConstraint.create = function(engine, options) {
        var mouse = (engine ? engine.mouse : null) || (options ? options.mouse : null);

        if (!mouse) {
            if (engine && engine.render && engine.render.canvas) {
                mouse = Mouse.create(engine.render.canvas);
            } else if (options && options.element) {
                mouse = Mouse.create(options.element);
            } else {
                mouse = Mouse.create();
                Common.warn('MouseConstraint.create: options.mouse was undefined, options.element was undefined, may not function as expected');
            }
        }

        var constraint = Constraint.create({ 
            label: 'Mouse Constraint',
            pointA: mouse.position,
            pointB: { x: 0, y: 0 },
            length: 0.01, 
            stiffness: 0.1,
            angularStiffness: 1,
            render: {
                strokeStyle: '#90EE90',
                lineWidth: 3
            }
        });

        var defaults = {
            type: 'mouseConstraint',
            mouse: mouse,
            element: null,
            body: null,
            constraint: constraint,
            collisionFilter: {
                category: 0x0001,
                mask: 0xFFFFFFFF,
                group: 0
            }
        };

        var mouseConstraint = Common.extend(defaults, options);

        Events.on(engine, 'beforeUpdate', function() {
            var allBodies = Composite.allBodies(engine.world);
            MouseConstraint.update(mouseConstraint, allBodies);
            MouseConstraint._triggerEvents(mouseConstraint);
        });

        return mouseConstraint;
    };

    /**
     * Updates the given mouse constraint.
     * @private
     * @method update
     * @param {MouseConstraint} mouseConstraint
     * @param {body[]} bodies
     */
    MouseConstraint.update = function(mouseConstraint, bodies) {
        var mouse = mouseConstraint.mouse,
            constraint = mouseConstraint.constraint,
            body = mouseConstraint.body;

        if (mouse.button === 0) {
            if (!constraint.bodyB) {
                for (var i = 0; i < bodies.length; i++) {
                    body = bodies[i];
                    if (Bounds.contains(body.bounds, mouse.position) 
                            && Detector.canCollide(body.collisionFilter, mouseConstraint.collisionFilter)) {
                        for (var j = body.parts.length > 1 ? 1 : 0; j < body.parts.length; j++) {
                            var part = body.parts[j];
                            if (Vertices.contains(part.vertices, mouse.position)) {
                                constraint.pointA = mouse.position;
                                constraint.bodyB = mouseConstraint.body = body;
                                constraint.pointB = { x: mouse.position.x - body.position.x, y: mouse.position.y - body.position.y };
                                constraint.angleB = body.angle;

                                Sleeping.set(body, false);
                                Events.trigger(mouseConstraint, 'startdrag', { mouse: mouse, body: body });

                                break;
                            }
                        }
                    }
                }
            } else {
                Sleeping.set(constraint.bodyB, false);
                constraint.pointA = mouse.position;
            }
        } else {
            constraint.bodyB = mouseConstraint.body = null;
            constraint.pointB = null;

            if (body)
                Events.trigger(mouseConstraint, 'enddrag', { mouse: mouse, body: body });
        }
    };

    /**
     * Triggers mouse constraint events.
     * @method _triggerEvents
     * @private
     * @param {mouse} mouseConstraint
     */
    MouseConstraint._triggerEvents = function(mouseConstraint) {
        var mouse = mouseConstraint.mouse,
            mouseEvents = mouse.sourceEvents;

        if (mouseEvents.mousemove)
            Events.trigger(mouseConstraint, 'mousemove', { mouse: mouse });

        if (mouseEvents.mousedown)
            Events.trigger(mouseConstraint, 'mousedown', { mouse: mouse });

        if (mouseEvents.mouseup)
            Events.trigger(mouseConstraint, 'mouseup', { mouse: mouse });

        // reset the mouse state ready for the next step
        Mouse.clearSourceEvents(mouse);
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired when the mouse has moved (or a touch moves) during the last step
    *
    * @event mousemove
    * @param {} event An event object
    * @param {mouse} event.mouse The engine's mouse instance
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when the mouse is down (or a touch has started) during the last step
    *
    * @event mousedown
    * @param {} event An event object
    * @param {mouse} event.mouse The engine's mouse instance
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when the mouse is up (or a touch has ended) during the last step
    *
    * @event mouseup
    * @param {} event An event object
    * @param {mouse} event.mouse The engine's mouse instance
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when the user starts dragging a body
    *
    * @event startdrag
    * @param {} event An event object
    * @param {mouse} event.mouse The engine's mouse instance
    * @param {body} event.body The body being dragged
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when the user ends dragging a body
    *
    * @event enddrag
    * @param {} event An event object
    * @param {mouse} event.mouse The engine's mouse instance
    * @param {body} event.body The body that has stopped being dragged
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * A `String` denoting the type of object.
     *
     * @property type
     * @type string
     * @default "constraint"
     * @readOnly
     */

    /**
     * The `Mouse` instance in use. If not supplied in `MouseConstraint.create`, one will be created.
     *
     * @property mouse
     * @type mouse
     * @default mouse
     */

    /**
     * The `Body` that is currently being moved by the user, or `null` if no body.
     *
     * @property body
     * @type body
     * @default null
     */

    /**
     * The `Constraint` object that is used to move the body during interaction.
     *
     * @property constraint
     * @type constraint
     */

    /**
     * An `Object` that specifies the collision filter properties.
     * The collision filter allows the user to define which types of body this mouse constraint can interact with.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter
     * @type object
     */

})();


/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Query` module contains methods for performing collision queries.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Query
*/

var Query = {};

module.exports = Query;

var Vector = __webpack_require__(2);
var Collision = __webpack_require__(8);
var Bounds = __webpack_require__(1);
var Bodies = __webpack_require__(12);
var Vertices = __webpack_require__(3);

(function() {

    /**
     * Returns a list of collisions between `body` and `bodies`.
     * @method collides
     * @param {body} body
     * @param {body[]} bodies
     * @return {collision[]} Collisions
     */
    Query.collides = function(body, bodies) {
        var collisions = [],
            bodiesLength = bodies.length,
            bounds = body.bounds,
            collides = Collision.collides,
            overlaps = Bounds.overlaps;

        for (var i = 0; i < bodiesLength; i++) {
            var bodyA = bodies[i],
                partsALength = bodyA.parts.length,
                partsAStart = partsALength === 1 ? 0 : 1;
            
            if (overlaps(bodyA.bounds, bounds)) {
                for (var j = partsAStart; j < partsALength; j++) {
                    var part = bodyA.parts[j];

                    if (overlaps(part.bounds, bounds)) {
                        var collision = collides(part, body);

                        if (collision) {
                            collisions.push(collision);
                            break;
                        }
                    }
                }
            }
        }

        return collisions;
    };

    /**
     * Casts a ray segment against a set of bodies and returns all collisions, ray width is optional. Intersection points are not provided.
     * @method ray
     * @param {body[]} bodies
     * @param {vector} startPoint
     * @param {vector} endPoint
     * @param {number} [rayWidth]
     * @return {collision[]} Collisions
     */
    Query.ray = function(bodies, startPoint, endPoint, rayWidth) {
        rayWidth = rayWidth || 1e-100;

        var rayAngle = Vector.angle(startPoint, endPoint),
            rayLength = Vector.magnitude(Vector.sub(startPoint, endPoint)),
            rayX = (endPoint.x + startPoint.x) * 0.5,
            rayY = (endPoint.y + startPoint.y) * 0.5,
            ray = Bodies.rectangle(rayX, rayY, rayLength, rayWidth, { angle: rayAngle }),
            collisions = Query.collides(ray, bodies);

        for (var i = 0; i < collisions.length; i += 1) {
            var collision = collisions[i];
            collision.body = collision.bodyB = collision.bodyA;            
        }

        return collisions;
    };

    /**
     * Returns all bodies whose bounds are inside (or outside if set) the given set of bounds, from the given set of bodies.
     * @method region
     * @param {body[]} bodies
     * @param {bounds} bounds
     * @param {bool} [outside=false]
     * @return {body[]} The bodies matching the query
     */
    Query.region = function(bodies, bounds, outside) {
        var result = [];

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                overlaps = Bounds.overlaps(body.bounds, bounds);
            if ((overlaps && !outside) || (!overlaps && outside))
                result.push(body);
        }

        return result;
    };

    /**
     * Returns all bodies whose vertices contain the given point, from the given set of bodies.
     * @method point
     * @param {body[]} bodies
     * @param {vector} point
     * @return {body[]} The bodies matching the query
     */
    Query.point = function(bodies, point) {
        var result = [];

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];
            
            if (Bounds.contains(body.bounds, point)) {
                for (var j = body.parts.length === 1 ? 0 : 1; j < body.parts.length; j++) {
                    var part = body.parts[j];

                    if (Bounds.contains(part.bounds, point)
                        && Vertices.contains(part.vertices, point)) {
                        result.push(body);
                        break;
                    }
                }
            }
        }

        return result;
    };

})();


/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Render` module is a lightweight, optional utility which provides a simple canvas based renderer for visualising instances of `Matter.Engine`.
* It is intended for development and debugging purposes, but may also be suitable for simple games.
* It includes a number of drawing options including wireframe, vector with support for sprites and viewports.
*
* @class Render
*/

var Render = {};

module.exports = Render;

var Body = __webpack_require__(4);
var Common = __webpack_require__(0);
var Composite = __webpack_require__(6);
var Bounds = __webpack_require__(1);
var Events = __webpack_require__(5);
var Vector = __webpack_require__(2);
var Mouse = __webpack_require__(14);

(function() {

    var _requestAnimationFrame,
        _cancelAnimationFrame;

    if (typeof window !== 'undefined') {
        _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame
                                      || window.mozRequestAnimationFrame || window.msRequestAnimationFrame
                                      || function(callback){ window.setTimeout(function() { callback(Common.now()); }, 1000 / 60); };

        _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame
                                      || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
    }

    Render._goodFps = 30;
    Render._goodDelta = 1000 / 60;

    /**
     * Creates a new renderer. The options parameter is an object that specifies any properties you wish to override the defaults.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {object} [options]
     * @return {render} A new renderer
     */
    Render.create = function(options) {
        var defaults = {
            engine: null,
            element: null,
            canvas: null,
            mouse: null,
            frameRequestId: null,
            timing: {
                historySize: 60,
                delta: 0,
                deltaHistory: [],
                lastTime: 0,
                lastTimestamp: 0,
                lastElapsed: 0,
                timestampElapsed: 0,
                timestampElapsedHistory: [],
                engineDeltaHistory: [],
                engineElapsedHistory: [],
                engineUpdatesHistory: [],
                elapsedHistory: []
            },
            options: {
                width: 800,
                height: 600,
                pixelRatio: 1,
                background: '#14151f',
                wireframeBackground: '#14151f',
                wireframeStrokeStyle: '#bbb',
                hasBounds: !!options.bounds,
                enabled: true,
                wireframes: true,
                showSleeping: true,
                showDebug: false,
                showStats: false,
                showPerformance: false,
                showBounds: false,
                showVelocity: false,
                showCollisions: false,
                showSeparations: false,
                showAxes: false,
                showPositions: false,
                showAngleIndicator: false,
                showIds: false,
                showVertexNumbers: false,
                showConvexHulls: false,
                showInternalEdges: false,
                showMousePosition: false
            }
        };

        var render = Common.extend(defaults, options);

        if (render.canvas) {
            render.canvas.width = render.options.width || render.canvas.width;
            render.canvas.height = render.options.height || render.canvas.height;
        }

        render.mouse = options.mouse;
        render.engine = options.engine;
        render.canvas = render.canvas || _createCanvas(render.options.width, render.options.height);
        render.context = render.canvas.getContext('2d');
        render.textures = {};

        render.bounds = render.bounds || {
            min: {
                x: 0,
                y: 0
            },
            max: {
                x: render.canvas.width,
                y: render.canvas.height
            }
        };

        // for temporary back compatibility only
        render.controller = Render;
        render.options.showBroadphase = false;

        if (render.options.pixelRatio !== 1) {
            Render.setPixelRatio(render, render.options.pixelRatio);
        }

        if (Common.isElement(render.element)) {
            render.element.appendChild(render.canvas);
        }

        return render;
    };

    /**
     * Continuously updates the render canvas on the `requestAnimationFrame` event.
     * @method run
     * @param {render} render
     */
    Render.run = function(render) {
        (function loop(time){
            render.frameRequestId = _requestAnimationFrame(loop);
            
            _updateTiming(render, time);

            Render.world(render, time);

            render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);

            if (render.options.showStats || render.options.showDebug) {
                Render.stats(render, render.context, time);
            }

            if (render.options.showPerformance || render.options.showDebug) {
                Render.performance(render, render.context, time);
            }

            render.context.setTransform(1, 0, 0, 1, 0, 0);
        })();
    };

    /**
     * Ends execution of `Render.run` on the given `render`, by canceling the animation frame request event loop.
     * @method stop
     * @param {render} render
     */
    Render.stop = function(render) {
        _cancelAnimationFrame(render.frameRequestId);
    };

    /**
     * Sets the pixel ratio of the renderer and updates the canvas.
     * To automatically detect the correct ratio, pass the string `'auto'` for `pixelRatio`.
     * @method setPixelRatio
     * @param {render} render
     * @param {number} pixelRatio
     */
    Render.setPixelRatio = function(render, pixelRatio) {
        var options = render.options,
            canvas = render.canvas;

        if (pixelRatio === 'auto') {
            pixelRatio = _getPixelRatio(canvas);
        }

        options.pixelRatio = pixelRatio;
        canvas.setAttribute('data-pixel-ratio', pixelRatio);
        canvas.width = options.width * pixelRatio;
        canvas.height = options.height * pixelRatio;
        canvas.style.width = options.width + 'px';
        canvas.style.height = options.height + 'px';
    };

    /**
     * Sets the render `width` and `height`.
     * 
     * Updates the canvas accounting for `render.options.pixelRatio`.  
     * 
     * Updates the bottom right render bound `render.bounds.max` relative to the provided `width` and `height`.
     * The top left render bound `render.bounds.min` isn't changed.
     * 
     * Follow this call with `Render.lookAt` if you need to change the render bounds.
     * 
     * See also `Render.setPixelRatio`.
     * @method setSize
     * @param {render} render
     * @param {number} width The width (in CSS pixels)
     * @param {number} height The height (in CSS pixels)
     */
    Render.setSize = function(render, width, height) {
        render.options.width = width;
        render.options.height = height;
        render.bounds.max.x = render.bounds.min.x + width;
        render.bounds.max.y = render.bounds.min.y + height;

        if (render.options.pixelRatio !== 1) {
            Render.setPixelRatio(render, render.options.pixelRatio);
        } else {
            render.canvas.width = width;
            render.canvas.height = height;
        }
    };

    /**
     * Positions and sizes the viewport around the given object bounds.
     * Objects must have at least one of the following properties:
     * - `object.bounds`
     * - `object.position`
     * - `object.min` and `object.max`
     * - `object.x` and `object.y`
     * @method lookAt
     * @param {render} render
     * @param {object[]} objects
     * @param {vector} [padding]
     * @param {bool} [center=true]
     */
    Render.lookAt = function(render, objects, padding, center) {
        center = typeof center !== 'undefined' ? center : true;
        objects = Common.isArray(objects) ? objects : [objects];
        padding = padding || {
            x: 0,
            y: 0
        };

        // find bounds of all objects
        var bounds = {
            min: { x: Infinity, y: Infinity },
            max: { x: -Infinity, y: -Infinity }
        };

        for (var i = 0; i < objects.length; i += 1) {
            var object = objects[i],
                min = object.bounds ? object.bounds.min : (object.min || object.position || object),
                max = object.bounds ? object.bounds.max : (object.max || object.position || object);

            if (min && max) {
                if (min.x < bounds.min.x)
                    bounds.min.x = min.x;

                if (max.x > bounds.max.x)
                    bounds.max.x = max.x;

                if (min.y < bounds.min.y)
                    bounds.min.y = min.y;

                if (max.y > bounds.max.y)
                    bounds.max.y = max.y;
            }
        }

        // find ratios
        var width = (bounds.max.x - bounds.min.x) + 2 * padding.x,
            height = (bounds.max.y - bounds.min.y) + 2 * padding.y,
            viewHeight = render.canvas.height,
            viewWidth = render.canvas.width,
            outerRatio = viewWidth / viewHeight,
            innerRatio = width / height,
            scaleX = 1,
            scaleY = 1;

        // find scale factor
        if (innerRatio > outerRatio) {
            scaleY = innerRatio / outerRatio;
        } else {
            scaleX = outerRatio / innerRatio;
        }

        // enable bounds
        render.options.hasBounds = true;

        // position and size
        render.bounds.min.x = bounds.min.x;
        render.bounds.max.x = bounds.min.x + width * scaleX;
        render.bounds.min.y = bounds.min.y;
        render.bounds.max.y = bounds.min.y + height * scaleY;

        // center
        if (center) {
            render.bounds.min.x += width * 0.5 - (width * scaleX) * 0.5;
            render.bounds.max.x += width * 0.5 - (width * scaleX) * 0.5;
            render.bounds.min.y += height * 0.5 - (height * scaleY) * 0.5;
            render.bounds.max.y += height * 0.5 - (height * scaleY) * 0.5;
        }

        // padding
        render.bounds.min.x -= padding.x;
        render.bounds.max.x -= padding.x;
        render.bounds.min.y -= padding.y;
        render.bounds.max.y -= padding.y;

        // update mouse
        if (render.mouse) {
            Mouse.setScale(render.mouse, {
                x: (render.bounds.max.x - render.bounds.min.x) / render.canvas.width,
                y: (render.bounds.max.y - render.bounds.min.y) / render.canvas.height
            });

            Mouse.setOffset(render.mouse, render.bounds.min);
        }
    };

    /**
     * Applies viewport transforms based on `render.bounds` to a render context.
     * @method startViewTransform
     * @param {render} render
     */
    Render.startViewTransform = function(render) {
        var boundsWidth = render.bounds.max.x - render.bounds.min.x,
            boundsHeight = render.bounds.max.y - render.bounds.min.y,
            boundsScaleX = boundsWidth / render.options.width,
            boundsScaleY = boundsHeight / render.options.height;

        render.context.setTransform(
            render.options.pixelRatio / boundsScaleX, 0, 0, 
            render.options.pixelRatio / boundsScaleY, 0, 0
        );
        
        render.context.translate(-render.bounds.min.x, -render.bounds.min.y);
    };

    /**
     * Resets all transforms on the render context.
     * @method endViewTransform
     * @param {render} render
     */
    Render.endViewTransform = function(render) {
        render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
    };

    /**
     * Renders the given `engine`'s `Matter.World` object.
     * This is the entry point for all rendering and should be called every time the scene changes.
     * @method world
     * @param {render} render
     */
    Render.world = function(render, time) {
        var startTime = Common.now(),
            engine = render.engine,
            world = engine.world,
            canvas = render.canvas,
            context = render.context,
            options = render.options,
            timing = render.timing;

        var allBodies = Composite.allBodies(world),
            allConstraints = Composite.allConstraints(world),
            background = options.wireframes ? options.wireframeBackground : options.background,
            bodies = [],
            constraints = [],
            i;

        var event = {
            timestamp: engine.timing.timestamp
        };

        Events.trigger(render, 'beforeRender', event);

        // apply background if it has changed
        if (render.currentBackground !== background)
            _applyBackground(render, background);

        // clear the canvas with a transparent fill, to allow the canvas background to show
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = "transparent";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';

        // handle bounds
        if (options.hasBounds) {
            // filter out bodies that are not in view
            for (i = 0; i < allBodies.length; i++) {
                var body = allBodies[i];
                if (Bounds.overlaps(body.bounds, render.bounds))
                    bodies.push(body);
            }

            // filter out constraints that are not in view
            for (i = 0; i < allConstraints.length; i++) {
                var constraint = allConstraints[i],
                    bodyA = constraint.bodyA,
                    bodyB = constraint.bodyB,
                    pointAWorld = constraint.pointA,
                    pointBWorld = constraint.pointB;

                if (bodyA) pointAWorld = Vector.add(bodyA.position, constraint.pointA);
                if (bodyB) pointBWorld = Vector.add(bodyB.position, constraint.pointB);

                if (!pointAWorld || !pointBWorld)
                    continue;

                if (Bounds.contains(render.bounds, pointAWorld) || Bounds.contains(render.bounds, pointBWorld))
                    constraints.push(constraint);
            }

            // transform the view
            Render.startViewTransform(render);

            // update mouse
            if (render.mouse) {
                Mouse.setScale(render.mouse, {
                    x: (render.bounds.max.x - render.bounds.min.x) / render.options.width,
                    y: (render.bounds.max.y - render.bounds.min.y) / render.options.height
                });

                Mouse.setOffset(render.mouse, render.bounds.min);
            }
        } else {
            constraints = allConstraints;
            bodies = allBodies;

            if (render.options.pixelRatio !== 1) {
                render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
            }
        }

        if (!options.wireframes || (engine.enableSleeping && options.showSleeping)) {
            // fully featured rendering of bodies
            Render.bodies(render, bodies, context);
        } else {
            if (options.showConvexHulls)
                Render.bodyConvexHulls(render, bodies, context);

            // optimised method for wireframes only
            Render.bodyWireframes(render, bodies, context);
        }

        if (options.showBounds)
            Render.bodyBounds(render, bodies, context);

        if (options.showAxes || options.showAngleIndicator)
            Render.bodyAxes(render, bodies, context);

        if (options.showPositions)
            Render.bodyPositions(render, bodies, context);

        if (options.showVelocity)
            Render.bodyVelocity(render, bodies, context);

        if (options.showIds)
            Render.bodyIds(render, bodies, context);

        if (options.showSeparations)
            Render.separations(render, engine.pairs.list, context);

        if (options.showCollisions)
            Render.collisions(render, engine.pairs.list, context);

        if (options.showVertexNumbers)
            Render.vertexNumbers(render, bodies, context);

        if (options.showMousePosition)
            Render.mousePosition(render, render.mouse, context);

        Render.constraints(constraints, context);

        if (options.hasBounds) {
            // revert view transforms
            Render.endViewTransform(render);
        }

        Events.trigger(render, 'afterRender', event);

        // log the time elapsed computing this update
        timing.lastElapsed = Common.now() - startTime;
    };

    /**
     * Renders statistics about the engine and world useful for debugging.
     * @private
     * @method stats
     * @param {render} render
     * @param {RenderingContext} context
     * @param {Number} time
     */
    Render.stats = function(render, context, time) {
        var engine = render.engine,
            world = engine.world,
            bodies = Composite.allBodies(world),
            parts = 0,
            width = 55,
            height = 44,
            x = 0,
            y = 0;
        
        // count parts
        for (var i = 0; i < bodies.length; i += 1) {
            parts += bodies[i].parts.length;
        }

        // sections
        var sections = {
            'Part': parts,
            'Body': bodies.length,
            'Cons': Composite.allConstraints(world).length,
            'Comp': Composite.allComposites(world).length,
            'Pair': engine.pairs.list.length
        };

        // background
        context.fillStyle = '#0e0f19';
        context.fillRect(x, y, width * 5.5, height);

        context.font = '12px Arial';
        context.textBaseline = 'top';
        context.textAlign = 'right';

        // sections
        for (var key in sections) {
            var section = sections[key];
            // label
            context.fillStyle = '#aaa';
            context.fillText(key, x + width, y + 8);

            // value
            context.fillStyle = '#eee';
            context.fillText(section, x + width, y + 26);

            x += width;
        }
    };

    /**
     * Renders engine and render performance information.
     * @private
     * @method performance
     * @param {render} render
     * @param {RenderingContext} context
     */
    Render.performance = function(render, context) {
        var engine = render.engine,
            timing = render.timing,
            deltaHistory = timing.deltaHistory,
            elapsedHistory = timing.elapsedHistory,
            timestampElapsedHistory = timing.timestampElapsedHistory,
            engineDeltaHistory = timing.engineDeltaHistory,
            engineUpdatesHistory = timing.engineUpdatesHistory,
            engineElapsedHistory = timing.engineElapsedHistory,
            lastEngineUpdatesPerFrame = engine.timing.lastUpdatesPerFrame,
            lastEngineDelta = engine.timing.lastDelta;
        
        var deltaMean = _mean(deltaHistory),
            elapsedMean = _mean(elapsedHistory),
            engineDeltaMean = _mean(engineDeltaHistory),
            engineUpdatesMean = _mean(engineUpdatesHistory),
            engineElapsedMean = _mean(engineElapsedHistory),
            timestampElapsedMean = _mean(timestampElapsedHistory),
            rateMean = (timestampElapsedMean / deltaMean) || 0,
            neededUpdatesPerFrame = Math.round(deltaMean / lastEngineDelta),
            fps = (1000 / deltaMean) || 0;

        var graphHeight = 4,
            gap = 12,
            width = 60,
            height = 34,
            x = 10,
            y = 69;

        // background
        context.fillStyle = '#0e0f19';
        context.fillRect(0, 50, gap * 5 + width * 6 + 22, height);

        // show FPS
        Render.status(
            context, x, y, width, graphHeight, deltaHistory.length, 
            Math.round(fps) + ' fps', 
            fps / Render._goodFps,
            function(i) { return (deltaHistory[i] / deltaMean) - 1; }
        );

        // show engine delta
        Render.status(
            context, x + gap + width, y, width, graphHeight, engineDeltaHistory.length,
            lastEngineDelta.toFixed(2) + ' dt', 
            Render._goodDelta / lastEngineDelta,
            function(i) { return (engineDeltaHistory[i] / engineDeltaMean) - 1; }
        );

        // show engine updates per frame
        Render.status(
            context, x + (gap + width) * 2, y, width, graphHeight, engineUpdatesHistory.length,
            lastEngineUpdatesPerFrame + ' upf', 
            Math.pow(Common.clamp((engineUpdatesMean / neededUpdatesPerFrame) || 1, 0, 1), 4),
            function(i) { return (engineUpdatesHistory[i] / engineUpdatesMean) - 1; }
        );

        // show engine update time
        Render.status(
            context, x + (gap + width) * 3, y, width, graphHeight, engineElapsedHistory.length,
            engineElapsedMean.toFixed(2) + ' ut', 
            1 - (lastEngineUpdatesPerFrame * engineElapsedMean / Render._goodFps),
            function(i) { return (engineElapsedHistory[i] / engineElapsedMean) - 1; }
        );

        // show render time
        Render.status(
            context, x + (gap + width) * 4, y, width, graphHeight, elapsedHistory.length,
            elapsedMean.toFixed(2) + ' rt', 
            1 - (elapsedMean / Render._goodFps),
            function(i) { return (elapsedHistory[i] / elapsedMean) - 1; }
        );

        // show effective speed
        Render.status(
            context, x + (gap + width) * 5, y, width, graphHeight, timestampElapsedHistory.length, 
            rateMean.toFixed(2) + ' x', 
            rateMean * rateMean * rateMean,
            function(i) { return (((timestampElapsedHistory[i] / deltaHistory[i]) / rateMean) || 0) - 1; }
        );
    };

    /**
     * Renders a label, indicator and a chart.
     * @private
     * @method status
     * @param {RenderingContext} context
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} count
     * @param {string} label
     * @param {string} indicator
     * @param {function} plotY
     */
    Render.status = function(context, x, y, width, height, count, label, indicator, plotY) {
        // background
        context.strokeStyle = '#888';
        context.fillStyle = '#444';
        context.lineWidth = 1;
        context.fillRect(x, y + 7, width, 1);

        // chart
        context.beginPath();
        context.moveTo(x, y + 7 - height * Common.clamp(0.4 * plotY(0), -2, 2));
        for (var i = 0; i < width; i += 1) {
            context.lineTo(x + i, y + 7 - (i < count ? height * Common.clamp(0.4 * plotY(i), -2, 2) : 0));
        }
        context.stroke();

        // indicator
        context.fillStyle = 'hsl(' + Common.clamp(25 + 95 * indicator, 0, 120) + ',100%,60%)';
        context.fillRect(x, y - 7, 4, 4);

        // label
        context.font = '12px Arial';
        context.textBaseline = 'middle';
        context.textAlign = 'right';
        context.fillStyle = '#eee';
        context.fillText(label, x + width, y - 5);
    };

    /**
     * Description
     * @private
     * @method constraints
     * @param {constraint[]} constraints
     * @param {RenderingContext} context
     */
    Render.constraints = function(constraints, context) {
        var c = context;

        for (var i = 0; i < constraints.length; i++) {
            var constraint = constraints[i];

            if (!constraint.render.visible || !constraint.pointA || !constraint.pointB)
                continue;

            var bodyA = constraint.bodyA,
                bodyB = constraint.bodyB,
                start,
                end;

            if (bodyA) {
                start = Vector.add(bodyA.position, constraint.pointA);
            } else {
                start = constraint.pointA;
            }

            if (constraint.render.type === 'pin') {
                c.beginPath();
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                c.closePath();
            } else {
                if (bodyB) {
                    end = Vector.add(bodyB.position, constraint.pointB);
                } else {
                    end = constraint.pointB;
                }

                c.beginPath();
                c.moveTo(start.x, start.y);

                if (constraint.render.type === 'spring') {
                    var delta = Vector.sub(end, start),
                        normal = Vector.perp(Vector.normalise(delta)),
                        coils = Math.ceil(Common.clamp(constraint.length / 5, 12, 20)),
                        offset;

                    for (var j = 1; j < coils; j += 1) {
                        offset = j % 2 === 0 ? 1 : -1;

                        c.lineTo(
                            start.x + delta.x * (j / coils) + normal.x * offset * 4,
                            start.y + delta.y * (j / coils) + normal.y * offset * 4
                        );
                    }
                }

                c.lineTo(end.x, end.y);
            }

            if (constraint.render.lineWidth) {
                c.lineWidth = constraint.render.lineWidth;
                c.strokeStyle = constraint.render.strokeStyle;
                c.stroke();
            }

            if (constraint.render.anchors) {
                c.fillStyle = constraint.render.strokeStyle;
                c.beginPath();
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                c.arc(end.x, end.y, 3, 0, 2 * Math.PI);
                c.closePath();
                c.fill();
            }
        }
    };

    /**
     * Description
     * @private
     * @method bodies
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodies = function(render, bodies, context) {
        var c = context,
            engine = render.engine,
            options = render.options,
            showInternalEdges = options.showInternalEdges || !options.wireframes,
            body,
            part,
            i,
            k;

        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.render.visible)
                continue;

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k];

                if (!part.render.visible)
                    continue;

                if (options.showSleeping && body.isSleeping) {
                    c.globalAlpha = 0.5 * part.render.opacity;
                } else if (part.render.opacity !== 1) {
                    c.globalAlpha = part.render.opacity;
                }

                if (part.render.sprite && part.render.sprite.texture && !options.wireframes) {
                    // part sprite
                    var sprite = part.render.sprite,
                        texture = _getTexture(render, sprite.texture);

                    c.translate(part.position.x, part.position.y);
                    c.rotate(part.angle);

                    c.drawImage(
                        texture,
                        texture.width * -sprite.xOffset * sprite.xScale,
                        texture.height * -sprite.yOffset * sprite.yScale,
                        texture.width * sprite.xScale,
                        texture.height * sprite.yScale
                    );

                    // revert translation, hopefully faster than save / restore
                    c.rotate(-part.angle);
                    c.translate(-part.position.x, -part.position.y);
                } else {
                    // part polygon
                    if (part.circleRadius) {
                        c.beginPath();
                        c.arc(part.position.x, part.position.y, part.circleRadius, 0, 2 * Math.PI);
                    } else {
                        c.beginPath();
                        c.moveTo(part.vertices[0].x, part.vertices[0].y);

                        for (var j = 1; j < part.vertices.length; j++) {
                            if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                                c.lineTo(part.vertices[j].x, part.vertices[j].y);
                            } else {
                                c.moveTo(part.vertices[j].x, part.vertices[j].y);
                            }

                            if (part.vertices[j].isInternal && !showInternalEdges) {
                                c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                            }
                        }

                        c.lineTo(part.vertices[0].x, part.vertices[0].y);
                        c.closePath();
                    }

                    if (!options.wireframes) {
                        c.fillStyle = part.render.fillStyle;

                        if (part.render.lineWidth) {
                            c.lineWidth = part.render.lineWidth;
                            c.strokeStyle = part.render.strokeStyle;
                            c.stroke();
                        }

                        c.fill();
                    } else {
                        c.lineWidth = 1;
                        c.strokeStyle = render.options.wireframeStrokeStyle;
                        c.stroke();
                    }
                }

                c.globalAlpha = 1;
            }
        }
    };

    /**
     * Optimised method for drawing body wireframes in one pass
     * @private
     * @method bodyWireframes
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyWireframes = function(render, bodies, context) {
        var c = context,
            showInternalEdges = render.options.showInternalEdges,
            body,
            part,
            i,
            j,
            k;

        c.beginPath();

        // render all bodies
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.render.visible)
                continue;

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k];

                c.moveTo(part.vertices[0].x, part.vertices[0].y);

                for (j = 1; j < part.vertices.length; j++) {
                    if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                        c.lineTo(part.vertices[j].x, part.vertices[j].y);
                    } else {
                        c.moveTo(part.vertices[j].x, part.vertices[j].y);
                    }

                    if (part.vertices[j].isInternal && !showInternalEdges) {
                        c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                    }
                }

                c.lineTo(part.vertices[0].x, part.vertices[0].y);
            }
        }

        c.lineWidth = 1;
        c.strokeStyle = render.options.wireframeStrokeStyle;
        c.stroke();
    };

    /**
     * Optimised method for drawing body convex hull wireframes in one pass
     * @private
     * @method bodyConvexHulls
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyConvexHulls = function(render, bodies, context) {
        var c = context,
            body,
            part,
            i,
            j,
            k;

        c.beginPath();

        // render convex hulls
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.render.visible || body.parts.length === 1)
                continue;

            c.moveTo(body.vertices[0].x, body.vertices[0].y);

            for (j = 1; j < body.vertices.length; j++) {
                c.lineTo(body.vertices[j].x, body.vertices[j].y);
            }

            c.lineTo(body.vertices[0].x, body.vertices[0].y);
        }

        c.lineWidth = 1;
        c.strokeStyle = 'rgba(255,255,255,0.2)';
        c.stroke();
    };

    /**
     * Renders body vertex numbers.
     * @private
     * @method vertexNumbers
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.vertexNumbers = function(render, bodies, context) {
        var c = context,
            i,
            j,
            k;

        for (i = 0; i < bodies.length; i++) {
            var parts = bodies[i].parts;
            for (k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
                var part = parts[k];
                for (j = 0; j < part.vertices.length; j++) {
                    c.fillStyle = 'rgba(255,255,255,0.2)';
                    c.fillText(i + '_' + j, part.position.x + (part.vertices[j].x - part.position.x) * 0.8, part.position.y + (part.vertices[j].y - part.position.y) * 0.8);
                }
            }
        }
    };

    /**
     * Renders mouse position.
     * @private
     * @method mousePosition
     * @param {render} render
     * @param {mouse} mouse
     * @param {RenderingContext} context
     */
    Render.mousePosition = function(render, mouse, context) {
        var c = context;
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillText(mouse.position.x + '  ' + mouse.position.y, mouse.position.x + 5, mouse.position.y - 5);
    };

    /**
     * Draws body bounds
     * @private
     * @method bodyBounds
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyBounds = function(render, bodies, context) {
        var c = context,
            engine = render.engine,
            options = render.options;

        c.beginPath();

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (body.render.visible) {
                var parts = bodies[i].parts;
                for (var j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    var part = parts[j];
                    c.rect(part.bounds.min.x, part.bounds.min.y, part.bounds.max.x - part.bounds.min.x, part.bounds.max.y - part.bounds.min.y);
                }
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,255,255,0.08)';
        } else {
            c.strokeStyle = 'rgba(0,0,0,0.1)';
        }

        c.lineWidth = 1;
        c.stroke();
    };

    /**
     * Draws body angle indicators and axes
     * @private
     * @method bodyAxes
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyAxes = function(render, bodies, context) {
        var c = context,
            engine = render.engine,
            options = render.options,
            part,
            i,
            j,
            k;

        c.beginPath();

        for (i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                parts = body.parts;

            if (!body.render.visible)
                continue;

            if (options.showAxes) {
                // render all axes
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                        var axis = part.axes[k];
                        c.moveTo(part.position.x, part.position.y);
                        c.lineTo(part.position.x + axis.x * 20, part.position.y + axis.y * 20);
                    }
                }
            } else {
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                        // render a single axis indicator
                        c.moveTo(part.position.x, part.position.y);
                        c.lineTo((part.vertices[0].x + part.vertices[part.vertices.length-1].x) / 2,
                            (part.vertices[0].y + part.vertices[part.vertices.length-1].y) / 2);
                    }
                }
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'indianred';
            c.lineWidth = 1;
        } else {
            c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            c.globalCompositeOperation = 'overlay';
            c.lineWidth = 2;
        }

        c.stroke();
        c.globalCompositeOperation = 'source-over';
    };

    /**
     * Draws body positions
     * @private
     * @method bodyPositions
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyPositions = function(render, bodies, context) {
        var c = context,
            engine = render.engine,
            options = render.options,
            body,
            part,
            i,
            k;

        c.beginPath();

        // render current positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.render.visible)
                continue;

            // handle compound parts
            for (k = 0; k < body.parts.length; k++) {
                part = body.parts[k];
                c.arc(part.position.x, part.position.y, 3, 0, 2 * Math.PI, false);
                c.closePath();
            }
        }

        if (options.wireframes) {
            c.fillStyle = 'indianred';
        } else {
            c.fillStyle = 'rgba(0,0,0,0.5)';
        }
        c.fill();

        c.beginPath();

        // render previous positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];
            if (body.render.visible) {
                c.arc(body.positionPrev.x, body.positionPrev.y, 2, 0, 2 * Math.PI, false);
                c.closePath();
            }
        }

        c.fillStyle = 'rgba(255,165,0,0.8)';
        c.fill();
    };

    /**
     * Draws body velocity
     * @private
     * @method bodyVelocity
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyVelocity = function(render, bodies, context) {
        var c = context;

        c.beginPath();

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (!body.render.visible)
                continue;

            var velocity = Body.getVelocity(body);

            c.moveTo(body.position.x, body.position.y);
            c.lineTo(body.position.x + velocity.x, body.position.y + velocity.y);
        }

        c.lineWidth = 3;
        c.strokeStyle = 'cornflowerblue';
        c.stroke();
    };

    /**
     * Draws body ids
     * @private
     * @method bodyIds
     * @param {render} render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyIds = function(render, bodies, context) {
        var c = context,
            i,
            j;

        for (i = 0; i < bodies.length; i++) {
            if (!bodies[i].render.visible)
                continue;

            var parts = bodies[i].parts;
            for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                var part = parts[j];
                c.font = "12px Arial";
                c.fillStyle = 'rgba(255,255,255,0.5)';
                c.fillText(part.id, part.position.x + 10, part.position.y - 10);
            }
        }
    };

    /**
     * Description
     * @private
     * @method collisions
     * @param {render} render
     * @param {pair[]} pairs
     * @param {RenderingContext} context
     */
    Render.collisions = function(render, pairs, context) {
        var c = context,
            options = render.options,
            pair,
            collision,
            corrected,
            bodyA,
            bodyB,
            i,
            j;

        c.beginPath();

        // render collision positions
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;
            for (j = 0; j < pair.contactCount; j++) {
                var contact = pair.contacts[j],
                    vertex = contact.vertex;
                c.rect(vertex.x - 1.5, vertex.y - 1.5, 3.5, 3.5);
            }
        }

        if (options.wireframes) {
            c.fillStyle = 'rgba(255,255,255,0.7)';
        } else {
            c.fillStyle = 'orange';
        }
        c.fill();

        c.beginPath();

        // render collision normals
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;

            if (pair.contactCount > 0) {
                var normalPosX = pair.contacts[0].vertex.x,
                    normalPosY = pair.contacts[0].vertex.y;

                if (pair.contactCount === 2) {
                    normalPosX = (pair.contacts[0].vertex.x + pair.contacts[1].vertex.x) / 2;
                    normalPosY = (pair.contacts[0].vertex.y + pair.contacts[1].vertex.y) / 2;
                }

                if (collision.bodyB === collision.supports[0].body || collision.bodyA.isStatic === true) {
                    c.moveTo(normalPosX - collision.normal.x * 8, normalPosY - collision.normal.y * 8);
                } else {
                    c.moveTo(normalPosX + collision.normal.x * 8, normalPosY + collision.normal.y * 8);
                }

                c.lineTo(normalPosX, normalPosY);
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,165,0,0.7)';
        } else {
            c.strokeStyle = 'orange';
        }

        c.lineWidth = 1;
        c.stroke();
    };

    /**
     * Description
     * @private
     * @method separations
     * @param {render} render
     * @param {pair[]} pairs
     * @param {RenderingContext} context
     */
    Render.separations = function(render, pairs, context) {
        var c = context,
            options = render.options,
            pair,
            collision,
            corrected,
            bodyA,
            bodyB,
            i,
            j;

        c.beginPath();

        // render separations
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;
            bodyA = collision.bodyA;
            bodyB = collision.bodyB;

            var k = 1;

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
            if (bodyB.isStatic) k = 0;

            // penetration is the normal scaled by the depth (the collision
            // record no longer stores it; the debug renderer was its only
            // consumer)
            var penetrationX = collision.normal.x * collision.depth,
                penetrationY = collision.normal.y * collision.depth;

            c.moveTo(bodyB.position.x, bodyB.position.y);
            c.lineTo(bodyB.position.x - penetrationX * k, bodyB.position.y - penetrationY * k);

            k = 1;

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
            if (bodyA.isStatic) k = 0;

            c.moveTo(bodyA.position.x, bodyA.position.y);
            c.lineTo(bodyA.position.x + penetrationX * k, bodyA.position.y + penetrationY * k);
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,165,0,0.5)';
        } else {
            c.strokeStyle = 'orange';
        }
        c.stroke();
    };

    /**
     * Description
     * @private
     * @method inspector
     * @param {inspector} inspector
     * @param {RenderingContext} context
     */
    Render.inspector = function(inspector, context) {
        var engine = inspector.engine,
            selected = inspector.selected,
            render = inspector.render,
            options = render.options,
            bounds;

        if (options.hasBounds) {
            var boundsWidth = render.bounds.max.x - render.bounds.min.x,
                boundsHeight = render.bounds.max.y - render.bounds.min.y,
                boundsScaleX = boundsWidth / render.options.width,
                boundsScaleY = boundsHeight / render.options.height;

            context.scale(1 / boundsScaleX, 1 / boundsScaleY);
            context.translate(-render.bounds.min.x, -render.bounds.min.y);
        }

        for (var i = 0; i < selected.length; i++) {
            var item = selected[i].data;

            context.translate(0.5, 0.5);
            context.lineWidth = 1;
            context.strokeStyle = 'rgba(255,165,0,0.9)';
            context.setLineDash([1,2]);

            switch (item.type) {

            case 'body':

                // render body selections
                bounds = item.bounds;
                context.beginPath();
                context.rect(Math.floor(bounds.min.x - 3), Math.floor(bounds.min.y - 3),
                    Math.floor(bounds.max.x - bounds.min.x + 6), Math.floor(bounds.max.y - bounds.min.y + 6));
                context.closePath();
                context.stroke();

                break;

            case 'constraint':

                // render constraint selections
                var point = item.pointA;
                if (item.bodyA)
                    point = item.pointB;
                context.beginPath();
                context.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                context.closePath();
                context.stroke();

                break;

            }

            context.setLineDash([]);
            context.translate(-0.5, -0.5);
        }

        // render selection region
        if (inspector.selectStart !== null) {
            context.translate(0.5, 0.5);
            context.lineWidth = 1;
            context.strokeStyle = 'rgba(255,165,0,0.6)';
            context.fillStyle = 'rgba(255,165,0,0.1)';
            bounds = inspector.selectBounds;
            context.beginPath();
            context.rect(Math.floor(bounds.min.x), Math.floor(bounds.min.y),
                Math.floor(bounds.max.x - bounds.min.x), Math.floor(bounds.max.y - bounds.min.y));
            context.closePath();
            context.stroke();
            context.fill();
            context.translate(-0.5, -0.5);
        }

        if (options.hasBounds)
            context.setTransform(1, 0, 0, 1, 0, 0);
    };

    /**
     * Updates render timing.
     * @method _updateTiming
     * @private
     * @param {render} render
     * @param {number} time
     */
    var _updateTiming = function(render, time) {
        var engine = render.engine,
            timing = render.timing,
            historySize = timing.historySize,
            timestamp = engine.timing.timestamp;

        timing.delta = time - timing.lastTime || Render._goodDelta;
        timing.lastTime = time;

        timing.timestampElapsed = timestamp - timing.lastTimestamp || 0;
        timing.lastTimestamp = timestamp;

        timing.deltaHistory.unshift(timing.delta);
        timing.deltaHistory.length = Math.min(timing.deltaHistory.length, historySize);

        timing.engineDeltaHistory.unshift(engine.timing.lastDelta);
        timing.engineDeltaHistory.length = Math.min(timing.engineDeltaHistory.length, historySize);

        timing.timestampElapsedHistory.unshift(timing.timestampElapsed);
        timing.timestampElapsedHistory.length = Math.min(timing.timestampElapsedHistory.length, historySize);

        timing.engineUpdatesHistory.unshift(engine.timing.lastUpdatesPerFrame);
        timing.engineUpdatesHistory.length = Math.min(timing.engineUpdatesHistory.length, historySize);

        timing.engineElapsedHistory.unshift(engine.timing.lastElapsed);
        timing.engineElapsedHistory.length = Math.min(timing.engineElapsedHistory.length, historySize);

        timing.elapsedHistory.unshift(timing.lastElapsed);
        timing.elapsedHistory.length = Math.min(timing.elapsedHistory.length, historySize);
    };

    /**
     * Returns the mean value of the given numbers.
     * @method _mean
     * @private
     * @param {Number[]} values
     * @return {Number} the mean of given values
     */
    var _mean = function(values) {
        var result = 0;
        for (var i = 0; i < values.length; i += 1) {
            result += values[i];
        }
        return (result / values.length) || 0;
    };

    /**
     * @method _createCanvas
     * @private
     * @param {} width
     * @param {} height
     * @return canvas
     */
    var _createCanvas = function(width, height) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.oncontextmenu = function() { return false; };
        canvas.onselectstart = function() { return false; };
        return canvas;
    };

    /**
     * Gets the pixel ratio of the canvas.
     * @method _getPixelRatio
     * @private
     * @param {HTMLElement} canvas
     * @return {Number} pixel ratio
     */
    var _getPixelRatio = function(canvas) {
        var context = canvas.getContext('2d'),
            devicePixelRatio = window.devicePixelRatio || 1,
            backingStorePixelRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio
                                      || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio
                                      || context.backingStorePixelRatio || 1;

        return devicePixelRatio / backingStorePixelRatio;
    };

    /**
     * Gets the requested texture (an Image) via its path
     * @method _getTexture
     * @private
     * @param {render} render
     * @param {string} imagePath
     * @return {Image} texture
     */
    var _getTexture = function(render, imagePath) {
        var image = render.textures[imagePath];

        if (image)
            return image;

        image = render.textures[imagePath] = new Image();
        image.src = imagePath;

        return image;
    };

    /**
     * Applies the background to the canvas using CSS.
     * @method applyBackground
     * @private
     * @param {render} render
     * @param {string} background
     */
    var _applyBackground = function(render, background) {
        var cssBackground = background;

        if (/(jpg|gif|png)$/.test(background))
            cssBackground = 'url(' + background + ')';

        render.canvas.style.background = cssBackground;
        render.canvas.style.backgroundSize = "contain";
        render.currentBackground = background;
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired before rendering
    *
    * @event beforeRender
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired after rendering
    *
    * @event afterRender
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * A back-reference to the `Matter.Render` module.
     *
     * @deprecated
     * @property controller
     * @type render
     */

    /**
     * A reference to the `Matter.Engine` instance to be used.
     *
     * @property engine
     * @type engine
     */

    /**
     * A reference to the element where the canvas is to be inserted (if `render.canvas` has not been specified)
     *
     * @property element
     * @type HTMLElement
     * @default null
     */

    /**
     * The canvas element to render to. If not specified, one will be created if `render.element` has been specified.
     *
     * @property canvas
     * @type HTMLCanvasElement
     * @default null
     */

    /**
     * A `Bounds` object that specifies the drawing view region.
     * Rendering will be automatically transformed and scaled to fit within the canvas size (`render.options.width` and `render.options.height`).
     * This allows for creating views that can pan or zoom around the scene.
     * You must also set `render.options.hasBounds` to `true` to enable bounded rendering.
     *
     * @property bounds
     * @type bounds
     */

    /**
     * The 2d rendering context from the `render.canvas` element.
     *
     * @property context
     * @type CanvasRenderingContext2D
     */

    /**
     * The sprite texture cache.
     *
     * @property textures
     * @type {}
     */

    /**
     * The mouse to render if `render.options.showMousePosition` is enabled.
     *
     * @property mouse
     * @type mouse
     * @default null
     */

    /**
     * The configuration options of the renderer.
     *
     * @property options
     * @type {}
     */

    /**
     * The target width in pixels of the `render.canvas` to be created.
     * See also the `options.pixelRatio` property to change render quality.
     *
     * @property options.width
     * @type number
     * @default 800
     */

    /**
     * The target height in pixels of the `render.canvas` to be created.
     * See also the `options.pixelRatio` property to change render quality.
     *
     * @property options.height
     * @type number
     * @default 600
     */

    /**
     * The [pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) to use when rendering.
     *
     * @property options.pixelRatio
     * @type number
     * @default 1
     */

    /**
     * A CSS background color string to use when `render.options.wireframes` is disabled.
     * This may be also set to `'transparent'` or equivalent.
     *
     * @property options.background
     * @type string
     * @default '#14151f'
     */

    /**
     * A CSS color string to use for background when `render.options.wireframes` is enabled.
     * This may be also set to `'transparent'` or equivalent.
     *
     * @property options.wireframeBackground
     * @type string
     * @default '#14151f'
     */

    /**
     * A CSS color string to use for stroke when `render.options.wireframes` is enabled.
     * This may be also set to `'transparent'` or equivalent.
     *
     * @property options.wireframeStrokeStyle
     * @type string
     * @default '#bbb'
     */

    /**
     * A flag that specifies if `render.bounds` should be used when rendering.
     *
     * @property options.hasBounds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable all debug information overlays together.  
     * This includes and has priority over the values of:
     *
     * - `render.options.showStats`
     * - `render.options.showPerformance`
     *
     * @property options.showDebug
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the engine stats info overlay.  
     * From left to right, the values shown are:
     *
     * - body parts total
     * - body total
     * - constraints total
     * - composites total
     * - collision pairs total
     *
     * @property options.showStats
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable performance charts.  
     * From left to right, the values shown are:
     *
     * - average render frequency (e.g. 60 fps)
     * - exact engine delta time used for last update (e.g. 16.66ms)
     * - average updates per frame (e.g. 1)
     * - average engine execution duration (e.g. 5.00ms)
     * - average render execution duration (e.g. 0.40ms)
     * - average effective play speed (e.g. '1.00x' is 'real-time')
     *
     * Each value is recorded over a fixed sample of past frames (60 frames).
     *
     * A chart shown below each value indicates the variance from the average over the sample.
     * The more stable or fixed the value is the flatter the chart will appear.
     *
     * @property options.showPerformance
     * @type boolean
     * @default false
     */
    
    /**
     * A flag to enable or disable rendering entirely.
     *
     * @property options.enabled
     * @type boolean
     * @default false
     */

    /**
     * A flag to toggle wireframe rendering otherwise solid fill rendering is used.
     *
     * @property options.wireframes
     * @type boolean
     * @default true
     */

    /**
     * A flag to enable or disable sleeping bodies indicators.
     *
     * @property options.showSleeping
     * @type boolean
     * @default true
     */

    /**
     * A flag to enable or disable the debug information overlay.
     *
     * @property options.showDebug
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the collision broadphase debug overlay.
     *
     * @deprecated no longer implemented
     * @property options.showBroadphase
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body bounds debug overlay.
     *
     * @property options.showBounds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body velocity debug overlay.
     *
     * @property options.showVelocity
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body collisions debug overlay.
     *
     * @property options.showCollisions
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the collision resolver separations debug overlay.
     *
     * @property options.showSeparations
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body axes debug overlay.
     *
     * @property options.showAxes
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body positions debug overlay.
     *
     * @property options.showPositions
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body angle debug overlay.
     *
     * @property options.showAngleIndicator
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body and part ids debug overlay.
     *
     * @property options.showIds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body vertex numbers debug overlay.
     *
     * @property options.showVertexNumbers
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body convex hulls debug overlay.
     *
     * @property options.showConvexHulls
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body internal edges debug overlay.
     *
     * @property options.showInternalEdges
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the mouse position debug overlay.
     *
     * @property options.showMousePosition
     * @type boolean
     * @default false
     */

})();


/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Runner` module is an optional utility that provides a game loop for running a `Matter.Engine` inside a browser environment.
* A runner will continuously update a `Matter.Engine` whilst synchronising engine updates with the browser frame rate.
* This runner favours a smoother user experience over perfect time keeping.
* This runner is optional and is used for development and debugging but could be useful as a starting point for implementing some games and experiences.
* Alternatively see `Engine.update` to step the engine directly inside your own game loop implementation as may be needed inside other environments.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Runner
*/

var Runner = {};

module.exports = Runner;

var Events = __webpack_require__(5);
var Engine = __webpack_require__(17);
var Common = __webpack_require__(0);

(function() {

    Runner._maxFrameDelta = 1000 / 15;
    Runner._frameDeltaFallback = 1000 / 60;
    Runner._timeBufferMargin = 1.5;
    Runner._elapsedNextEstimate = 1;
    Runner._smoothingLowerBound = 0.1;
    Runner._smoothingUpperBound = 0.9;

    /**
     * Creates a new Runner. 
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} options
     */
    Runner.create = function(options) {
        var defaults = {
            delta: 1000 / 60,
            frameDelta: null,
            frameDeltaSmoothing: true,
            frameDeltaSnapping: true,
            frameDeltaHistory: [],
            frameDeltaHistorySize: 100,
            frameRequestId: null,
            timeBuffer: 0,
            timeLastTick: null,
            maxUpdates: null,
            maxFrameTime: 1000 / 30,
            lastUpdatesDeferred: 0,
            enabled: true
        };

        var runner = Common.extend(defaults, options);

        // for temporary back compatibility only
        runner.fps = 0;

        return runner;
    };

    /**
     * Runs a `Matter.Engine` whilst synchronising engine updates with the browser frame rate. 
     * See module and properties descriptions for more information on this runner.
     * Alternatively see `Engine.update` to step the engine directly inside your own game loop implementation.
     * @method run
     * @param {runner} runner
     * @param {engine} [engine]
     * @return {runner} runner
     */
    Runner.run = function(runner, engine) {
        // initial time buffer for the first frame
        runner.timeBuffer = Runner._frameDeltaFallback;

        (function onFrame(time){
            runner.frameRequestId = Runner._onNextFrame(runner, onFrame);

            if (time && runner.enabled) {
                Runner.tick(runner, engine, time);
            }
        })();

        return runner;
    };

    /**
     * Performs a single runner tick as used inside `Runner.run`.
     * See module and properties descriptions for more information on this runner.
     * Alternatively see `Engine.update` to step the engine directly inside your own game loop implementation.
     * @method tick
     * @param {runner} runner
     * @param {engine} engine
     * @param {number} time
     */
    Runner.tick = function(runner, engine, time) {
        var tickStartTime = Common.now(),
            engineDelta = runner.delta,
            updateCount = 0;

        // find frame delta time since last call
        var frameDelta = time - runner.timeLastTick;

        // fallback for unusable frame delta values (e.g. 0, NaN, on first frame or long pauses)
        if (!frameDelta || !runner.timeLastTick || frameDelta > Math.max(Runner._maxFrameDelta, runner.maxFrameTime)) {
            // reuse last accepted frame delta else fallback
            frameDelta = runner.frameDelta || Runner._frameDeltaFallback;
        }

        if (runner.frameDeltaSmoothing) {
            // record frame delta over a number of frames
            runner.frameDeltaHistory.push(frameDelta);
            runner.frameDeltaHistory = runner.frameDeltaHistory.slice(-runner.frameDeltaHistorySize);

            // sort frame delta history
            var deltaHistorySorted = runner.frameDeltaHistory.slice(0).sort();

            // sample a central window to limit outliers
            var deltaHistoryWindow = runner.frameDeltaHistory.slice(
                deltaHistorySorted.length * Runner._smoothingLowerBound, 
                deltaHistorySorted.length * Runner._smoothingUpperBound
            );

            // take the mean of the central window
            var frameDeltaSmoothed = _mean(deltaHistoryWindow);
            frameDelta = frameDeltaSmoothed || frameDelta;
        }

        if (runner.frameDeltaSnapping) {
            // snap frame delta to the nearest 1 Hz
            frameDelta = 1000 / Math.round(1000 / frameDelta);
        }

        // update runner values for next call
        runner.frameDelta = frameDelta;
        runner.timeLastTick = time;

        // accumulate elapsed time
        runner.timeBuffer += runner.frameDelta;

        // limit time buffer size to a single frame of updates
        runner.timeBuffer = Common.clamp(
            runner.timeBuffer, 0, runner.frameDelta + engineDelta * Runner._timeBufferMargin
        );

        // reset count of over budget updates
        runner.lastUpdatesDeferred = 0;

        // get max updates per frame
        var maxUpdates = runner.maxUpdates || Math.ceil(runner.maxFrameTime / engineDelta);

        // create event object
        var event = {
            timestamp: engine.timing.timestamp
        };

        // tick events before update
        Events.trigger(runner, 'beforeTick', event);
        Events.trigger(runner, 'tick', event);

        var updateStartTime = Common.now();

        // simulate time elapsed between calls
        while (engineDelta > 0 && runner.timeBuffer >= engineDelta * Runner._timeBufferMargin) {
            // update the engine
            Events.trigger(runner, 'beforeUpdate', event);
            Engine.update(engine, engineDelta);
            Events.trigger(runner, 'afterUpdate', event);

            // consume time simulated from buffer
            runner.timeBuffer -= engineDelta;
            updateCount += 1;

            // find elapsed time during this tick
            var elapsedTimeTotal = Common.now() - tickStartTime,
                elapsedTimeUpdates = Common.now() - updateStartTime,
                elapsedNextEstimate = elapsedTimeTotal + Runner._elapsedNextEstimate * elapsedTimeUpdates / updateCount;

            // defer updates if over performance budgets for this frame
            if (updateCount >= maxUpdates || elapsedNextEstimate > runner.maxFrameTime) {
                runner.lastUpdatesDeferred = Math.round(Math.max(0, (runner.timeBuffer / engineDelta) - Runner._timeBufferMargin));
                break;
            }
        }

        // track timing metrics
        engine.timing.lastUpdatesPerFrame = updateCount;

        // tick events after update
        Events.trigger(runner, 'afterTick', event);

        // show useful warnings if needed
        if (runner.frameDeltaHistory.length >= 100) {
            if (runner.lastUpdatesDeferred && Math.round(runner.frameDelta / engineDelta) > maxUpdates) {
                Common.warnOnce('Matter.Runner: runner reached runner.maxUpdates, see docs.');
            } else if (runner.lastUpdatesDeferred) {
                Common.warnOnce('Matter.Runner: runner reached runner.maxFrameTime, see docs.');
            }

            if (typeof runner.isFixed !== 'undefined') {
                Common.warnOnce('Matter.Runner: runner.isFixed is now redundant, see docs.');
            }

            if (runner.deltaMin || runner.deltaMax) {
                Common.warnOnce('Matter.Runner: runner.deltaMin and runner.deltaMax were removed, see docs.');
            }

            if (runner.fps !== 0) {
                Common.warnOnce('Matter.Runner: runner.fps was replaced by runner.delta, see docs.');
            }
        }
    };

    /**
     * Ends execution of `Runner.run` on the given `runner` by canceling the frame loop.
     * Alternatively to temporarily pause the runner, see `runner.enabled`.
     * @method stop
     * @param {runner} runner
     */
    Runner.stop = function(runner) {
        Runner._cancelNextFrame(runner);
    };

    /**
     * Schedules the `callback` on this `runner` for the next animation frame.
     * @private
     * @method _onNextFrame
     * @param {runner} runner
     * @param {function} callback
     * @return {number} frameRequestId
     */
    Runner._onNextFrame = function(runner, callback) {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            runner.frameRequestId = window.requestAnimationFrame(callback);
        } else {
            throw new Error('Matter.Runner: missing required global window.requestAnimationFrame.');
        }

        return runner.frameRequestId;
    };

    /**
     * Cancels the last callback scheduled by `Runner._onNextFrame` on this `runner`.
     * @private
     * @method _cancelNextFrame
     * @param {runner} runner
     */
    Runner._cancelNextFrame = function(runner) {
        if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
            window.cancelAnimationFrame(runner.frameRequestId);
        } else {
            throw new Error('Matter.Runner: missing required global window.cancelAnimationFrame.');
        }
    };

    /**
     * Returns the mean of the given numbers.
     * @method _mean
     * @private
     * @param {Number[]} values
     * @return {Number} the mean of given values.
     */
    var _mean = function(values) {
        var result = 0,
            valuesLength = values.length;

        for (var i = 0; i < valuesLength; i += 1) {
            result += values[i];
        }

        return (result / valuesLength) || 0;
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired once at the start of the browser frame, before any engine updates.
    *
    * @event beforeTick
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired once at the start of the browser frame, after `beforeTick`.
    *
    * @event tick
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired once at the end of the browser frame, after `beforeTick`, `tick` and after any engine updates.
    *
    * @event afterTick
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired before each and every engine update in this browser frame (if any). 
    * There may be multiple engine update calls per browser frame (or none) depending on framerate and timestep delta.
    *
    * @event beforeUpdate
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired after each and every engine update in this browser frame (if any). 
    * There may be multiple engine update calls per browser frame (or none) depending on framerate and timestep delta.
    *
    * @event afterUpdate
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * The fixed timestep size used for `Engine.update` calls in milliseconds, known as `delta`.
     * 
     * This value is recommended to be `1000 / 60` ms or smaller (i.e. equivalent to at least 60hz).
     * 
     * Smaller `delta` values provide higher quality results at the cost of performance.
     * 
     * You should usually avoid changing `delta` during running, otherwise quality may be affected. 
     * 
     * For smoother frame pacing choose a `delta` that is an even multiple of each display FPS you target, i.e. `1000 / (n * fps)` as this helps distribute an equal number of updates over each display frame.
     * 
     * For example with a 60 Hz `delta` i.e. `1000 / 60` the runner will on average perform one update per frame on displays running 60 FPS and one update every two frames on displays running 120 FPS, etc.
     * 
     * Where as e.g. using a 240 Hz `delta` i.e. `1000 / 240` the runner will on average perform four updates per frame on displays running 60 FPS and two updates per frame on displays running 120 FPS, etc.
     * 
     * Therefore `Runner.run` will call multiple engine updates (or none) as needed to simulate the time elapsed between browser frames. 
     * 
     * In practice the number of updates in any particular frame may be restricted to respect the runner's performance budgets. These are specified by `runner.maxFrameTime` and `runner.maxUpdates`, see those properties for details.
     * 
     * @property delta
     * @type number
     * @default 1000 / 60
     */

    /**
     * A flag that can be toggled to enable or disable tick calls on this runner, therefore pausing engine updates and events while the runner loop remains running.
     *
     * @property enabled
     * @type boolean
     * @default true
     */

    /**
     * The accumulated time elapsed that has yet to be simulated in milliseconds.
     * This value is clamped within certain limits (see `Runner.tick` code).
     *
     * @private
     * @property timeBuffer
     * @type number
     * @default 0
     */

    /**
     * The measured time elapsed between the last two browser frames measured in milliseconds.
     * This is useful e.g. to estimate the current browser FPS using `1000 / runner.frameDelta`.
     *
     * @readonly
     * @property frameDelta
     * @type number
     */

    /**
     * Enables averaging to smooth frame rate measurements and therefore stabilise play rate.
     *
     * @property frameDeltaSmoothing
     * @type boolean
     * @default true
     */

    /**
     * Rounds measured browser frame delta to the nearest 1 Hz.
     * This option can help smooth frame rate measurements and simplify handling hardware timing differences e.g. 59.94Hz and 60Hz displays.
     * For best results you should also round your `runner.delta` equivalent to the nearest 1 Hz.
     *
     * @property frameDeltaSnapping
     * @type boolean
     * @default true
     */

    /**
     * A performance budget that limits execution time allowed for this runner per browser frame in milliseconds.
     * 
     * To calculate the effective browser FPS at which this throttle is applied use `1000 / runner.maxFrameTime`.
     * 
     * This performance budget is intended to help maintain browser interactivity and help improve framerate recovery during temporary high CPU usage.
     * 
     * This budget only covers the measured time elapsed executing the functions called in the scope of the runner tick, including `Engine.update` and its related user event callbacks.
     * 
     * You may also reduce this budget to allow for any significant additional processing you perform on the same thread outside the scope of this runner tick, e.g. rendering time.
     * 
     * See also `runner.maxUpdates`.
     *
     * @property maxFrameTime
     * @type number
     * @default 1000 / 30
     */

    /**
     * An optional limit for maximum engine update count allowed per frame tick in addition to `runner.maxFrameTime`.
     * 
     * Unless you set a value it is automatically chosen based on `runner.delta` and `runner.maxFrameTime`.
     * 
     * See also `runner.maxFrameTime`.
     * 
     * @property maxUpdates
     * @type number
     * @default null
     */

    /**
     * The timestamp of the last call to `Runner.tick` used to measure `frameDelta`.
     *
     * @private
     * @property timeLastTick
     * @type number
     * @default 0
     */

    /**
     * The id of the last call to `Runner._onNextFrame`.
     *
     * @private
     * @property frameRequestId
     * @type number
     * @default null
     */

})();


/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

/**
* This module has now been replaced by `Matter.Collision`.
*
* All usage should be migrated to `Matter.Collision`.
* For back-compatibility purposes this module will remain for a short term and then later removed in a future release.
*
* The `Matter.SAT` module contains methods for detecting collisions using the Separating Axis Theorem.
*
* @class SAT
* @deprecated
*/

var SAT = {};

module.exports = SAT;

var Collision = __webpack_require__(8);
var Common = __webpack_require__(0);
var deprecated = Common.deprecated;

(function() {

    /**
     * Detect collision between two bodies using the Separating Axis Theorem.
     * @deprecated replaced by Collision.collides
     * @method collides
     * @param {body} bodyA
     * @param {body} bodyB
     * @return {collision} collision
     */
    SAT.collides = function(bodyA, bodyB) {
        return Collision.collides(bodyA, bodyB);
    };

    deprecated(SAT, 'collides', 'SAT.collides ➤ replaced by Collision.collides');

})();


/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

/**
* The `Matter.Svg` module contains methods for converting SVG images into an array of vector points.
*
* To use this module you also need the SVGPathSeg polyfill: https://github.com/progers/pathseg
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Svg
*/

var Svg = {};

module.exports = Svg;

var Bounds = __webpack_require__(1);
var Common = __webpack_require__(0);

(function() {

    /**
     * Converts an SVG path into an array of vector points.
     * If the input path forms a concave shape, you must decompose the result into convex parts before use.
     * See `Bodies.fromVertices` which provides support for this.
     * Note that this function is not guaranteed to support complex paths (such as those with holes).
     * You must load the `pathseg.js` polyfill on newer browsers.
     * @method pathToVertices
     * @param {SVGPathElement} path
     * @param {Number} [sampleLength=15]
     * @return {Vector[]} points
     */
    Svg.pathToVertices = function(path, sampleLength) {
        if (typeof window !== 'undefined' && !('SVGPathSeg' in window)) {
            Common.warn('Svg.pathToVertices: SVGPathSeg not defined, a polyfill is required.');
        }

        // https://github.com/wout/svg.topoly.js/blob/master/svg.topoly.js
        var i, il, total, point, segment, segments, 
            segmentsQueue, lastSegment, 
            lastPoint, segmentIndex, points = [],
            lx, ly, length = 0, x = 0, y = 0;

        sampleLength = sampleLength || 15;

        var addPoint = function(px, py, pathSegType) {
            // all odd-numbered path types are relative except PATHSEG_CLOSEPATH (1)
            var isRelative = pathSegType % 2 === 1 && pathSegType > 1;

            // when the last point doesn't equal the current point add the current point
            if (!lastPoint || px != lastPoint.x || py != lastPoint.y) {
                if (lastPoint && isRelative) {
                    lx = lastPoint.x;
                    ly = lastPoint.y;
                } else {
                    lx = 0;
                    ly = 0;
                }

                var point = {
                    x: lx + px,
                    y: ly + py
                };

                // set last point
                if (isRelative || !lastPoint) {
                    lastPoint = point;
                }

                points.push(point);

                x = lx + px;
                y = ly + py;
            }
        };

        var addSegmentPoint = function(segment) {
            var segType = segment.pathSegTypeAsLetter.toUpperCase();

            // skip path ends
            if (segType === 'Z') 
                return;

            // map segment to x and y
            switch (segType) {

            case 'M':
            case 'L':
            case 'T':
            case 'C':
            case 'S':
            case 'Q':
                x = segment.x;
                y = segment.y;
                break;
            case 'H':
                x = segment.x;
                break;
            case 'V':
                y = segment.y;
                break;
            }

            addPoint(x, y, segment.pathSegType);
        };

        // ensure path is absolute
        Svg._svgPathToAbsolute(path);

        // get total length
        total = path.getTotalLength();

        // queue segments
        segments = [];
        for (i = 0; i < path.pathSegList.numberOfItems; i += 1)
            segments.push(path.pathSegList.getItem(i));

        segmentsQueue = segments.concat();

        // sample through path
        while (length < total) {
            // get segment at position
            segmentIndex = path.getPathSegAtLength(length);
            segment = segments[segmentIndex];

            // new segment
            if (segment != lastSegment) {
                while (segmentsQueue.length && segmentsQueue[0] != segment)
                    addSegmentPoint(segmentsQueue.shift());

                lastSegment = segment;
            }

            // add points in between when curving
            // TODO: adaptive sampling
            switch (segment.pathSegTypeAsLetter.toUpperCase()) {

            case 'C':
            case 'T':
            case 'S':
            case 'Q':
            case 'A':
                point = path.getPointAtLength(length);
                addPoint(point.x, point.y, 0);
                break;

            }

            // increment by sample value
            length += sampleLength;
        }

        // add remaining segments not passed by sampling
        for (i = 0, il = segmentsQueue.length; i < il; ++i)
            addSegmentPoint(segmentsQueue[i]);

        return points;
    };

    Svg._svgPathToAbsolute = function(path) {
        // http://phrogz.net/convert-svg-path-to-all-absolute-commands
        // Copyright (c) Gavin Kistner
        // http://phrogz.net/js/_ReuseLicense.txt
        // Modifications: tidy formatting and naming
        var x0, y0, x1, y1, x2, y2, segs = path.pathSegList,
            x = 0, y = 0, len = segs.numberOfItems;

        for (var i = 0; i < len; ++i) {
            var seg = segs.getItem(i),
                segType = seg.pathSegTypeAsLetter;

            if (/[MLHVCSQTA]/.test(segType)) {
                if ('x' in seg) x = seg.x;
                if ('y' in seg) y = seg.y;
            } else {
                if ('x1' in seg) x1 = x + seg.x1;
                if ('x2' in seg) x2 = x + seg.x2;
                if ('y1' in seg) y1 = y + seg.y1;
                if ('y2' in seg) y2 = y + seg.y2;
                if ('x' in seg) x += seg.x;
                if ('y' in seg) y += seg.y;

                switch (segType) {

                case 'm':
                    segs.replaceItem(path.createSVGPathSegMovetoAbs(x, y), i);
                    break;
                case 'l':
                    segs.replaceItem(path.createSVGPathSegLinetoAbs(x, y), i);
                    break;
                case 'h':
                    segs.replaceItem(path.createSVGPathSegLinetoHorizontalAbs(x), i);
                    break;
                case 'v':
                    segs.replaceItem(path.createSVGPathSegLinetoVerticalAbs(y), i);
                    break;
                case 'c':
                    segs.replaceItem(path.createSVGPathSegCurvetoCubicAbs(x, y, x1, y1, x2, y2), i);
                    break;
                case 's':
                    segs.replaceItem(path.createSVGPathSegCurvetoCubicSmoothAbs(x, y, x2, y2), i);
                    break;
                case 'q':
                    segs.replaceItem(path.createSVGPathSegCurvetoQuadraticAbs(x, y, x1, y1), i);
                    break;
                case 't':
                    segs.replaceItem(path.createSVGPathSegCurvetoQuadraticSmoothAbs(x, y), i);
                    break;
                case 'a':
                    segs.replaceItem(path.createSVGPathSegArcAbs(x, y, seg.r1, seg.r2, seg.angle, seg.largeArcFlag, seg.sweepFlag), i);
                    break;
                case 'z':
                case 'Z':
                    x = x0;
                    y = y0;
                    break;

                }
            }

            if (segType == 'M' || segType == 'm') {
                x0 = x;
                y0 = y;
            }
        }
    };

})();

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

/**
* This module has now been replaced by `Matter.Composite`.
*
* All usage should be migrated to the equivalent functions found on `Matter.Composite`.
* For example `World.add(world, body)` now becomes `Composite.add(world, body)`.
*
* The property `world.gravity` has been moved to `engine.gravity`.
*
* For back-compatibility purposes this module will remain as a direct alias to `Matter.Composite` in the short term during migration.
* Eventually this alias module will be marked as deprecated and then later removed in a future release.
*
* @class World
*/

var World = {};

module.exports = World;

var Composite = __webpack_require__(6);
var Common = __webpack_require__(0);

(function() {

    /**
     * See above, aliases for back compatibility only
     */
    World.create = Composite.create;
    World.add = Composite.add;
    World.remove = Composite.remove;
    World.clear = Composite.clear;
    World.addComposite = Composite.addComposite;
    World.addBody = Composite.addBody;
    World.addConstraint = Composite.addConstraint;

})();


/***/ })
/******/ ]);
});