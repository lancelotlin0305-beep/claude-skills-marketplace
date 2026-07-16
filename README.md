# lancelot-skills — 個人 Claude Code Plugin Marketplace

集中管理個人 Claude Code skills，供多台電腦同步安裝與更新。

## 內含 plugins

| Plugin | 說明 | 來源 |
|---|---|---|
| `bpmn-flow-builder` | 流程說明 → BPMN 直式流程圖（6 檔輸出、迭代進版） | 自行維護 |
| `drawio-skill` | 通用 draw.io 圖表產生與匯出 | [Agents365-ai/drawio-skill](https://github.com/Agents365-ai/drawio-skill) |

## 新電腦安裝（在 Claude Code 內執行）

```
/plugin marketplace add <本 repo 的 GitHub URL 或 owner/repo>
/plugin install bpmn-flow-builder@lancelot-skills
/plugin install drawio-skill@lancelot-skills
```

## 更新流程

1. 修改 `plugins/<名稱>/skills/` 下的 skill 內容，並同步調整對應 `plugin.json` 的 `version`。
2. `git commit` + `git push`。
3. 各電腦執行 `/plugin marketplace update lancelot-skills`，必要時 `/reload-plugins`。

## 新增 skill

1. 在 `plugins/` 下建立新資料夾：`.claude-plugin/plugin.json` + `skills/<skill名>/SKILL.md`。
2. 在 `.claude-plugin/marketplace.json` 的 `plugins` 陣列加入該項目。
3. push 後在各電腦 `/plugin marketplace update lancelot-skills` 再 `/plugin install <新plugin>@lancelot-skills`。

## 注意事項

- 安裝為 plugin 後，skill 會以 `plugin名:skill名` 命名空間生效；請移除 `~/.claude/skills/` 下的同名副本以免重複觸發。
- `drawio-skill` 需要本機安裝 draw.io desktop（CLI 在 PATH 上），選用的 autolayout 需要 Graphviz。
