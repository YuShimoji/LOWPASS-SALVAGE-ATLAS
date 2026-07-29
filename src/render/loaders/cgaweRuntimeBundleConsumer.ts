import {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Scene,
  type Group,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export const CGAWE_RUNTIME_BUNDLE_CONTRACT_VERSION =
  "cgawe-runtime-bundle-1.0.0";
export const CGAWE_RUNTIME_BUNDLE_MANIFEST_SCHEMA_VERSION = "1.0.0";

export type CgaweRuntimeBundleRights =
  | {
      readonly status: "NOASSERTION";
      readonly notice: string;
      readonly licenseId?: string;
    }
  | {
      readonly status: "DECLARED";
      readonly notice: string;
      readonly licenseId: string;
    };

export interface CgaweRuntimeBundleIdentity {
  readonly expectedManifestSha256: string;
  readonly manifestFileName: string;
  readonly glbFileName: string;
}

export interface CgaweRuntimeBundleInput {
  readonly manifest: string | Uint8Array;
  readonly glb: Uint8Array;
  readonly identity: CgaweRuntimeBundleIdentity;
}

export interface CgaweRuntimeBundleNodeMapEntry {
  readonly stableId: string;
  readonly glbNodeName: string;
  readonly kind: string;
  readonly sourceId: string;
}

export interface CgaweRuntimeBundleCounts {
  readonly nodes: number;
  readonly meshes: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly materials: number;
  readonly sceneInstances: number;
  readonly placements: number;
  readonly splines: number;
  readonly rooms: number;
  readonly sockets: number;
}

export interface CgaweRuntimeBundleManifest {
  readonly contractVersion: typeof CGAWE_RUNTIME_BUNDLE_CONTRACT_VERSION;
  readonly manifestSchemaVersion: typeof CGAWE_RUNTIME_BUNDLE_MANIFEST_SCHEMA_VERSION;
  readonly projectId: string;
  readonly coordinateSystem: {
    readonly handedness: "right";
    readonly upAxis: "+Y";
    readonly forwardAxis: "-Z";
    readonly unit: "meter";
    readonly rotationUnit: "radian";
  };
  readonly files: {
    readonly glb: {
      readonly name: string;
      readonly mediaType: "model/gltf-binary";
      readonly bytes: number;
      readonly sha256: string;
    };
    readonly manifest: {
      readonly name: string;
      readonly mediaType: "application/json";
    };
  };
  readonly nodeMap: readonly CgaweRuntimeBundleNodeMapEntry[];
  readonly counts: CgaweRuntimeBundleCounts;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly rights: CgaweRuntimeBundleRights;
}

export type CgaweRuntimeBundleErrorStage =
  | "pre-parse"
  | "parse"
  | "post-parse"
  | "attachment";

export type CgaweRuntimeBundleErrorCode =
  | "CGAWE_MANIFEST_JSON_INVALID"
  | "CGAWE_MANIFEST_OBJECT_REQUIRED"
  | "CGAWE_CONTRACT_VERSION_UNSUPPORTED"
  | "CGAWE_MANIFEST_SCHEMA_VERSION_UNSUPPORTED"
  | "CGAWE_COORDINATE_SYSTEM_INVALID"
  | "CGAWE_MANIFEST_SHA256_MISMATCH"
  | "CGAWE_MANIFEST_FILE_DECLARATION_INVALID"
  | "CGAWE_GLB_FILE_NAME_MISMATCH"
  | "CGAWE_GLB_MEDIA_TYPE_INVALID"
  | "CGAWE_GLB_BYTE_COUNT_MISMATCH"
  | "CGAWE_GLB_SHA256_MISMATCH"
  | "CGAWE_RIGHTS_STATUS_INVALID"
  | "CGAWE_RIGHTS_NOTICE_INVALID"
  | "CGAWE_RIGHTS_LICENSE_ID_REQUIRED"
  | "CGAWE_RIGHTS_LICENSE_ID_INVALID"
  | "CGAWE_NODE_MAP_INVALID"
  | "CGAWE_STABLE_ID_INVALID"
  | "CGAWE_STABLE_ID_DUPLICATE"
  | "CGAWE_GLB_NODE_NAME_INVALID"
  | "CGAWE_GLB_NODE_NAME_DUPLICATE"
  | "CGAWE_COUNTS_INVALID"
  | "CGAWE_BOUNDS_INVALID"
  | "CGAWE_GLTF_PARSE_FAILED"
  | "CGAWE_GLB_NODE_REFERENCE_MISSING"
  | "CGAWE_GLB_NODE_REFERENCE_AMBIGUOUS"
  | "CGAWE_PARSED_MESH_COUNT_MISMATCH"
  | "CGAWE_PARSED_TRIANGLE_COUNT_MISMATCH"
  | "CGAWE_NON_FINITE_RUNTIME_DATA"
  | "CGAWE_ATTACHMENT_STATE_INVALID";

export interface CgaweResourceDisposalResult {
  readonly geometries: number;
  readonly materials: number;
  readonly detached: boolean;
  readonly alreadyDisposed: boolean;
}

export class CgaweRuntimeBundleConsumerError extends Error {
  readonly code: CgaweRuntimeBundleErrorCode;
  readonly stage: CgaweRuntimeBundleErrorStage;
  readonly disposal: CgaweResourceDisposalResult | undefined;

  constructor(
    code: CgaweRuntimeBundleErrorCode,
    stage: CgaweRuntimeBundleErrorStage,
    message: string,
    disposal?: CgaweResourceDisposalResult,
  ) {
    super(message);
    this.name = "CgaweRuntimeBundleConsumerError";
    this.code = code;
    this.stage = stage;
    this.disposal = disposal;
  }
}

export interface PreparedCgaweRuntimeBundle {
  readonly manifest: CgaweRuntimeBundleManifest;
  readonly root: Group;
  readonly rights: CgaweRuntimeBundleRights;
  readonly manifestSha256: string;
  readonly glbSha256: string;
  readonly resolvedStableIds: ReadonlyMap<string, Object3D>;
  readonly parsedNodeCount: number;
  readonly parsedMeshCount: number;
  readonly parsedTriangleCount: number;
}

export type CgaweRuntimeBundleParser = (glb: ArrayBuffer) => Promise<GLTF>;

interface PreparedLifecycle {
  attachedScene: Scene | undefined;
  disposed: boolean;
}

const preparedLifecycles = new WeakMap<
  PreparedCgaweRuntimeBundle,
  PreparedLifecycle
>();

const COUNT_KEYS = [
  "nodes",
  "meshes",
  "vertices",
  "triangles",
  "materials",
  "sceneInstances",
  "placements",
  "splines",
  "rooms",
  "sockets",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  code: CgaweRuntimeBundleErrorCode,
  stage: CgaweRuntimeBundleErrorStage,
  message: string,
  disposal?: CgaweResourceDisposalResult,
): never {
  throw new CgaweRuntimeBundleConsumerError(code, stage, message, disposal);
}

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string"
    ? new TextEncoder().encode(input)
    : Uint8Array.from(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export async function computeCgaweSha256(
  input: string | Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(toBytes(input)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function parseManifest(bytes: Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(
      "CGAWE_MANIFEST_JSON_INVALID",
      "pre-parse",
      "Runtime Bundle manifest must be valid UTF-8 JSON.",
    );
  }
  if (!isRecord(parsed)) {
    fail(
      "CGAWE_MANIFEST_OBJECT_REQUIRED",
      "pre-parse",
      "Runtime Bundle manifest must be a JSON object.",
    );
  }
  return parsed;
}

function validateCoordinateSystem(value: unknown): void {
  if (
    !isRecord(value) ||
    value.handedness !== "right" ||
    value.upAxis !== "+Y" ||
    value.forwardAxis !== "-Z" ||
    value.unit !== "meter" ||
    value.rotationUnit !== "radian"
  ) {
    fail(
      "CGAWE_COORDINATE_SYSTEM_INVALID",
      "pre-parse",
      "Runtime Bundle coordinate system must be right-handed, +Y up, -Z forward, meters and radians.",
    );
  }
}

function validateFiles(
  value: unknown,
  identity: CgaweRuntimeBundleIdentity,
): {
  glb: Record<string, unknown>;
  manifest: Record<string, unknown>;
} {
  if (
    !isRecord(value) ||
    !isRecord(value.glb) ||
    !isRecord(value.manifest)
  ) {
    fail(
      "CGAWE_MANIFEST_FILE_DECLARATION_INVALID",
      "pre-parse",
      "Runtime Bundle files declaration is missing.",
    );
  }
  if (
    value.manifest.name !== identity.manifestFileName ||
    value.manifest.mediaType !== "application/json"
  ) {
    fail(
      "CGAWE_MANIFEST_FILE_DECLARATION_INVALID",
      "pre-parse",
      "Runtime Bundle manifest file declaration does not match the supplied manifest.",
    );
  }
  if (value.glb.name !== identity.glbFileName) {
    fail(
      "CGAWE_GLB_FILE_NAME_MISMATCH",
      "pre-parse",
      "Runtime Bundle GLB filename does not match the supplied GLB.",
    );
  }
  if (value.glb.mediaType !== "model/gltf-binary") {
    fail(
      "CGAWE_GLB_MEDIA_TYPE_INVALID",
      "pre-parse",
      "Runtime Bundle GLB media type must be model/gltf-binary.",
    );
  }
  return { glb: value.glb, manifest: value.manifest };
}

function validateRights(value: unknown): CgaweRuntimeBundleRights {
  if (!isRecord(value)) {
    fail(
      "CGAWE_RIGHTS_STATUS_INVALID",
      "pre-parse",
      "Runtime Bundle rights declaration must be an object.",
    );
  }
  if (value.status !== "NOASSERTION" && value.status !== "DECLARED") {
    fail(
      "CGAWE_RIGHTS_STATUS_INVALID",
      "pre-parse",
      "Runtime Bundle rights status is unsupported.",
    );
  }
  if (typeof value.notice !== "string" || !/\S/u.test(value.notice)) {
    fail(
      "CGAWE_RIGHTS_NOTICE_INVALID",
      "pre-parse",
      "Runtime Bundle rights notice must contain a non-whitespace character.",
    );
  }
  if (value.licenseId !== undefined) {
    if (typeof value.licenseId !== "string" || !/\S/u.test(value.licenseId)) {
      fail(
        "CGAWE_RIGHTS_LICENSE_ID_INVALID",
        "pre-parse",
        "Runtime Bundle rights license ID must contain a non-whitespace character.",
      );
    }
  }
  if (value.status === "DECLARED" && value.licenseId === undefined) {
    fail(
      "CGAWE_RIGHTS_LICENSE_ID_REQUIRED",
      "pre-parse",
      "DECLARED Runtime Bundle rights require a license ID.",
    );
  }
  if (value.status === "DECLARED") {
    return {
      status: value.status,
      notice: value.notice,
      licenseId: value.licenseId as string,
    };
  }
  return value.licenseId === undefined
    ? { status: value.status, notice: value.notice }
    : {
        status: value.status,
        notice: value.notice,
        licenseId: value.licenseId as string,
      };
}

function validateNodeMap(value: unknown): CgaweRuntimeBundleNodeMapEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      "CGAWE_NODE_MAP_INVALID",
      "pre-parse",
      "Runtime Bundle nodeMap must be a non-empty array.",
    );
  }
  const stableIds = new Set<string>();
  const glbNodeNames = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      fail(
        "CGAWE_NODE_MAP_INVALID",
        "pre-parse",
        `Runtime Bundle nodeMap entry ${index} must be an object.`,
      );
    }
    if (typeof entry.stableId !== "string" || entry.stableId.length === 0) {
      fail(
        "CGAWE_STABLE_ID_INVALID",
        "pre-parse",
        `Runtime Bundle nodeMap entry ${index} has an invalid Stable ID.`,
      );
    }
    if (stableIds.has(entry.stableId)) {
      fail(
        "CGAWE_STABLE_ID_DUPLICATE",
        "pre-parse",
        `Runtime Bundle Stable ID ${entry.stableId} is duplicated.`,
      );
    }
    stableIds.add(entry.stableId);
    if (
      typeof entry.glbNodeName !== "string" ||
      entry.glbNodeName.length === 0
    ) {
      fail(
        "CGAWE_GLB_NODE_NAME_INVALID",
        "pre-parse",
        `Runtime Bundle nodeMap entry ${index} has an invalid GLB node name.`,
      );
    }
    if (glbNodeNames.has(entry.glbNodeName)) {
      fail(
        "CGAWE_GLB_NODE_NAME_DUPLICATE",
        "pre-parse",
        `Runtime Bundle GLB node name ${entry.glbNodeName} is duplicated.`,
      );
    }
    glbNodeNames.add(entry.glbNodeName);
    if (typeof entry.kind !== "string" || typeof entry.sourceId !== "string") {
      fail(
        "CGAWE_NODE_MAP_INVALID",
        "pre-parse",
        `Runtime Bundle nodeMap entry ${index} is incomplete.`,
      );
    }
    return {
      stableId: entry.stableId,
      glbNodeName: entry.glbNodeName,
      kind: entry.kind,
      sourceId: entry.sourceId,
    };
  });
}

function validateCounts(
  value: unknown,
  nodeMapLength: number,
): CgaweRuntimeBundleCounts {
  if (!isRecord(value)) {
    fail(
      "CGAWE_COUNTS_INVALID",
      "pre-parse",
      "Runtime Bundle counts must be an object.",
    );
  }
  for (const key of COUNT_KEYS) {
    const count = value[key];
    if (!Number.isInteger(count) || (count as number) < 0) {
      fail(
        "CGAWE_COUNTS_INVALID",
        "pre-parse",
        `Runtime Bundle count ${key} must be a non-negative integer.`,
      );
    }
  }
  if (value.nodes !== nodeMapLength) {
    fail(
      "CGAWE_COUNTS_INVALID",
      "pre-parse",
      "Runtime Bundle declared node count must match nodeMap length.",
    );
  }
  return value as unknown as CgaweRuntimeBundleCounts;
}

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function validateBounds(
  value: unknown,
): CgaweRuntimeBundleManifest["bounds"] {
  if (!isRecord(value) || !isFiniteVec3(value.min) || !isFiniteVec3(value.max)) {
    fail(
      "CGAWE_BOUNDS_INVALID",
      "pre-parse",
      "Runtime Bundle bounds must contain finite min and max vectors.",
    );
  }
  const min = value.min;
  const max = value.max;
  if (min.some((component, index) => component > max[index]!)) {
    fail(
      "CGAWE_BOUNDS_INVALID",
      "pre-parse",
      "Runtime Bundle bounds min must not exceed max.",
    );
  }
  return { min, max };
}

async function validateBeforeParse(
  input: CgaweRuntimeBundleInput,
): Promise<{
  manifest: CgaweRuntimeBundleManifest;
  manifestSha256: string;
  glbSha256: string;
}> {
  const manifestBytes = toBytes(input.manifest);
  const parsed = parseManifest(manifestBytes);
  if (parsed.contractVersion !== CGAWE_RUNTIME_BUNDLE_CONTRACT_VERSION) {
    fail(
      "CGAWE_CONTRACT_VERSION_UNSUPPORTED",
      "pre-parse",
      "Runtime Bundle contract version is unsupported.",
    );
  }
  if (
    parsed.manifestSchemaVersion !==
    CGAWE_RUNTIME_BUNDLE_MANIFEST_SCHEMA_VERSION
  ) {
    fail(
      "CGAWE_MANIFEST_SCHEMA_VERSION_UNSUPPORTED",
      "pre-parse",
      "Runtime Bundle manifest schema version is unsupported.",
    );
  }
  validateCoordinateSystem(parsed.coordinateSystem);
  const manifestSha256 = await computeCgaweSha256(manifestBytes);
  if (manifestSha256 !== input.identity.expectedManifestSha256) {
    fail(
      "CGAWE_MANIFEST_SHA256_MISMATCH",
      "pre-parse",
      "Runtime Bundle manifest SHA-256 does not match the external identity binding.",
    );
  }
  const files = validateFiles(parsed.files, input.identity);
  if (files.glb.bytes !== input.glb.byteLength) {
    fail(
      "CGAWE_GLB_BYTE_COUNT_MISMATCH",
      "pre-parse",
      "Runtime Bundle GLB byte count does not match the supplied bytes.",
    );
  }
  const glbSha256 = await computeCgaweSha256(input.glb);
  if (files.glb.sha256 !== glbSha256) {
    fail(
      "CGAWE_GLB_SHA256_MISMATCH",
      "pre-parse",
      "Runtime Bundle GLB SHA-256 does not match the supplied bytes.",
    );
  }
  const rights = validateRights(parsed.rights);
  const nodeMap = validateNodeMap(parsed.nodeMap);
  const counts = validateCounts(parsed.counts, nodeMap.length);
  const bounds = validateBounds(parsed.bounds);
  if (typeof parsed.projectId !== "string" || parsed.projectId.length === 0) {
    fail(
      "CGAWE_MANIFEST_OBJECT_REQUIRED",
      "pre-parse",
      "Runtime Bundle project ID must be non-empty.",
    );
  }
  return {
    manifest: {
      contractVersion: parsed.contractVersion,
      manifestSchemaVersion: parsed.manifestSchemaVersion,
      projectId: parsed.projectId,
      coordinateSystem:
        parsed.coordinateSystem as CgaweRuntimeBundleManifest["coordinateSystem"],
      files: parsed.files as CgaweRuntimeBundleManifest["files"],
      nodeMap,
      counts,
      bounds,
      rights,
    },
    manifestSha256,
    glbSha256,
  };
}

function countTriangles(geometry: BufferGeometry): number {
  if (geometry.index !== null) {
    return geometry.index.count / 3;
  }
  const position = geometry.getAttribute("position");
  return position === undefined ? 0 : position.count / 3;
}

function validateFiniteGeometry(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  if (position !== undefined) {
    for (let index = 0; index < position.count; index += 1) {
      if (
        !Number.isFinite(position.getX(index)) ||
        !Number.isFinite(position.getY(index)) ||
        !Number.isFinite(position.getZ(index))
      ) {
        fail(
          "CGAWE_NON_FINITE_RUNTIME_DATA",
          "post-parse",
          "Parsed Runtime Bundle geometry contains a non-finite position.",
        );
      }
    }
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (
    bounds !== null &&
    ![
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
    ].every(Number.isFinite)
  ) {
    fail(
      "CGAWE_NON_FINITE_RUNTIME_DATA",
      "post-parse",
      "Parsed Runtime Bundle geometry bounds are non-finite.",
    );
  }
}

function inspectParsedGraph(
  root: Group,
  manifest: CgaweRuntimeBundleManifest,
): {
  resolvedStableIds: ReadonlyMap<string, Object3D>;
  parsedNodeCount: number;
  parsedMeshCount: number;
  parsedTriangleCount: number;
} {
  const names = new Map<string, Object3D[]>();
  let parsedNodeCount = 0;
  let parsedMeshCount = 0;
  let parsedTriangleCount = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    parsedNodeCount += 1;
    if (object.name.length > 0) {
      const matches = names.get(object.name) ?? [];
      matches.push(object);
      names.set(object.name, matches);
    }
    if (
      ![
        object.position.x,
        object.position.y,
        object.position.z,
        object.quaternion.x,
        object.quaternion.y,
        object.quaternion.z,
        object.quaternion.w,
        object.scale.x,
        object.scale.y,
        object.scale.z,
        ...object.matrix.elements,
        ...object.matrixWorld.elements,
      ].every(Number.isFinite)
    ) {
      fail(
        "CGAWE_NON_FINITE_RUNTIME_DATA",
        "post-parse",
        "Parsed Runtime Bundle graph contains a non-finite transform.",
      );
    }
    if (object instanceof Mesh) {
      parsedMeshCount += 1;
      validateFiniteGeometry(object.geometry);
      parsedTriangleCount += countTriangles(object.geometry);
    }
  });
  const resolvedStableIds = new Map<string, Object3D>();
  for (const entry of manifest.nodeMap) {
    const matches = names.get(entry.glbNodeName) ?? [];
    if (matches.length === 0) {
      fail(
        "CGAWE_GLB_NODE_REFERENCE_MISSING",
        "post-parse",
        `Runtime Bundle GLB node ${entry.glbNodeName} is missing.`,
      );
    }
    if (matches.length !== 1) {
      fail(
        "CGAWE_GLB_NODE_REFERENCE_AMBIGUOUS",
        "post-parse",
        `Runtime Bundle GLB node ${entry.glbNodeName} is ambiguous.`,
      );
    }
    resolvedStableIds.set(entry.stableId, matches[0]!);
  }
  if (parsedMeshCount !== manifest.counts.meshes) {
    fail(
      "CGAWE_PARSED_MESH_COUNT_MISMATCH",
      "post-parse",
      "Parsed Runtime Bundle mesh count does not match the manifest.",
    );
  }
  if (parsedTriangleCount !== manifest.counts.triangles) {
    fail(
      "CGAWE_PARSED_TRIANGLE_COUNT_MISMATCH",
      "post-parse",
      "Parsed Runtime Bundle triangle count does not match the manifest.",
    );
  }
  return {
    resolvedStableIds,
    parsedNodeCount,
    parsedMeshCount,
    parsedTriangleCount,
  };
}

function disposeRoot(
  root: Object3D,
  detached: boolean,
  alreadyDisposed: boolean,
): CgaweResourceDisposalResult {
  if (alreadyDisposed) {
    return { geometries: 0, materials: 0, detached, alreadyDisposed: true };
  }
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  return {
    geometries: geometries.size,
    materials: materials.size,
    detached,
    alreadyDisposed: false,
  };
}

async function defaultParser(glb: ArrayBuffer): Promise<GLTF> {
  return new GLTFLoader().parseAsync(glb, "");
}

export class CgaweRuntimeBundleConsumer {
  readonly #parse: CgaweRuntimeBundleParser;

  constructor(parse: CgaweRuntimeBundleParser = defaultParser) {
    this.#parse = parse;
  }

  async prepare(
    input: CgaweRuntimeBundleInput,
  ): Promise<PreparedCgaweRuntimeBundle> {
    const validated = await validateBeforeParse(input);
    let gltf: GLTF;
    try {
      gltf = await this.#parse(toArrayBuffer(input.glb));
    } catch {
      fail(
        "CGAWE_GLTF_PARSE_FAILED",
        "parse",
        "Runtime Bundle GLB parsing failed.",
        { geometries: 0, materials: 0, detached: false, alreadyDisposed: false },
      );
    }
    let inspection: ReturnType<typeof inspectParsedGraph>;
    try {
      inspection = inspectParsedGraph(gltf.scene, validated.manifest);
    } catch (error) {
      const disposal = disposeRoot(gltf.scene, false, false);
      if (error instanceof CgaweRuntimeBundleConsumerError) {
        fail(error.code, error.stage, error.message, disposal);
      }
      throw error;
    }
    const prepared: PreparedCgaweRuntimeBundle = Object.freeze({
      manifest: validated.manifest,
      root: gltf.scene,
      rights: validated.manifest.rights,
      manifestSha256: validated.manifestSha256,
      glbSha256: validated.glbSha256,
      resolvedStableIds: inspection.resolvedStableIds,
      parsedNodeCount: inspection.parsedNodeCount,
      parsedMeshCount: inspection.parsedMeshCount,
      parsedTriangleCount: inspection.parsedTriangleCount,
    });
    preparedLifecycles.set(prepared, {
      attachedScene: undefined,
      disposed: false,
    });
    return prepared;
  }
}

function getLifecycle(
  prepared: PreparedCgaweRuntimeBundle,
): PreparedLifecycle {
  const lifecycle = preparedLifecycles.get(prepared);
  if (lifecycle === undefined) {
    fail(
      "CGAWE_ATTACHMENT_STATE_INVALID",
      "attachment",
      "Prepared Runtime Bundle was not created by this consumer.",
    );
  }
  return lifecycle;
}

export function attachPreparedCgaweRuntimeBundle(
  destination: Scene,
  prepared: PreparedCgaweRuntimeBundle,
): void {
  const lifecycle = getLifecycle(prepared);
  if (lifecycle.disposed || lifecycle.attachedScene !== undefined) {
    fail(
      "CGAWE_ATTACHMENT_STATE_INVALID",
      "attachment",
      "Prepared Runtime Bundle cannot be attached more than once or after disposal.",
    );
  }
  destination.add(prepared.root);
  lifecycle.attachedScene = destination;
}

export function disposePreparedCgaweRuntimeBundle(
  prepared: PreparedCgaweRuntimeBundle,
): CgaweResourceDisposalResult {
  const lifecycle = getLifecycle(prepared);
  if (lifecycle.disposed) {
    return disposeRoot(prepared.root, false, true);
  }
  const attachedScene = lifecycle.attachedScene;
  const detached =
    attachedScene !== undefined && prepared.root.parent === attachedScene;
  if (detached) {
    attachedScene.remove(prepared.root);
  }
  lifecycle.attachedScene = undefined;
  lifecycle.disposed = true;
  return disposeRoot(prepared.root, detached, false);
}
