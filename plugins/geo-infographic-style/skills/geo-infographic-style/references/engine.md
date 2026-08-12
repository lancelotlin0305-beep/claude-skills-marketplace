# 排版引擎:分層、API 與寫模板的規矩

> **寫或改模板前必讀。** 本檔說明四層的分工、可用的 API,以及為什麼某些做法會被 validator 擋下。
> 「多少」看 `tokens.json`;「為什麼與判準」看 `style-spec.md`;本檔講「怎麼寫」。

## 1. 為什麼要有引擎

改成引擎之前,5 支生成器共 1,282 行卻只共用 49 行,裡面有 **1,219 個寫死的數字字面值**——版面不是算出來的,是釘死的。結果有二:

- **換內容就壞**:模組從 5 個變 6 個,第 6 張卡直接跑到畫布外,而程式回報「OK」。
- **規則管不到實作**:`style-spec §3.1` 明訂「容器尺寸 = 內容 + 內距」,但生成器把膠囊寬寫成「圓柱半徑 × 1.66」,填充率只有 65%,**沒有違反任何可執行的檢查**。

引擎的目的就是把這兩件事變成不可能:座標由內容求解、規則由 validator 執行。

## 2. 四層與鐵則

| 層 | 檔案 | 負責 | 鐵則 |
|---|---|---|---|
| 權杖 | `tokens.json` + `scripts/tokens.js` | 字級、色盤、幾何、陰影、門檻、頁框;文字量測與斷行 | 所有「數量」的唯一出處 |
| 引擎 | `scripts/engine.js` | Box、求解器、繪製原語、頁面裝飾、Validator | 不含任何特定版型的知識 |
| 圖示 | `scripts/icons.js` | 線稿圖示庫 + fallback | 缺件回中性幾何形並警告 |
| 模板 | `templates/*.js` | 宣告「有哪些帶、每帶有哪些項」 | **不寫座標、不寫死字級色票間距** |

**跨層寫死是最常見的退步。** 模板裡出現 `font-size="22"` 或 `#1F6FD0` 就是錯的——前者換模式會縮水(§6.1),後者換色盤會失效。一律 `tokens` 取值。

## 3. 模板介面

```js
module.exports = {
  id: 'hub-flow',                       // build.js --template= 用
  accepts: c => !!c.hub && c.modules,   // 自動判定版型;寧可嚴格,誤判比沒判更糟
  render(doc, D) { /* ... */ },         // doc = Doc 實例, D = 內容 JSON
};
```

`build.js` 未指定 `--template` 時,取第一個 `accepts()` 為真的模板。

## 4. 常用 API

### 量測與斷行(`tokens`)
```js
tk.textWidth(s, size)          // 估算字寬:CJK ≈ 字級,半形 ≈ 0.55 字級
tk.capHeight(size)             // CJK 字身高 ≈ 字級 × 0.88(驗收字級用)
tk.lineHeight(size)            // 預設行高
tk.wrap(text, size, maxW)      // 一般斷行:長段落用
tk.wrapBalanced(text, size, maxW)  // 平衡斷行:短標籤/卡標題用
```

**短標籤一律用 `wrapBalanced`。** 純寬度斷行會切出「採購成本最佳／化模組」;平衡斷行加了「中文複合詞多為雙字,奇數切點加罰分」的成本項,實測五個模組名的斷點與人工斷行完全一致。內容端可用 `lines: [...]` 覆寫。

### 求解(`engine`)
```js
grid(count, { x, w, gap })              // 數量驅動等寬網格
distribute(contentWidths, { x, w, pad, minGap })  // 內容驅動分佈(分佈帶用)
stackV(heights, { top, gap })           // 垂直堆疊
fitBox(parts, { padX, gap })            // 容器尺寸由內容回推
fitDisplay(text, maxSize, availW)       // 展示型數字依寬度回推字級
```

> `fitDisplay` 是**唯一允許縮字**的情形(大數字不是內文)。其餘文字塞不下一律報錯,由模板改斷行、縮短文案或拆頁(§6.3)。

### 繪製(`doc`)
```js
doc.pageBg().decorBottom()              // L0 底圖 + 底緣裝飾
doc.decorTitleRight(titleBox.right)     // 標題右側裝飾(填補標題右方空白)
doc.text(s, x, y, { size, weight, fill, anchor, ls })   // 回傳佔用 Box
doc.paragraph(s, x, y, maxW, {...})     // 自動斷行的文字塊
doc.roundRect(box, { r, fill, stroke, sw, filter })
doc.card(box, col, { fillId })          // 厚度邊 + 主體(立體四件套)
doc.pill(text, x, y, col, {...})        // 寬度由內容決定
```

### 驗收(`doc.v`)
```js
doc.v.inside(name, child, parent, parentName, hint)  // 溢出(hint 寫「該怎麼辦」)
doc.v.clearance(name, a, b, min, ref)                // 淨距
doc.v.fill(name, usedW, totalW, kind)                // 單一容器填充率
doc.v.fillGroup(name, contentWidths, colW)           // 等寬欄群組(只驗 governing 卡)
doc.v.verticalFill(name, usedH, availH)              // 垂直填充(抓「下半整片空白」)
doc.v.noOverlap(name, boxes)
doc.v.warn(rule, msg, ref)
```

**每畫一個容器就下一個檢查。** 檢查漏了,錯誤就會靜默通過——這不是假設,是這套引擎開發過程中實際發生四次的事(見 §6)。

## 5. 寫模板的順序

1. **先算,後畫。** 所有尺寸在同一段算完(斷行 → 容器寬 → 帶高 → 垂直堆疊),再進入繪製迴圈。邊算邊畫會讓「卡高由最長欄決定」這類跨項相依算不出來。
2. **元素數量一律從 `D.xxx.length` 來**,不得假設固定數。
3. **容器尺寸 = 內容 + 內距**;等寬欄的欄寬取「該欄最寬卡所需的最小值」,不是把可用寬度等分(§3.1 例外①)。
4. **留一個可伸縮的帶**吸收剩餘垂直空間(如 hub-flow 的連線區),其餘各帶高度都由內容決定。
5. **撐滿與不溢出一樣重要**:內容明顯短於畫布時要把卡撐高並讓內容置中,否則下半頁整片空白。
6. **標題帶可省略但頁碼註腳不可亂放**:16:9 內頁座標見 `deck-anatomy.md §2`。

## 6. 已知的失敗模式(validator 都已覆蓋,新模板照樣會踩)

| 失敗模式 | 症狀 | 檢查 |
|---|---|---|
| 沿用固定欄數 | 第 N 張卡跑到畫布外,程式回報 OK | `inside` |
| 容器由外層反推 | 膠囊寬 = 半徑 × 1.66,內容只佔 65% | `fill` / `fillGroup` |
| 展示數字用固定字級 | 「38.17/100分」溢出卡外 16px | `inside` + `fitDisplay` |
| 容器高度寫死 | 第 4 列膠囊上下各溢出柱身 33px | `inside` |
| 只查溢出不查填不滿 | 內容只佔上半頁、下半整片空白 | `verticalFill` |
| 逐卡套填充率門檻 | **誤判**——§3.1 明訂短卡因等寬多出的內距可接受 | `fillGroup`(只驗 governing 卡) |
| 貼標與內容混為一談 | 導言句壓到磚上緣(貼標可越界,內容不行) | `clearance` |
| 色相寫死成字典 | 群組數超過色數直接 crash | `palette().hue(i)` 自動循環 |
| 圖示查不到 | 靜默留白 | `icons` fallback + warn |

**修好一個坑就補一條檢查。** 上表每一列都是實際踩過才加的;沒有檢查的規則等於沒有規則。

## 7. 新增模板的檢核

- [ ] `accepts()` 夠嚴格,不會搶走別的模板的內容
- [ ] 所有字級來自 `doc.T.*`、色票來自 `doc.P.hue()`、間距來自 `doc.geo()`
- [ ] 元素數量全部從資料長度來,沒有寫死的欄數/列數
- [ ] 每個容器都有 `inside` 檢查;等寬欄用 `fillGroup`;整頁有 `verticalFill`
- [ ] 溢出訊息帶 `hint`,講清楚該拆頁還是減項
- [ ] 換數量測過:項目數 ±2 都能正常產出或給出明確錯誤
- [ ] 換模式測過:`--mode=a4` 不會橫向溢出
