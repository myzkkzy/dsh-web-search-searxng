// Browser artifact using Harness's ModuleLoader and shared React runtime.
// UI translations are kept in dictionaries; control flow stays language-neutral.
window.__ModuleLoader__.load({
  id: "dsh-web-search-searxng",
  factory(require) {
    const React = require("react");
    const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
    const NAMESPACE = "web-search-searxng";
    const LOCALE_NAMESPACE = "plugins.searxng";
    const PROVIDER_ID = "searxng-local";
    const DICTIONARIES = {
      en: {
        "summary": "Search with your SearXNG instance without an API key.",
        "form.label": "SearXNG search settings",
        "field.baseURL.label": "SearXNG Base URL",
        "field.baseURL.hint": "Instance URL without /search, for example http://127.0.0.1:8888.",
        "field.maxResults.label": "Maximum results",
        "field.maxResults.hint": "1–50 results. The web_search tool limit also applies.",
        "field.language.label": "Search language",
        "field.language.hint": "Leave blank for the SearXNG default. Examples: ja-JP, en-US.",
        "field.engines.label": "Search engines",
        "field.engines.hint": "Leave blank for the SearXNG defaults, or enter comma-separated engine names.",
        "field.timeoutMs.label": "Timeout (milliseconds)",
        "field.timeoutMs.hint": "100–120000. The default is 15000 (15 seconds).",
        "validation.url": "Enter a valid SearXNG HTTP(S) Base URL.",
        "validation.urlParts": "Use an HTTP(S) Base URL without /search, credentials, a query, or a fragment.",
        "validation.integer": "{field} must be an integer between {min} and {max}.",
        "status.unavailable": "The search plugin is disabled.",
        "status.loading": "Loading settings…",
        "status.readOnly": "Settings are read-only in this environment.",
        "status.selected": "Current web search: SearXNG",
        "status.notSelected": "SearXNG is not selected for web search.",
        "status.saveFirst": "Save your settings before changing the search provider.",
        "action.save": "Save settings",
        "action.discard": "Discard changes",
        "action.busy": "Working…",
        "action.select": "Use SearXNG for search",
        "action.restore": "Restore default search",
        "notice.saved": "Settings saved. They will apply to the next search.",
        "notice.conflict": "Settings changed or the save was rejected. Your edits are preserved. Discard changes to load the latest settings.",
        "notice.transport": "The request failed. Check the connection and try again. Your edits are preserved.",
        "notice.selected": "Web search now uses SearXNG.",
        "notice.restored": "Search settings restored to the Harness default.",
        "notice.selectionRejected": "Could not change the search provider. Check the current settings and try again.",
      },
      ja: {
        "summary": "指定した SearXNG を使う、API キー不要の Web 検索。",
        "form.label": "SearXNG 検索の設定",
        "field.baseURL.label": "SearXNG Base URL",
        "field.baseURL.hint": "/search を含まない URL。例: http://127.0.0.1:8888",
        "field.maxResults.label": "最大検索結果数",
        "field.maxResults.hint": "1〜50 件。web_search 側の上限も適用されます。",
        "field.language.label": "検索言語",
        "field.language.hint": "空欄で SearXNG の既定値。例: ja-JP、en-US",
        "field.engines.label": "使用エンジン",
        "field.engines.hint": "空欄で SearXNG の既定構成。指定する場合はカンマ区切り。",
        "field.timeoutMs.label": "タイムアウト（ミリ秒）",
        "field.timeoutMs.hint": "100〜120000。初期値は 15000（15 秒）です。",
        "validation.url": "有効な SearXNG HTTP(S) Base URL を入力してください。",
        "validation.urlParts": "Base URL は /search・認証情報・クエリ・フラグメントを含まない HTTP(S) URL にしてください。",
        "validation.integer": "{field}は {min}〜{max} の整数にしてください。",
        "status.unavailable": "検索プラグインが無効になっています。",
        "status.loading": "設定を読み込んでいます…",
        "status.readOnly": "この環境の設定は読み取り専用です。",
        "status.selected": "現在の Web 検索: SearXNG",
        "status.notSelected": "SearXNG は現在の Web 検索に選択されていません。",
        "status.saveFirst": "検索先を切り替える前に、設定を保存してください。",
        "action.save": "設定を保存",
        "action.discard": "編集を破棄",
        "action.busy": "処理中…",
        "action.select": "SearXNG を検索に使う",
        "action.restore": "既定の検索に戻す",
        "notice.saved": "設定を保存しました。次の検索から反映されます。",
        "notice.conflict": "設定が更新されたか、保存が拒否されました。編集内容は保持されています。「編集を破棄」で最新の設定を読み直せます。",
        "notice.transport": "通信に失敗しました。接続を確認して再試行してください。編集内容は保持されています。",
        "notice.selected": "Web 検索を SearXNG に切り替えました。",
        "notice.restored": "検索の設定を Harness の既定に戻しました。",
        "notice.selectionRejected": "検索先を切り替えられませんでした。現在の設定を確認して再試行してください。",
      },
    };
    const FIELDS = [
      { key: "baseURL", type: "url" },
      { key: "maxResults", type: "number", min: 1, max: 50 },
      { key: "language", type: "text" },
      { key: "engines", type: "text" },
      { key: "timeoutMs", type: "number", min: 100, max: 120000 },
    ];

    function draftOf(value) {
      return Object.fromEntries(FIELDS.map(({ key }) => [key, String(value?.[key] ?? "")]));
    }

    function parseDraft(fields) {
      const values = { ...fields };
      try {
        const url = new URL(values.baseURL);
        if (
          !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.search || url.hash || /\/search\/?$/.test(url.pathname)
        ) {
          return { error: { key: "validation.urlParts" } };
        }
      } catch {
        return { error: { key: "validation.url" } };
      }
      for (const field of FIELDS.filter((item) => item.type === "number")) {
        const value = Number(values[field.key]);
        if (!Number.isInteger(value) || value < field.min || value > field.max) {
          return {
            error: {
              key: "validation.integer",
              params: { field: field.key, min: field.min, max: field.max },
            },
          };
        }
        values[field.key] = value;
      }
      values.baseURL = values.baseURL.trim();
      values.language = values.language.trim();
      values.engines = values.engines.trim();
      return { values };
    }

    function apply(ctx) {
      const scope = ctx.configForms.get(NAMESPACE);
      const web = ctx.configForms.get("web");
      const subscribe = scope.subscribe.bind(scope);
      const getSnapshot = scope.getSnapshot.bind(scope);
      const subscribeWeb = web.subscribe.bind(web);
      const getWebSnapshot = web.getSnapshot.bind(web);
      const subscribeLocale = ctx.locale.subscribe.bind(ctx.locale);
      const getLocaleSnapshot = ctx.locale.getSnapshot.bind(ctx.locale);
      const t = ctx.locale.bind(LOCALE_NAMESPACE);
      ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), "searxng settings dictionaries");

      function translate(message) {
        const params = { ...message.params };
        if (params.field) params.field = t("field." + params.field + ".label");
        return t(message.key, params);
      }

      function SearxngSettings({ view }) {
        const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
        const webSnapshot = useSyncExternalStore(subscribeWeb, getWebSnapshot, getWebSnapshot);
        useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleSnapshot);
        const [edit, setEdit] = useState(null);
        const [busy, setBusy] = useState(false);
        const [notice, setNotice] = useState(null);
        const inFlight = useRef(false);
        const mounted = useRef(true);
        useEffect(() => {
          mounted.current = true;
          return () => { mounted.current = false; };
        }, []);

        if (view === "summary") return t("summary");
        const fields = edit?.fields ?? draftOf(snapshot.value);
        const parsed = parseDraft(fields);
        const dirty = edit !== null;
        const ready = snapshot.status === "ready";
        const writable = ready && snapshot.writable;
        const selected = webSnapshot.value?.searchProvider === PROVIDER_ID;

        async function operation(callback) {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true);
          setNotice(null);
          try {
            await callback();
          } catch {
            if (mounted.current) setNotice({ error: true, key: "notice.transport" });
          } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
          }
        }

        async function save(event) {
          event?.preventDefault();
          if (!dirty || parsed.error || !writable) return;
          await operation(async () => {
            const ops = FIELDS.map(({ key }) => ({ op: "set", path: [key], value: parsed.values[key] }));
            const accepted = await scope.mutate(ops, edit.revision);
            if (!mounted.current) return;
            if (accepted) {
              setEdit(null);
              setNotice({ key: "notice.saved" });
            } else {
              setNotice({ error: true, key: "notice.conflict" });
            }
          });
        }

        async function select(useSearxng) {
          if (dirty || !webSnapshot.writable || webSnapshot.status !== "ready") return;
          await operation(async () => {
            const ops = useSearxng
              ? [{ op: "set", path: ["searchProvider"], value: PROVIDER_ID }]
              : [{ op: "unset", path: ["searchProvider"] }];
            const accepted = await web.mutate(ops, webSnapshot.revision);
            if (mounted.current) setNotice(accepted
              ? { key: useSearxng ? "notice.selected" : "notice.restored" }
              : { error: true, key: "notice.selectionRejected" });
          });
        }

        return h("section", { className: "searxng-settings", "aria-label": t("form.label") },
          !ready && h("p", { role: "status" },
            t(snapshot.status === "unavailable" ? "status.unavailable" : "status.loading")),
          ready && !snapshot.writable && h("p", { role: "status" }, t("status.readOnly")),
          h("form", { onSubmit: save, noValidate: true },
            ...FIELDS.map((field) => h("div", { className: "searxng-field", key: field.key },
              h("label", { htmlFor: "searxng-" + field.key }, t("field." + field.key + ".label")),
              h("input", {
                id: "searxng-" + field.key, name: field.key, type: field.type,
                min: field.min, max: field.max, step: field.type === "number" ? 1 : undefined,
                value: fields[field.key], disabled: !writable || busy,
                autoComplete: "off", spellCheck: false,
                onChange: (event) => {
                  const text = event.target.value;
                  setEdit((current) => ({
                    fields: { ...(current?.fields ?? draftOf(snapshot.value)), [field.key]: text },
                    revision: current?.revision ?? snapshot.revision,
                  }));
                  setNotice(null);
                },
              }),
              h("p", { className: "searxng-hint" }, t("field." + field.key + ".hint")),
            )),
            dirty && parsed.error && h("p", { className: "searxng-error", role: "alert" }, translate(parsed.error)),
            h("div", { className: "searxng-actions" },
              h("button", {
                type: "submit", disabled: !writable || !dirty || busy || !!parsed.error,
                className: "searxng-primary",
              }, t(busy ? "action.busy" : "action.save")),
              h("button", {
                type: "button", disabled: !dirty || busy,
                onClick: () => { setEdit(null); setNotice(null); },
              }, t("action.discard")),
            ),
          ),
          h("div", { className: "searxng-selection" },
            h("p", { role: "status" }, t(selected ? "status.selected" : "status.notSelected")),
            dirty && h("p", { className: "searxng-hint" }, t("status.saveFirst")),
            h("div", { className: "searxng-actions" },
              h("button", {
                type: "button", className: "searxng-primary",
                disabled: busy || dirty || !writable || webSnapshot.status !== "ready" || !webSnapshot.writable || selected,
                onClick: () => select(true),
              }, t("action.select")),
              h("button", {
                type: "button", disabled: busy || dirty || !webSnapshot.writable || !selected,
                onClick: () => select(false),
              }, t("action.restore")),
            ),
          ),
          notice && h("p", {
            role: notice.error ? "alert" : "status",
            className: notice.error ? "searxng-error" : "searxng-hint",
          }, translate(notice)),
        );
      }

      ctx.effect(() => {
        const style = document.createElement("style");
        style.dataset.plugin = "dsh-web-search-searxng";
        style.textContent = [
          ".searxng-settings{max-width:640px;color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:1.6}",
          ".searxng-field{display:grid;gap:5px;margin:18px 0}",
          ".searxng-field label{font-weight:500}",
          ".searxng-field input{box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid var(--dsw-alias-border-default,#8886);border-radius:8px;background:var(--dsw-alias-fill-tertiary,transparent);color:inherit;font:inherit}",
          ".searxng-field input:focus{outline:2px solid var(--dsw-alias-link,#5677e0);outline-offset:1px}",
          ".searxng-hint{margin:3px 0;color:var(--dsw-alias-label-tertiary,#888);font-size:12px}",
          ".searxng-actions{display:flex;flex-wrap:wrap;gap:8px}",
          ".searxng-actions button{padding:8px 13px;border:1px solid var(--dsw-alias-border-default,#8886);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}",
          ".searxng-actions .searxng-primary{background:var(--dsw-alias-link,#4263d5);border-color:transparent;color:white}",
          ".searxng-actions button:disabled{opacity:.45;cursor:default}",
          ".searxng-selection{border-top:1px solid var(--dsw-alias-border-default,#8886);margin-top:24px;padding-top:12px}",
          ".searxng-error{color:var(--dsw-alias-label-error,#d84949)}",
        ].join("\n");
        document.head.appendChild(style);
        return () => style.remove();
      }, "searxng settings styles");
      ctx.effect(() => ctx.configForms.whileServed([NAMESPACE], () => ctx.slots.inject(
        "plugins.bundle.config", () => ctx.slots.register({
          name: "plugins.bundle.config",
          key: "dsh-web-search-searxng",
          locale: LOCALE_NAMESPACE,
        }, SearxngSettings),
      )), "searxng settings page");
    }
    return { apply, inject: ["slots", "configForms", "locale"] };
  },
});
