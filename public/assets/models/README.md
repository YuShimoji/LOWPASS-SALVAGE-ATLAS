# Model drop location

Phase A deliberately uses primitive geometry. Production models should be shipped as `.glb` or glTF 2.0 and addressed through `src/game/content/assetManifest.ts`; filenames are not gameplay APIs.

Keep visual meshes and collision proxies separable. Embedded collision nodes should use a documented naming convention before Phase B asset integration begins.
