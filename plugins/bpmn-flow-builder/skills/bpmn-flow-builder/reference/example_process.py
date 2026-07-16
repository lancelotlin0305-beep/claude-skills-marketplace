# -*- coding: utf-8 -*-
"""範例:定義流程並產出全部交付物(每張圖 6 檔;圖檔 XML 依 emit 的 fmt 擇一:.bpmn 預設/.drawio)。
執行: python3 example_process.py [輸出資料夾]

涵蓋:
  build_manual()   單 pool,手動指定 row/route(精修)
  build_auto()     單 pool,只給節點+角色+邊,auto_layout 自動分層與選路
  build_parallel() 單 pool,平行閘道(kind="parallel":同時分岔、合流等齊)
  build_bands()    單 pool + 橫向系統分區(bands 第二軸:系統/階段)
  build_collab()   多 pool 協作,pool 之間以 message flow 連接(跨組織傳訊息)
emit() 對 Proc 或 Collab 皆可用,一次產出 6 檔並自動跑 check_layout;
src=__file__ 會把本定義檔複製進輸出資料夾,change*=... 寫入版本記錄表。
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from bpmn_builder import Proc, Collab, emit


def build_manual():
    p = Proc("範例_書類初稿產製工作流程圖", "範例｜書類初稿產製工作流程圖",
             ["承辦人", "AI系統", "既有系統"],
             version="V01.00")   # 版號:結構變動進主版(次版歸00)、僅改文字次版+1;省略則預設 V01.00
    # add(id, 型別, 名稱, 泳道索引, 列索引)   型別: start / end / gateway / task
    p.add("s",   "start",   "收到案件",            0, 0)
    p.add("read","task",    "讀取卷證資料",         2, 1)
    p.add("gen", "task",    "AI生成初稿",           1, 2)
    p.add("gw",  "gateway", "符合?",               1, 3)   # 排他閘道名稱 ≤3 字
    p.add("edit","task",    "人工編修審閱",         0, 4)
    p.add("imp", "task",    "匯入既有系統",         2, 4)
    p.add("ft",  "task",    "回饋/再訓練",          1, 5)
    p.add("e",   "end",     "完成",                2, 5)
    # route: auto(預設)/ straight(同欄直下)/ enterRight(從右側接入)
    #        outLeft / outRight(分歧分支自左/右頂點出)/ backLoop(回饋迴圈走最左通道)
    #        sideRight / sideLeft(同泳道跳層走泳道右/左緣通道,不穿過中間節點)
    p.flow("s", "read")
    p.flow("read", "gen")
    p.flow("gen", "gw", route="straight")
    p.flow("gw", "edit", "否", route="outLeft")
    p.flow("gw", "imp", "是", route="outRight")
    p.flow("edit", "ft")
    p.flow("ft", "gen", route="backLoop")
    p.flow("imp", "e", route="straight")
    return p


def build_auto():
    p = Proc("範例_自動佈局工作流程圖", "範例｜自動佈局工作流程圖(免手動排版)",
             ["承辦人", "AI系統", "既有系統"])
    p.add("s",   "start",   "收到案件",      0)      # 省略 row → 自動分層
    p.add("read","task",    "讀取卷證資料",   2)
    p.add("gen", "task",    "AI生成初稿",     1)
    p.add("gw",  "gateway", "符合?",         1)   # 排他閘道名稱 ≤3 字
    p.add("edit","task",    "人工編修審閱",   0)
    p.add("imp", "task",    "匯入既有系統",   2)
    p.add("ft",  "task",    "回饋/再訓練",    1)
    p.add("e",   "end",     "完成",          2)
    p.flow("s", "read");  p.flow("read", "gen");  p.flow("gen", "gw")
    p.flow("gw", "edit", "否");  p.flow("gw", "imp", "是")
    p.flow("edit", "ft");  p.flow("ft", "gen");  p.flow("imp", "e")
    return p


def build_parallel():
    p = Proc("範例_平行作業工作流程圖", "範例｜平行作業工作流程圖(同時進行)",
             ["受理", "內勤A", "內勤B"])
    # kind="parallel":分岔同時啟動、合流等全部到齊
    p.add("s",    "start",   "收件",        0)
    p.add("fork", "gateway", "",            0, kind="parallel")
    p.add("a",    "task",    "建立案件資料", 1)
    p.add("b",    "task",    "通知關係人",   2)
    p.add("join", "gateway", "",            0, kind="parallel")
    p.add("sum",  "task",    "彙整送件",     0)
    p.add("e",    "end",     "完成",        0)
    p.flow("s", "fork")
    p.flow("fork", "a"); p.flow("fork", "b")
    p.flow("a", "join"); p.flow("b", "join")
    p.flow("join", "sum"); p.flow("sum", "e")
    return p


def build_bands():
    """橫向系統分區:垂直泳道給角色,bands 給第二軸(系統/階段)。"""
    p = Proc("範例_系統分區工作流程圖", "範例｜系統分區工作流程圖",
             ["承辦人", "主管"],
             bands=[("既有系統", ["s", "t1"]),
                    ("AI輔助系統", ["t2", "t3", "e"])])
    p.add("s",  "start", "收到案件申請資料", 0)   # >4 字 → 標籤自動置於圓圈右側
    p.add("t1", "task",  "登錄案件",         0)
    p.add("t2", "task",  "AI生成摘要",       0)
    p.add("t3", "task",  "審核摘要",         1)
    p.add("e",  "end",   "完成",             1)
    p.flow("s", "t1"); p.flow("t1", "t2"); p.flow("t2", "t3")
    p.flow("t3", "e", route="straight")
    return p


def build_collab():
    c = Collab("範例_跨組織協作工作流程圖", "範例｜跨組織協作工作流程圖(訂購)")
    buyer = c.add_pool(Proc("顧客", "顧客", ["顧客"]))
    buyer.add("b0", "start", "提出需求", 0)
    buyer.add("b1", "task",  "送出訂單", 0)
    buyer.add("b2", "task",  "付款取貨", 0)
    buyer.add("b3", "end",   "完成",    0)
    buyer.flow("b0", "b1"); buyer.flow("b1", "b2"); buyer.flow("b2", "b3")

    seller = c.add_pool(Proc("供應商", "供應商", ["業務", "倉儲"]))
    seller.add("s0", "start", "收到訂單",   0)
    seller.add("s1", "task",  "備貨出貨",   1)
    seller.add("s2", "task",  "出貨並收款", 0)
    seller.add("s3", "end",   "結案",      0)
    seller.flow("s0", "s1"); seller.flow("s1", "s2"); seller.flow("s2", "s3")

    c.message("b1", "s0", "訂單")          # 顧客 → 供應商
    c.message("s2", "b2", "貨品/收據")      # 供應商 → 顧客
    return c


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    for x in (build_manual(), build_auto(), build_parallel(), build_bands(), build_collab()):
        emit(x, outdir, src=__file__,
             change="初版產出", change_kind="初版", change_source="流程說明")
    print("done ->", os.path.abspath(outdir))
