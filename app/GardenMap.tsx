"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type MapZone = {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  anchor: [number, number, number];
  locked?: boolean;
};

type GardenMotion = {
  time: { value: number };
  strength: { value: number };
};

const LIVING_CROWN_MATERIALS = new Set([
  "foliage_green",
  "foliage_lime",
  "blossom_gold",
  "blossom_pink",
]);
const LIVING_CROWN_PATTERN = /^(?:broadleaf_canopy(?:_upper)?|flowering_crown(?:_top)?)_/i;

function installWaterRipples(
  material: THREE.MeshStandardMaterial,
  motion: GardenMotion,
) {
  material.color.set("#4e9fb0");
  material.roughness = 1;
  material.emissive.set("#174b5e");
  material.emissiveIntensity = 0.08;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGardenTime = motion.time;
    shader.uniforms.uGardenMotion = motion.strength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGardenWaterXZ;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 gardenWaterWorld = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  gardenWaterWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#endif
vGardenWaterXZ = gardenWaterWorld.xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uGardenTime;
uniform float uGardenMotion;
varying vec2 vGardenWaterXZ;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float gardenWaveA =
  sin(dot(vGardenWaterXZ, vec2(0.15, 0.10)) + uGardenTime * 0.55);
float gardenWaveB =
  sin(dot(vGardenWaterXZ, vec2(-0.08, 0.18)) - uGardenTime * 0.38 + 1.7);
float gardenRipple =
  clamp(0.5 + 0.25 * (gardenWaveA + gardenWaveB), 0.0, 1.0);
float gardenVariation = (gardenRipple - 0.5) * uGardenMotion;
float gardenRibbon =
  0.5 + 0.5 * sin((gardenWaveA + gardenWaveB) * 2.2);
gardenRibbon = gardenRibbon * gardenRibbon * (3.0 - 2.0 * gardenRibbon);

// Broad moving ribbons are readable from the overview while staying opaque,
// soft-edged, and free of reflection shimmer.
diffuseColor.rgb *= 1.0 + gardenVariation * 0.22;
diffuseColor.rgb +=
  vec3(0.015, 0.070, 0.080) * gardenRibbon * uGardenMotion;`,
      );
  };
  material.customProgramCacheKey = () => "aditi-water-ripples-v2";
  material.needsUpdate = true;
}

function installFoliageSway(
  material: THREE.MeshStandardMaterial,
  motion: GardenMotion,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGardenTime = motion.time;
    shader.uniforms.uGardenMotion = motion.strength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uGardenTime;
uniform float uGardenMotion;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 gardenOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  gardenOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#endif

float gardenSeed = dot(gardenOrigin.xz, vec2(0.071, 0.113));
float gardenSwayX =
  sin(uGardenTime * 0.55 + gardenSeed) +
  0.35 * sin(uGardenTime * 1.05 + gardenSeed * 1.71);
float gardenSwayZ = cos(uGardenTime * 0.47 + gardenSeed * 1.27);

// Each crown moves as one rigid shape, preserving its original normals and
// keeping the low-poly lighting steady while neighbouring trees move apart.
transformed.x += gardenSwayX * 0.62 * uGardenMotion;
transformed.z += gardenSwayZ * 0.34 * uGardenMotion;`,
      );
  };
  material.customProgramCacheKey = () => "aditi-foliage-sway-v2";
  material.needsUpdate = true;
}

function prepareLivingMaterials(root: THREE.Object3D, motion: GardenMotion) {
  const preparedMaterials = new WeakSet<THREE.MeshStandardMaterial>();
  const waterMaterials = new WeakSet<THREE.MeshStandardMaterial>();
  const animatedCrowns = new Map<string, THREE.MeshStandardMaterial>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const isLivingCrown = LIVING_CROWN_PATTERN.test(object.name);
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const nextMaterials = sourceMaterials.map((source) => {
      if (!(source instanceof THREE.MeshStandardMaterial)) return source;
      if (!preparedMaterials.has(source)) {
        preparedMaterials.add(source);
        source.roughness = 1;
        source.metalness = 0;
        source.transparent = false;
        source.opacity = 1;
        source.depthWrite = true;
        source.needsUpdate = true;
      }

      const materialName = source.name.trim().toLowerCase();
      if (materialName === "water_blue" && !waterMaterials.has(source)) {
        waterMaterials.add(source);
        installWaterRipples(source, motion);
      }

      if (!isLivingCrown || !LIVING_CROWN_MATERIALS.has(materialName)) {
        return source;
      }

      let animated = animatedCrowns.get(source.uuid);
      if (!animated) {
        animated = source.clone();
        animated.name = `${source.name}_living_crown`;
        installFoliageSway(animated, motion);
        animatedCrowns.set(source.uuid, animated);
      }
      return animated;
    });
    object.material = Array.isArray(object.material)
      ? nextMaterials
      : nextMaterials[0];
  });
}

type GardenMapProps = {
  zones: MapZone[];
  selectedZone: string;
  completedZones: string[];
  lockedZoneIds?: string[];
  active: boolean;
  onSelectZone: (id: string) => void;
};

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function instanceRepeatedMeshes(root: THREE.Object3D, scene: THREE.Scene) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, THREE.Mesh[]>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const key = `${object.geometry.uuid}:${object.material.uuid}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  });

  buckets.forEach((meshes) => {
    if (meshes.length < 4) return;
    const sample = meshes[0];
    const instanced = new THREE.InstancedMesh(
      sample.geometry,
      sample.material,
      meshes.length,
    );
    instanced.name = `garden_instances_${sample.name}`;
    meshes.forEach((mesh, index) => {
      instanced.setMatrixAt(index, mesh.matrixWorld);
      mesh.parent?.remove(mesh);
    });
    instanced.instanceMatrix.needsUpdate = true;
    scene.add(instanced);
  });
}

type PollinatorSystem = {
  mesh: THREE.InstancedMesh;
  update: (time: number) => void;
};

const POLLINATOR_PATHS = [
  { center: [-35, 13, -4], radius: [10, 6], speed: 0.34, phase: 0.2 },
  { center: [-6, 15, -18], radius: [8, 7], speed: 0.29, phase: 1.7 },
  { center: [24, 13, -8], radius: [9, 5], speed: 0.31, phase: 3.1 },
  { center: [-58, 12, -34], radius: [7, 5], speed: 0.27, phase: 4.4 },
  { center: [69, 11, -20], radius: [7, 4], speed: 0.36, phase: 2.3 },
  { center: [51, 7, 35], radius: [10, 6], speed: 0.3, phase: 5.2 },
  { center: [29, 8, 69], radius: [8, 5], speed: 0.33, phase: 0.9 },
  { center: [-22, 12, 26], radius: [7, 5], speed: 0.28, phase: 3.8 },
] as const;

function createPollinatorSystem(scene: THREE.Scene, count: number): PollinatorSystem {
  // Four tiny wing triangles form a low-poly butterfly silhouette. The whole
  // flock is one instanced draw call, so it stays inexpensive on small screens.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        0, 0, 0, -1, 0, 0.5, -0.12, 0, 0.1,
        0, 0, 0, -0.78, 0, -0.42, -0.12, 0, -0.1,
        0, 0, 0, 1, 0, 0.5, 0.12, 0, 0.1,
        0, 0, 0, 0.78, 0, -0.42, 0.12, 0, -0.1,
      ]),
      3,
    ),
  );
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "garden_pollinators";
  mesh.frustumCulled = false;
  const palette = ["#f4c64e", "#ed765e", "#ef92b6", "#7fd1c7"];
  for (let index = 0; index < count; index += 1) {
    mesh.setColorAt(index, new THREE.Color(palette[index % palette.length]));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const update = (time: number) => {
    for (let index = 0; index < count; index += 1) {
      const path = POLLINATOR_PATHS[index];
      const angle = time * path.speed * 1.35 + path.phase;
      dummy.position.set(
        path.center[0] + Math.cos(angle) * path.radius[0],
        path.center[1] + Math.sin(time * 1.9 + path.phase) * 0.7,
        path.center[2] + Math.sin(angle * 1.07) * path.radius[1],
      );
      dummy.rotation.set(
        Math.sin(time * 3.2 + path.phase) * 0.08,
        -angle,
        Math.sin(time * 5.4 + path.phase) * 0.14,
      );
      const flutter = 0.72 + Math.abs(Math.sin(time * 5.8 + path.phase)) * 0.45;
      const size = 1.25 + (index % 3) * 0.15;
      dummy.scale.set(flutter * size, size, size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

export default function GardenMap({
  zones,
  selectedZone,
  completedZones,
  lockedZoneIds = [],
  active,
  onSelectZone,
}: GardenMapProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const resetViewRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(active);
  const loopControlRef = useRef<{ resume: () => void; pause: () => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    activeRef.current = active;
    if (active) loopControlRef.current?.resume();
    else loopControlRef.current?.pause();
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#b9d8cd");
    // Keep the haze beyond the garden. Starting it at the camera distance made
    // a pale band travel across the model and resemble a moving reflection.
    scene.fog = new THREE.Fog("#b9d8cd", 650, 950);

    // The whole map is hundreds of units wide, so a tighter depth range avoids
    // distant, nearly coplanar surfaces flickering as the camera rotates.
    const camera = new THREE.PerspectiveCamera(34, 1, 6, 1000);
    const startPosition = new THREE.Vector3(245, 245, 310);
    const startTarget = new THREE.Vector3(0, 4, 0);
    camera.position.copy(startPosition);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setStatus("error"));
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.className = "garden-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D map of Aditi Garden");
    mount.appendChild(renderer.domElement);

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = motionPreference.matches;
    let userStoppedRotation = false;
    let gardenElapsed = 0;
    let pollinators: PollinatorSystem | null = null;
    const gardenMotion: GardenMotion = {
      time: { value: 0 },
      strength: { value: prefersReducedMotion ? 0 : 1 },
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(startTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 265;
    controls.maxDistance = 640;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.autoRotate = !prefersReducedMotion;
    controls.autoRotateSpeed = 0.2;
    const onControlsStart = () => {
      userStoppedRotation = true;
      controls.autoRotate = false;
    };
    controls.addEventListener("start", onControlsStart);

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      gardenMotion.strength.value = event.matches ? 0 : 1;
      if (event.matches) controls.autoRotate = false;
      else if (!userStoppedRotation) controls.autoRotate = true;
      if (pollinators) pollinators.mesh.visible = !event.matches;
    };
    motionPreference.addEventListener("change", onMotionPreferenceChange);

    resetViewRef.current = () => {
      userStoppedRotation = true;
      camera.position.copy(startPosition);
      controls.target.copy(startTarget);
      controls.autoRotate = false;
      controls.update();
    };

    scene.add(new THREE.HemisphereLight("#fff4c6", "#315943", 2.5));
    const keyLight = new THREE.DirectionalLight("#fff4d0", 3.2);
    keyLight.position.set(-160, 260, 180);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#bde7e4", 1.3);
    fillLight.position.set(220, 100, -160);
    scene.add(fillLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(245, 80),
      new THREE.MeshStandardMaterial({
        color: "#8cab70",
        roughness: 1,
        transparent: true,
        opacity: 0.32,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4.5;
    scene.add(ground);

    const loader = new GLTFLoader();
    let cancelled = false;
    let mapReady = false;
    loader.load(
      "/assets/aditi-garden.glb",
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        prepareLivingMaterials(model, gardenMotion);
        scene.add(model);
        instanceRepeatedMeshes(model, scene);
        const pollinatorCount = window.matchMedia("(max-width: 760px)").matches ? 5 : 8;
        pollinators = createPollinatorSystem(scene, pollinatorCount);
        pollinators.mesh.visible = !prefersReducedMotion;
        pollinators.update(gardenElapsed);
        mapReady = true;
        setStatus("ready");
      },
      undefined,
      () => {
        if (!cancelled) setStatus("error");
      },
    );

    let viewportWidth = 1;
    let viewportHeight = 1;
    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      viewportWidth = width;
      viewportHeight = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    window.addEventListener("resize", resize);
    resize();

    let frame = 0;
    let lastFrameTime: number | null = null;
    const markerPosition = new THREE.Vector3();
    const animate = (time: number) => {
      frame = window.requestAnimationFrame(animate);
      // Passing elapsed time keeps auto-rotation smooth and independent of
      // refresh rate or the occasional slow frame.
      const delta = lastFrameTime === null
        ? 1 / 60
        : Math.min((time - lastFrameTime) / 1000, 1 / 20);
      lastFrameTime = time;
      if (!prefersReducedMotion) {
        gardenElapsed += delta;
        gardenMotion.time.value = gardenElapsed;
        pollinators?.update(gardenElapsed);
      }
      controls.update(delta);
      zones.forEach((zone) => {
        const marker = markerRefs.current.get(zone.id);
        if (!marker) return;
        markerPosition.set(...zone.anchor).project(camera);
        const x = (markerPosition.x * 0.5 + 0.5) * viewportWidth;
        const y = (-markerPosition.y * 0.5 + 0.5) * viewportHeight;
        const visible = markerPosition.z > -1 && markerPosition.z < 1;
        marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
        marker.style.opacity = visible ? "1" : "0";
        marker.style.pointerEvents = visible ? "auto" : "none";
        marker.tabIndex = visible && mapReady ? 0 : -1;
      });
      renderer.render(scene, camera);
    };
    const pause = () => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = null;
    };
    const resume = () => {
      if (frame || !activeRef.current || document.hidden) return;
      frame = window.requestAnimationFrame(animate);
    };
    loopControlRef.current = { resume, pause };
    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    resume();

    return () => {
      cancelled = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
      controls.removeEventListener("start", onControlsStart);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
      resetViewRef.current = null;
      loopControlRef.current = null;
    };
  }, [zones]);

  return (
    <div className="map-stage">
      <div ref={mountRef} className="map-canvas-mount" />
      <div className="map-wash" aria-hidden="true" />

      {status === "ready" && zones.map((zone) => (
        <button
          key={zone.id}
          ref={(element) => {
            if (element) markerRefs.current.set(zone.id, element);
            else markerRefs.current.delete(zone.id);
          }}
          className={`world-marker ${selectedZone === zone.id ? "world-marker-selected" : ""} ${completedZones.includes(zone.id) ? "world-marker-complete" : ""} ${lockedZoneIds.includes(zone.id) ? "world-marker-locked" : ""}`}
          style={{ "--marker-color": zone.color } as React.CSSProperties}
          type="button"
          onClick={() => onSelectZone(zone.id)}
          aria-label={`Select ${zone.name}${lockedZoneIds.includes(zone.id) ? ", currently locked" : ""}`}
          aria-disabled={lockedZoneIds.includes(zone.id)}
          tabIndex={-1}
        >
          <span className="marker-pulse" />
          <span className="marker-icon">{lockedZoneIds.includes(zone.id) ? "✦" : zone.icon}</span>
          <span className="marker-label">{zone.shortName}</span>
        </button>
      ))}

      {status === "loading" && (
        <div className="map-loading" role="status">
          <span className="loading-bee">◆</span>
          <span>Growing the living map…</span>
        </div>
      )}
      {status === "error" && (
        <div className="map-fallback" role="status">
          <strong>Choose a garden trail</strong>
          <div>
            {zones.map((zone) => (
              <button key={zone.id} type="button" onClick={() => onSelectZone(zone.id)}>
                <span style={{ background: zone.color }}>{zone.icon}</span>{zone.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "ready" && <div className="map-controls">
        <button type="button" onClick={() => resetViewRef.current?.()}>
          Reset view
        </button>
        <span>Drag to turn · Pinch or scroll to zoom</span>
      </div>}
    </div>
  );
}
