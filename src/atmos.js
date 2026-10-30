// Atmospheric haze. Replaces three's fog with one that thins out with height
// (valleys are hazy, peaks are clear), turns cooler and bluer away from the sun,
// and glows warm and bright towards it, so distance reads in layers like a film shot.
// The sun direction is fixed for a page load (Time of day reloads), so it's baked in.
import * as THREE from 'three';
import { TOD } from './tod.js';

export function installAtmosphere() {
  const H = TOD.haze, s = new THREE.Vector3(...TOD.sun).normalize();
  const v3 = a => `vec3(${a.map(x => x.toFixed(4)).join(',')})`;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth; varying vec3 vFogRay;
  #endif`;
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor; uniform float fogDensity;
    varying float vFogDepth; varying vec3 vFogRay;
    const vec3 SUN_DIR = ${v3([s.x, s.y, s.z])};
    const vec3 SUN_FOG = ${v3(H.sunFog)};
    const vec3 COOL_FOG = ${v3(H.cool)};
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    float fDist = length(vFogRay);
    vec3 fRd = vFogRay / max(fDist, 1e-3);
    float fAvgY = max(cameraPosition.y + 0.5 * vFogRay.y, 0.0);
    float fThin = exp(-fAvgY * ${H.height.toFixed(5)});
    float fSun = pow(max(dot(fRd, SUN_DIR), 0.0), ${H.focus.toFixed(1)});
    float fd = fogDensity * fDist * fThin;
    float fogFactor = 1.0 - exp(-fd * fd * (1.0 + ${H.forward.toFixed(2)} * fSun)) * exp(-fDist * fThin * ${H.k2.toFixed(6)} * (1.0 + 0.6 * fSun));
    vec3 fCol = mix(fogColor * COOL_FOG, SUN_FOG, fSun * ${H.glow.toFixed(3)});
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, clamp(fogFactor, 0.0, 1.0));
  #endif`;
}
