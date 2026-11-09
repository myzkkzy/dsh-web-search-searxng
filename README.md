# DeepSeek Harness 用 SearXNG 検索プラグイン

日本語 | [English](README.en.md)

同じ PC で動作する SearXNG を、DeepSeek Harness の標準 `web_search` から使う自作プラグインです。
API キーや既成の検索プラグインは不要です。日英対応の設定画面を Plugins 内に追加します。Harness 本体の表示言語に連動し、その他の言語では英語を表示します。

- 対象環境: DeepSeek Harness Desktop **0.2.2-rc.1**
- 動作確認済み OS: Windows
- 開発・テスト: Node.js 22.19 以降

実行には Harness 本体に同梱されたランタイムと共有モジュールを使用します。Node.js の別途インストールは不要です。
ソースとブラウザー用の完成物を同梱しているため、ビルドや `npm install` は不要です。

## 導入

Harness の **Plugins → Add plugin** で、プラグインをダウンロード・展開したディレクトリ（`package.json` がある場所）を指定します。

登録後に **Enable now** で有効化します。必要と表示された場合は Harness を再起動してください。
プラグイン詳細を開くと SearXNG の設定画面が表示されます。

CLI を使う場合は Harness を完全に終了してから、同梱コマンドで登録できます。
ウィンドウの × だけでは終了しないため、トレイの Quit / 終了を使用してください。

以下のコマンド例では、`<DeepSeek Harness インストールディレクトリ>` と `<プラグインのディレクトリ>` を、それぞれ実際のパスに置き換えてください。山括弧も含めて置き換えてください。

```powershell
& '<DeepSeek Harness インストールディレクトリ>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add '<プラグインのディレクトリ>'
```

## SearXNG の起動

利用している導入方式の手順に従って SearXNG を起動し、検索中は Harness から接続できる状態を維持してください。
起動方法や設定方法は、利用している構成の手順または [SearXNG の公式導入手順](https://docs.searxng.org/admin/installation.html) を参照してください。

このプラグインには、JSON 形式の検索結果を取得できる SearXNG が必要です。必要に応じて SearXNG 側で JSON 形式の出力を有効にしてください。
検索 API の詳細は [公式 Search API ドキュメント](https://docs.searxng.org/dev/search_api.html) を参照してください。

接続確認では、次の `<SearXNG の Base URL>` を、使用するインスタンスの Base URL に山括弧も含めて置き換え、JSON の検索結果が返ることを確認します。

```text
<SearXNG の Base URL>/search?q=SearXNG&format=json
```

## 設定

**Plugins → SearXNG Web 検索**（パッケージ名: `dsh-web-search-searxng`） で変更し、**設定を保存**を押します。
その後 **SearXNG を検索に使う**で標準の検索先を切り替えます。

フォームは Harness 本体の表示言語に連動します。言語を切り替えても入力中の値を保持し、通知の表示も更新します。
画面の表示言語と、検索条件の「検索言語」はそれぞれ設定できます。

| 項目 | 初期値 | 説明 |
| --- | --- | --- |
| Base URL | `http://127.0.0.1:8888` | `/search` やクエリを含まないインスタンス URL |
| 最大検索結果数 | `8` | 1〜50。標準ツールの結果上限も適用 |
| 検索言語 | 空欄 | SearXNG の既定値。指定例: `ja-JP` |
| 使用エンジン | 空欄 | SearXNG の既定構成。指定例: `bing,duckduckgo` |
| タイムアウト | `15000` | ミリ秒。100〜120000 |

変更は次の検索から反映され、Harness の再起動後も保持されます。
保存前の編集は検索に使われません。保存が拒否された場合は編集内容を保持し、
**編集を破棄**で最新の保存済み設定へ戻せます。
検索先の切り替えは `web.searchProvider` だけを更新し、本文取得の設定には触れません。

会話で Web 検索を依頼すると、SearXNG の検索結果が引用可能な URL・タイトル・抜粋として返ります。
SearXNG 自体のエンジン構成と、各エンジンの稼働状況が検索結果を決めます。
通信失敗時に他の検索サービスへ自動で切り替える処理はありません。
検索処理がスローする例外は、英語のメッセージと固定のエラーコードを持ちます。フォームの入力エラーは表示言語に従います。

## 元に戻す・削除

プラグインを無効化・削除する前に、設定画面で **既定の検索に戻す**を押します。
その後 Plugins から無効化・削除します。ソースディレクトリはそのまま残せます。

CLI で削除する場合も、先に検索先を戻し、Harness を完全に終了してから実行してください。

```powershell
& '<DeepSeek Harness インストールディレクトリ>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop remove dsh-web-search-searxng
```

## 開発・テスト

```powershell
Set-Location '<プラグインのディレクトリ>'
node --test
node --check index.js
node --check provider.js
node --check client.js
```

Node 標準のテスト機能で模擬 HTTP サーバーを起動し、検索と失敗時の契約を検証します。
設定画面は保存・検索先の切り替え・競合・入力検証・言語切り替え・編集中の値の保持を検証します。
パッケージの検証では、README の代わりに各言語の短い説明文が選ばれる設定を確認します。外部サービスへの接続や API キーは不要です。

Host エントリー: `index.js`、検索処理: `provider.js`、ブラウザーエントリー: `client.js`。
設定のエントリー ID は `web-search-searxng`、検索プロバイダー ID は `searxng-local` です。
