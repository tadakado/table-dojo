# テーブル打鍵道場 (table-dojo)

AZIK などの**自分のローマ字テーブル**で練習するタイピング練習アプリです。
Google 日本語入力からエクスポートしたテーブルを読み込むと、そのテーブルでの最短の打ち方をガイドしながら練習できます。
自作キーボード（ZMK）の配列を読み込んで、次に押すキーをその配列の上に表示することもできます。

ビルド不要の静的サイトなので、GitHub Pages にそのまま置けます。

- 練習: `index.html`
- 物理配置エディタ: `editor.html`（ZMK の `key_physical_attrs` を GUI で編集）

## できること

- **自分のテーブルで最短打鍵**: テーブルの規則をすべて考慮して、語ごとの最短の打ち方を厳密に求めます。最短が複数あるときはどれでも受け付けます（「どの打ち方も可」にも切り替え可能）。
- **IME と同じ確定の仕方**: 3列目（次の入力）や、`n` が次の文字を待つ挙動も再現します。全角で書かれた記号（`：` `；` など）は半角として扱います。
- **ガイド**: 打鍵を確定単位に区切って、対応するかなを添えて表示します。同じ打鍵数で打てるほかの打ち方（AZIK の `kgo` と `kyo`、`q` と `n` など）も、その下に小さく表示します（「別表記」で非表示にできます）。同じ打鍵数なら、表示には標準ローマ字に近い打ち方を選びます。ミスしたときは、届いたキーと弾いた理由を表示します。
- **結果**: 標準ローマ字と比べた打鍵の削減率、ミスしたキー、ミスのあった語。
- **出題の絞り込み**: 「独自規則の語のみ」で、標準ローマ字と変わらない語（打鍵が減らず、`;` `:` のような記号キーの規則も使わない語）を外せます。
- **キーボード表示**: US / JIS / 自作。自作キーボードでは、別レイヤーにある文字を「Lower を押しながら」のように示します。
- **単語**: 基本語彙 1201語。自分の単語リストも読み込めます。

## 使い方

### ローマ字テーブル

練習ページの「テーブル」で切り替えます。

| 選択 | 使うテーブル |
| --- | --- |
| ローマ字 | 同梱の標準ローマ字（Google 日本語入力の初期設定に近いもの） |
| AZIK | 同梱の `tables/azik.tsv`（[azooKey](https://github.com/azooKey/azooKey-Desktop) の AZIK テーブルを変換したもの） |
| カスタム | 自分で読み込んだテーブル |

AZIK テーブルは、azooKey-Desktop が使っている [AzooKeyKanaKanjiConverter](https://github.com/azooKey/AzooKeyKanaKanjiConverter) の `defaultAzik.swift`（MIT License）を `tools/azik-from-azookey.mjs` で Google 日本語入力の形式に変換したものです。azooKey はキーを「打った記号の全角形」（`;` → `；`、`-` → `ー`、`.` → `。` など）で持っているので、変換時に元のキーに戻しています。長音は `:`、促音は `;` で打ちます（`-` での長音は含まれません）。

元の表を更新したいときは、スクリプト内のコミットを変えて `npm run update-azik` を実行します。

カスタムは次の手順で読み込みます（ブラウザに保存されます）。

1. Google 日本語入力の設定 → 一般 → ローマ字テーブル「編集…」を開く
2. 「編集」メニューの「エクスポート」で `.tsv` を保存
3. 練習ページの「ローマ字テーブル」カードにドロップ

形式は 1行1規則の `入力<TAB>出力[<TAB>次の入力]` です。

### 自分の単語リスト

UTF-8 のテキストで、1行に `表記<TAB>よみ`（カンマ区切りも可）。よみだけの行、`#` で始まるコメント行も書けます。カタカナのよみはひらがなに直して判定します。

```
入場券	にゅうじょうけん
量子ビット,りょうしびっと
きっぷ
```

### 自作キーボード

刻印は [keymap-drawer](https://github.com/caksoylar/keymap-drawer) の `keymap parse` が出す YAML、配置は ZMK の physical layout（`key_physical_attrs` を含む dtsi）か `keymap draw` が出す SVG から読みます。
レイヤー名は、そのレイヤーに切り替えるキーの刻印（例: `Lower`）と同じにしておいてください。別レイヤーの文字を「Lower を押しながら」と示すのに使います。

「自作キーボード」カードの一番上に、使用中のキーボードと、刻印・配置それぞれの読み込み元を表示します。

**GitHub から読み込む**（エディタでは「Web から開く」）

| 入力 | 取得するもの |
| --- | --- |
| `owner/repo`、`owner/repo@branch`、`https://github.com/owner/repo` | `keymap/<repo>.yaml`（なければ `keymap/` 内の YAML）と、その `layout: {dts_layout: …}` が指す dtsi（リポジトリ直下からのパス） |
| GitHub のファイル URL（`/blob/…` や raw.githubusercontent.com） | その YAML と、`dts_layout` が指す dtsi |
| その他の https URL | その YAML と、YAML の場所から見た `dts_layout` の dtsi |

YAML に `dts_layout` がない場合は、「YAML に配置ファイルが書かれていない場合」を開いて dtsi の URL を入れます。
読み込んだアドレスは保存され、ページを開くたびに最新を取り直します（取得できないときは前回の取得分を使います）。
GitHub の raw ファイルは最大5分ほどキャッシュされるので、push 直後は少し待ってください。

**ファイルから読み込む**: 「刻印」で YAML、「配置」で dtsi か SVG を選びます。片方だけ選ぶと、もう片方は使用中のものをそのまま使います（たとえば配置だけ自分の dtsi に差し替える）。2つまとめてドロップしても読み込めます。

既定では [tk46v6b](https://github.com/tadakado/tk46v6b) を GitHub から取得して表示します。取得できないときは `keyboards/tk46v6b/` の同梱データを使います。

### 物理配置エディタ

`editor.html` で dtsi を開くか、「Web から開く」に GitHub のリポジトリ名を入れて読み込み、キーをドラッグ・回転・左右鏡映・数値入力で編集して、`keys = …;` ブロックとして書き出します。回転は ZMK と同じく「(rx, ry) を中心に回す」表現のまま計算します。

## ローカルで動かす

ES モジュールと `fetch` を使うので、ファイルを直接開く（`file://`）と動きません。HTTP サーバー経由で開いてください。

```sh
python3 -m http.server 8000
# http://localhost:8000/
```

## 単一ファイル版

```sh
npm run build   # node tools/build-single.mjs
```

`dist/table-dojo.html`（練習）と `dist/table-dojo-editor.html`（配置エディタ）ができます。CSS・JavaScript・js-yaml・単語リスト・AZIK テーブル・既定のキーボードをすべて1つの HTML に埋め込んであり、サーバーなしでファイルを直接開いて使えます（ネットにつながっていなくても動きます）。
ネットにつながっていれば、フォントと、GitHub からのキーボード取得はそのまま使えます。設定はブラウザに保存されますが、Pages 版とは別のサイト扱いなので共有はされません。

## テスト

判定ロジック（`js/engine.js`）は DOM に依存しないので、Node.js でテストできます。

```sh
npm test        # node --test tests/*.test.mjs
```

`tests/fixtures/azik-mini.tsv` はテスト用に作った最小限の AZIK 風規則です（公開されている AZIK テーブルの複製ではありません）。

## 構成

```
index.html              練習ページ
editor.html             物理配置エディタ
css/base.css            共通の色・フォント
css/dojo.css            練習ページ
css/editor.css          エディタ
js/engine.js            IME シミュレータ・最短打鍵探索・テーブル/単語の読み込み（DOM 非依存）
js/keyboard.js          自作キーボード（YAML + dtsi/SVG）の読み込みとキー探索
js/remote.js            GitHub / URL からの取得（取得先の解決）
js/version.js           バージョン表示（version.json）
js/app.js               練習ページの画面と進行
js/editor.js            エディタ
words/basic.tsv         基本語彙
tables/azik.tsv         AZIK テーブル（azooKey から変換）
tools/                  azik-from-azookey.mjs（AZIK テーブルの変換）、build-single.mjs（単一ファイル版の生成）
keyboards/index.json    選べるキーボードの一覧と既定
keyboards/tk46v6b/      tk46v6b の刻印 YAML と dtsi（取得できないときの予備）
vendor/js-yaml.min.js   YAML パーサ（js-yaml 4.1.0, MIT）
tests/                  node --test のテスト
```

### キーボードを追加する

`keyboards/<id>/` に YAML と dtsi（または SVG）を置き、`keyboards/index.json` に追加します。`default` が起動時に表示されるキーボード、`base` が既定のベースレイヤー名です。

`repo` を書いておくと、起動時にそのリポジトリから最新を取得し、同梱の `yaml` / `layout` は取得できないときの予備になります。tk46v6b はこの方式なので、キーマップや配置を tk46v6b リポジトリに push すれば、このアプリの更新は不要です。

## 判定の仕組み

「かなの位置」と「IME の未確定バッファ」の組を状態とするグラフを作り、ゴールから逆向きに幅優先探索して、各状態から最短何打で打ち終われるかを求めます。入力されたキーは「その先が最短のままか」で判定します。

効率の高い規則から順に当てはめる方法（貪欲法）と違い、規則の組み合わせ次第で最短を外すことがありません。

## GitHub Pages で公開する

`.github/workflows/pages.yml` が、`main` への push ごとにテストを実行し、通ったら公開します。リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にしておいてください。

### バージョン表示

ページのヘッダーに、公開したコミットの日時（日本時間）を `2026.10.30.2056`（年.月.日.時分）の形で表示します。クリックすると、そのコミットを GitHub で開きます。
番号は公開時にワークフローが `version.json` に書き込みます。単一ファイル版は `npm run build` の時点のコミットから同じ形式で埋め込み、未コミットの変更があれば末尾に `-dirty` を付けます。手元で `python3 -m http.server` から開いたときは `dev` と表示されます。

## 単語リストについて

`words/basic.tsv` は、このプロジェクトのために作成した語彙です（既存の語彙表の複製ではありません）。読みは形態素解析器との照合と目視で確認しています。リポジトリと同じ MIT ライセンスです。

## ライセンス・謝辞

- このリポジトリ: [MIT](LICENSE)
- [js-yaml](https://github.com/nodeca/js-yaml): MIT（`vendor/js-yaml.LICENSE`）
- フォント: Google Fonts（Zen Kaku Gothic New、Shippori Mincho B1、JetBrains Mono）を CDN から読み込み
- AZIK のテーブル: [AzooKeyKanaKanjiConverter](https://github.com/azooKey/AzooKeyKanaKanjiConverter)（MIT, Copyright (c) 2023 Miwa / Ensan, `tables/azik.LICENSE`）。AZIK の考案者による解説は [AZIK総合解説書](https://note.com/actbemu/n/n74f1c04c9a2e)
- 自作キーボードのデータ形式: [keymap-drawer](https://github.com/caksoylar/keymap-drawer)
- 着想: AZIK 用タイピング練習サイト [TQPU](https://kuroneko2828.github.io/tqpu/)（[紹介記事](https://techbull.cloud/archives/2606)）
