# 功能架構圖(SVG)

拆工項時,除了工項 MD,**一併產出功能架構圖 SVG**——把「系統 → 模組 → 工項」的功能樹畫成圖。
樹狀的**文字版不另出檔**:寫在工項 MD 開頭的「功能架構總覽」段(見 `work-items-template.md`),
與本 SVG 內容一致。
讓業主 / 團隊一眼看懂系統範圍與結構,也適合放進服務建議書。

SVG 採**乾淨可編輯**寫法,產出即可直接拖進 Figma 拆解成圖層 / 文字 / 形狀:
`<text>` 不轉 path、`<g>` 命名(如 `id="M1"`)、顏色寫實值 hex、明確 `viewBox`、常見字體(Noto Sans TC…)。

## 內容與結構

- **三層功能樹**:頂層 = 系統名;第二層 = 模組(M1、M2…);第三層 = 各模組的工項(M1-01…)。
- 節點編號、名稱、優先級**與工項 MD(含功能架構總覽段)完全一致**(可追溯)。
- 用底色或左側色條標出**雛型優先級**:高 = 主色、中 = 輔色、低 = 灰。
- 版面由上而下或由左而右皆可;同層對齊、間距一致;模組多時換行分組。

## 圖層對應(方便 Figma 編輯)

- 每個模組包成 `<g id="M1">`,其下工項再包 `<g id="M1-01">`,匯入 Figma 後圖層面板清楚好找。
- 模組與工項之間用 `<line>` / `<path>` 連接。

## 結構範本(簡例)

```svg
<svg viewBox="0 0 900 500" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans TC, sans-serif">
  <text x="40" y="48" fill="#e6e6e6" font-size="22" font-weight="700">[系統名] 功能架構</text>
  <g id="M1">
    <rect x="40" y="90" width="180" height="44" rx="8" fill="#1a2230"/>
    <text x="56" y="118" fill="#e6e6e6" font-size="15" font-weight="600">M1 會員管理</text>
    <g id="M1-01">
      <rect x="60" y="150" width="160" height="38" rx="6" fill="#4f7cff"/>
      <text x="74" y="174" fill="#fff" font-size="13">會員註冊 ｜ M1-01</text>
    </g>
    <!-- 其餘工項 M1-02… 同上，往下堆疊 -->
  </g>
  <!-- 其餘模組 M2… 往右排列 -->
</svg>
```

## 輸出

存成 `.svg`(例 `功能架構圖.svg`)到 `/mnt/user-data/outputs/`,**與工項 MD 一起** `present_files`。
