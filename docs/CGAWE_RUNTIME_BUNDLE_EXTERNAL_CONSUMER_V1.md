# CGAWE Runtime Bundle external consumer v1

最終更新: 2026-07-30 JST

## 現在の状態

LOWPASS内に、CodexGameAssetWorkbench（CGAWE）から独立したThree.js Runtime Bundle consumerを実装しました。現在の技術分類は **`CGAWE_RB_C1_LOWPASS_EXTERNAL_CONSUMER_REMOTE_GREEN`** です。

- Target base: `c5ae3b9a168eb81c41886aab93699980be4c90df`
- Target branch: `codex/cgawe-runtime-bundle-external-consumer-v1`
- Implementation / evidence commit: `6daa4663e3085cfb1a46902e3cbffb3adbf9b24f`
- CI boundary repair tips: `d3a4879d6dca85898fddb765f11af9f8670c435f`、`1f6f9648bf8d3d28785163d52e8ab6d322155dc7`
- Exact producer commit: `831bdf587d26f74964f8d8a90f178f93e7213e54`
- Implementation CI: run `30478074956`、job `90664715213`、success
- Contract / manifest schema: `cgawe-runtime-bundle-1.0.0` / `1.0.0`

このconsumerは通常のgame startupへ接続されていません。`src/main.ts`、`RenderSystem`、ship interior、physics、missions、saves、UI、audio、controls、primitive sceneは変更していません。

## External input

`CgaweRuntimeBundleConsumer.prepare`は以下を受け取ります。

- manifestのexact UTF-8 bytesまたはtext
- GLB bytes
- external identity binding
  - expected manifest SHA-256
  - supplied manifest filename
  - supplied GLB filename

consumerはWorkbench source、package、Recipe、schema実装、generatorをimportしません。GLB、manifest、schema、Recipe、screenshotをLOWPASSへcopyまたはvendorしません。

proof commandは環境変数`CGAWE_WORKBENCH_ROOT`が指す外部checkoutをread-onlyで使います。checkoutの`HEAD`がexact producer commitでない場合は失敗し、target-local fallback、`latest` download、暗黙cloneは行いません。

## Validation and attachment boundary

`GLTFLoader.parseAsync`より前に次を検証します。

1. manifestがUTF-8 JSON object
2. contract versionが`cgawe-runtime-bundle-1.0.0`
3. manifest schema versionが`1.0.0`
4. coordinate systemがright-handed、`+Y` up、`-Z` forward、meter、radian
5. external identityのmanifest SHA-256とactual manifest bytesが一致
6. manifest/GLB filename、media type、GLB bytes、GLB SHA-256がsupplied inputと一致
7. rights statusが`NOASSERTION`または`DECLARED`
8. noticeがnon-whitespace
9. `DECLARED`のlicense IDがnon-whitespace
10. Stable IDとGLB node nameがnon-emptyかつunique
11. declared countsとboundsがvalidかつfinite

malformed valueはtrim、repair、infer、downgrade、substituteしません。pre-parse failureはstable consumer error codeを返し、GLTF parser invocationは0です。

actual GLB parse後かつScene attachment前に次を確認します。

- 全`nodeMap.glbNodeName`がparsed graph内で一意に解決
- actual mesh countとtriangle countがmanifestと一致
- object transforms、geometry positions、geometry boundsがfinite

`prepare`の成功結果はdetached Three.js root、rights、hash、parsed counts、Stable ID mapを持ちます。Scene mutationは`attachPreparedCgaweRuntimeBundle`を明示的に呼んだ場合だけ発生し、同じprepared resultの二重attachmentは拒否します。

## Lifecycle ownership

consumerがdisposeするのは、consumer自身がparseしてprepared root配下で所有するgeometryとmaterialだけです。

- post-parse validation failure: rootをattachせず、owned resourcesをdispose
- successful attachment後のdispose: exact rootだけをdetachし、owned resourcesをdispose
- repeated dispose: idempotent、追加dispose 0
- unrelated caller Scene child、geometry、material: 保持

raw parser failureでrootが返らない場合はattachment 0、owned disposal count 0として記録します。

## Exact cross-repository evidence

| Case | Manifest SHA-256 | GLB SHA-256 | Rights | Declared nodes / meshes / triangles | Parsed nodes / meshes / triangles | Stable IDs | Attach | Dispose geometry / material |
|---|---|---|---|---:|---:|---:|---:|---:|
| Starter | `9378e8cb…160c` | `5b39c86b…437ea` | `NOASSERTION` | 41 / 26 / 2720 | 42 / 26 / 2720 | 41 | 1 | 26 / 26 |
| Paper Glider generic | `b8cbaee3…3cc99` | `27e13b5e…d12fe` | `NOASSERTION` | 13 / 8 / 1064 | 14 / 8 / 1064 | 13 | 1 | 8 / 8 |

両caseとも二重attachmentを拒否し、sentinelとcaller-owned resourcesを保持し、repeated disposalで追加resourceをdisposeしません。

## Negative evidence

| Case | Stable error code | Parser | Attach | Sentinel | Owned disposal geometry / material |
|---|---|---:|---:|---|---:|
| unknown contract version | `CGAWE_CONTRACT_VERSION_UNSUPPORTED` | 0 | 0 | preserved | 0 / 0 |
| unknown manifest schema version | `CGAWE_MANIFEST_SCHEMA_VERSION_UNSUPPORTED` | 0 | 0 | preserved | 0 / 0 |
| manifest SHA mismatch | `CGAWE_MANIFEST_SHA256_MISMATCH` | 0 | 0 | preserved | 0 / 0 |
| GLB byte-count mismatch | `CGAWE_GLB_BYTE_COUNT_MISMATCH` | 0 | 0 | preserved | 0 / 0 |
| GLB hash mismatch | `CGAWE_GLB_SHA256_MISMATCH` | 0 | 0 | preserved | 0 / 0 |
| unknown rights status | `CGAWE_RIGHTS_STATUS_INVALID` | 0 | 0 | preserved | 0 / 0 |
| blank rights notice | `CGAWE_RIGHTS_NOTICE_INVALID` | 0 | 0 | preserved | 0 / 0 |
| `DECLARED` missing license ID | `CGAWE_RIGHTS_LICENSE_ID_REQUIRED` | 0 | 0 | preserved | 0 / 0 |
| `DECLARED` blank license ID | `CGAWE_RIGHTS_LICENSE_ID_INVALID` | 0 | 0 | preserved | 0 / 0 |
| duplicate Stable ID | `CGAWE_STABLE_ID_DUPLICATE` | 0 | 0 | preserved | 0 / 0 |
| duplicate GLB node name | `CGAWE_GLB_NODE_NAME_DUPLICATE` | 0 | 0 | preserved | 0 / 0 |
| missing GLB node reference | `CGAWE_GLB_NODE_REFERENCE_MISSING` | 1 | 0 | preserved | 26 / 26 |
| malformed GLB | `CGAWE_GLTF_PARSE_FAILED` | 1 | 0 | preserved | 0 / 0 |

全negative sequence後、Starterを同じconsumer/parser processで再度prepare、attach、disposeし、parser 1、attachment 1、sentinel preserved、owned disposal 26 / 26でrecoveryしました。

## Deterministic readback

Machine authority:

`artifacts/cgawe-runtime-bundle-consumer-v1/consumer-readback.json`

- same inputで2回生成したSHA-256: `a5e060b5636f7a3acd9f8e106af019b3d3468aafef256ab2e00234981464f35a`
- timestamps: なし
- username、email、drive letter、absolute path、temporary directory: なし
- producer artifact bytes: 含まない

## Invocation

Local PowerShell:

```powershell
$env:CGAWE_WORKBENCH_ROOT = 'X:\path\to\exact\CodexGameAssetWorkbench'
npm run cgawe:consumer:check
Remove-Item Env:CGAWE_WORKBENCH_ROOT
```

missing environment variableまたは非exact producer commitはprecise errorでexit 1になります。

`.github/workflows/verify.yml`はpushされた`main`と`codex/**`で次を実行します。

- Windows latest
- Node 24.13.0
- locked target dependency installation
- target dependency tree
- target typecheck、full tests、build
- exact producer second checkout
- external consumer proof
- whitespace validation

second checkoutは`External Sources/CodexGameAssetWorkbench`に固定し、target Vitestから明示除外します。producer build、producer test、browser、screenshot、deployment、release、artifact publicationは実行しません。

## Rights and claim boundary

`NOASSERTION`は構造的loadを許すstatusであり、public domain、redistributable、approved、配布許諾を意味しません。実在rightsの判断はRights ownerの独立gateです。

このsliceが証明するのは、exact producer artifactに対する **repository-external Three.js consumer conformance** だけです。以下は証明していません。

- cross-engine portability
- production game-scene integration
- gameplay、visual、人間acceptance
- real licenseまたはdistribution approval
- target/producerのmain integration
- release、deployment、product completion
