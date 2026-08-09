/* eslint-env node, jest */
/**
* Release-hygiene guard: the COMMITTED bundle must report the CURRENT version.
*
* This fork ships `build/matter.js` in the repo (tarball installs run no build
* step), and its version reaches consumers through the webpack DefinePlugin
* reading `package.json` at build time. So the version a consumer sees is the
* one that was in `package.json` WHEN THE BUNDLE WAS LAST BUILT, not the one in
* `package.json` now. Bump the version and forget to rebuild, and the tag ships
* claiming to be its predecessor.
*
* That matters because since `v0.20.0-perf16` `Matter.version` carries the fork
* tag specifically so consumers can assert in CI that they resolved the release
* they pinned (page-rage does exactly this). A bundle reporting a stale version
* silently defeats that check, and the failure surfaces in someone else's repo.
*
* Part of `npm run test-unit`, which the release loop runs before building, so
* it fails on the version bump and passes once the rebuild lands.
*/
const path = require('path');
const fs = require('fs');

describe('release hygiene', () => {
    const root = path.join(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    it('package version is a fork release version', () => {
        // `0.20.0-perfN`: upstream's base version plus this fork's tag suffix.
        // A bare `0.20.0` means the bump was skipped, which is the mistake that
        // makes every consumer-side pin assertion useless.
        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+-perf\d+$/);
    });

    it('committed build/matter.js reports the current package version', () => {
        const buildPath = path.join(root, 'build', 'matter.js');
        expect(fs.existsSync(buildPath)).toBe(true);

        // eslint-disable-next-line global-require
        const built = require(buildPath);
        expect(built.version).toBe(pkg.version);
    });
});
