---
standard_id: FCC-AUTONOMY-STANDARD
standard_version: "1.10.0"
standard_sha256: "706cf5eba7c2eb0893bb4f356b0db5e48290014664248721f96996cd7c08caa1"
project_id: kore-dousuru-nagoya-deploy
risk_profile: STANDARD
autonomy_level: STANDARD
production_requires_human: true
external_auth_required: true
auto_push: false
spec_lock_mode: OBSERVE
behavior_contract: null
generated_by: formation-control-center/scripts/apply_autonomy_standard.py
---

# 自律開発標準 適用宣言（自動生成）

> **このファイルは全体が自動生成である。手で編集しない。**
> 変更は `formation-control-center/config/project-registry.yaml` を直し、
> `scripts/apply_autonomy_standard.py` を再実行して反映する。
> 手動改変は `scripts/audit_autonomy_drift.py` が `FAIL` として検出する。

## 1. 適用対象

| 項目 | 値 |
|---|---|
| project_id | `kore-dousuru-nagoya-deploy` |
| 表示名 | kore-dousuru-nagoya-deploy |
| repository_type | `git` |
| default_branch | `master` |
| remote | あり |
| risk_profile | `STANDARD` |
| デフォルト変更区分 | `STANDARD` |

## 2. 参照する正本

正本は複製しない。`formation-control-center` に 1 箇所だけ存在する。

| 参照先 | 内容 |
|---|---|
| `formation-control-center/docs/autonomy/AUTONOMOUS_DEVELOPMENT_STANDARD.md` | 工程・必須原則・重大停止条件（`standard_version=1.10.0`, `sha256=706cf5eba7c2eb0893bb4f356b0db5e48290014664248721f96996cd7c08caa1`） |
| `formation-control-center/config/project-registry.yaml` | 本プロジェクトの適用プロファイル |
| `development-os/docs/08_自律完遂境界.md` | 上位由来（`DEVOS-CANON-08`） |

本プロジェクトの `CLAUDE.md` には、上記正本から生成した管理ブロックが挿入されている。
`CLAUDE.md` の管理ブロックと本ファイルは、どちらも同じ正本から生成される。

## 3. 変更区分と工程

| 区分 | 工程 |
|---|---|
| LIGHT | `INSPECT → CHANGE → TEST → CLOSE` |
| STANDARD | `INSPECT → PLAN-INTERNALLY → IMPLEMENT → TEST → VERIFY → CLOSE` |
| RELEASE | `INSPECT → IMPLEMENT → TEST → INDEPENDENT REVIEW → RELEASE VERIFY → CLOSE` |

本プロジェクトの既定は `STANDARD`。

### RELEASE 扱いとする領域

- 本番データ・本番環境への反映（削除・上書き・初期化を含む）
- 実顧客・実金銭・課金・契約に関わる処理
- 認証・権限・秘密情報の取扱い
- 個人情報の取扱い
- 公開 API・保存済みデータの破壊的互換性変更

### 独立レビュー必須領域

- RELEASE と判定した変更差分（1 Run につき 1 回を上限とする）

## 3-2. SPEC_IMPLEMENTATION_LOCK（自律開発標準 §11）

外部から観測可能な挙動を変更する実装変更は、現在の正本仕様との整合性確認
（`SPEC_IMPLEMENTATION_SYNC_CHECK`）なしに CLOSE しない。工程は増えず、VERIFY の内側の
検査項目として実施し、CLOSE 条件へ `SPEC_IMPLEMENTATION_SYNC_PASS` を 1 件追加する。

| 項目 | 値 |
|---|---|
| 適用モード | `OBSERVE` |
| behavior_contract | 未整備（本プロジェクトには未配置） |

`behavior_contract` が未整備のため、検出・記録は行うが CLOSE は止めない（移行段階）。**契約を 1 件でも宣言した時点で `ENFORCE` として働く。**契約を持つプロジェクトに `OBSERVE` は認めない（台帳検証が拒否する）。

## 4. 人間介入

| 項目 | 値 |
|---|---|
| 本番反映の人間承認 | 必要（自律開発標準 §3 の 2） |
| 外部認証（OAuth・2FA 等） | 必要になる場面がある（§3 の 4） |
| 自動 push | しない（自動仮登録。push 可否を人間が確認するまで local commit までとする） |

### 人間操作が必要な領域

- 外部サービスの認証同意（OAuth・2FA 等）
- 実物・実機でしか判定できない確認
- 本番反映の実行

人間へ操作を依頼する前に、自動実行できない理由を実測で示す（自律開発標準 §4-2）。
依頼は 1 回にまとめる。

## 5. プロジェクト固有ルール（保持）

以下は本プロジェクト固有として保持する。自律開発標準を弱めるものではなく、追加である。

- 自動仮登録である。risk_profile・RELEASE 領域・人間操作領域は保守的な既定値であり、実態が判明したら人間が台帳を調整してよい。調整するまでは既定値で運用する
- Run の目的に直接必要な変更だけを行う。無関係なガバナンス改善・全面リファクタリング・新しい承認工程の追加を行わない

## 6. 例外

- （なし）

## 7. 廃止した旧ルール

横断で廃止した旧ルールの一覧と分類は
`formation-control-center/docs/autonomy/LEGACY_GATE_RETIREMENT_MAP.md` にある。
本プロジェクトの該当箇所には、`autonomy-superseded` マーカー付きの廃止注記が挿入されている。
