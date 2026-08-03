import type { GeometrySpec, SceneNode } from "./scene-schema.ts";

export type GeometryFieldDefinition = {
  key: string;
  labelKey: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
};

export type GeometryDefinition = {
  kind: GeometrySpec["kind"];
  labelKey: string;
  fields: readonly GeometryFieldDefinition[];
};

export type NodeDefinition = {
  type: SceneNode["type"];
  labelKey: string;
  capabilities: readonly ["select", "transform", "patch", "duplicate", "delete"];
  geometryKinds?: readonly GeometrySpec["kind"][];
};

const numberField = (
  key: string,
  labelKey: string,
  options: Omit<GeometryFieldDefinition, "key" | "labelKey" | "kind"> = {},
): GeometryFieldDefinition => ({
  key,
  labelKey,
  kind: "number",
  ...options,
});

const booleanField = (key: string, labelKey: string): GeometryFieldDefinition => ({
  key,
  labelKey,
  kind: "boolean",
});

export const GEOMETRY_DEFINITIONS: Record<GeometrySpec["kind"], GeometryDefinition> = {
  box: {
    kind: "box",
    labelKey: "scene.box",
    fields: [
      numberField("width", "inspector.width", { min: 0.01 }),
      numberField("height", "inspector.height", { min: 0.01 }),
      numberField("depth", "inspector.depth", { min: 0.01 }),
      numberField("bevel", "inspector.bevel", { min: 0, max: 1 }),
    ],
  },
  sphere: {
    kind: "sphere",
    labelKey: "scene.sphere",
    fields: [
      numberField("radius", "inspector.radius", { min: 0.01 }),
      numberField("widthSegments", "inspector.widthSegments", { min: 8, max: 128, step: 1, integer: true }),
      numberField("heightSegments", "inspector.heightSegments", { min: 6, max: 128, step: 1, integer: true }),
    ],
  },
  cylinder: {
    kind: "cylinder",
    labelKey: "scene.cylinder",
    fields: [
      numberField("radiusTop", "inspector.radiusTop", { min: 0 }),
      numberField("radiusBottom", "inspector.radiusBottom", { min: 0.01 }),
      numberField("height", "inspector.height", { min: 0.01 }),
      numberField("radialSegments", "inspector.radialSegments", { min: 3, max: 128, step: 1, integer: true }),
      booleanField("openEnded", "inspector.openEnded"),
    ],
  },
  cone: {
    kind: "cone",
    labelKey: "scene.cone",
    fields: [
      numberField("radius", "inspector.radius", { min: 0.01 }),
      numberField("height", "inspector.height", { min: 0.01 }),
      numberField("radialSegments", "inspector.radialSegments", { min: 3, max: 128, step: 1, integer: true }),
    ],
  },
  torus: {
    kind: "torus",
    labelKey: "scene.torus",
    fields: [
      numberField("radius", "inspector.mainRadius", { min: 0.01 }),
      numberField("tube", "inspector.tubeRadius", { min: 0.005 }),
      numberField("radialSegments", "inspector.radialSegments", { min: 3, max: 64, step: 1, integer: true }),
      numberField("tubularSegments", "inspector.tubularSegments", { min: 8, max: 256, step: 1, integer: true }),
    ],
  },
  capsule: {
    kind: "capsule",
    labelKey: "scene.capsule",
    fields: [
      numberField("radius", "inspector.radius", { min: 0.01 }),
      numberField("length", "inspector.length", { min: 0.01 }),
      numberField("capSegments", "inspector.capSegments", { min: 2, max: 32, step: 1, integer: true }),
      numberField("radialSegments", "inspector.radialSegments", { min: 3, max: 64, step: 1, integer: true }),
    ],
  },
  plane: {
    kind: "plane",
    labelKey: "scene.plane",
    fields: [
      numberField("width", "inspector.width", { min: 0.01 }),
      numberField("height", "inspector.height", { min: 0.01 }),
    ],
  },
};

const commonCapabilities = ["select", "transform", "patch", "duplicate", "delete"] as const;

export const NODE_DEFINITIONS: Record<SceneNode["type"], NodeDefinition> = {
  mesh: {
    type: "mesh",
    labelKey: "node.mesh",
    capabilities: commonCapabilities,
    geometryKinds: Object.keys(GEOMETRY_DEFINITIONS) as GeometrySpec["kind"][],
  },
  group: {
    type: "group",
    labelKey: "node.group",
    capabilities: commonCapabilities,
  },
  light: {
    type: "light",
    labelKey: "node.light",
    capabilities: commonCapabilities,
  },
};

export function getNodeDefinition(type: SceneNode["type"]): NodeDefinition {
  return NODE_DEFINITIONS[type];
}

export function getGeometryDefinition(kind: GeometrySpec["kind"]): GeometryDefinition {
  return GEOMETRY_DEFINITIONS[kind];
}

export function estimateGeometryTriangles(geometry: GeometrySpec): number {
  switch (geometry.kind) {
    case "box":
      return 12;
    case "sphere":
      return geometry.widthSegments * geometry.heightSegments * 2;
    case "cylinder":
      return geometry.radialSegments * (geometry.openEnded ? 2 : 4);
    case "cone":
      return geometry.radialSegments * 4;
    case "torus":
      return geometry.radialSegments * geometry.tubularSegments * 2;
    case "capsule":
      return geometry.radialSegments * (geometry.capSegments * 2 + 2);
    case "plane":
      return 2;
  }
}

export function describeNodeDefinitionsForAi() {
  return Object.values(NODE_DEFINITIONS).map((definition) => ({
    type: definition.type,
    labelKey: definition.labelKey,
    capabilities: definition.capabilities,
    geometryKinds: definition.geometryKinds,
    fields: definition.type === "mesh"
      ? Object.values(GEOMETRY_DEFINITIONS).map((geometry) => ({
        kind: geometry.kind,
        fields: geometry.fields.map(({ key, kind, min, max, step, integer }) => ({ key, kind, min, max, step, integer })),
      }))
      : undefined,
  }));
}
