// Two small shader additions that make surfaces look like what they are made of. Both patch a standard material's shader (and chain with any patch it already has).
//  paintFlakes: metallic car paint is a layer of tiny aluminium flakes under a smooth clear lacquer. Each flake lies at its own angle, so up close the paint glitters in the sun while
//     the lacquer on top stays smooth and mirror-like (three.js keeps the clear coat's normal apart from the base layer's, so tilting the base normal does exactly that). The flakes are
//     fixed to the body (they are cells of its own coordinates, so they do not crawl as the car or the camera moves) and fade out with distance, so a far car is just smooth paint.
//  backlight:   skin, hair and thin cloth glow where the sun comes through them at their edges (a cheap stand-in for light scattering under the skin: ears, noses, fingers and the
//     rims of a head lit from behind go warm and bright instead of flat and dark).
import * as THREE from 'three';

const keyOf = m => Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey() : (m.onBeforeCompile ? m.onBeforeCompile.toString() : '');

export function paintFlakes(m, strength = 1) {
  if (m.userData.flakes) return m; m.userData.flakes = true;
  const prev = m.onBeforeCompile, key = keyOf(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uFlake = { value: strength };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlakeP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlakeP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlakeP; uniform float uFlake;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float fk = uFlake * (1.0 - smoothstep(3.0, 10.0, length(vViewPosition)));
          if (fk > 0.0) {
            vec3 cell = floor(vFlakeP * 480.0);
            vec3 h = vec3(fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453), fract(sin(dot(cell, vec3(39.346, 11.135, 83.155))) * 24634.6345), fract(sin(dot(cell, vec3(73.156, 52.235, 9.151))) * 31415.9265));
            normal = normalize(normal + (h - 0.5) * 0.3 * fk);
          } }`);
  };
  m.customProgramCacheKey = () => key + '|flakes' + strength;
  return m;
}

export function backlight(m, k = 0.4, tint = [1.0, 0.62, 0.45]) {
  if (m.userData.backlit) return m; m.userData.backlit = true;
  const prev = m.onBeforeCompile, key = keyOf(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uBack = { value: k }; sh.uniforms.uBackTint = { value: new THREE.Color(tint[0], tint[1], tint[2]) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBack; uniform vec3 uBackTint;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        { vec3 Ld = directionalLights[0].direction, Vv = normalize(vViewPosition);
          float t = pow(clamp(dot(Vv, -(Ld + normal * 0.35)), 0.0, 1.0), 3.0) * (0.35 + 0.65 * (1.0 - clamp(dot(normal, Vv), 0.0, 1.0)));
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * uBackTint * (t * uBack); }
        #endif`);
  };
  m.customProgramCacheKey = () => key + '|back' + k;
  return m;
}
