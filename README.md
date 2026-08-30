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

`../時間記録アプリ_仕様書.md` と `../time-tracker.jsx`（チャット上の試作版）がもとになっています。
