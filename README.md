# 時間記録日記

一日の行動を記録し、そこから日本語の日記を自動で書き起こす個人用アプリ。
iPhone のホーム画面に追加して使うことを想定した PWA（ビルド不要の素の HTML/JS）です。

## 使い方（開発者向け）

ビルドツールは使っていません。静的ファイルをそのまま Web サーバーで配信するだけで動きます。

```bash
# 例：Python がある環境なら
python -m http.server 8000
# 例：VS Code の Live Server 拡張でもOK
```

`index.html` を開けば動作します。

## 公開（GitHub Pages）

1. このリポジトリを GitHub にプッシュする
2. リポジトリの Settings → Pages で「Deploy from a branch」→ branch: `main` / folder: `/ (root)` を選ぶ
3. 数分待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される
4. iPhone の Safari でそのURLを開き、共有ボタン →「ホーム画面に追加」

## 技術構成

- ビルド不要。[Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm) を `vendor/` にローカル同梱し、`<script type="module">` で直接読み込みます。
- 保存は IndexedDB（だめなら localStorage にフォールバック）。`storage.js`
- 天気は [Open-Meteo](https://open-meteo.com/)（無料・キー不要）。`weather.js`
- 日記の文章生成ルールは `diary.js` に切り出してあります。仕様書 5章の移植です。

## 引き継ぎ元

最初のバージョンは `時間記録アプリ_仕様書.md` と `time-tracker.jsx`（チャット上の試作版）がもとになっています。
その後 `Claude Code への指示書.md` と、作り込まれた新しい `time-tracker.jsx`（「動くお手本」）をもとに、
日記エンジンを大きく作り直しています（下記「現在の状況」参照）。これら3ファイルはこのリポジトリには
含まれていません（作者の手元にあります）。

## 現在の状況（別のPCで作業を再開する人向け）

このアプリは Claude Code とのやりとりで少しずつ作られています。別のマシンで `git clone` して
Claude Code を開いた場合、この節を読めばこれまでの経緯がだいたい分かります。

**データモデル**：行動（activity）は `diary: "time" | "name" | "off"` の3種類。`"time"` は
`merge`（1日ぶんをまとめる/1回ずつ書く）・`namePos`（行動名を文頭/文中/文後/入れない）・
`np`/`sp`/`ep`（助詞）・`startWord`/`endWord`（言い切る形とつなぐ形を持つ言葉、共有リストから選ぶ）
を組み合わせて文を作る。重なった記録は「先に始まった方」が主になり、`overlap`（行動ごとの重なりの
言葉、例:「の途中で」）で1文にまとめるかどうかを選ぶ。詳しいルールは `diary.js` の関数コメントを参照。

**このアプリ独自の判断（「動くお手本」の time-tracker.jsx には無い変更）**：
- 保存は `window.storage`（チャット環境依存）ではなく IndexedDB/localStorage（`storage.js`）
- 天気は Claude API 検索ではなく Open-Meteo（`weather.js`）。地名検索で緯度経度を保存する UI 付き
- 行動ボタンは2列固定（グリッド表示）
- カラーバーを指でなぞると出る欄（プローブパネル）から、記録の**追加・編集・削除**がすべてできる。
  かつて存在した「時間を修正」タブは、この機能に置き換わったため削除済み
- 計測開始から3秒未満で止めた記録は自動で破棄（誤タップ対策）、
  止めてから8秒だけ「元に戻す」を出す
- 行動編集中に貼りつく「できあがる文」プレビューは `top: max(76px, env(safe-area-inset-top) + 24px)`
  で、iPhoneのステータスバー等と重ならない位置に固定

**移行処理**：`constants.js` の `normalize()` は、(1) とても古い試作の形、(2) このアプリが以前
使っていた span/points/name/off の形、(3) 現在の time/name/off の形、のどれが保存データに来ても
正しく直るようになっている。特に「以前このアプリで使っていた設定」からの移行（`timeFirst` →
`namePos`、行動の「なし」語尾 → 助詞も含めて空に、日記全体の重なり設定 → 行動ごとの `overlap` に
展開）は、この "動くお手本" 側では想定されていない、このアプリ独自の移行ロジックなので、
`normalize()` を触るときは注意すること。

**まだやっていないこと**：Apple ヘルスケア連携、週次/月次分析の充実、記録忘れの通知（仕様書 7-⑤）。
