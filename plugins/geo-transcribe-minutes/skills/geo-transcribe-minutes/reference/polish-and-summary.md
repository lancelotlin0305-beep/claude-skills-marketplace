# 順稿與重點萃取規則

## A. 順稿(逐字稿 → 可讀稿)

順稿由 Claude 直接執行,**分段處理**(每段約 10–15 分鐘的逐字稿內容一批,避免長文品質下滑)。
輸入是 `transcribe.py` 產出的 segments(含時間戳、可能含 speaker);輸出兩版:

1. **原始逐字稿**(`transcript_raw.txt`):引擎輸出**原樣保存,不做任何修改**
   (簡轉繁已在 transcribe.py 的 segments 層完成;存證用)。
2. **順稿版**:給人讀的版本,規則如下。

> 轉交 `geo-meeting-minutes-builder` 的路徑**不跑本節**——只交 raw,清理由對方執行
> (見 SKILL.md 銜接節),避免順稿改寫污染對方的「引用原話」依據。

### 順稿七規則

1. **簡轉繁+台灣用語**:引擎輸出若含簡體,先過 OpenCC `s2twp`(scripts 會自動做;若環境沒裝 opencc,由 Claude 轉換)。「軟件→軟體」「視頻→影片」「服務器→伺服器」等台灣慣用詞。
2. **同音/近音錯字修正**:ASR 常見錯誤依上下文修正(例:「在做」↔「再做」、「需求」誤成「訴求」、專有名詞誤拼)。**修正要有把握才改**;沒把握的在順稿版標 `[?]`,並列入交付說明的「待確認」清單。
3. **術語表優先**:使用者提供術語表 / 與會者名單 / 產品名時,全篇強制對齊(也回饋給轉錄階段當 prompt/keyterms)。英文術語保留原文,首次出現可括號附中文。
4. **去除口語贅詞**:「嗯」「啊」「就是說」「對不對」「那個」等填充詞刪除;口吃重複合併。**但不改變語意、不摘要**——順稿版仍是完整內容,只是變乾淨。
5. **斷句分段**:依語意重新標點、分段;每段開頭保留該段起始時間戳 `[hh:mm:ss]`;有 speaker 資訊時每段標 `發言者:`。
6. **聽不清處理**:引擎信心低或明顯亂碼的片段標 `[聽不清 hh:mm:ss]`,不要腦補。
7. **數字與單位**:金額、日期、版本號統一格式(「三百萬」→ 300 萬;日期用 YYYY/MM/DD)。

## B. 重點萃取(三種模式)

模式在流程開頭確認(見 workflow.md);萃取一律**引用時間戳**,方便回查原檔。

### B1. 會議模式(meeting)

**兩段式**:先從順稿逐字稿萃取固定 schema 的 `minutes.json`(結構化中繼檔),
再由 JSON 轉寫 `summary.md` 與 HTML——摘要與版面永遠以 JSON 為準,三份文件才不會互相漂移。

#### 萃取七規則(嚴格遵守)

1. 只依據逐字稿內容作答,**嚴禁推測、補充或美化**。
2. 無法從逐字稿確認的欄位一律填 `null`(陣列填 `[]`),不得猜測。
3. 人名、職稱照逐字稿原文,不翻譯不改寫。
4. 相對日期(「下週三」「月底」)**換算成絕對日期 YYYY-MM-DD**,基準為會議日期;
   基準不明則填 `null`,並在 `due_raw` 保留原話。
5. **實際拍板的才是決議**;僅被提出討論、未達成結論者歸 `unresolved`,不得寫進 `decision`。
6. 同一件事既是決議又衍生待辦:決議寫 `agenda_items[].decision`,待辦另列 `action_items`,
   兩邊都要有。全程未發言的出席者仍列入 `attendees`(present=true);請假者 present=false。
7. 判定疑義**往未決降級**(寫入 `unresolved`,不往決議升);交付前做**反轉檢查**
   ——後段推翻前段的決議以最後拍板為準(與 geo-meeting-minutes-builder 的
   extraction-rules 三分法同源)。

#### minutes.json schema

```json
{
  "meeting": { "title": "", "date": "YYYY-MM-DD", "time": "HH:MM-HH:MM|null",
               "location": null, "chair": null },
  "attendees": [ { "name": "", "role": null, "present": true } ],
  "tldr": [ "一句話結論,3–7 條,每條可附 (hh:mm:ss)" ],
  "agenda_items": [ {
      "seq": 1, "topic": "", "ts": "hh:mm:ss|null",
      "summary": "討論重點,三句以內,中立敘述",
      "options_considered": [ { "option": "", "pros": null, "cons": null } ],
      "decision": { "made": true, "content": "", "rationale": null,
                    "decided_by": null, "ts": "hh:mm:ss|null" }
  } ],
  "action_items": [ { "task": "", "owner": null, "due": "YYYY-MM-DD|null",
      "due_raw": null, "related_topic": null, "is_blocker": false,
      "ts": "hh:mm:ss|null" } ],
  "risks": [ { "item": "", "trigger": null, "impact": null, "owner": null } ],
  "unresolved": [ { "question": "", "raised_by": null, "next_step": null,
                    "ts": "hh:mm:ss|null" } ],
  "deferred": [ { "item": "", "reason": null, "revisit_when": null } ]
}
```

- `is_blocker`:該行動項未完成會直接卡住其他工作或影響時程才填 true。
- `ts` 一律填該內容在逐字稿的起始時間戳(查得到就填,是回查原檔的錨點)。

#### summary.md(由 minutes.json 轉寫)

依序:會議資訊 → 結論摘要(tldr)→ 決議事項(含理由/拍板者/時間戳)→
行動項目表(事項/負責人/期限/卡關/時間戳;owner 為 null 顯示「待指派」,due 為 null 顯示
due_raw 原話或「待定」)→ 討論過程摘要(依 agenda_items,含未拍板標記)→
風險 → 未解問題 → 延後事項。

### B2. 技術傳承模式(handover)

產出「技術重點 MD」,結構:

- **主題與範圍**:這份錄音在講哪個系統/流程/技術。
- **架構與脈絡**:講者描述的系統組成、資料流、相依關係(此節內容可再餵給 `geo-infographic-style` 或 `geo-bpmn-flow-builder` 畫正式圖)。
- **操作步驟/SOP**:有序步驟,含指令、路徑、參數(逐字稿聽到的指令要原樣保留,不確定拼字標 `[?]`)。
- **眉角與陷阱(Tips & Pitfalls)**:講者提到的「這裡要注意」「之前踩過雷」逐條抽出——**這是技術傳承最有價值的部分,寧多勿漏**。
- **相關資源**:提到的文件、系統、帳號、聯絡人。
- **Q&A**:現場問答整理成問/答對。

### B3. 影片重點模式(video)

產出「影片重點 MD」:分章節(依主題轉折切),每章「時間區間+標題+3 句內摘要+關鍵引述」;最後全片 5 條總結。影片有畫面資訊且引擎為 Gemini 時,可請模型一併描述關鍵畫面(投影片標題、demo 操作)。

## C. 品質底線

交付前檢核以 `workflow.md`「品質門檻」為唯一清單,依其逐條過,此處不重複。
