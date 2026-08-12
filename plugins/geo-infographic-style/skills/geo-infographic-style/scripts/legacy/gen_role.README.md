# 角色 / 中心輻射圖生成器 `gen_role.js` 使用範本

依 `references/style-spec.md` §13/§14 的「圖文結構語法」用程式生成**角色圖 / 中心輻射圖**——座標由規則自動算出,保證多級**同構**、圖文比例一致。改文字、加角色、調比例都能一鍵重出,不必手工挪 SVG。

`gen_role.js` 內含一組**示範資料**(可直接跑);換到自己的案子時只替換資料區,不動繪圖邏輯。

> 佔位說明:下文 `<SKILL>` = 本 skill 目錄;`<PROJECT>` = 你的專案資料夾;`<ASSETS>` = 素材目錄(建議 `<PROJECT>/geo-assets/`,命名 `P編號_英文名.png`)。

---

## 一、環境需求

| 需求 | 說明 |
|---|---|
| Node v18+ | 執行生成器與轉檔 |
| Playwright + Chromium | 轉 PNG(`render.js`)。安裝:`npm i -g playwright && npx playwright install chromium` |
| 素材庫 | 第 3 級主圖用,放於 `<ASSETS>` |

---

## 二、基本用法

```bash
# 語法: node gen_role.js <等級 1-3> <輸出.svg> [素材目錄]
node <SKILL>/scripts/gen_role.js 2 out_L2.svg <ASSETS>

# 轉 PNG
export NODE_PATH="$(npm root -g)"
node <SKILL>/scripts/render.js out_L2.svg
```

一次產全三級:

```bash
export NODE_PATH="$(npm root -g)"
for i in 1 2 3; do
  node <SKILL>/scripts/gen_role.js $i out_L$i.svg <ASSETS>
  node <SKILL>/scripts/render.js out_L$i.svg
done
```

> `[素材目錄]` 省略時使用腳本內建預設路徑;跨機器請顯式帶入 `<ASSETS>`。

---

## 三、三級豐富度(§13)

| 等級 | 用途 | 主圖區 | 裝飾 | 場景 |
|---|---|---|---|---|
| **1 線框** | 草稿 / 討論 / 黑白 | 線條圖示 | ✗ | ✗ |
| **2 立體** | 簡報內容頁 | 擬 3D SVG 插圖 | ✓ | ✗ |
| **3 素材場景** | 封面 / 重點頁 | 嵌入真實素材 | ✓ | ✓(天際線) |

三級**版面骨架完全相同**,只有主圖區與裝飾/場景遞增(利於等寬對照)。

### 級內開關(環境變數)
「裝飾」「場景」是開關,非獨立等級,可覆寫預設:

```bash
SCENE=0 node <SKILL>/scripts/gen_role.js 3 out.svg <ASSETS>   # 要素材、不要天際線
DECOR=0 node <SKILL>/scripts/gen_role.js 2 out.svg            # 立體卡、關背景裝飾
```

---

## 四、換到別的案子(替換資料)

打開 `gen_role.js`,只改資料區:

- `leftCards` / `rightCards`:左右兩欄的卡片陣列。每張卡:
  ```js
  {
    color:'blue',            // blue/green/orange/purple/red/gray(§1 八色語意)
    icon:'laptop',           // 主圖圖示鍵 / 對應素材鍵(見下)
    title:'卡片標題',
    pill:'膠囊文字',          // 過長會自動截寬;等長替換最穩
    side:'L',                // L=圖在左(外側) / R=圖在右
    reserved:true,           // (選填)整卡預留:虛線框
    rows:[
      {t:'項目文字'},
      {t:'預留項目', res:true},  // res:true = 預留列(虛線+時鐘+灰字)
    ]
  }
  ```
- `hubRows`:中央核心卡的平台列文字。
- 中央標題 / 副標:hub 區塊的兩行文字。

### `icon` 鍵 → 素材檔對應
第 1/2 級用 `domainIcon()` 現繪的線圖示;第 3 級改嵌 `<ASSETS>` 的去背 PNG。示範資料用的鍵:`laptop / engineer / megaphone / building / gears / shield`,各對應一個 `P編號_英文名.png`。

新增圖示:在 `domainIcon()` 加一個 `case '<鍵>'`,並在 L3 素材對應表(`useAssets` 區塊)補上該鍵的檔名。

---

## 五、設計規則(唯一出處)

- **§14** 圖文並置卡與 hub-spoke 版式(主圖 35% : 清單 65%、左右鏡像、hub-spoke 連線、核心卡維持淺色、場景素材落地)
- **§13** 三級同構原則
- **§1** 八色語意、**§3 / §3.1** 元件與留白控制

生成器是上述規則的**參考實作**;規則若調整,應同步改 `gen_role.js` 與 `style-spec.md`。

---

## 附註:三支範例生成器都內含「示範資料」,他案請整段替換

以下皆為**範例、非通用工具**——各自夾帶一份專案示範資料,套用到自己的案子時只改資料區、不動繪圖邏輯:

| 生成器 | 版型 | 要替換的資料區 |
|---|---|---|
| `gen_role.js` | 角色/中心輻射 | `leftCards` / `rightCards` / hub 標題 |
| `gen_blueprint.js` | 流程·平行卡 | `cards`(pill/title/body/asset)/ `chips` |
| `gen_blueprint2.js` | 流程·階梯成長 | 同 `gen_blueprint.js` |

> 若要徹底解耦,可把各自的資料區抽成獨立 `examples/*.json`、生成器改讀 JSON;目前為求直觀,資料與骨架同檔,以檔頭註解與本表標示替換點。
