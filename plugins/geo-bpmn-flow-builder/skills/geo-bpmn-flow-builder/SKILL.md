---
name: geo-bpmn-flow-builder
description: >-
  把工作流程說明、訪談/會議記錄中談到的流程、或一張現有操作流程圖,轉成符合 BPMN 規則的
  直式流程圖。必產 3 檔:流程說明 MD、流程定義 .py、版本記錄表;可選 3 檔(首次產出時
  詢問,勾選才產):可編輯圖檔 XML(預設 .drawio;明講用 bpmn.io 才產 .bpmn)、SVG、
  可縮放 HTML 檢視器。支援迭代:使用者修改圖檔、
  .md、.drawio、.bpmn 或相關描述文字後上傳,自動比對差異、進版並重產全部檔案。使用時機:使用者要
  「整理成流程圖」「畫 BPMN」「swimlane / 泳道圖」「跨部門 / 跨組織協作圖」,
  提供流程說明 / 會議記錄 / 舊流程圖要(重)畫,
  或上傳修改後的圖檔 / .md / .drawio / .bpmn / 相關描述文字要求更新迭代。
---

<!-- skill 20260720.01 -->
<!-- 修改本 skill 時:同步更新上行版號(yyyymmdd.兩位數序號),並在 CHANGELOG.md 增列 -->

# BPMN 直式流程圖產生器

**一律以繁體中文回覆與產出**(對話、圖面文字、`.md` 皆同)。

## 何時啟動

使用者提供流程說明、**訪談/會議記錄**(含流程段落)、舊流程圖要繪製/重繪 BPMN 泳道圖;
或上傳修改後的圖檔 / `.md` / `.drawio` / `.bpmn` / 相關描述文字要求迭代更新。

## 如何執行(細節見 reference,產圖前先讀)

1. `reference/workflow.md`:首次繪圖與迭代同步的完整流程(**確認分級**:輸入明確的
   簡單案直接產出、假設列交付說明;輸入含糊、會議記錄含多條流程、或使用者明示
   要先看摘要時才確認先行)、交付物清單與圖檔 XML 擇一規則、命名/版號規則、圖別選擇。
2. `reference/conventions.md`:版面、繞線、閘道、分區、驗證慣例;多張圖同案時用 `emit_multi`(單一多頁 .drawio,見 workflow.md);
   API 寫法仿 `reference/example_process.py`。
   (`reference/internals.md` 為 builder 內部機制規格,**僅維護 skill 時讀**,產圖不需。)

## 執行內容(產出)

必產 3 檔(流程說明 MD、流程定義 .py、版本記錄表)+ 可選 3 檔(圖檔 XML、SVG、
檢視器 HTML;**首次產出前以一題詢問、勾選才產**,迭代沿用選擇),由 `emit()`
一次產齊。圖檔 XML 格式預設 `.drawio`、不需詢問(僅使用者明講 bpmn.io 才
`fmt="bpmn"`;兩格式不相容)——清單與規則見 `workflow.md`。有產圖檔 XML 時交付前
`python3 scripts/validate_bpmn.py <輸出資料夾>` 須通過;未產 XML 時以 emit 內建
檢核為門檻(本環境無法 render SVG,以離線檢查為準)。

**git 版控模式**:輸出資料夾位於 git 工作樹內時(emit/emit_multi 自動偵測,
`git=` 可強制),不建版號子目錄、檔名不帶版號(原地覆寫同名檔),版本演進
由 git 控管;邏輯版號、圖頂/`.md` 標題版號與版本記錄表照舊(見 workflow.md)。
