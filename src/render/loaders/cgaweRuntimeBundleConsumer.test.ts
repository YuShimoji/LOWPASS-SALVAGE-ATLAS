import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import {
  attachPreparedCgaweRuntimeBundle,
  CgaweRuntimeBundleConsumer,
  CgaweRuntimeBundleConsumerError,
  computeCgaweSha256,
  disposePreparedCgaweRuntimeBundle,
  type CgaweRuntimeBundleInput,
} from "./cgaweRuntimeBundleConsumer";

interface TestManifest {
  contractVersion: string;
  manifestSchemaVersion: string;
  projectId: string;
  coordinateSystem: {
    handedness: string;
    upAxis: string;
    forwardAxis: string;
    unit: string;
    rotationUnit: string;
  };
  files: {
    glb: {
      name: string;
      mediaType: string;
      bytes: number;
      sha256: string;
    };
    manifest: {
      name: string;
      mediaType: string;
    };
  };
  nodeMap: Array<{
    stableId: string;
    glbNodeName: string;
    kind: string;
    sourceId: string;
  }>;
  counts: {
    nodes: number;
    meshes: number;
    vertices: number;
    triangles: number;
    materials: number;
    sceneInstances: number;
    placements: number;
    splines: number;
    rooms: number;
    sockets: number;
  };
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  rights: {
    status: string;
    notice: string;
    licenseId?: string;
  };
}

const GLB_BYTES = new Uint8Array([1, 2, 3, 4]);
const MANIFEST_FILE_NAME = "unit.runtime.manifest.json";
const GLB_FILE_NAME = "unit.runtime.glb";

function makeManifest(): TestManifest {
  return {
    contractVersion: "cgawe-runtime-bundle-1.0.0",
    manifestSchemaVersion: "1.0.0",
    projectId: "unit",
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Y",
      forwardAxis: "-Z",
      unit: "meter",
      rotationUnit: "radian",
    },
    files: {
      glb: {
        name: GLB_FILE_NAME,
        mediaType: "model/gltf-binary",
        bytes: GLB_BYTES.byteLength,
        sha256: "",
      },
      manifest: {
        name: MANIFEST_FILE_NAME,
        mediaType: "application/json",
      },
    },
    nodeMap: [
      {
        stableId: "runtime-root--unit",
        glbNodeName: "runtime-root--unit",
        kind: "root",
        sourceId: "unit",
      },
      {
        stableId: "scene-part--unit",
        glbNodeName: "scene-part--unit",
        kind: "scene-part",
        sourceId: "unit-part",
      },
    ],
    counts: {
      nodes: 2,
      meshes: 1,
      vertices: 24,
      triangles: 12,
      materials: 1,
      sceneInstances: 1,
      placements: 0,
      splines: 0,
      rooms: 0,
      sockets: 0,
    },
    bounds: {
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    },
    rights: {
      status: "NOASSERTION",
      notice: "No license assertion is made by this unit fixture.",
    },
  };
}

async function makeInput(
  manifest: TestManifest,
  glb = GLB_BYTES,
): Promise<CgaweRuntimeBundleInput> {
  manifest.files.glb.bytes = glb.byteLength;
  manifest.files.glb.sha256 = await computeCgaweSha256(glb);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    manifest: manifestText,
    glb,
    identity: {
      expectedManifestSha256: await computeCgaweSha256(manifestText),
      manifestFileName: MANIFEST_FILE_NAME,
      glbFileName: GLB_FILE_NAME,
    },
  };
}

function makeGltf(): GLTF {
  const scene = new Group();
  const runtimeRoot = new Group();
  runtimeRoot.name = "runtime-root--unit";
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.name = "scene-part--unit";
  runtimeRoot.add(mesh);
  scene.add(runtimeRoot);
  return {
    animations: [],
    asset: { version: "2.0" },
    cameras: [],
    parser: {},
    scene,
    scenes: [scene],
    userData: {},
  } as unknown as GLTF;
}

describe("CgaweRuntimeBundleConsumer", () => {
  it("rejects unsupported contracts before invoking the GLTF parser", async () => {
    const manifest = makeManifest();
    manifest.contractVersion = "cgawe-runtime-bundle-9.9.9";
    let parserInvocations = 0;
    const consumer = new CgaweRuntimeBundleConsumer(async () => {
      parserInvocations += 1;
      return makeGltf();
    });

    await expect(consumer.prepare(await makeInput(manifest))).rejects.toMatchObject({
      code: "CGAWE_CONTRACT_VERSION_UNSUPPORTED",
      stage: "pre-parse",
    });
    expect(parserInvocations).toBe(0);
  });

  it("prepares detached content, attaches once and disposes only owned resources", async () => {
    const consumer = new CgaweRuntimeBundleConsumer(async () => makeGltf());
    const prepared = await consumer.prepare(await makeInput(makeManifest()));
    const destination = new Scene();
    const sentinelGeometry = new BoxGeometry(1, 1, 1);
    const sentinelMaterial = new MeshBasicMaterial();
    let sentinelGeometryDisposals = 0;
    let sentinelMaterialDisposals = 0;
    sentinelGeometry.dispose = () => {
      sentinelGeometryDisposals += 1;
    };
    sentinelMaterial.dispose = () => {
      sentinelMaterialDisposals += 1;
    };
    const sentinel = new Mesh(sentinelGeometry, sentinelMaterial);
    destination.add(sentinel);

    expect(prepared.root.parent).toBeNull();
    expect(prepared.rights.status).toBe("NOASSERTION");
    expect(prepared.resolvedStableIds.size).toBe(2);
    expect(prepared.parsedNodeCount).toBe(3);
    attachPreparedCgaweRuntimeBundle(destination, prepared);
    expect(destination.children).toEqual([sentinel, prepared.root]);
    expect(() =>
      attachPreparedCgaweRuntimeBundle(destination, prepared),
    ).toThrowError(
      expect.objectContaining({
        code: "CGAWE_ATTACHMENT_STATE_INVALID",
      }),
    );

    expect(disposePreparedCgaweRuntimeBundle(prepared)).toEqual({
      geometries: 1,
      materials: 1,
      detached: true,
      alreadyDisposed: false,
    });
    expect(destination.children).toEqual([sentinel]);
    expect(disposePreparedCgaweRuntimeBundle(prepared)).toEqual({
      geometries: 0,
      materials: 0,
      detached: false,
      alreadyDisposed: true,
    });
    expect(sentinelGeometryDisposals).toBe(0);
    expect(sentinelMaterialDisposals).toBe(0);
  });

  it("disposes parsed resources when a Stable ID target is missing", async () => {
    const manifest = makeManifest();
    manifest.nodeMap[1]!.glbNodeName = "missing-node";
    const consumer = new CgaweRuntimeBundleConsumer(async () => makeGltf());

    let actual: unknown;
    try {
      await consumer.prepare(await makeInput(manifest));
    } catch (error) {
      actual = error;
    }

    expect(actual).toBeInstanceOf(CgaweRuntimeBundleConsumerError);
    expect(actual).toMatchObject({
      code: "CGAWE_GLB_NODE_REFERENCE_MISSING",
      stage: "post-parse",
      disposal: {
        geometries: 1,
        materials: 1,
        detached: false,
        alreadyDisposed: false,
      },
    });
  });
});
