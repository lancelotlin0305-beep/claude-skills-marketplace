#!/usr/bin/env python3
"""drawio_import:.drawio 反向解析與差異比對(人工微調整合回去用)。

使用者在 draw.io 手動調整(挪節點、改文字、增刪節點/連線)後上傳 .drawio,
以本工具把變更整合回流程定義:
  1. 解析上傳檔(單頁或多頁)→ 標準結構:節點吸附回格線
     (lane/sub/row 網格;政策:保留自動佈局能力,不保留任意座標)
  2. show    列印重建的定義(可直接對照/貼回 _流程定義.py)
  3. diff    與上一版 .drawio 比對 → 結構/文字差異清單 + 建議版號進位
差異清單先交使用者確認,確認後才把變更套回 _流程定義.py 重產全部交付物。

用法:
  python3 drawio_import.py show <檔.drawio> [頁碼(1起算,預設全部)]
  python3 drawio_import.py diff <舊.drawio> <新.drawio>

限制:僅辨識本 skill 產出的形狀樣式(mxgraph.bpmn 事件/閘道、圓角任務);
使用者以其他樣式新增的形狀一律視為 task 並提示確認。
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpmn_builder import (POOL_Y, LANE_LABEL_H, ROW_H, LANE_W,  # noqa: E402
                          bump_version)


# 規範色(與 bpmn_builder.STYLE 對應)用於區分同構型事件
_YELLOW = "#fff2cc"


_EV_SYMBOLS = {"message": "message", "timer": "timer", "error": "error",
               "escalation": "escalation", "conditional": "conditional",
               "compensation": "compensation"}


def _node_type(style):
    """由 style 反推節點型別與(task/gateway/事件)kind。回傳 (t, kind, certain)。
    事件 kind:擲出(throw)以 outline=throwing 且非 catch 記號難分,
    v1 一律回 catch;邊界事件的宿主資訊無法自 .drawio 還原,
    以一般事件回讀並於 show 提示人工確認。"""
    if "mxgraph.bpmn.gateway2" in style:
        if "symbol=multiple" in style:
            return "gateway", "event", True       # 事件型閘道
        if "gwType=parallel" in style:
            return "gateway", "parallel", True
        if "outline=end" in style:
            return "gateway", "inclusive", True
        return "gateway", "exclusive", True
    if "mxgraph.bpmn.event" in style:
        for t2, sym in _EV_SYMBOLS.items():
            if "symbol=%s" % sym in style:
                return t2, "catch", True
        if "outline=end" in style:
            return "end", None, True
        if _YELLOW in style:
            return "terminate", None, True        # 規範:流程中止(黃圈)
        return "start", None, True
    if "mxgraph.flowchart.annotation_2" in style:
        return "note", None, True
    if "mxgraph.bpmn.task2" in style:
        kind = "generic"
        if "taskMarker=user" in style:
            kind = "user"
        elif "taskMarker=service" in style:
            kind = "system"
        elif "taskMarker=send" in style:
            kind = "send"
        elif "taskMarker=receive" in style:
            kind = "receive"
        elif "taskMarker=script" in style:
            kind = "script"
        elif "isLoopSub=1" in style:
            kind = "subprocess"
        if "bpmnShapeType=call" in style:
            kind = "call"
        return "task", kind, True
    if "mxgraph.bpmn.data2" in style:
        if "bpmnTransferType=input" in style:
            return "input", None, True
        if "bpmnTransferType=output" in style:
            return "output", None, True
        return "input", None, False
    if "shape=datastore" in style:
        return "database", None, True
    if "rounded=1" in style:
        return "task", "generic", True
    return "task", "generic", False   # 未知樣式:當一般任務,提示確認


def parse_page(diagram):
    """單一 <diagram> → dict(name, lanes{pool: [泳道名...]}, nodes, flows, messages)。
    節點吸附回格線:lane/sub 由泳道框幾何反查,row 由 y 反算後四捨五入。"""
    root = diagram.find(".//root")
    cells = {c.get("id"): c for c in root.findall("mxCell")}

    def geo(c):
        g = c.find("mxGeometry")
        return (float(g.get("x", 0)), float(g.get("y", 0)),
                float(g.get("width", 0)), float(g.get("height", 0)))

    # 泳道框(dio_lane_{pool}_{i})與泳道名(dio_lanehdr_{pool}_{i})
    lanes = {}       # pool_idx -> [(lane_idx, x, w, name)]
    for cid, c in cells.items():
        m = re.match(r"dio_lane_(\d+)_(\d+)$", cid or "")
        if m and c.get("vertex") == "1":
            x, _y, w, _h = geo(c)
            hdr = cells.get(f"dio_lanehdr_{m.group(1)}_{m.group(2)}")
            lanes.setdefault(int(m.group(1)), []).append(
                (int(m.group(2)), x, w, (hdr.get("value") if hdr is not None
                                         else f"泳道{m.group(2)}")))
    for k in lanes:
        lanes[k].sort()

    def snap(cx, cy):
        """中心點 → (pool, lane, sub, row);找不到泳道回 None。"""
        for pk, ls in lanes.items():
            for li, x, w, _nm in ls:
                if x <= cx < x + w:
                    sub = min(int((cx - x) // LANE_W), max(int(w // LANE_W) - 1, 0))
                    row = max(round((cy - POOL_Y - LANE_LABEL_H - ROW_H / 2.0)
                                    / ROW_H), 0)
                    return pk, li, sub, row
        return None

    nodes, unknown = {}, []
    for cid, c in cells.items():
        if c.get("vertex") != "1" or (cid or "").startswith("dio_"):
            continue
        x, y, w, h = geo(c)
        t, kind, certain = _node_type(c.get("style", ""))
        pos = snap(x + w / 2.0, y + h / 2.0)
        if pos is None:
            unknown.append(cid)
            continue
        pk, li, sub, row = pos
        nodes[cid] = dict(id=cid, t=t, kind=kind,
                          name=(c.get("value") or "").replace("\n", "\\n"),
                          pool=pk, lane=li, sub=sub, row=row, certain=certain)
    flows, messages, assocs = [], [], []
    for cid, c in cells.items():
        if c.get("edge") != "1":
            continue
        s, tg = c.get("source"), c.get("target")
        if s not in nodes or tg not in nodes:
            continue                     # 端點掛在框架/不明 cell,略過並於 show 提示
        lab = c.get("value") or ""
        st = c.get("style", "")
        if "endArrow=none" in st or "dashPattern=1 4" in st:
            assocs.append((s, tg, lab))  # 關連(點線、無箭頭)
        elif "dashed=1" in st and nodes[s]["pool"] != nodes[tg]["pool"]:
            messages.append((s, tg, lab))
        else:
            flows.append((s, tg, lab))
    return dict(name=diagram.get("name", ""), lanes=lanes, nodes=nodes,
                flows=flows, messages=messages, assocs=assocs, unknown=unknown)


def parse_file(path):
    tree = ET.parse(path)
    return [parse_page(d) for d in tree.getroot().findall("diagram")]


def show(path, page=None):
    pages = parse_file(path)
    idxs = range(len(pages)) if page is None else [page - 1]
    for i in idxs:
        pg = pages[i]
        print(f"=== 頁 {i+1}:{pg['name']} ===")
        for pk, ls in sorted(pg["lanes"].items()):
            print(f"  pool {pk} 泳道:{[nm for _i, _x, _w, nm in ls]}")
        for n in pg["nodes"].values():
            mark = "" if n["certain"] else "   # ⚠ 未知樣式,暫視為 task,請確認"
            sub = f", sub={n['sub']}" if n["sub"] else ""
            print(f"  add({n['id']!r}, {n['t']!r}, \"{n['name']}\", "
                  f"lane={n['lane']}, row={n['row']}{sub})"
                  + (f"  # kind={n['kind']}" if n["kind"] else "") + mark)
        for s, t, lab in pg["flows"]:
            print(f"  flow({s!r}, {t!r}" + (f", \"{lab}\"" if lab else "") + ")")
        for s, t, lab in pg["messages"]:
            print(f"  message({s!r}, {t!r}" + (f", \"{lab}\"" if lab else "") + ")")
        for s, t, lab in pg["assocs"]:
            print(f"  assoc({s!r}, {t!r}" + (f", \"{lab}\"" if lab else "") + ")")
        if pg["unknown"]:
            print("  ⚠ 落在泳道之外、未納入的形狀:", ", ".join(pg["unknown"]))


def diff(old_path, new_path):
    olds, news = parse_file(old_path), parse_file(new_path)
    structural = text = False
    for i in range(max(len(olds), len(news))):
        title = (news[i]["name"] if i < len(news)
                 else olds[i]["name"]) or f"頁 {i+1}"
        print(f"=== {title} ===")
        if i >= len(olds):
            print("  + 新增整頁"); structural = True; continue
        if i >= len(news):
            print("  - 刪除整頁"); structural = True; continue
        o, n = olds[i], news[i]
        okeys, nkeys = set(o["nodes"]), set(n["nodes"])
        for k in sorted(nkeys - okeys):
            print(f"  + 新增節點 {k}「{n['nodes'][k]['name']}」"); structural = True
        for k in sorted(okeys - nkeys):
            print(f"  - 刪除節點 {k}「{o['nodes'][k]['name']}」"); structural = True
        for k in sorted(okeys & nkeys):
            a, b = o["nodes"][k], n["nodes"][k]
            if a.get("kind") != b.get("kind"):
                print(f"  ~ 改型 {k}:{a['t']}/{a.get('kind')} → {b['t']}/{b.get('kind')}")
                structural = True
            if a["name"] != b["name"]:
                print(f"  ~ 改名 {k}:「{a['name']}」→「{b['name']}」"); text = True
            if (a["lane"], a["sub"], a["row"]) != (b["lane"], b["sub"], b["row"]):
                print(f"  ~ 挪位 {k}:lane {a['lane']}/sub {a['sub']}/row {a['row']}"
                      f" → lane {b['lane']}/sub {b['sub']}/row {b['row']}(已吸附格線)")
                text = True               # 純挪位視為版面調整 → 次版
        of = {(s, t): lab for s, t, lab in o["flows"]}
        nf = {(s, t): lab for s, t, lab in n["flows"]}
        for k in sorted(set(nf) - set(of)):
            print(f"  + 新增連線 {k[0]}→{k[1]}"); structural = True
        for k in sorted(set(of) - set(nf)):
            print(f"  - 刪除連線 {k[0]}→{k[1]}"); structural = True
        for k in sorted(set(of) & set(nf)):
            if of[k] != nf[k]:
                print(f"  ~ 連線標籤 {k[0]}→{k[1]}:「{of[k]}」→「{nf[k]}」"); text = True
    kind = "結構" if structural else ("文字" if text else "無差異")
    print(f"\n=> 差異類型:{kind}")
    if structural or text:
        print(f"   建議版號:bump_version(舊版號, structural={structural})"
              f"(例 V01.00 → {bump_version('V01.00', structural)})")
    return structural, text


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "show":
        show(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
    elif cmd == "diff":
        diff(sys.argv[2], sys.argv[3])
    else:
        print(__doc__); sys.exit(1)


if __name__ == "__main__":
    main()
