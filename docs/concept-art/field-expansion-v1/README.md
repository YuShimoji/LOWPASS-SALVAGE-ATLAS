# LOWPASS field expansion v1

作成日: 2026-08-04 JST

## 位置づけ

この10枚は、LOWPASSのフィールドを「暗い放棄施設」へ限定しないための都市スケール基準です。正本となる前提は、**人は不在だが、普通の都市建築と設備は必ずしも崩壊していない**ことです。浸水、停電、破損、過成長は個別フィールドの条件であり、世界全体の既定表現ではありません。

生成画像は `CONCEPT_REFERENCE_ONLY` です。ゲームプレイauthority、衝突形状、WorldState、production geometry、texture、release approvalを直接所有しません。

## 共通prompt

> Production concept art for a stylized low-poly 3D browser game set in an uninhabited ordinary city that remains intact rather than uniformly abandoned. Use clear daylight, recognizable everyday architecture, coherent buildable geometry, multiple readable traversal routes, warm varied civic colors, and calm uncanny absence. No crowds, apocalypse clichés, catastrophic destruction, brand logos, readable text, or watermark.

各画像はこの共通promptに、用途固有の建築、移動構造、搬送経路、照明条件を加えてbuilt-in `imagegen` で個別生成しました。

## 10 field prompts

| # | ファイル | 場所 | プレイ空間の差 |
| --- | --- | --- | --- |
| 01 | `01-sunlit-business-district.png` | 晴天の業務地区 | 広場、ロビー、街路樹、長い見通し |
| 02 | `02-open-plan-office.png` | 通常のオフィス階 | 机島の小遮蔽、会議室、server / service奥行き |
| 03 | `03-shopping-mall-atrium.png` | ショッピングモール | 二層回遊、吹抜け、escalator、cart route |
| 04 | `04-elevated-transit-hub.png` | 高架駅・bus結節点 | platform、上下移動、lift、長い直線 |
| 05 | `05-apartment-courtyard.png` | 集合住宅中庭 | 中庭loop、balcony、外階段、屋上庭園 |
| 06 | `06-civic-library.png` | 図書館・学習施設 | 書架視界、吹抜け、reading terrace、staff archive |
| 07 | `07-business-hotel.png` | business hotel | lobby hub、elevator、会議室、反復する客室廊下 |
| 08 | `08-medical-center.png` | 外来医療center | 清潔な分岐廊下、診断bridge、supply搬送 |
| 09 | `09-parking-logistics.png` | 立体駐車場・物流区画 | ramp loop、半屋外視界、freight lift、loading bay |
| 10 | `10-community-campus.png` | 学校・地域campus | courtyard hub、covered route、gym、屋上access |

## Visual rules

- 「無人」は人間の不在で表現し、瓦礫、死体、火災、全面的な暗さへ短絡しない。
- 昼光、空、glass、植栽、暖色舗装、通常照明を積極的に使う。
- office、mall、station、housingなど、用途を遠景silhouetteと家具密度から判別できるようにする。
- cyanはcrew / utility / accessible route、amberはmachine observation / caution、coralは短時間のhostile interventionに限定する。
- fieldごとにroute topologyを変える。palette差だけで別fieldとしない。
- 既存の浸水marketは暗所・浸水fieldの一例であり、本セットの例外ではなく並列variantとして扱う。

## Runtime application order

1. 現行marketの露出、safe-route照明、silhouette separationを改善する。
2. Environment kitを`daylit civic` / `interior utility` / `flooded service`へ分離する。
3. 新field実装時は、この10案から1箇所を選び、navigation、collider、mission contractを先に定義する。
4. Concept imageのpixelをtextureへ直接転用しない。production asset化は別gateとする。
