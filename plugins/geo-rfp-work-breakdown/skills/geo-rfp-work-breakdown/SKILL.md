---
name: geo-rfp-work-breakdown
description: >-
  從 RFP / 需求文件拆解工項,產出「工項拆解 MD(含功能架構總覽)+ 功能架構圖 SVG」(有疑義另產待釐清清單)。
  使用時機:使用者提供 RFP、招標文件、需求規格書、SOW,或說「拆工項」「需求拆解」「產功能架構圖」;
  只丟一份像 RFP 的文件沒明講要做什麼,也應主動套用。若已有工項後再提供服務建議書 / 會議記錄
  要求更新,走二次拆解模式(結合全部需求文件重新核對)。
---

# RFP 工項拆解

RFP / 需求文件 → **工項拆解 MD(含功能架構總覽)+ 功能架構圖 SVG**(有疑義另產待釐清清單)。
方法細節都在 `references/rfp-breakdown.md`,**動手前先讀**。

## 原則

完整覆蓋、可追溯、不偏離不加料;需求權威順序 **訪談會議記錄 > 服務建議書 > RFP**,衝突取上位者。

## 模式與前置輸入(缺則先索取,不足不產出)

- **首次拆解**:RFP(Word / PDF)。
- **二次拆解**:既有工項 MD + 新文件(服務建議書 / 會議記錄)+ 原 RFP(三方比對必需)。
  結合全部文件重新核對,產出帶新版本號(v2),舊版保留。

## 流程(各步細節見對應檔)

1. **讀文件** — 讀法見 `rfp-breakdown.md`。
2. **拆工項** — 套 `assets/work-items-template.md`;二次拆解依 `rfp-breakdown.md`「二次拆解」段。
3. **收集疑義** — 登錄獨立待釐清清單(`assets/clarification-log-template.md`,方法 `references/requirements-clarification.md`),不寫進工項 MD;二次時同步更新既有清單。
4. **功能架構圖** — 依 `references/function-map.md` 產出 SVG,節點與工項 MD 一致。
5. **對照驗證** — 依 `rfp-breakdown.md`「對照需求文件驗證」段,逐條對回全部需求文件,有落差先補正。
6. **交付** — 全部產出存 `/mnt/user-data/outputs/`、`present_files` 呈現,請使用者確認。**做完即停**。
