# -*- coding: utf-8 -*-
"""BPMN 2.0 產生器(直式 / 垂直泳道)。

支援:
  * 單一 pool:Proc(角色=泳道、順序流、排他/平行/包容閘道、bands 橫向系統分區)
  * 多 pool 協作:Collab(多個 Proc 並排,pool 之間以 message flow 虛線連接)
  * 自動佈局(省略 row)、離線版面檢查(check_layout)與可讀性評分(layout_score)
  * id 雙軌:pid/cid/節點 id 可含中文(檔名/顯示);XML 內自動用 _ncname() 清洗
    成 ASCII NCName(xid),bpmn.io / draw.io 皆合法

公開 API:
  Proc(pid, name, lanes, bands=None, version="V01.00")
    .add(id, type, name, lane, row=None, dx=0, kind="exclusive")
        type: start / end / gateway / task
        kind(僅 gateway): exclusive(預設) / parallel / inclusive
    .flow(src, tgt, label="", route="auto")
  Collab(cid, name, version="V01.00")
    .add_pool(Proc) -> Proc
    .message(src_nodeid, tgt_nodeid, label="")   # 跨 pool 的訊息流
  auto_layout(p) / check_layout(p) / check_semantics(x) / layout_score(issues)
  build_bpmn(x)                                 # BPMN 2.0 XML(bpmn.io 用)
  build_drawio(x) / build_drawio_multi([x,..])  # mxGraph XML(draw.io 用;兩格式不相容)
  emit_multi(diagrams, project, outdir, ...)    # 多圖一檔專案級交付(多頁 .drawio)
  build_svg(x, pad_aspect=True) / build_md(x)
  build_viewer_html(x)                          # 可縮放 HTML 檢視器(含節點搜尋)
  bump_version(v, structural)                   # 版號進位(規則見 reference/workflow.md)
  emit(x, outdir, viewer=True, src=None,        # x 可為 Proc 或 Collab;固定 6 檔,
       fmt="drawio",                            #   圖檔 XML 預設 drawio(明講才用 bpmn)
       change=None, change_kind=None, change_source=None)
"""
import os, math, re, hashlib, time
from xml.sax.saxutils import escape

MIN_ASPECT = 1.3                   # viewBox 最低寬高比:過窄的直式圖在預覽器會裁底
PAD_CAP = 2.0                      # 補白封頂:補白後寬 ≤ 內容寬 × PAD_CAP(主圖至少佔畫布一半),
                                   # 超長圖不再被補白稀釋成細條;封頂生效時 SVG 根元素標
                                   # data-pad="capped",validate_bpmn.py 據此放行並改提醒
BAND_COLORS = [("#f2f8f2", "#6f9f78"), ("#f6f4fb", "#8a7fb8"),
               ("#fdf6ec", "#c2955a"), ("#eef6fa", "#5a8fb0")]

POOL_X, POOL_Y = 140, 70
POOL_HEADER_W = 30
LANE_W = 230
ROW_CAP = 12                       # 自動佈局列數閾值:超過即視為「過長」
ROW_PENALTY = 4                    # 選型評分:每超出 ROW_CAP 一列計 4 分(交叉為 10)——
                                   # 「使列數減下來」是目標的一部分:加寬省 3 列(-12)
                                   # 即使多一條交叉(+10)仍中選;僅當加寬造成的缺陷
                                   # 比「過長」更嚴重時才放棄
MAX_SUBS = 3
LINE_GAP = 12                      # 統一錯開間距:讓位軌距/走廊錯開/分軌
                                   # 位移共用(夠辨識即可、不過寬,可調)
MIN_LINE_GAP = 10                  # 平行連線最小間距門檻(< LINE_GAP,
                                   # 幾何用 12 錯開後不會自我觸發)
FRAME_TOL = 4                      # 連線與框線(泳道邊界/pool 框/容器框)
                                   # 視為沿線重疊的距離容差;交錯(垂直穿越)
                                   # 允許,沿線重疊不允許                       # 泳道子欄上限:雙子欄壓完仍超標時試三子欄,再寬不試
LANE_LABEL_H = 36
ROW_H = 120
TASK_W, TASK_H = 158, 66
EV_D = 38
GW_D = 52
GAP = 24
POOL_GAP = 90                      # 多 pool 之間的水平間距(供 message flow 走線)

GW_TAG = {"exclusive": "exclusiveGateway",
          "event": "eventBasedGateway",
          "parallel":  "parallelGateway",
          "inclusive": "inclusiveGateway"}

# ---------------------------------------------------------------------------
# 組織 BPMN 繪製規範(圖例):配色採 draw.io 標準色盤,SVG/.bpmn DI/.drawio
# 三種輸出統一由此讀取;規範改版時呼叫 load_style("style.json") 覆蓋即可。
# ---------------------------------------------------------------------------
STYLE = {
    "start":       {"fill": "#f8cecc", "stroke": "#b85450", "sw": 1.8},  # 流程開始(粉紅)
    "terminate":   {"fill": "#fff2cc", "stroke": "#d6b656", "sw": 1.8},  # 流程中止(黃)
    "end":         {"fill": "#f8cecc", "stroke": "#b85450", "sw": 3.2},  # 流程結束(紅粗框)
    "message":     {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},  # 訊息觸發(信封)
    "timer":       {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},  # 時間觸發(時鐘)
    "gateway":     {"fill": "#dae8fc", "stroke": "#6c8ebf"},             # 關口(淡藍)
    "task_user":   {"fill": "#d5e8d4", "stroke": "#82b366"},   # 使用者功能(綠)
    "task_system": {"fill": "#dae8fc", "stroke": "#6c8ebf"},   # 系統內部功能(藍)
    "task_subprocess": {"fill": "#e1d5e7", "stroke": "#9673a6"},  # 子流程(紫,[+])
    "task_generic": {"fill": "#ffffff", "stroke": "#444444"},  # 一般任務(白,預設)
    "artifact":    {"fill": "#ffffff", "stroke": "#5a6b7b"},   # 工件(Input/Output/DB)
    "error":       {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},
    "escalation":  {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},
    "conditional": {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},
    "compensation": {"fill": "#ffffff", "stroke": "#5a6b7b", "sw": 1.8},
    "task_send":   {"fill": "#ffffff", "stroke": "#444444"},
    "task_receive": {"fill": "#ffffff", "stroke": "#444444"},
    "task_script": {"fill": "#ffffff", "stroke": "#444444"},
    "task_call":   {"fill": "#ffffff", "stroke": "#333333"},  # 呼叫活動(粗框)
}
EVENT_TS = ("start", "end", "terminate", "message", "timer",
            "error", "escalation", "conditional", "compensation")
EVDEF = {"message": "messageEventDefinition", "timer": "timerEventDefinition",
         "error": "errorEventDefinition", "escalation": "escalationEventDefinition",
         "conditional": "conditionalEventDefinition",
         "compensation": "compensateEventDefinition"}
NONGRID_TS = ("input", "output", "note")   # 不佔流程格位
ARTIFACT_TS = ("input", "output", "database")
TASK_KINDS = ("user", "system", "subprocess", "generic",
              "send", "receive", "script", "call")


def load_style(path):
    """自 JSON 檔載入規範覆蓋(鍵同 STYLE;僅覆蓋提供的鍵)。"""
    import json
    for k, v in json.load(open(path, encoding="utf-8")).items():
        STYLE.setdefault(k, {}).update(v)



def node_size(t, name=""):
    if t in EVENT_TS:
        return EV_D, EV_D
    if t == "gateway":
        return GW_D, GW_D          # 菱形固定尺寸;名稱 ≤3 字單行、4 字折兩行,≥5 字由版面檢查警告
    if t in ("input", "output"):
        return 42, 52              # 文件形工件(折角);名稱置下方
    if t == "database":
        return 56, 50              # 圓柱
    if t == "note":
        # 文字註解(開口括號):高度隨字數自動加高(11 字/行、14px 行高),
        # 文字必須收在幾何框內——框外標籤會溢出泳道且逃過幾何檢核(20260716.02)
        lines = max(1, -(-len(name) // 11))
        return 150, max(44, lines * 14 + 16)
    return TASK_W, TASK_H


def row_y(r):
    return POOL_Y + LANE_LABEL_H + r * ROW_H


# ---------------------------------------------------------------------------
# id 清洗:bpmn.io 的 ID 驗證只接受 ASCII NCName(字母/底線開頭,
# 之後限 [A-Za-z0-9_.-]);中文等其他字元一律不合法(illegal ID)。
# 中文請放 name 屬性,id 交由此函式保證合法;同一原始字串必得同一結果,
# 不同原始字串以 md5 前 6 碼保證不碰撞。
# 另:JS 內建屬性名(Object/Array prototype 方法與 length)不可作 cell id——
# draw.io(mxGraph)以純 JS 物件/陣列作 id 查找表,撞名時查得內建函式而非
# 圖形物件,開檔即報「x.setId is not a function」(20260710.10 桌面版 CLI 實測:
# fill/map/push/filter/sort/toString/constructor 全數開檔失敗)。
# 撞名者走既有「安全名_md5前6碼」路徑改名(如 fill → fill_a552c7),確定性不變。
# ---------------------------------------------------------------------------
_NC_OK = re.compile(r'^[A-Za-z_][A-Za-z0-9_.\-]*$')

_JS_RESERVED = frozenset((
    # Object.prototype
    "constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
    "toLocaleString", "toString", "valueOf", "__proto__",
    "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
    # Array.prototype + length(JS 區分大小寫,僅完全同名才撞)
    "at", "concat", "copyWithin", "entries", "every", "fill", "filter",
    "find", "findIndex", "findLast", "findLastIndex", "flat", "flatMap",
    "forEach", "includes", "indexOf", "join", "keys", "lastIndexOf", "length",
    "map", "pop", "push", "reduce", "reduceRight", "reverse", "shift",
    "slice", "some", "sort", "splice", "unshift", "values", "with",
))


def _ncname(s):
    s = str(s)
    if _NC_OK.match(s) and s not in _JS_RESERVED:
        return s
    safe = re.sub(r'[^A-Za-z0-9_.\-]+', '_', s).strip('_.')
    if safe and not (safe[0].isalpha() or safe[0] == '_'):
        safe = '_' + safe
    h = hashlib.md5(s.encode('utf-8')).hexdigest()[:6]
    return f"{safe}_{h}" if safe else f"id_{h}"


# ---------------------------------------------------------------------------
# 模型
# ---------------------------------------------------------------------------
class Proc:
    def __init__(self, pid, name, lanes, ox=None, bands=None, version="V01.00"):
        self.pid = str(pid)        # 檔名/顯示用,可含中文
        self.xid = _ncname(pid)    # XML 專用 id:ASCII NCName(bpmn.io 要求)
        self.name = name
        self.lanes = lanes
        self.lane_subs = [1] * len(lanes)  # 各泳道子欄數;自動佈局加寬版會把長鏈泳道設為 2
        self.lane_pad = {}          # 河道加寬:{lane: 額外寬 px}
        self.assocs = []           # 關連(點線):[(aid, src, tgt, label), ...]
        self.containers = []       # 展開/事件子流程容器:[(cid, name, [成員id], kind)]
        self.version = version     # 版號 V主版.次版;進位規則見 reference/workflow.md
        self.ox = ox               # pool 原點 x;None = 獨立使用,預設 POOL_X
        self.bands = [(bn, [_ncname(i) for i in ids])
                      for bn, ids in (bands or [])]  # 橫向系統分區:[(名稱, [節點id, ...]), ...]
        self.nodes = {}
        self.flows = []

    def band_spans(self):
        """回傳 [(名稱, y0, y1, 底色, 框色)],依 bands 定義順序;需在佈局完成後呼叫。"""
        spans = []
        for k, (name, ids) in enumerate(self.bands):
            rows = [self.nodes[i]["row"] for i in ids if i in self.nodes]
            if not rows:
                continue
            fill, stroke = BAND_COLORS[k % len(BAND_COLORS)]
            spans.append((name, row_y(min(rows)), row_y(max(rows)) + ROW_H, fill, stroke))
        return spans

    def lane_width(self, i):
        """泳道 i 的寬度 = 子欄數 × LANE_W + 河道加寬量(lane_pad,
        五輪修正於通道空間不足時自動加寬)。"""
        return self.lane_subs[i] * LANE_W + self.lane_pad.get(i, 0)

    def pool_width(self):
        return POOL_HEADER_W + sum(self.lane_width(i) for i in range(len(self.lanes)))

    def _lane_x(self, i):
        ox = POOL_X if self.ox is None else self.ox
        return ox + POOL_HEADER_W + sum(self.lane_width(j) for j in range(i))

    def add(self, nid, t, name, lane, row=None, dx=0, kind=None,
            attach=None, interrupting=True, loop=False):
        """t: start/end/terminate/message/timer/error/escalation/conditional/
              compensation(事件;kind="catch"預設/"throw",單圈=起訖、
              雙圈=流程中間,依進出線自動判定)、gateway、task、
              input/output/database/note(工件與註解,以 assoc() 連接)
        attach="節點id":邊界事件,貼附於該活動邊框(interrupting=False 為
              非中斷,虛線雙圈);loop=True:活動迴圈記號
        kind: gateway → exclusive(預設,素菱形)/parallel/inclusive/event(事件型)
              task    → generic(預設,白)/user(綠)/system(藍)/subprocess(紫)/
                        send/receive/script/call(呼叫活動,粗框)"""
        nid = _ncname(nid)
        if kind is None:
            kind = "exclusive" if t == "gateway" else \
                   ("generic" if t == "task" else
                    ("catch" if t in EVDEF else None))
        if t == "task" and kind not in TASK_KINDS:
            raise ValueError(f"task kind 只能是 {TASK_KINDS},收到 {kind!r}")
        if t in EVDEF and kind not in ("catch", "throw"):
            raise ValueError(f"事件 kind 只能是 catch/throw,收到 {kind!r}")
        if t == "gateway" and kind not in ("exclusive", "parallel",
                                           "inclusive", "event"):
            raise ValueError(f"gateway kind 只能是 exclusive/parallel/"
                             f"inclusive/event,收到 {kind!r}")
        w, h = node_size(t, name)
        if attach is not None:
            attach = _ncname(attach)
        self.nodes[nid] = dict(id=nid, t=t, name=name, lane=lane, row=row,
                               dx=dx, w=w, h=h, kind=kind, sub=0,
                               attach=attach, interrupting=interrupting,
                               loop=loop)
        return nid

    def container(self, cid, name, members, kind="expanded"):
        """展開/事件子流程容器:kind="expanded"(實線)/"event"(虛線)。
        v1 為視覺群組(hull)+ .bpmn 以 Group 表示,不做語意巢套。"""
        if kind not in ("expanded", "event"):
            raise ValueError("container kind 只能是 expanded/event")
        self.containers.append((_ncname(cid), name,
                                [_ncname(m) for m in members], kind))

    def container_spans(self):
        """回傳 [(cid, name, x0, y0, x1, y1, kind)];需佈局完成後呼叫。
        x 齊格:取成員所跨泳道並集邊界內縮 6(固定於保留帶,避免與
        讓位軌/側通道貼線);y 頂 -50:標題帶(y0+4~22)讓出
        _orth_down 折點帶(top-24)。"""
        out = []
        for cid, name, members, kind in self.containers:
            ms = [self.nodes[m] for m in members if m in self.nodes]
            if not ms:
                continue
            lo_l = min(m["lane"] for m in ms)
            hi_l = max(m["lane"] for m in ms)
            x0 = self._lane_x(lo_l) + 6
            x1 = self._lane_x(hi_l) + self.lane_width(hi_l) - 6
            y0 = min(m["y"] for m in ms) - 50
            y1 = max(m["y"] + m["h"] for m in ms) + 22
            out.append((cid, name, x0, y0, x1, y1, kind))
        return out

    def assoc(self, src, tgt, label=""):
        """關連(點線、無箭頭):把工件(input/output/database)掛到節點,
        或節點掛工件;不參與順序流語意,但參與版面與佈局。"""
        aid = f"as_{len(self.assocs)+1}"
        self.assocs.append((aid, _ncname(src), _ncname(tgt), label))
        return aid

    def _place(self, nid):
        n = self.nodes[nid]
        ox = POOL_X if self.ox is None else self.ox
        n["ox"] = ox
        host_id = n.get("attach")
        if host_id and host_id in self.nodes and \
                self.nodes[host_id].get("x") is not None:
            h = self.nodes[host_id]
            # 同宿主邊界的排列(右起往左):目標在右者排前(靠右),
            # 目標在左者排後(靠左);同向群內「目標列淺者靠讓位側」
            # ——讓位軌的幾何序因此等同目標深度序,巢狀不交叉
            sibs = [k2 for k2, m in self.nodes.items()
                    if m.get("attach") == host_id]
            def _side_r(bid):
                tgt = next((t for _f, s2, t, _l, _r in self.flows
                            if s2 == bid and t in self.nodes), None)
                if tgt is None:
                    return ("R", 0)
                tn, hh = self.nodes[tgt], self.nodes[host_id]
                left = tn["lane"] < hh["lane"] or \
                    (tn["lane"] == hh["lane"] and tn.get("sub", 0) <
                     hh.get("sub", 0))
                r = tn["row"] if tn["row"] is not None else 0
                return ("L" if left else "R", r)
            # 依目標方向分側:左群貼左角、右群貼右角,群內目標淺者在外
            # (近讓位側=淺廊外軌,巢狀不交叉);中央永遠讓出,宿主的
            # 順序流可直下出線不被邊界圓擋路
            grpL = sorted([b for b in sibs if _side_r(b)[0] == "L"],
                          key=lambda b: (_side_r(b)[1], b))
            grpR = sorted([b for b in sibs if _side_r(b)[0] == "R"],
                          key=lambda b: (_side_r(b)[1], b))
            if nid in grpL:
                g = grpL.index(nid)
                n["x"] = int(h["x"] - n["w"] * 0.25 + g * (n["w"] + 8))
            else:
                g = grpR.index(nid)
                n["x"] = int(h["x"] + h["w"] - n["w"] * 0.75
                             - g * (n["w"] + 8))
            n["_bidx"] = (grpL + grpR).index(nid)
            n["_bmax"] = len(sibs) - 1
            n["y"] = int(h["y"] + h["h"] - n["h"] / 2)
            n["row"] = h["row"]
            n["_lane_left"] = h.get("_lane_left", n.get("_lane_left", 0))
            n["_lane_right"] = h.get("_lane_right", n.get("_lane_right", 0))
            return
        n["x"] = self._lane_x(n["lane"]) \
            + self.lane_pad.get(n["lane"], 0) // 2 \
            + n.get("sub", 0) * LANE_W \
            + (LANE_W - n["w"]) // 2 + n["dx"]
        n["_lane_left"] = self._lane_x(n["lane"])
        n["_lane_right"] = self._lane_x(n["lane"]) + self.lane_width(n["lane"])
        n["y"] = row_y(n["row"]) + (ROW_H - n["h"]) // 2

    def flow(self, src, tgt, label="", route="auto"):
        fid = "f_%d" % (len(self.flows) + 1)
        self.flows.append((fid, _ncname(src), _ncname(tgt), label, route))


class Collab:
    def __init__(self, cid, name, version="V01.00"):
        self.cid = str(cid)        # 檔名/顯示用,可含中文
        self.xid = _ncname(cid)    # XML 專用 id:ASCII NCName(bpmn.io 要求)
        self.name = name
        self.version = version     # 版號規則同 Proc(見 workflow.md);輸出以 Collab 版號為準
        self.pools = []
        self.blackboxes = []       # 黑箱 pool:[(xid, name)]
        self.mflows = []           # (mid, src_nodeid, tgt_nodeid, label)

    def add_pool(self, proc):
        self.pools.append(proc)
        return proc

    def add_blackbox(self, name):
        """黑箱 pool(收合、無內部流程):僅顯示空 pool 框,
        可作 message() 的端點(以回傳的 xid 引用)。"""
        xid = _ncname("bb_" + name)
        self.blackboxes.append((xid, name))
        return xid

    def message(self, src, tgt, label=""):
        mid = "mf_%d" % (len(self.mflows) + 1)
        self.mflows.append((mid, _ncname(src), _ncname(tgt), label))
        return mid


def _pools_mflows(x):
    """把 Proc 或 Collab 統一成 (pools, mflows),避免到處 isinstance。"""
    if isinstance(x, Collab):
        return x.pools, x.mflows
    return [x], []


def _attr(name, val):
    return f' {name}="{escape(val)}"' if val else ""


# ---------------------------------------------------------------------------
# 連線端點與路由
# ---------------------------------------------------------------------------
def ports(n):
    return dict(
        top=(n["x"] + n["w"] / 2.0, n["y"]),
        bot=(n["x"] + n["w"] / 2.0, n["y"] + n["h"]),
        left=(n["x"], n["y"] + n["h"] / 2.0),
        right=(n["x"] + n["w"], n["y"] + n["h"] / 2.0),
    )


def _orth_down(ps, pt):
    """正交折線(垂直→水平→垂直),保證不產生斜線。
    同列跨欄(兩節點中心同高)改走側到側的單段水平線——否則會出底邊、
    在節點中線高度貫穿兩節點內部、再向上折進頂邊(bpmn.io/draw.io 皆顯示為穿框)。"""
    if abs(ps["right"][1] - pt["left"][1]) < 1 \
            and abs(ps["bot"][0] - pt["top"][0]) >= 1:
        if pt["left"][0] >= ps["right"][0]:      # 目標在右側
            return [ps["right"], pt["left"]]
        if ps["left"][0] >= pt["right"][0]:      # 目標在左側
            return [ps["left"], pt["right"]]
    sx, sy = ps["bot"]; tx, ty = pt["top"]
    if abs(sx - tx) < 1:
        return [(sx, sy), (tx, ty)]
    cy = ty - GAP
    if cy <= sy + 8:
        cy = (sy + ty) / 2.0
    return [(sx, sy), (sx, cy), (tx, cy), (tx, ty)]


def waypoints(s, t, route):
    ps, pt = ports(s), ports(t)
    if route == "bndSide":
        # 邊界事件出邊讓位:先落入列間水平走廊(宿主底與下一列的空隙),
        # 沿泳道邊緣夾縫(節點置中後左右各約 36px 邊距)垂直下行,
        # 從側面進入目標——避開宿主正下方的扇出與既有側通道。
        # 僅來源為邊界事件(attach)時有意義;其他來源退化為 straight。
        if not s.get("attach"):
            return waypoints(s, t, "straight")
        sx, sy = ps["bot"]
        # 巢狀錯開:走廊深淺與夾縫內外同依圓幾何序(近讓位側=淺廊外軌)
        rg = s.get("_bg", s.get("_bidx", 0))
        rt_ = rg
        y_gap = sy + 14 + LINE_GAP * rg
        t_cx = t["x"] + t["w"] / 2
        s_cx = s["x"] + s["w"] / 2
        if t_cx < s_cx:                       # 目標在左:宿主泳道左緣夾縫
            xc = s.get("_lane_left", sx - 60) + 12 + LINE_GAP * rt_
            tp = pt["right"]
        else:                                 # 目標在右:右緣夾縫(避開
            xc = s.get("_lane_right", sx + 60) - 28 - LINE_GAP * rt_  # sideRight -14)
            tp = pt["left"]
        if abs(tp[1] - y_gap) < 8:            # 目標幾乎同高:直接水平進入
            return [ps["bot"], (sx, y_gap), (xc, y_gap), tp]
        return [ps["bot"], (sx, y_gap), (xc, y_gap), (xc, tp[1]), tp]
    if route == "straight":
        # 同欄直下;不同欄則自動轉正交折線,避免斜線
        if abs(ps["bot"][0] - pt["top"][0]) < 1:
            return [ps["bot"], pt["top"]]
        return _orth_down(ps, pt)
    if route == "enterRight":
        sx, sy = ps["bot"]; tx, ty = pt["right"]
        return [(sx, sy), (sx, ty), (tx, ty)]
    if route in ("sideRight", "sideLeft"):
        # 側通道繞行:同泳道跨多列的跳層連線專用——出側邊 → 走泳道邊緣通道 → 進側邊,
        # 不會像 enterRight 從欄中央下切而穿過中間節點。
        ox = s.get("ox", POOL_X)
        if route == "sideRight":
            ln = max(s["lane"], t["lane"])
            edge_n = s if s["lane"] == ln else t
            cx = edge_n.get("_lane_right",
                            ox + POOL_HEADER_W + (ln + 1) * LANE_W) - 14
            sp, tp = ps["right"], pt["right"]
        else:
            ln = min(s["lane"], t["lane"])
            edge_n = s if s["lane"] == ln else t
            # 讓位軌佔用讓位:左廊有 k 條 bndSide 讓位軌時外移 k×LINE_GAP,
            # 落在讓位軌之外的乾淨軌位(空間由修正輪 lane_pad 加寬提供)
            cx = edge_n.get("_lane_left",
                            ox + POOL_HEADER_W + ln * LANE_W) + 14 \
                 + LINE_GAP * edge_n.get("_bndL", 0)
            sp, tp = ps["left"], pt["left"]
        return [sp, (cx, sp[1]), (cx, tp[1]), tp]
    if route == "outLeft":
        sx, sy = ps["left"]; tx, ty = pt["top"]
        if abs(ps["bot"][0] - tx) < 1:
            # 目標在正下方同一欄:outLeft 會折返穿過閘道本體,退化為直下
            return [ps["bot"], pt["top"]]
        return [(sx, sy), (tx, sy), (tx, ty)]
    if route == "outRight":
        sx, sy = ps["right"]; tx, ty = pt["top"]
        if abs(ps["bot"][0] - tx) < 1:
            return [ps["bot"], pt["top"]]
        return [(sx, sy), (tx, sy), (tx, ty)]
    if route == "backLoop":
        # 20260710.14:多條回線各佔一軌(+2×LINE_GAP/軌)——原通道 x 寫死
        # +14,兩條以上 backLoop 必然長距完全共線(使用者標紅實證:
        # 流標/廢標雙回線共線 720px);軌位由 _assign_backloop_tracks 指派。
        ox = s.get("ox", POOL_X)
        cx = ox + POOL_HEADER_W + 14 + s.get("_blt", 0) * 2 * LINE_GAP
        return [ps["left"], (cx, ps["left"][1]), (cx, pt["left"][1]), pt["left"]]
    # auto:正交折線
    return _orth_down(ps, pt)


def mf_waypoints(s, t):
    """message flow:從面向對方的側邊出去,水平→垂直→水平接入對方側邊。"""
    ps, pt = ports(s), ports(t)
    if t["x"] >= s["x"]:
        sp, tp = ps["right"], pt["left"]
    else:
        sp, tp = ps["left"], pt["right"]
    midx = (sp[0] + tp[0]) / 2.0
    return [sp, (midx, sp[1]), (midx, tp[1]), tp]


def label_pos(wps):
    # 優先:夠長的水平段,標籤置於線上方 65% 處(遠離閘道頂點)
    for i in range(len(wps) - 1):
        (x1, y1), (x2, y2) = wps[i], wps[i + 1]
        if abs(y1 - y2) < 1 and abs(x2 - x1) > 24:
            return (x1 + (x2 - x1) * 0.65, y1 - 8)
    # 次選:夠長的垂直段,標籤貼在線旁(右側、離起點 22px)
    for i in range(len(wps) - 1):
        (x1, y1), (x2, y2) = wps[i], wps[i + 1]
        if abs(x1 - x2) < 1 and abs(y2 - y1) > 24:
            return (x1 + 10, y1 + (22 if y2 > y1 else -22))
    (x1, y1), (x2, y2) = wps[0], wps[1]
    return ((x1 + x2) / 2.0 + 8, (y1 + y2) / 2.0 - 4)


# ---------------------------------------------------------------------------
# 幾何重疊檢查(離線)
# ---------------------------------------------------------------------------
def _boxes_overlap(a, b, pad=2):
    return not (a["x"] + a["w"] + pad <= b["x"] - pad or
                b["x"] + b["w"] + pad <= a["x"] - pad or
                a["y"] + a["h"] + pad <= b["y"] - pad or
                b["y"] + b["h"] + pad <= a["y"] - pad)


def _seg_hits_box(p1, p2, n, pad=6):
    (x1, y1), (x2, y2) = p1, p2
    bx1, by1 = n["x"] - pad, n["y"] - pad
    bx2, by2 = n["x"] + n["w"] + pad, n["y"] + n["h"] + pad
    if abs(x1 - x2) < 1e-6:
        if bx1 <= x1 <= bx2:
            lo, hi = (y1, y2) if y1 <= y2 else (y2, y1)
            return not (hi < by1 or lo > by2)
        return False
    if abs(y1 - y2) < 1e-6:
        if by1 <= y1 <= by2:
            lo, hi = (x1, x2) if x1 <= x2 else (x2, x1)
            return not (hi < bx1 or lo > bx2)
        return False
    for k in range(1, 24):
        tt = k / 24.0
        x, y = x1 + (x2 - x1) * tt, y1 + (y2 - y1) * tt
        if bx1 <= x <= bx2 and by1 <= y <= by2:
            return True
    return False


def _seg_cross(a1, a2, b1, b2):
    """兩正交線段是否嚴格交叉(互相穿過內部;端點相觸不算)。
    (熱路徑:方向判斷延遲計算、2 元素 sorted 改條件交換——
    profile 實測 abs/sorted 各佔千萬次級呼叫;語意與原式完全等價)"""
    if abs(a1[1] - a2[1]) < 1e-6 and abs(b1[0] - b2[0]) < 1e-6:      # a橫 b縱
        h, v = (a1, a2), (b1, b2)
    elif abs(a1[0] - a2[0]) < 1e-6 and abs(b1[1] - b2[1]) < 1e-6:    # a縱 b橫
        h, v = (b1, b2), (a1, a2)
    else:
        return False
    hy = h[0][1]
    x1, x2 = h[0][0], h[1][0]
    hlo, hhi = (x1, x2) if x1 <= x2 else (x2, x1)
    vx = v[0][0]
    y1, y2 = v[0][1], v[1][1]
    vlo, vhi = (y1, y2) if y1 <= y2 else (y2, y1)
    return hlo + 0.5 < vx < hhi - 0.5 and vlo + 0.5 < hy < vhi - 0.5


def _wps_cross(w1, w2):
    """兩條折線之間的嚴格交叉數。"""
    c = 0
    for i in range(len(w1) - 1):
        for j in range(len(w2) - 1):
            if _seg_cross(w1[i], w1[i + 1], w2[j], w2[j + 1]):
                c += 1
    return c


def _wps_par_close(w1, w2, lo=2, hi=None, minlen=30):
    """兩折線的同向平行段距離在 (lo, hi) 且並行 >minlen px 的段對數
    (人眼難以判別歸屬;≤lo 屬重合、≥hi 視為已分離)。
    20260710.14 長並行加距規則:呼叫端另以 hi=2×LINE_GAP、minlen=150
    檢核——12px 間距在數百 px 的長並行下人眼仍視為重疊(使用者標紅實證),
    長並行須 ≥24px。"""
    if hi is None:
        hi = MIN_LINE_GAP
    c = 0
    for i in range(len(w1) - 1):
        (ax1, ay1), (ax2, ay2) = w1[i], w1[i + 1]
        for j in range(len(w2) - 1):
            (bx1, by1), (bx2, by2) = w2[j], w2[j + 1]
            if abs(ax1 - ax2) < 1e-6 and abs(bx1 - bx2) < 1e-6:
                d = abs(ax1 - bx1)
                lo1, hi1 = (ay1, ay2) if ay1 <= ay2 else (ay2, ay1)
                lo2, hi2 = (by1, by2) if by1 <= by2 else (by2, by1)
            elif abs(ay1 - ay2) < 1e-6 and abs(by1 - by2) < 1e-6:
                d = abs(ay1 - by1)
                lo1, hi1 = (ax1, ax2) if ax1 <= ax2 else (ax2, ax1)
                lo2, hi2 = (bx1, bx2) if bx1 <= bx2 else (bx2, bx1)
            else:
                continue
            if lo < d < hi and min(hi1, hi2) - max(lo1, lo2) > minlen:
                c += 1
    return c


def _wps_overlap(w1, w2, trim=15):
    """兩條折線之間共線重合的線段對數(同 x 垂直段或同 y 水平段、區間交集)。
    trim:忽略端樁——重合交集若完全落在任一條折線首/末端點 trim px 內不計
    (同端口出發的短樁重合屬「端口重合」檢核的職責,避免同一問題重複計分)。"""
    def _near_end(w, lo, hi, vert, coord):
        for pt in (w[0], w[-1]):
            px, py = pt
            v = py if vert else px
            if lo >= v - trim and hi <= v + trim:
                # 交集完全落在端點附近的樁範圍
                if abs((px if vert else py) - coord) < trim:
                    return True
        return False
    c = 0
    for i in range(len(w1) - 1):
        (ax1, ay1), (ax2, ay2) = w1[i], w1[i + 1]
        for j in range(len(w2) - 1):
            (bx1, by1), (bx2, by2) = w2[j], w2[j + 1]
            if abs(ax1 - ax2) < 1e-6 and abs(bx1 - bx2) < 1e-6 and abs(ax1 - bx1) <= 2:
                lo1, hi1 = (ay1, ay2) if ay1 <= ay2 else (ay2, ay1)
                lo2, hi2 = (by1, by2) if by1 <= by2 else (by2, by1)
                lo, hi = max(lo1, lo2), min(hi1, hi2)
                if hi - lo > 2 and not (_near_end(w1, lo, hi, True, ax1)
                                        or _near_end(w2, lo, hi, True, bx1)):
                    c += 1
            elif abs(ay1 - ay2) < 1e-6 and abs(by1 - by2) < 1e-6 and abs(ay1 - by1) <= 2:
                lo1, hi1 = (ax1, ax2) if ax1 <= ax2 else (ax2, ax1)
                lo2, hi2 = (bx1, bx2) if bx1 <= bx2 else (bx2, bx1)
                lo, hi = max(lo1, lo2), min(hi1, hi2)
                if hi - lo > 2 and not (_near_end(w1, lo, hi, False, ay1)
                                        or _near_end(w2, lo, hi, False, by1)):
                    c += 1
    return c


# 版面可讀性評分(取法 drawio-skill 的 route_score,權重對齊:穿越 20、交叉 10、
# 重疊 5;再加本 skill 特有的缺陷權重:斜線 15、連線重合 8、標籤/溢出問題 3)。
# 分數只在「同一張圖的不同版面變體」之間比較有意義,越低越好、0 = 無缺陷。
_SCORE_RULES = [("連線穿過節點", 20), ("連線交叉", 10), ("斜線", 15),
                ("連線重合", 8), ("節點重疊", 5), ("節點壓泳道線", 5),
                ("端口重合", 5),
                ("間距不足", 5), ("框線重疊", 5), ("分區列範圍重疊", 5),
                ("繞行過長", 3),
                ("轉折過多", 3), ("容器標題", 3),
                ("貼鄰", 3), ("標籤", 3), ("溢出", 3)]


def layout_score(issues):
    """check_layout 的問題清單 → (總分, 明細字串)。可用於比較調整前後的版面。"""
    counts = {key: 0 for key, _w in _SCORE_RULES}
    for q in issues:
        for key, _w in _SCORE_RULES:
            if key in q:
                counts[key] += 1
                break
    score = sum(counts[key] * w for key, w in _SCORE_RULES)
    detail = "、".join("%s×%d" % (key, counts[key])
                       for key, _w in _SCORE_RULES if counts[key]) or "無"
    return score, detail


def check_semantics(x):
    """模型層語意檢查(與輸出格式無關,emit 對 bpmn/drawio 皆執行):
    懸空/孤兒、start/end 數量、起點可達/能達終點、閘道 diverging≥2 與
    單進單出提醒、排他分支命名建議、訊息流須跨 pool。
    validate_bpmn.py 對 .bpmn 檔另有同類檢查,作為使用者手改檔的第二道防線。"""
    pools, mflows = _pools_mflows(x)
    iss = []
    node_pool = {}
    for p in pools:
        for nid in p.nodes:
            node_pool[nid] = p
        adj = {nid: [] for nid in p.nodes}
        radj = {nid: [] for nid in p.nodes}
        labeled = {}
        for fid, s, tg, lab, rt in p.flows:
            if s in adj and tg in adj:
                adj[s].append(tg); radj[tg].append(s)
                labeled.setdefault(s, []).append(lab)
        flow_nodes = {k: n for k, n in p.nodes.items()
                      if n["t"] not in NONGRID_TS}   # 工件/註解不參與流程語意
        starts = [k for k, n in flow_nodes.items()
                  if n["t"] == "start" or (n["t"] in ("message", "timer")
                                           and not radj[k])]
        ends = [k for k, n in flow_nodes.items()
                if n["t"] in ("end", "terminate")]
        if not starts:
            iss.append(f"pool「{p.name}」沒有 start 事件")
        if not ends:
            iss.append(f"pool「{p.name}」沒有 end 事件")
        for k, n in flow_nodes.items():
            if n["t"] not in ("end", "terminate") and not adj[k]:
                iss.append(f"「{n['name']}」無下一關(懸空)")
            if n["t"] not in ("start", "message", "timer") \
                    and not n.get("attach") and not radj[k]:
                iss.append(f"「{n['name']}」無上一關(孤兒)")
            if n["t"] == "gateway":
                if len(adj[k]) >= 2 and n.get("kind", "exclusive") == "exclusive":
                    miss = sum(1 for lab in labeled.get(k, []) if not lab)
                    if miss:
                        iss.append(f"排他閘道「{n['name']}」有 {miss} 條分支未命名(建議標條件)")
                if len(adj[k]) == 1 and len(radj[k]) == 1:
                    iss.append(f"閘道「{n['name']}」單進單出,通常多餘")
        seen = set(starts) | {k for k, n in flow_nodes.items()
                              if n.get("attach")}    # 邊界事件視為可達(隨宿主)
        stack = list(seen)
        while stack:
            for v in adj[stack.pop()]:
                if v not in seen:
                    seen.add(v); stack.append(v)
        for k in flow_nodes:
            if k not in seen:
                iss.append(f"「{p.nodes[k]['name']}」從起點無法到達")
        seen_r = set(ends)
        stack = list(ends)
        while stack:
            for v in radj[stack.pop()]:
                if v not in seen_r:
                    seen_r.add(v); stack.append(v)
        for k in flow_nodes:
            if k not in seen_r:
                iss.append(f"「{p.nodes[k]['name']}」無法走到任何終點")
    bb_ids = {bxid for bxid, _n in getattr(x, "blackboxes", [])} \
        if isinstance(x, Collab) else set()
    for mid, s, tg, lab in mflows:
        ok_s = s in node_pool or s in bb_ids
        ok_t = tg in node_pool or tg in bb_ids
        if not ok_s or not ok_t:
            iss.append(f"訊息流 {mid} 端點不存在:{s if not ok_s else tg}")
        elif s in node_pool and tg in node_pool \
                and node_pool[s] is node_pool[tg]:
            iss.append(f"訊息流 {mid} 兩端在同一 pool(訊息流應跨 pool)")
        # 黑箱端點:必屬不同 pool,免同 pool 檢查
    return iss


def check_layout(x):
    """回傳版面問題清單(空 list = 無重疊)。接受 Proc 或 Collab。"""
    _ensure(x)
    return _check_placed(x)


def _check_placed(x):
    """check_layout 的核心:假設節點皆已分層/放置(供 _ensure 試算時呼叫,避免遞迴)。"""
    pools, mflows = _pools_mflows(x)
    allnodes, edges = {}, []
    for proc in pools:
        allnodes.update(proc.nodes)
        ov = getattr(proc, "wps_override", {})
        for fid, s, tg, lab, rt in proc.flows:
            edges.append((s, tg,
                          ov.get(fid) or
                          waypoints(proc.nodes[s], proc.nodes[tg], rt), "flow"))
        for aid, s, tg, lab in proc.assocs:
            if s in proc.nodes and tg in proc.nodes:
                edges.append((s, tg, assoc_waypoints(proc, s, tg), "assoc"))
    for mid, s, tg, lab in mflows:
        if s in allnodes and tg in allnodes:
            edges.append((s, tg, mf_waypoints(allnodes[s], allnodes[tg]), "mf"))
    issues = []
    KIND_TXT = {"flow": "連線", "assoc": "關連線", "mf": "訊息流"}
    for s, tg, wps, ek in edges:
        for k in range(len(wps) - 1):
            (x1, y1), (x2, y2) = wps[k], wps[k + 1]
            if abs(x1 - x2) > 1 and abs(y1 - y2) > 1:
                issues.append(
                    f"斜線(非水平/垂直):「{allnodes[s]['name']}→{allnodes[tg]['name']}」")
                break
    # 端口重合:同節點多條線共用同一進出點(視覺上進出同點,方向不可辨)
    port_use = {}
    for s, tg, wps, ek in edges:
        for node, pt in ((s, wps[0]), (tg, wps[-1])):
            port_use.setdefault((node, round(pt[0]), round(pt[1])), []).append(
                f"{allnodes[s]['name']}→{allnodes[tg]['name']}")
    for (node, _px, _py), users in port_use.items():
        if len(users) > 1:
            issues.append(f"端口重合:「{allnodes[node]['name']}」有 "
                          f"{len(users)} 條線共用同一進出點"
                          f"({'、'.join(users[:3])})")
    ns = list(allnodes.values())
    for i in range(len(ns)):
        for j in range(i + 1, len(ns)):
            if _boxes_overlap(ns[i], ns[j]):
                # 邊界事件與其宿主(attach)重疊為 BPMN 慣例,豁免
                if ns[i].get("attach") == ns[j]["id"] \
                        or ns[j].get("attach") == ns[i]["id"]:
                    continue
                issues.append(f"節點重疊:「{ns[i]['name']}」↔「{ns[j]['name']}」")
    # 鐵則②(20260710.12):節點不可壓在泳道線上(邊界事件貼宿主框緣屬
    # BPMN 慣例,豁免;_lane_left/right 含 pad,為該節點所屬泳道的實界)
    for n in ns:
        if n.get("attach"):
            continue
        ll, lr = n.get("_lane_left"), n.get("_lane_right")
        if ll is None or lr is None:
            continue
        if n["x"] < ll + 2 or n["x"] + n["w"] > lr - 2:
            issues.append(f"節點壓泳道線:「{n['name']}」超出所屬泳道邊界")
    for s, tg, wps, ek in edges:
        if ek == "mf":
            continue        # 訊息流跨 pool 飛越屬慣例(與 validator 對齊)
        for nid, n in allnodes.items():
            if nid in (s, tg):
                continue
            if n.get("attach") in (s, tg):
                continue    # 貼附於邊端點宿主的邊界事件,豁免
            if any(_seg_hits_box(wps[k], wps[k + 1], n) for k in range(len(wps) - 1)):
                issues.append(
                    f"{KIND_TXT[ek]}穿過節點:「{allnodes[s]['name']}→{allnodes[tg]['name']}」"
                    f"壓到「{n['name']}」")
        # 穿過自身端點節點(20260710.15):端點前/後 12px 處若落在自身節點
        # 「內部」,表示末段橫穿本體才接到 port(如對向端接入)——一般
        # 檢核豁免 s/tg,此盲區曾讓 enterRight 穿目標完全漏檢(使用者標紅)
        if len(wps) >= 2:
            for ei, nid in ((0, s), (-1, tg)):
                n = allnodes.get(nid)
                if n is None or "x" not in n:
                    continue
                px, py = wps[ei]
                qx, qy = wps[1] if ei == 0 else wps[-2]
                dx, dy = qx - px, qy - py
                L = abs(dx) + abs(dy)
                if L < 14:
                    continue
                probe = (px + dx / L * 12, py + dy / L * 12)
                if (n["x"] + 2 < probe[0] < n["x"] + n["w"] - 2
                        and n["y"] + 2 < probe[1] < n["y"] + n["h"] - 2):
                    issues.append(
                        f"{KIND_TXT[ek]}穿過節點:「{allnodes[s]['name']}→"
                        f"{allnodes[tg]['name']}」末段橫穿自身端點節點"
                        f"「{n['name']}」(對向端接入)")
    # 連線交叉/重合檢查(端點相觸不算;重合排除共享節點的合流/分岔邊)
    for i in range(len(edges)):
        for j in range(i + 1, len(edges)):
            (s1, t1, w1, _k1), (s2, t2, w2, _k2) = edges[i], edges[j]
            pair = (f"「{allnodes[s1]['name']}→{allnodes[t1]['name']}」×"
                    f"「{allnodes[s2]['name']}→{allnodes[t2]['name']}」")
            if _wps_cross(w1, w2):
                issues.append(f"連線交叉:{pair}"
                              f"(可嘗試 sideLeft/sideRight 或調整 row 消除)")
            elif _wps_overlap(w1, w2):
                # 20260710.14:移除「共端點對豁免」——豁免使同目標雙回線
                # (720px 共線)、同源閘道雙出邊(230px 共線)全數漏檢
                # (使用者標紅實證);端樁短重合由 _wps_overlap 的 trim 排除,
                # 不會與端口重合重複計分
                issues.append(f"連線重合(疊在同一線上):{pair}"
                              f"(可嘗試 sideLeft/sideRight 分邊)")
    # 平行間距檢核(20260710.14 雙門檻):
    #   短並行:距離 <MIN_LINE_GAP 且並行 >30px(共端點對豁免:端口分散
    #           所致的近節點短貼行屬正常)
    #   長並行:距離 <2×LINE_GAP 且並行 >150px——12px 間距在長並行下
    #           人眼仍視為重疊,不論是否共端點一律檢核
    for i in range(len(edges)):
        for j in range(i + 1, len(edges)):
            (s1, t1, w1, _k1), (s2, t2, w2, _k2) = edges[i], edges[j]
            shared = bool({s1, t1} & {s2, t2})
            hit = ""
            if _wps_par_close(w1, w2, lo=2, hi=2 * LINE_GAP, minlen=150):
                hit = f"<{2*LINE_GAP}px 且並行 >150px(長並行須加距)"
            elif not shared and _wps_par_close(w1, w2):
                hit = f"<{MIN_LINE_GAP}px,難以判別歸屬"
            if hit:
                issues.append(
                    f"平行間距不足:「{allnodes[s1]['name']}→{allnodes[t1]['name']}」"
                    f"∥「{allnodes[s2]['name']}→{allnodes[t2]['name']}」({hit})")
    # 框線重疊檢核:連線可與框線(泳道邊界/pool 框/容器框)交錯穿越,
    # 但不可沿線重疊(貼著框線走,人眼無法區分連線與框架)
    frame_v, frame_h = [], []   # (座標, lo, hi, 名稱)
    for proc in pools:
        top, bot = POOL_Y, POOL_Y + _pool_height([proc])
        xs = [proc._lane_x(0) - POOL_HEADER_W]
        for li in range(len(proc.lanes)):
            xs.append(proc._lane_x(li))
        xs.append(proc._lane_x(len(proc.lanes) - 1)
                  + proc.lane_width(len(proc.lanes) - 1))
        for fx in xs:
            frame_v.append((fx, top, bot, "泳道/pool 框"))
        for cid, cname, cx0, cy0, cx1, cy1, _kd in proc.container_spans():
            frame_v.append((cx0, cy0, cy1, f"容器「{cname}」框"))
            frame_v.append((cx1, cy0, cy1, f"容器「{cname}」框"))
            frame_h.append((cy0, cx0, cx1, f"容器「{cname}」框"))
            frame_h.append((cy1, cx0, cx1, f"容器「{cname}」框"))
        bx0 = proc._lane_x(0)
        bx1 = proc._lane_x(len(proc.lanes) - 1) \
            + proc.lane_width(len(proc.lanes) - 1)
        for bname, by0, by1, _f, _st in proc.band_spans():
            frame_h.append((by0, bx0, bx1, f"分區「{bname}」線"))
            frame_h.append((by1, bx0, bx1, f"分區「{bname}」線"))
    for s, tg, wps, ek in edges:
        if ek == "mf":
            continue    # 訊息流走 pool 間隙走道,貼 pool 框屬設計,豁免
        hit = None
        for k in range(len(wps) - 1):
            (x1, y1), (x2, y2) = wps[k], wps[k + 1]
            if abs(x1 - x2) < 1e-6:
                lo, hi = sorted((y1, y2))
                for fx, flo, fhi, nm in frame_v:
                    if abs(x1 - fx) <= FRAME_TOL and \
                            min(hi, fhi) - max(lo, flo) > 30:
                        hit = nm; break
            else:
                lo, hi = sorted((x1, x2))
                for fy, flo, fhi, nm in frame_h:
                    if abs(y1 - fy) <= FRAME_TOL and \
                            min(hi, fhi) - max(lo, flo) > 30:
                        hit = nm; break
            if hit:
                break
        if hit:
            issues.append(f"連線與框線重疊:「{allnodes[s]['name']}→"
                          f"{allnodes[tg]['name']}」沿{hit}行走"
                          f"(交錯可、沿線不可)")
    # 容器標題壓線檢核:連線段不可壓在容器名稱文字上
    for proc in pools:
        for cid, cname, cx0, cy0, cx1, cy1, _kd in proc.container_spans():
            tbox = {"x": cx0 + 6, "y": cy0 + 2,
                    "w": len(cname) * 12 + 10, "h": 20, "name": cname}
            for s, tg, wps, ek in edges:
                if any(_seg_hits_box_b(wps[k], wps[k + 1], tbox, pad=0)
                       for k in range(len(wps) - 1)):
                    issues.append(f"連線壓到容器標題:「{allnodes[s]['name']}→"
                                  f"{allnodes[tg]['name']}」壓在"
                                  f"「{cname}」字上")
                    break
    # 轉折過多檢核:兩個轉角能到就不走第三個(慣例路線與分軌豁免;
    # 為避交錯而增彎者經五輪修正後殘留,屬必要繞行)
    ov_fids = set()
    for proc in pools:
        ov_fids |= set(getattr(proc, "wps_override", {}))
    conv_pairs = {(f[1], f[2]) for proc in pools for f in proc.flows
                  if f[4] in ("backLoop", "bndSide") or f[0] in ov_fids}
    for s, tg, wps, ek in edges:
        if ek != "flow" or (s, tg) in conv_pairs:
            continue
        bends = len(wps) - 2
        base = 0 if abs(wps[0][0] - wps[-1][0]) < 1 else 2
        if bends > base + 1:
            issues.append(f"轉折過多:「{allnodes[s]['name']}→"
                          f"{allnodes[tg]['name']}」{bends} 個轉角"
                          f"(基準 {base},建議取直)")
    # 繞行過長檢核:路徑長遠超曼哈頓距離(交錯點與並行段的主要來源),
    # 建議改道或調整佈局
    bl_pairs = {(f[1], f[2]) for proc in pools for f in proc.flows
                if f[4] in ("backLoop", "bndSide")}
    for s, tg, wps, ek in edges:
        if ek != "flow" or (s, tg) in bl_pairs:
            continue    # 迴圈/邊界讓位邊走專用通道,繞遠屬設計慣例
        plen = sum(abs(wps[k+1][0]-wps[k][0]) + abs(wps[k+1][1]-wps[k][1])
                   for k in range(len(wps)-1))
        man = abs(wps[-1][0]-wps[0][0]) + abs(wps[-1][1]-wps[0][1])
        if man > 0 and plen > man * 2.2 and plen - man > 150:
            issues.append(f"繞行過長:「{allnodes[s]['name']}→"
                          f"{allnodes[tg]['name']}」路徑 {int(plen)}px"
                          f"(直達約 {int(man)}px,建議改道或調整佈局)")
    # 工件貼鄰檢核:工件應緊鄰其關連夥伴(同列或相鄰一格),
    # 距離過遠時關連線變長、來源不可辨
    for proc in pools:
        pmap = {}
        for aid, a, b, lab in proc.assocs:
            if a in proc.nodes and b in proc.nodes:
                ta, tb = proc.nodes[a]["t"], proc.nodes[b]["t"]
                if ta in NONGRID_TS and tb not in NONGRID_TS:
                    pmap.setdefault(a, b)
                elif tb in NONGRID_TS and ta not in NONGRID_TS:
                    pmap.setdefault(b, a)
        for art, pk in pmap.items():
            na, np_ = proc.nodes[art], proc.nodes[pk]
            dist = abs(na["row"] - np_["row"]) + abs(na["lane"] - np_["lane"])
            if dist > 1:
                issues.append(f"工件未貼鄰夥伴:「{na['name']}」離"
                              f"「{np_['name']}」{dist} 格(建議調整放置)")
    # 事件/工件的下方標籤(依組織規範置於圖形下方)碰撞檢查
    for proc in pools:
        pr = proc.ox + proc.pool_width()
        for n in proc.nodes.values():
            if (n["t"] not in EVENT_TS and n["t"] not in ARTIFACT_TS) \
                    or not n["name"]:
                continue
            lines = wrap(n["name"], 6)
            lw = max(len(ln) for ln in lines) * 11.5
            lb = {"x": n["x"] + n["w"] / 2 - lw / 2,
                  "y": n["y"] + n["h"] + 4,
                  "w": lw, "h": len(lines) * 13 + 4,
                  "name": n["name"] + "(標籤)"}
            if lb["x"] + lb["w"] > pr or lb["x"] < proc.ox:
                issues.append(f"標籤超出 pool 邊緣:「{n['name']}」(建議縮短名稱或調整泳道)")
            for m in proc.nodes.values():
                if m["id"] != n["id"] and _boxes_overlap(lb, m):
                    issues.append(f"下方標籤壓到節點:「{n['name']}」標籤 ↔「{m['name']}」")
    # 排他閘道名稱長度檢查(菱形固定尺寸:≤3 字單行、4 字折兩行,≥5 字會溢出)
    for proc in pools:
        for n in proc.nodes.values():
            if n["t"] == "gateway" and n.get("kind", "exclusive") == "exclusive" \
                    and len(n["name"]) > 4:
                issues.append(f"閘道名稱過長會溢出菱形:「{n['name']}」"
                              f"(請精簡至 4 字內,如「面談方式」,詳細準則放前置判斷任務)")
    # 橫向系統分區(bands)定義檢查
    for proc in pools:
        spans = []
        for name, ids in proc.bands:
            unknown = [i for i in ids if i not in proc.nodes]
            if unknown:
                issues.append(f"分區「{name}」引用不存在的節點:{', '.join(unknown)}")
            rows = [proc.nodes[i]["row"] for i in ids if i in proc.nodes]
            if rows:
                spans.append((name, min(rows), max(rows)))
        spans.sort(key=lambda b: b[1])
        for a, b in zip(spans, spans[1:]):
            if b[1] <= a[2]:
                issues.append(f"分區列範圍重疊:「{a[0]}」(列{a[1]}~{a[2]})↔"
                              f"「{b[0]}」(列{b[1]}~{b[2]})")
    return issues


# ---------------------------------------------------------------------------
# 自動佈局
# ---------------------------------------------------------------------------
def auto_layout(p, auto_route=True, compact=None):
    if not p.nodes:
        raise ValueError("流程沒有任何節點;請先用 add() 加入節點。")
    if p.ox is None:
        p.ox = POOL_X
    if not hasattr(p, "_route_hints"):
        # 快照使用者原始 route 提示(僅首次;之後 p.flows 會被選路結果覆寫)。
        # 修正輪每次試算前重設回提示、全量重新選路——換位/加寬後的最佳
        # 分邊組合(如協同換邊)沿用舊定案 + 逐條精修常翻不出來。
        p._route_hints = {f[0]: f[4] for f in p.flows}
    adj = {nid: [] for nid in p.nodes}
    radj = {nid: [] for nid in p.nodes}
    for fid, s, tg, lab, rt in p.flows:
        if s in adj and tg in adj:
            adj[s].append(tg); radj[tg].append(s)
    # 邊界事件:宿主 → 邊界 的合成邊納入拓撲鄰接——確保邊界分支
    # 「從起點可達」而取得正確的拓撲位置(否則反轉後序會把不可達
    # 節點排到最前,分組時反覆把主鏈往下擠,深度發散)。
    for _bid, _bn in p.nodes.items():
        _host = _bn.get("attach")
        if _host and _host in adj:
            adj[_host].append(_bid); radj[_bid].append(_host)
    # 工件不參與分層網格:分層完成後由 _place_artifacts() 以夥伴節點為
    # 圓心就近放置(否則會被格位衝突/加寬分組推離夥伴,關連線變長繞)。
    starts = [nid for nid, n in p.nodes.items() if n["t"] == "start"] \
        or [nid for nid in p.nodes
            if not radj[nid] and p.nodes[nid]["t"] not in ARTIFACT_TS] \
        or [next(iter(p.nodes))]

    import sys as _sys
    _sys.setrecursionlimit(10000)
    color = {nid: 0 for nid in p.nodes}
    order = []

    def dfs(u):
        color[u] = 1
        for v in adj[u]:
            if color[v] == 0:
                dfs(v)
        color[u] = 2; order.append(u)

    for stn in starts:
        if color[stn] == 0:
            dfs(stn)
    for nid in p.nodes:
        if color[nid] == 0:
            dfs(nid)
    topo = list(reversed(order))
    pos = {nid: i for i, nid in enumerate(topo)}

    # 迴圈鏈標記(20260710.13):能沿前向邊走到「回頭邊起點」的節點
    # (含起點自身)= 迴圈鏈成員;供 chainL/wideL 的迴圈親和分欄使用。
    _radj_fwd = {nid: [] for nid in p.nodes}
    for _u in topo:
        for _v in adj[_u]:
            if pos[_u] < pos[_v]:
                _radj_fwd[_v].append(_u)
    loopsrc = {u for _f, u, v, _l, _r in p.flows
               if u in pos and v in pos and pos[u] >= pos[v]}
    loopish = set()
    _stk = list(loopsrc)
    while _stk:
        _u = _stk.pop()
        if _u in loopish:
            continue
        loopish.add(_u)
        _stk.extend(_radj_fwd[_u])

    # 分層採雙版面試算(取法 drawio-skill 的 --tune):
    #   compact=True  同欄後繼、閘道分支才降列;跨欄順序交接(來源非閘道)同列並排
    #                 (水平走線)→ 壓低總列數、避免樓梯狀長圖
    #   compact=False 傳統最長路徑分層(每個前向邊一律降列)→ 迴圈/合流較不易穿框
    # 各排一版 → check_layout 評分 → 取分數低者;同分取總列數少者(偏好緊湊)。
    def _layer(mode):
        # mode: False=傳統(每前向邊降列);True=緊湊(跨欄交接同列);
        #       ("wide", k)=加寬(僅閘道分支降列,其餘交接一律同列並排,
        #                        泳道加寬至 k 個子欄蛇行)
        wide_k = mode[1] if isinstance(mode, tuple) else 0
        chain_mode = isinstance(mode, tuple) and mode[0] in ("chain", "chainL")
        loop_aff = isinstance(mode, tuple) and mode[0].endswith("L")
        simple = set()
        if chain_mode:
            # 使用者規則:僅「一進一出」節點可橫向並排;
            # 多連線節點(閘道、匯流點、分岔點)一律降列自佔一列。
            indeg, outdeg = {}, {}
            for _f, _s, _t, _l, _r in p.flows:
                outdeg[_s] = outdeg.get(_s, 0) + 1
                indeg[_t] = indeg.get(_t, 0) + 1
            simple = {nid for nid in p.nodes
                      if p.nodes[nid]["t"] not in ("gateway",)
                      and indeg.get(nid, 0) <= 1 and outdeg.get(nid, 0) <= 1}
        def _step(u, v):
            nu, nv = p.nodes[u], p.nodes[v]
            if chain_mode:
                return 0 if (u in simple and v in simple
                             and nu["lane"] == nv["lane"]) else 1
            if wide_k:
                # 加寬版:只有閘道的分支才降列;其餘交接(含同泳道、含
                # 任務→閘道)一律同列並排——鏈上夾閘道時仍能大幅壓縮列數
                return 1 if nu["t"] == "gateway" else 0
            if not mode or nu["lane"] == nv["lane"] or nu["t"] == "gateway":
                return 1
            return 0
        depth = {nid: 0 for nid in p.nodes}
        sub = {nid: 0 for nid in p.nodes}
        grid_ids = [nid for nid in p.nodes
                    if p.nodes[nid]["t"] not in ARTIFACT_TS
                    and p.nodes[nid]["t"] != "note"
                    and not p.nodes[nid].get("attach")]
        fwd = [(u, v) for u in topo for v in adj[u] if pos[u] < pos[v]]
        bnd_host = [(bid, bn["attach"]) for bid, bn in p.nodes.items()
                    if bn.get("attach") and bn["attach"] in p.nodes]
        # 定點迭代:①列序約束 row[v] >= row[u]+step ②子欄指派(僅 wide:
        # 同泳道同列的任務交接,子欄交替)③同 (lane,sub,row) 格位唯一
        # (衝突時把 topo 較晚者往下推)。row 只增不減,必收斂。
        for _ in range(len(p.nodes) * len(p.nodes) + 1):
            changed = False
            for u, v in fwd:
                need = depth[u] + _step(u, v)
                if depth[v] < need:
                    depth[v] = need
                    changed = True
            for bid, host in bnd_host:
                if depth[bid] != depth[host]:   # 邊界事件深度=宿主(直接指派,
                    depth[bid] = depth[host]    # 破除經退回迴圈的有向環)
                    changed = True
            if wide_k:
                # 牛耕式蛇行:同 (lane, row) 的節點依流程(topo)順序給子欄,
                # 偶數列左→右、奇數列右→左——換列處上下相鄰、垂直直下,
                # 絕不環繞跳欄(跳欄的水平線會橫穿中間欄的節點)。
                groups = {}
                for nid in sorted(grid_ids, key=lambda kk: pos[kk]):
                    groups.setdefault(
                        (p.nodes[nid]["lane"], depth[nid]), []).append(nid)
                lane_k = {}
                for (li, _d), members in groups.items():
                    lane_k[li] = max(lane_k.get(li, 1),
                                     min(len(members), wide_k))
                for (li, d), members in groups.items():
                    kk = lane_k[li]
                    order, wants = members, None
                    if loop_aff and len(members) <= kk:
                        # 迴圈親和分欄(20260710.13,學自使用者手修):
                        # 同列混有「迴圈鏈」與「終止鏈」節點時,迴圈鏈靠左
                        # (貼近 backLoop 左通道)、終止鏈靠右,各鏈固定欄
                        # 直下——回線就近入通道,不橫穿終止鏈節點。
                        # 迴圈鏈內排序:回頭邊起點(loopsrc)最左、其餘依
                        # 拓撲反序——回線出邊就近入左通道,不橫穿同列節點
                        lp = sorted([m for m in members if m in loopish],
                                    key=lambda m: (0 if m in loopsrc else 1,
                                                   -pos[m]))
                        tm = [m for m in members if m not in loopish]
                        if lp and tm:
                            order = lp + tm
                            wants = list(range(len(lp))) + \
                                [kk - len(tm) + i for i in range(len(tm))]
                        elif len(lp) > 1 and any(m in loopsrc for m in lp):
                            # 全迴圈列且含回頭邊起點:起點靠左、各自直下
                            order = lp
                            wants = list(range(len(lp)))
                    for idx, nid in enumerate(order):
                        if idx >= wide_k:      # 一列塞不下 → 推往下一列
                            depth[nid] += 1
                            changed = True
                            continue
                        if wants is not None:
                            want = wants[idx]
                        else:
                            want = idx if d % 2 == 0 else kk - 1 - idx
                        if sub[nid] != want:
                            sub[nid] = want
                            changed = True
            if not wide_k:
                # 泛用格位唯一(非加寬版):同 (lane,sub,row) 衝突把 topo
                # 較晚者往下推。加寬版由上方分組邏輯保證唯一(溢出成員
                # 推下一列、下輪重新分組),不可再跑此迴圈——它拿著
                # 過期的 sub 會把溢出成員逐一疊成長串。
                seen = {}
                for nid in sorted(grid_ids, key=lambda k: (depth[k], pos[k])):
                    while (p.nodes[nid]["lane"], sub[nid], depth[nid]) in seen:
                        depth[nid] += 1
                        changed = True
                    seen[(p.nodes[nid]["lane"], sub[nid], depth[nid])] = nid
            if not changed:
                break
        return depth, sub

    flows0 = [tuple(f) for f in p.flows]     # 原始路線快照:每輪試算前還原,
                                             # 避免上一輪 _auto_routes 改寫的
                                             # route 汙染本輪評分

    def _try(mode):
        p.lane_pad = {}                      # 每輪乾淨本底(min-width 依候選 subs 重算)
        p.flows = [tuple(f) for f in flows0]
        if isinstance(mode, tuple):
            # 加寬版重排使原 route 提示(針對單欄版面)失效且易撞子欄鄰居,
            # 一律重設為 auto 交由 _auto_routes 衝突試算重新選路;
            # 其他變體仍尊重使用者的 route 提示。
            p.flows = [(fid, s_, t_, lab, "auto")
                       for fid, s_, t_, lab, _rt in p.flows]
        depth, sub = _layer(mode)
        for nid, n in p.nodes.items():
            n["row"] = depth[nid]
            n["sub"] = sub[nid]
        p.lane_subs = [max([n["sub"] for n in p.nodes.values()
                            if n["lane"] == i] or [0]) + 1
                       for i in range(len(p.lanes))]
        _artifact_widen(p)                   # 含工件泳道無條件 ≥2 子欄
        _lane_min_width(p)                   # 鐵則⑦:全泳道 ≥2 倍寬(>20 節點 3 倍)
        _place_artifacts(p, depth, sub)
        for nid in p.nodes:
            p._place(nid)
        for nid in p.nodes:                  # 第二輪:邊界事件此時宿主已定位
            if p.nodes[nid].get("attach"):
                p._place(nid)
        if auto_route:
            _auto_routes(p)
        score, _detail = layout_score(_check_placed(p))
        nrows = max(depth.values()) + 1
        # 「過長」本身視為缺陷:超出 ROW_CAP 的列數計入選型評分,
        # 使「減列」成為目標的一部分,而非附帶好處
        penalized = score + max(0, nrows - ROW_CAP) * ROW_PENALTY
        order = {True: 1, False: 2}.get(mode, 0)
        return ((penalized, nrows, order), dict(depth), dict(sub),
                [tuple(f) for f in p.flows], list(p.lane_subs))

    best = None
    modes = [True, False] if compact is None else \
        [("wide", 2) if compact == "wide" else compact]
    for m in modes:
        cand = _try(m)
        if best is None or cand[0] < best[0]:
            best = cand
    # 列數仍超過閾值 → 逐級加試加寬版(chain:僅一進一出節點並排、
    # 多連線節點降列;wide:蛇行並排),同樣以評分取優
    if compact is None:
        k = 2
        while best[0][1] > ROW_CAP and k <= MAX_SUBS:
            for kind in ("chain", "wide", "chainL", "wideL"):
                cand = _try((kind, k))       # *L=迴圈親和分欄變體(20260710.13)
                if cand[0] < best[0]:
                    best = cand
            k += 1
    _, depth, sub, flows, lane_subs = best
    p.flows = [tuple(f) for f in flows]
    p.lane_subs = lane_subs
    p.lane_pad = {}
    _lane_min_width(p)                       # 定案版同樣套用最小寬度本底
    for nid, n in p.nodes.items():
        n["row"] = depth[nid]
        n["sub"] = sub[nid]
    _place_artifacts(p, depth, sub)
    for nid in p.nodes:
        p._place(nid)
    for nid in p.nodes:
        if p.nodes[nid].get("attach"):
            p._place(nid)
    if auto_route:
        _auto_routes(p)
        _repair_rounds(p)
    return p


def _repair_rounds(p, max_rounds=5):
    """五輪修正:產出前若仍有交錯/重疊/間距缺陷,嘗試「換位」變異
    (交換涉事節點與鄰列佔位者、或移到鄰列空位)並全量重佈線,
    擇優採納;無改善或滿五輪即停,殘餘由評分如實回報。
    (「換線」已由 _auto_routes 的精修涵蓋,此處專攻位置調整——
    推廣「交換節點位置避開交錯」的做法。)"""
    BAD_KEYS = ("交叉", "重合", "間距不足", "框線重疊", "端口重合",
                "分區列範圍重疊")

    def _score():
        iss = _check_placed(p)
        sc, _d = layout_score(iss)
        bad = [i for i in iss if any(k in i for k in BAD_KEYS)]
        return sc, bad

    def _bad_nids(bad):
        nids = set()
        by_name = {}
        for k, n in p.nodes.items():
            by_name.setdefault(n["name"], k)
        band_members = {bn: ids for bn, ids in getattr(p, "bands", [])}
        for msg in bad:
            for nm, k in by_name.items():
                if nm and f"「{nm}" in msg or nm and f"{nm}」" in msg:
                    nids.add(k)
            if "分區列範圍重疊" in msg:
                # 分區重疊訊息點名的是分區名而非節點名——反查涉事分區的
                # 成員節點,讓換位/交換候選有對象(交換交錯列即可分離範圍)
                for bn, ids in band_members.items():
                    if f"「{bn}」" in msg:
                        nids.update(i for i in ids if i in p.nodes)
        return nids

    def _movable(k):
        n = p.nodes[k]
        return (n["t"] not in NONGRID_TS and not n.get("attach")
                and n["t"] != "start")

    def _apply_and_route():
        for nid in p.nodes:
            p._place(nid)
        for nid in p.nodes:
            if p.nodes[nid].get("attach"):
                p._place(nid)
        hints = getattr(p, "_route_hints", {})
        p.flows = [(fid, s, tg, lab, hints.get(fid, "auto"))
                   for fid, s, tg, lab, _rt in p.flows]
        _auto_routes(p)

    cur_sc, bad = _score()
    for rnd in range(max_rounds):
        if not bad:
            break
        occupant = {}
        for k, n in p.nodes.items():
            if n["t"] in NONGRID_TS or n.get("attach"):
                continue
            occupant[(n["lane"], n.get("sub", 0), n["row"])] = k
        cands = []
        # sorted:候選順序必須確定(set 迭代受 PYTHONHASHSEED 影響,
        # 擇優嚴格 < 之下平手取先者,順序不定會使同一定義產出不同版面
        # ——20260710.11 實測 A-2 在 55/70 分兩解間隨機跳動)
        for k in sorted(_bad_nids(bad)):
            if not _movable(k):
                continue
            n = p.nodes[k]
            key = (n["lane"], n.get("sub", 0))
            for dr in (1, -1):
                r2 = n["row"] + dr
                if r2 < 1:
                    continue
                other = occupant.get(key + (r2,))
                if other is None or _movable(other):
                    cands.append((k, r2, other, None))
                    # 組合候選「換位+加寬」:側通道讓位需要空間、換位需要
                    # 讓位軌外的乾淨軌;兩者常須同時成立才降分(單做任一
                    # 皆不改善,逐一試算會全數落選)——如邊界事件扇出
                    # 佔滿左廊 + 同欄雙長跨線的 7-3a 情境。
                    cands.append((k, r2, other, n["lane"]))
        for li in sorted({p.nodes[k]["lane"] for k in _bad_nids(bad)
                          if k in p.nodes}):        # sorted:同上,確定性
            cands.append(("widen", li, None, li))   # 河道加寬變異
        snap_rows = {k: (n["row"], n.get("sub", 0))
                     for k, n in p.nodes.items()}
        snap_flows = [tuple(f) for f in p.flows]
        snap_pad = dict(p.lane_pad)
        def _restore():
            p.lane_pad = dict(snap_pad)
            for kk, (r0, s0) in snap_rows.items():
                p.nodes[kk]["row"] = r0
                p.nodes[kk]["sub"] = s0
            p.flows = [tuple(f) for f in snap_flows]

        def _apply_cand(k, r2, other, wl):
            if wl is not None:              # 加寬(單獨或與換位組合)
                p.lane_pad[wl] = p.lane_pad.get(wl, 0) + 2 * LINE_GAP
            if k != "widen":                # 換位/交換
                p.nodes[k]["row"] = r2
                if other is not None:
                    p.nodes[other]["row"] = snap_rows[k][0]
            _apply_and_route()

        best = None
        for k, r2, other, wl in cands:
            _apply_cand(k, r2, other, wl)
            sc2, bad2 = _score()
            if best is None or sc2 < best[0]:
                best = (sc2, bad2, k, r2, other, wl)
            _restore()
        if best is None or best[0] >= cur_sc:
            _apply_and_route()          # 還原後重佈線回基準
            break
        # 採納最佳變異
        _sc, bad, k, r2, other, wl = best
        _apply_cand(k, r2, other, wl)
        cur_sc, bad = _score()
    return p


def _assign_backloop_tracks(p):
    """回線軌位指派(20260710.14):每條 backLoop(明示或依列序回頭者)
    依(目標列、來源列、fid)排序各配一軌,寫入來源節點 `_blt`,
    供 waypoints() 的左通道 x 逐軌外移 2×LINE_GAP——消除多回線共線;
    目標端進點由 _spread_ports 以長並行加距(2×LINE_GAP)分開。"""
    loops = []
    for fid, s, tg, _lab, rt in p.flows:
        S, T = p.nodes.get(s), p.nodes.get(tg)
        if not S or not T or S.get("row") is None or T.get("row") is None:
            continue
        if rt == "backLoop" or (rt == "auto" and T["row"] < S["row"]
                                and not S.get("attach")):
            loops.append((T["row"], S["row"], fid, s))
    # 深源佔外軌(20260710.15):同目標多回線要同心巢狀不交叉,最深來源
    # 須佔最左(外)軌+最上進點(進點次序由 _spread_ports 依通道 x 自動
    # 對應);故以 -S.row 排序——原「淺源佔外軌」實測外軌出線橫穿內軌。
    for i, (_tr, _nsr, _fid, s) in enumerate(
            sorted((tr, -sr, fid, s) for tr, sr, fid, s in loops)):
        p.nodes[s]["_blt"] = i


def _stash_bnd_tracks(p):
    """側通道讓位(修 7-3a 已知極限):統計各泳道**左緣走廊**被邊界事件
    讓位軌(bndSide 且目標在左)佔用的最深軌位,寫入該泳道所有節點的
    `_bndL`,供 waypoints() 的 sideLeft 通道外移讓位——
    sideLeft 基準位(泳道左緣 +14)與讓位軌(+12 起、每軌 +LINE_GAP)
    同廊互撞,是「加寬修正救不回左側」的根因:通道位置寫死,既不知
    讓位軌佔用、也用不到加寬多出的空間。外移後,修正輪的河道加寬
    (lane_pad)即可騰出乾淨左軌,重佈線自動換邊。
    (右緣 sideRight -14 與讓位軌 -28 起跳,設計時已錯開,毋須處理。)"""
    deep = {}
    for _fid, s, tg, _lab, rt in p.flows:
        S = p.nodes.get(s); T = p.nodes.get(tg)
        if not S or not T or not S.get("attach"):
            continue
        if rt not in ("auto", "bndSide"):
            continue
        if (S.get("row") is not None and T.get("row") is not None
                and T["row"] < S["row"]):
            continue                       # 走 backLoop,不佔讓位軌
        t_cx = T["x"] + T["w"] / 2
        s_cx = S["x"] + S["w"] / 2
        if t_cx < s_cx:                    # 目標在左 → 佔左緣夾縫
            rg = S.get("_bg", S.get("_bidx", 0))
            li = S["lane"]
            deep[li] = max(deep.get(li, 0), rg + 1)
    for n in p.nodes.values():
        n["_bndL"] = deep.get(n["lane"], 0)


def _force_split_gateway_pairs(p, decided):
    """同源閘道雙出邊強制分邊(20260710.15,鐵則優先於評分):兩出邊
    決案仍「共線或共用出點」時,試「雙側出/單邊側出×2」三組合,驗證
    互不重合、出點相異、側出不反向繞穿菱形、不穿其他節點才採納。
    註:曾試「把 outLeft/outRight 加進精修候選」——全域波及使
    範例_平行作業平白多出交叉,故改為僅對違規對做針對性後處理。"""
    def _hits_other(w, s_, tg_):
        return any(nid not in (s_, tg_)
                   and not (p.nodes[nid].get("attach") in (s_, tg_))
                   and any(_seg_hits_box(w[k], w[k + 1], n)
                           for k in range(len(w) - 1))
                   for nid, n in p.nodes.items())
    gw_out = {}
    for idx, (fid, s, tg, lab, r) in enumerate(p.flows):
        if p.nodes[s]["t"] == "gateway" and not p.nodes[s].get("attach") \
                and tg in p.nodes:
            gw_out.setdefault(s, []).append(idx)
    for s, idxs in sorted(gw_out.items()):
        if len(idxs) != 2:
            continue
        i1, i2 = idxs
        same_port = (round(decided[i1][0][0]), round(decided[i1][0][1])) == \
                    (round(decided[i2][0][0]), round(decided[i2][0][1]))
        if not _wps_overlap(decided[i1], decided[i2]) and not same_port:
            continue
        S = p.nodes[s]
        t1, t2 = p.flows[i1][2], p.flows[i2][2]
        c1 = p.nodes[t1]["x"] + p.nodes[t1]["w"] / 2
        c2 = p.nodes[t2]["x"] + p.nodes[t2]["w"] / 2
        if abs(c1 - c2) < 1:
            continue
        left_i, right_i = (i1, i2) if c1 < c2 else (i2, i1)
        combos = [((left_i, "outLeft",
                    waypoints(S, p.nodes[p.flows[left_i][2]], "outLeft")),
                   (right_i, "outRight",
                    waypoints(S, p.nodes[p.flows[right_i][2]], "outRight")))]
        for ii in (i1, i2):        # 單邊側出、另一條維持決案(目標同側時)
            other = i2 if ii == i1 else i1
            Ti = p.nodes[p.flows[ii][2]]
            side = "outRight" if Ti["x"] + Ti["w"] / 2 \
                > S["x"] + S["w"] / 2 else "outLeft"
            combos.append(((ii, side, waypoints(S, Ti, side)),
                           (other, p.flows[other][4], decided[other])))
        for (ia, ra, wa), (ib, rb, wb) in combos:
            if _wps_overlap(wa, wb):
                continue
            if (round(wa[0][0]), round(wa[0][1])) == \
                    (round(wb[0][0]), round(wb[0][1])):
                continue                      # 出點仍相同,未解端口重合
            bad = False                       # 側出不可反向繞穿菱形本體
            for rX, wX in ((ra, wa), (rb, wb)):
                if rX == "outLeft" and wX[1][0] > wX[0][0] + 1:
                    bad = True
                if rX == "outRight" and wX[1][0] < wX[0][0] - 1:
                    bad = True
            if bad:
                continue
            if _hits_other(wa, s, p.flows[ia][2]) \
                    or _hits_other(wb, s, p.flows[ib][2]):
                continue
            for iX, rX, wX in ((ia, ra, wa), (ib, rb, wb)):
                fid_, s_, tg_, lab_, _o = p.flows[iX]
                p.flows[iX] = (fid_, s_, tg_, lab_, rX)
                decided[iX] = wX
            break


def _er_ok(S, T):
    """enterRight 方向防呆(20260710.15,學自使用者標紅):enterRight 末段
    水平接入目標「右緣」,只有目標整體在來源中線左側時才是自然的
    右側接入;否則末段須橫穿目標本體才能到右緣(對向端),而自身端點
    豁免使衝突分完全看不見這種穿越。"""
    return S["x"] + S["w"] / 2 > T["x"] + T["w"] + 4


def _auto_routes(p):
    _stash_bnd_tracks(p)
    _assign_backloop_tracks(p)

    def blocked(s, t):
        if s["lane"] != t["lane"]:
            return False
        lo, hi = sorted((s["row"], t["row"]))
        return any(o["lane"] == s["lane"] and lo < o["row"] < hi
                   for o in p.nodes.values())

    outdeg = {}
    for fid, s, tg, lab, rt in p.flows:
        outdeg[s] = outdeg.get(s, 0) + 1

    decided = []                       # 已定案各邊的折線,供後續邊做衝突試算
    used_ports = {}                    # 節點 → 已用端口座標(進出不共點)

    # 邊界出邊讓位軌次(同宿主多顆、同讓位方向分群):
    # 廊深與軌位同用「圓的幾何序」——近讓位側的圓走淺廊+外軌。
    # 淺水平段永不橫穿他圓的深下落柱(柱底=自己走廊,近側柱必較淺);
    # 已知破口:遠側圓配較淺目標時,其入段可能跨近側圓的外軌
    # (A/B 實測此序整體最優;該組合由評分回報,調整目標 row 即解)。
    grp = {}
    for _fid, s0, t0, _lb, _rt in p.flows:
        S0 = p.nodes[s0]
        if not S0.get("attach"):
            continue
        T0 = p.nodes[t0]
        left = (T0.get("x", 0) + T0.get("w", 0) / 2) < \
               (S0.get("x", 0) + S0.get("w", 0) / 2)
        grp.setdefault((S0["attach"], left), []).append((s0, t0))
    for (host, left), lst in grp.items():
        by_geo = sorted(lst, key=lambda st: p.nodes[st[0]].get("x", 0),
                        reverse=not left)   # 近讓位側在前
        for rk, (bid, _t) in enumerate(by_geo):
            p.nodes[bid]["_bg"] = rk

    def conflicts(s, tg, wps, skip=None):
        """衝突分數:穿過節點(重罰)+ 與已定案邊的交叉/共線重合
        + 端口重用(同節點多條邊共用同一進出點,視覺上進出同點)。"""
        c = 0
        for nid, n in p.nodes.items():
            if nid in (s, tg):
                continue
            if n.get("attach") in (s, tg):
                continue    # 貼附於邊端點宿主的邊界事件,豁免(同 check)
            if any(_seg_hits_box(wps[k], wps[k + 1], n) for k in range(len(wps) - 1)):
                c += 10
        for i, ow in enumerate(decided):
            if skip is not None and i == skip:
                continue
            # 重合權重 4(20260710.14):原為 1、比平行貼行(5)還輕,
            # 使同源閘道雙出邊寧可共線也不側出——與鐵則③牴觸;
            # 交叉維持 1(已有跨線橋呈現,容忍度相對高)。
            # 註:試過 8 —— 範例_平行作業被推出一個原本沒有的交叉,
            # 貪婪決策對過重懲罰敏感,4 為實測平衡點。
            c += _wps_cross(wps, ow) + 2 * _wps_overlap(wps, ow)
            c += 5 * _wps_par_close(wps, ow)   # 平行貼行(2~10px)難辨歸屬
        for node, pt, end_i in ((s, wps[0], 0), (tg, wps[-1], -1)):
            others = list(used_ports.get(node, ()))
            key = (round(pt[0]), round(pt[1]))
            if skip is not None and skip < len(decided):
                # 精修:先移除「自己這條邊的舊端點」再判定——候選端點
                # 與舊端點不同時,舊寫法 count>1 會錯誤放寬(自己根本
                # 沒貢獻新 key),導致變體間 straight↔side 振盪
                old_pt = decided[skip][end_i]
                old_key = (round(old_pt[0]), round(old_pt[1]))
                if old_key in others:
                    others.remove(old_key)
            if key in others:
                c += 2
        return c

    new = []
    for fid, s, tg, lab, rt in p.flows:
        S, T = p.nodes[s], p.nodes[tg]
        if rt != "auto":
            new.append((fid, s, tg, lab, rt))
            decided.append(waypoints(S, T, rt))
            continue
        if S.get("attach") and T["row"] >= S["row"]:
            # 邊界事件出邊:固定走讓位軌(bndSide)。專用走廊+夾縫的
            # 幾何已保證同宿主巢狀不交叉;若進候選試算,微小幾何差異
            # 會引發全域路線組合漂移(同分換序),反而不穩定。
            r = "bndSide"
        elif T["row"] < S["row"]:
            r = "backLoop"
        elif T["row"] == S["row"]:
            r = "auto"
        elif S["lane"] == T["lane"]:
            if blocked(S, T):
                # 跳層連線:左右側通道各試算一次,選衝突最少的一側(平手取右)
                cand = [(conflicts(s, tg, waypoints(S, T, rr)), k, rr)
                        for k, rr in enumerate(("sideRight", "sideLeft"))]
                r = min(cand)[2]
            else:
                r = "straight"
        elif outdeg.get(s, 0) >= 2:
            # 分支慣例為左右側出;但加寬/同列並排後側出可能撞子欄鄰居,
            # 故與正交下行各試算一次取衝突少者(平手維持慣例側出)。
            side = "outLeft" if T["lane"] < S["lane"] else "outRight"
            rrs = (side, "straight") + \
                (("enterRight",) if _er_ok(S, T) else ())
            cand = [(conflicts(s, tg, waypoints(S, T, rr)), k, rr)
                    for k, rr in enumerate(rrs)]
            r = min(cand)[2]
        else:
            r = "auto"
        wps = waypoints(S, T, r)
        if r in ("straight", "auto") and any(
               nid not in (s, tg) and
               any(_seg_hits_box(wps[k], wps[k + 1], n) for k in range(len(wps) - 1))
               for nid, n in p.nodes.items()):
            if T["row"] <= S["row"]:
                r = "backLoop"
            elif _er_ok(S, T):
                r = "enterRight"
            else:
                cand = [(conflicts(s, tg, waypoints(S, T, rr)), k, rr)
                        for k, rr in enumerate(("sideRight", "sideLeft"))]
                r = min(cand)[2]
            wps = waypoints(S, T, r)
        new.append((fid, s, tg, lab, r))
        decided.append(wps)
        for node, pt in ((s, wps[0]), (tg, wps[-1])):
            used_ports.setdefault(node, []).append(
                (round(pt[0]), round(pt[1])))
    p.flows = new

    # 第二輪精修:第一輪為貪婪(先決定的邊看不到後面的邊),此輪在
    # 全景已知下逐條重試候選,能消除「先手選了會與後手交叉」的殘餘。
    CAND = ("straight", "sideRight", "sideLeft", "enterRight")
    CAND_BND = ("bndSide",) + CAND
    for idx, (fid, s, tg, lab, r) in enumerate(list(p.flows)):
        if r in ("backLoop", "bndSide"):
            continue                    # 迴圈/邊界讓位邊走專用通道,不重選
        S, T = p.nodes[s], p.nodes[tg]
        cands_r = CAND_BND if S.get("attach") else CAND
        cur = conflicts(s, tg, decided[idx], skip=idx)
        def _geo(w):
            plen = sum(abs(w[k+1][0]-w[k][0]) + abs(w[k+1][1]-w[k][1])
                       for k in range(len(w)-1))
            return (len(w) - 2, plen)          # (轉折數, 路徑長)
        best_r, best_c, best_w = r, (cur,) + _geo(decided[idx]), decided[idx]
        for rr in cands_r:
            if rr == r:
                continue
            if rr == "enterRight" and not _er_ok(S, T):
                continue    # 對向端防呆(20260710.15):目標在來源右側時,
                            # enterRight 的末段會「穿過目標本體」接右緣——
                            # 自身端點豁免使衝突分看不見,候選端直接排除
            try:
                wps2 = waypoints(S, T, rr)
            except Exception:
                continue
            c2 = (conflicts(s, tg, wps2, skip=idx),) + _geo(wps2)
            if c2 < best_c:                     # 衝突優先;同衝突取直、取短
                best_r, best_c, best_w = rr, c2, wps2
        if best_r != r:
            p.flows[idx] = (fid, s, tg, lab, best_r)
            decided[idx] = best_w

    # 第二輪半(a):同源閘道雙出邊強制分邊(鐵則優先於評分);
    # 端口消解可能把邊改路、在上游閘道產生新共點/共線,故消解後再跑一次
    _force_split_gateway_pairs(p, decided)

    # 第二輪半之二:閘道端口衝突消解(20260710.15,鐵則⑥優先於評分)——
    # 菱形豁免端口分散,進線與出線共用同一頂點時(常伴隨共線),把可
    # 改路的邊改走「未佔用頂點」的最佳候選;backLoop/bndSide 走專用
    # 通道不動,由其他邊讓位。
    CANDG = ("straight", "sideRight", "sideLeft", "enterRight",
             "outLeft", "outRight")
    for g in sorted(p.nodes):
        gn = p.nodes[g]
        if gn["t"] != "gateway" or gn.get("attach"):
            continue
        bypt = {}
        for idx2, (fid2, s2, t2, lab2, r2) in enumerate(p.flows):
            if s2 == g and t2 in p.nodes:
                pt = decided[idx2][0]
                bypt.setdefault((round(pt[0]), round(pt[1])),
                                []).append((idx2, True))
            if t2 == g and s2 in p.nodes:
                pt = decided[idx2][-1]
                bypt.setdefault((round(pt[0]), round(pt[1])),
                                []).append((idx2, False))
        for key, users in sorted(bypt.items()):
            if len(users) < 2:
                continue
            fixed = [u for u in users
                     if p.flows[u[0]][4] in ("backLoop", "bndSide")]
            keepers = set(fixed) or {users[0]}
            occ = set(bypt.keys())
            for idx2, at_src in users:
                if (idx2, at_src) in keepers:
                    continue
                fid2, s2, t2, lab2, r2 = p.flows[idx2]
                S2, T2 = p.nodes[s2], p.nodes[t2]
                best = None
                for rr in CANDG:
                    if rr == r2:
                        continue
                    if rr == "enterRight" and not _er_ok(S2, T2):
                        continue
                    if rr in ("outLeft", "outRight") and not at_src:
                        continue
                    try:
                        w2 = waypoints(S2, T2, rr)
                    except Exception:
                        continue
                    if len(w2) >= 2:      # 側出不可反向繞穿菱形本體
                        if rr == "outLeft" and w2[1][0] > w2[0][0] + 1:
                            continue
                        if rr == "outRight" and w2[1][0] < w2[0][0] - 1:
                            continue
                    ptg = w2[0] if at_src else w2[-1]
                    if (round(ptg[0]), round(ptg[1])) in occ:
                        continue          # 仍落在已佔用端口
                    if any(_wps_overlap(w2, decided[u2[0]])
                           for u2 in users if u2 != (idx2, at_src)):
                        continue
                    plen = sum(abs(w2[q+1][0] - w2[q][0])
                               + abs(w2[q+1][1] - w2[q][1])
                               for q in range(len(w2) - 1))
                    c2 = (conflicts(s2, t2, w2, skip=idx2),
                          len(w2) - 2, plen)
                    if best is None or c2 < best[0]:
                        best = (c2, rr, w2)
                if best is not None:
                    _c2, rr, w2 = best
                    p.flows[idx2] = (fid2, s2, t2, lab2, rr)
                    decided[idx2] = w2
                    npt = w2[0] if at_src else w2[-1]
                    occ.add((round(npt[0]), round(npt[1])))
    # 端口消解後再跑一次分邊:改路的邊可能在上游閘道生成新共點/共線
    _force_split_gateway_pairs(p, decided)

    # 第三階段:重合自動分軌——仍共線的邊(排除端樁),把後決定那條的
    # 共線垂直段整段平移 12px(兩端插短水平段接回原 port),持久化於
    # p.wps_override 供三種輸出與檢核共用。隔不開者由 check_layout 回報。
    p.wps_override = {}
    p._flow_port_cache = None   # 端口快取隨路線重選一併失效(避免陳舊懲罰)
    p._assoc_wps = None         # 關連線全體互覺快取同步失效(20260710.14)
    p._flow_port_cache = None
    for i in range(len(decided)):
        for j in range(i + 1, len(decided)):
            if {p.flows[i][1], p.flows[i][2]} & {p.flows[j][1], p.flows[j][2]}:
                continue                      # 共享節點的合流/分岔不算重合
            if not _wps_overlap(decided[i], decided[j]):
                continue
            wj = [list(pt) for pt in decided[j]]
            moved = False
            for k in range(len(wj) - 1):
                (ax, ay), (bx, by) = wj[k], wj[k + 1]
                if abs(ax - bx) > 1e-6:
                    continue                  # 只處理垂直共線段(常見型)
                hit = any(_wps_overlap([tuple(wj[k]), tuple(wj[k + 1])], di)
                          for di in (decided[i],))
                if not hit:
                    continue
                fv = []
                for li2 in range(len(p.lanes) + 1):
                    fv.append(p._lane_x(min(li2, len(p.lanes) - 1))
                              + (p.lane_width(len(p.lanes) - 1)
                                 if li2 == len(p.lanes) else 0))
                for _c, _n, cx0, _y0, cx1, _y1, _kd in p.container_spans():
                    fv += [cx0, cx1]
                # 方向排序:共用通道的重合對,「目標較深者放外軌」
                # (外=遠離泳道中心;淺者外置時其入段會跨仍在下行的
                # 內軌——讓位軌巢狀原理在側通道的鏡像)
                Sj = p.nodes[p.flows[j][1]]
                lc = Sj.get("_lane_left", 0)
                rc = Sj.get("_lane_right", lc + LANE_W)
                outward = LINE_GAP if ax > (lc + rc) / 2 else -LINE_GAP
                deeper_j = decided[j][-1][1] >= decided[i][-1][1]
                # 深者「只許外移」、淺者「只許內移」——反向即巢狀錯置
                # (深內淺外必生入段交叉);單向失敗即 fallback 改移對方
                dxs = (outward,) if deeper_j else (-outward,)
                for dx in dxs:
                    if any(abs(ax + dx - f) <= 6 for f in fv):
                        continue          # 平移後貼框線,棄此向
                    cand = [list(pt) for pt in wj]
                    # 鄰段為水平 → 平移併入該水平段(整段挪移,不插
                    # 12px 短橫移毛刺=視覺斷頭);端點直出才插短接段
                    pre_h = k > 0 and abs(cand[k - 1][1] - ay) < 1e-6
                    post_h = k + 2 < len(cand) \
                        and abs(cand[k + 2][1] - by) < 1e-6
                    cand[k][0] += dx
                    cand[k + 1][0] += dx
                    if not pre_h:
                        cand.insert(k, [ax, ay])
                        k_off = 1
                    else:
                        k_off = 0
                    if not post_h:
                        cand.insert(k + 2 + k_off, [bx, by])
                    cand = [tuple(pt) for pt in cand]
                    # 去除零長段
                    cand = [pt for q, pt in enumerate(cand)
                            if q == 0 or abs(pt[0] - cand[q - 1][0]) > 1e-6
                            or abs(pt[1] - cand[q - 1][1]) > 1e-6]
                    c_old = conflicts(p.flows[j][1], p.flows[j][2],
                                      decided[j], skip=j)
                    c_new = conflicts(p.flows[j][1], p.flows[j][2],
                                      cand, skip=j)
                    # 註:左邊距帶寬(36px)須容納側通道+讓位軌,
                    # 全域淨空條件會鎖死平移;採觸發對條件,殘餘貼行
                    # 由評分如實回報(帶寬物理極限,見 conventions)
                    if c_new <= c_old and not _wps_overlap(cand, decided[i]):
                        decided[j] = cand
                        p.wps_override[p.flows[j][0]] = cand
                        moved = True
                        break
                if moved:
                    break
                # j 兩向皆不可(外移貼框/內移衝突)→ fallback:改移
                # 「淺者 i」內移,同樣達成「深外淺內」的巢狀配置
                for ki in range(len(decided[i]) - 1):
                    (aix, aiy), (bix, biy) = decided[i][ki], decided[i][ki + 1]
                    if abs(aix - bix) > 1e-6:
                        continue
                    if not _wps_overlap([(aix, aiy), (bix, biy)], wj):
                        continue
                    inward = -outward
                    if any(abs(aix + inward - f) <= 6 for f in fv):
                        continue
                    ci = [list(pt) for pt in decided[i]]
                    pre_h = ki > 0 and abs(ci[ki - 1][1] - aiy) < 1e-6
                    post_h = ki + 2 < len(ci) and abs(ci[ki + 2][1] - biy) < 1e-6
                    ci[ki][0] += inward
                    ci[ki + 1][0] += inward
                    if not pre_h:
                        ci.insert(ki, [aix, aiy])
                    if not post_h:
                        ci.insert(ki + 2 + (0 if pre_h else 1), [bix, biy])
                    ci = [tuple(pt) for pt in ci]
                    ci = [pt for q, pt in enumerate(ci)
                          if q == 0 or abs(pt[0] - ci[q - 1][0]) > 1e-6
                          or abs(pt[1] - ci[q - 1][1]) > 1e-6]
                    ci_old = conflicts(p.flows[i][1], p.flows[i][2],
                                       decided[i], skip=i)
                    ci_new = conflicts(p.flows[i][1], p.flows[i][2],
                                       ci, skip=i)
                    if ci_new <= ci_old and not _wps_overlap(ci, wj):
                        decided[i] = ci
                        p.wps_override[p.flows[i][0]] = ci
                        moved = True
                        break
                if moved:
                    break
    _spread_ports(p)


_SPREAD_TS = ("task", "database")   # 矩形類節點才錯開(圓/菱形端點會浮離外框)


def _spread_ports(p):
    """鐵則⑥(20260710.12):任兩條連線的起迄點不可重疊。路線與分軌
    定案後,同一矩形節點上共用同一端點的順序流沿該側錯開(間距
    ≤LINE_GAP、夾邊 8px),端點與鄰接折點一起平移保持正交,結果
    持久化 wps_override(三輸出與檢核共用)。直線邊(2 點)優先保住
    原位;圓形事件/菱形閘道錯開會使端點浮離外框,不處理——殘餘由
    「端口重合」檢核如實回報。"""
    ov = p.wps_override
    edges, groups = {}, {}
    for fid, s, tg, _lab, rt in p.flows:
        S, T = p.nodes.get(s), p.nodes.get(tg)
        if not S or not T or S.get("x") is None or T.get("x") is None:
            continue
        w = ov.get(fid) or waypoints(S, T, rt)
        edges[fid] = [tuple(q) for q in w]
        for nid, idx in ((s, 0), (tg, len(w) - 1)):
            pt = w[idx]
            groups.setdefault((nid, round(pt[0]), round(pt[1])),
                              []).append((fid, idx))
    for (nid, kx, ky), members in sorted(groups.items()):
        if len(members) < 2:
            continue
        n = p.nodes[nid]
        if n["t"] not in _SPREAD_TS or n.get("attach"):
            continue
        horiz = min(abs(ky - n["y"]), abs(ky - (n["y"] + n["h"]))) <= 2
        vert = min(abs(kx - n["x"]), abs(kx - (n["x"] + n["w"]))) <= 2
        if horiz == vert:
            continue                    # 角點/非邊上,不處理

        def _away(m):
            fid_, idx_ = m
            w_ = edges[fid_]
            q = w_[1] if idx_ == 0 else w_[-2]
            if horiz:
                return q[0]
            # 垂直側(左/右邊)依鄰接點 x 排序(20260710.15):多回線同心
            # 巢狀時「外軌(更遠通道)配上位進點」才不交叉;原按 y 排序
            # 在初始同 y 時退化為按 fid,外軌常拿到下位進點而與內軌交叉。
            # 左側:x 越小(越外)越先(上位);右側鏡像。
            return q[0] if abs(kx - n["x"]) <= 2 else -q[0]
        members = sorted(members, key=lambda m: (_away(m), m[0]))
        anchors = [m for m in members if len(edges[m[0]]) == 2]
        if len(anchors) > 1:
            continue                    # 兩條直線邊同點=重合,交檢核回報
        j = members.index(anchors[0]) if anchors else (len(members) - 1) // 2
        base = kx if horiz else ky
        lo = (n["x"] if horiz else n["y"]) + 8
        hi = ((n["x"] + n["w"]) if horiz else (n["y"] + n["h"])) - 8
        # 長並行加距(20260710.14):任一成員的鄰接段 >150px(如回線的
        # 長水平進線)時,錯開間距升為 2×LINE_GAP——12px 在長並行下
        # 人眼仍視為重疊
        def _adjlen(m):
            fid_, idx_ = m
            w_ = edges[fid_]
            if len(w_) < 2:
                return 0
            q1 = w_[idx_]
            q2 = w_[1] if idx_ == 0 else w_[-2]
            return abs(q1[0] - q2[0]) + abs(q1[1] - q2[1])
        base_gap = (2 * LINE_GAP if any(_adjlen(m) > 150 for m in members)
                    else LINE_GAP)
        gap = min(base_gap, (hi - lo) / max(len(members) - 1, 1))
        for i, (fid, idx) in enumerate(members):
            if i == j:
                continue
            w = edges[fid]
            if len(w) < 3:
                continue                # 直線邊不動(端點平移會生斜線)
            adj = 1 if idx == 0 else len(w) - 2
            ax = 0 if horiz else 1
            if abs(w[adj][ax] - w[idx][ax]) > 1:
                continue                # 鄰接段方向不符,平移會破正交
            npos = min(max(base + (i - j) * gap, lo), hi)
            wl = [list(q) for q in w]
            wl[idx][ax] = npos
            wl[adj][ax] = npos
            edges[fid] = [tuple(q) for q in wl]
            ov[fid] = edges[fid]


def _flow_ports(proc):
    """順序流端點集合(供關連線端口懲罰/讓位)。"""
    used = getattr(proc, "_flow_port_cache", None)
    if used is None:
        used = set()
        ov = getattr(proc, "wps_override", {})
        for fid, s_, t_, _l, rt_ in proc.flows:
            if s_ in proc.nodes and t_ in proc.nodes \
                    and proc.nodes[s_].get("x") is not None:
                w = ov.get(fid) or waypoints(proc.nodes[s_],
                                             proc.nodes[t_], rt_)
                used.add((round(w[0][0]), round(w[0][1])))
                used.add((round(w[-1][0]), round(w[-1][1])))
        proc._flow_port_cache = used
    return used


def _assoc_route_one(proc, src, tgt, used, prior, aports):
    """單條關連線選路:straight/sideRight/sideLeft/up 候選試算,取
    「穿框×10 + 重合先決關連×8 + 平行貼行×5 + 端口(流程邊/先決關連)×2
    + 交叉×1」最少者。prior/aports=先決定關連線的路徑與端點
    (20260710.14 全體互覺:原本各條獨立選路彼此不可見,同夥伴多條
    關連線必然同路重合)。"""
    S, T = proc.nodes[src], proc.nodes[tgt]
    best = None
    cands = []
    if T["y"] + T["h"] <= S["y"]:          # 目標在上方:向上直達候選
        # 起訖預偏 +14:避開頂/底四正 port(順序流常駐),免端口撞分
        sp = (S["x"] + S["w"] / 2 + 14, S["y"])
        tp = (T["x"] + T["w"] / 2 + 14, T["y"] + T["h"])
        if abs(sp[0] - tp[0]) < 1:
            cands.append(("up", [sp, tp]))
        else:
            my = (sp[1] + tp[1]) / 2
            cands.append(("up", [sp, (sp[0], my), (tp[0], my), tp]))
    cands += [(rt, None) for rt in ("straight", "sideRight", "sideLeft")]
    for rt, pre in cands:
        wps = pre if pre is not None else waypoints(S, T, rt)
        hits = sum(1 for nid, n in proc.nodes.items()
                   if nid not in (src, tgt) and "x" in n
                   and any(_seg_hits_box_b(wps[k], wps[k + 1], n)
                           for k in range(len(wps) - 1)))
        pcost = sum(1 for pt in (wps[0], wps[-1])
                    if (round(pt[0]), round(pt[1])) in used
                    or (round(pt[0]), round(pt[1])) in aports)
        pa = sum(8 * _wps_overlap(wps, pw) + _wps_cross(wps, pw)
                 + 5 * _wps_par_close(wps, pw) for pw in prior)
        score = hits * 10 + pcost * 2 + pa
        if best is None or score < best[0]:
            best = (score, wps)
        if score == 0:
            break
    wps = [list(pt) for pt in best[1]]
    # 端口讓位:關連線可從節點邊上任意點進出(BPMN 慣例)——
    # 選定路線的端點若與流程邊/先決關連共用端口,沿節點邊緣平移
    # 14px 錯開(仍撞則續移,至多三次;相鄰折點同軸同步維持正交)。
    for ei, node in ((0, S), (-1, T)):
        for _try in range(3):
            px, py = wps[ei]
            key = (round(px), round(py))
            if key not in used and key not in aports:
                break
            adj = wps[1] if ei == 0 else wps[-2]
            on_side = abs(px - node["x"]) < 1 \
                or abs(px - node["x"] - node["w"]) < 1
            if on_side:                   # 左/右邊:沿 y 平移
                ny = min(max(py + 14, node["y"] + 8),
                         node["y"] + node["h"] - 8)
                if abs(adj[1] - py) < 1e-6:   # 相鄰段水平 → 同步 y
                    adj[1] = ny
                if abs(ny - py) < 1:
                    break                 # 已到邊界,移不動
                wps[ei][1] = ny
            else:                         # 上/下邊:沿 x 平移
                nx = min(max(px + 14, node["x"] + 8),
                         node["x"] + node["w"] - 8)
                if abs(adj[0] - px) < 1e-6:
                    adj[0] = nx
                if abs(nx - px) < 1:
                    break
                wps[ei][0] = nx
    return [tuple(pt) for pt in wps]


def _assoc_dodge(proc, src, tgt, wps, prior):
    """關連線走廊避讓(20260710.15):與先決關連仍共線/長並行時,把中段
    水平走廊整段平移 ±LINE_GAP/±2×LINE_GAP,取第一個「不共線、不撞
    節點」的位移(端點不動、正交不變)。候選選路分數同分時兩條同夥伴
    關連常得到同一走廊 y——完全共線(使用者標紅實證:244px)。"""
    def _hits(w):
        return any(nid not in (src, tgt) and "x" in n
                   and any(_seg_hits_box_b(w[k], w[k + 1], n)
                           for k in range(len(w) - 1))
                   for nid, n in proc.nodes.items())

    def _bad(w):
        return _hits(w) or any(
            _wps_overlap(w, pw)
            or _wps_par_close(w, pw, lo=2, hi=2 * LINE_GAP, minlen=150)
            for pw in prior)
    if len(wps) < 4 or not _bad(wps):
        return wps

    def _corridor(base):
        """中段平移試算:先水平段 y、再垂直段 x;成功回傳新路徑。"""
        for coord in (1, 0):
            for dd in (-LINE_GAP, LINE_GAP, -2 * LINE_GAP, 2 * LINE_GAP):
                w2 = [list(q) for q in base]
                moved = False
                for q in range(1, len(w2) - 2):
                    if abs(w2[q][coord] - w2[q + 1][coord]) < 1e-6:
                        w2[q][coord] += dd
                        w2[q + 1][coord] += dd
                        moved = True
                if not moved:
                    continue
                w2t = [tuple(q) for q in w2]
                if not _bad(w2t):
                    return w2t
        return None
    r = _corridor(wps)
    if r:
        return r
    # 末手:首段插折讓開(端點段不能整段平移——起點釘在夥伴節點上;
    # 夥伴正下方貼著別的節點時,起點後 18px 先橫移 dd 再續行),
    # 並與走廊平移做二階組合(插折解掉垂直段、平移解掉水平段)
    (x0, y0), (x1, y1) = wps[0], wps[1]
    if abs(x0 - x1) < 1e-6 and abs(y1 - y0) > 40:
        step = 18 if y1 > y0 else -18
        for dd in (LINE_GAP, -LINE_GAP, 2 * LINE_GAP, -2 * LINE_GAP,
                   3 * LINE_GAP, -3 * LINE_GAP):
            jog = [wps[0], (x0, y0 + step), (x0 + dd, y0 + step),
                   (x0 + dd, y1)] + [tuple(q) for q in wps[2:]]
            if not _bad(jog):
                return jog
            r = _corridor(jog)
            if r:
                return r
    return wps


def _route_assocs(proc):
    """全部關連線一次選路(20260710.14 全體互覺),依宣告順序逐條決定,
    後決定者把先決定者的路徑/端點計入衝突分;仍共線者走廊平移避讓。
    回傳 {(src,tgt): wps}。"""
    used = _flow_ports(proc)
    cache, prior, aports = {}, [], set()
    for aid, src, tgt, lab in proc.assocs:
        if src not in proc.nodes or tgt not in proc.nodes:
            continue
        wps = _assoc_route_one(proc, src, tgt, used, prior, aports)
        wps = _assoc_dodge(proc, src, tgt, wps, prior)
        cache[(src, tgt)] = wps
        prior.append(wps)
        aports.add((round(wps[0][0]), round(wps[0][1])))
        aports.add((round(wps[-1][0]), round(wps[-1][1])))
    return cache


def assoc_waypoints(proc, src, tgt):
    """關連線走線(三種輸出與檢核共用):首次呼叫時全體互覺選路並快取,
    快取由 _auto_routes 隨路線重選一併失效。"""
    cache = getattr(proc, "_assoc_wps", None)
    if cache is None:
        cache = _route_assocs(proc)
        proc._assoc_wps = cache
    w = cache.get((src, tgt))
    if w is None:      # 不在 assocs 清單(防禦):即席單條選路
        w = _assoc_route_one(proc, src, tgt, _flow_ports(proc), [], set())
    return w


def _seg_hits_box_b(p1, p2, n, pad=4):
    (x1, y1), (x2, y2) = p1, p2
    bx1, by1 = n["x"] - pad, n["y"] - pad
    bx2, by2 = n["x"] + n["w"] + pad, n["y"] + n["h"] + pad
    if abs(x1 - x2) < 1e-6:
        if bx1 <= x1 <= bx2:
            lo, hi = sorted((y1, y2))
            return not (hi < by1 or lo > by2)
        return False
    if abs(y1 - y2) < 1e-6:
        if by1 <= y1 <= by2:
            lo, hi = sorted((x1, x2))
            return not (hi < bx1 or lo > bx2)
        return False
    return False


def _lane_min_width(p):
    """鐵則⑦(20260710.12):所有泳道預設 ≥2 倍 LANE_W 寬;單一泳道
    格點節點(不含工件/邊界)>20 個時 ≥3 倍。不足的以 lane_pad 對稱
    補足——_place 的 pad//2 置中使節點仍居泳道中央、兩側多出走線通道。
    呼叫時機:lane_subs 定案後、_place 之前;呼叫前 lane_pad 須為當輪
    乾淨狀態(修正輪的河道加寬疊加在本底之上)。"""
    counts = {}
    for n in p.nodes.values():
        if n["t"] in NONGRID_TS or n.get("attach"):
            continue
        counts[n["lane"]] = counts.get(n["lane"], 0) + 1
    for li in range(len(p.lanes)):
        mult = 3 if counts.get(li, 0) > 20 else 2
        deficit = mult * LANE_W - p.lane_subs[li] * LANE_W \
            - p.lane_pad.get(li, 0)
        if deficit > 0:
            p.lane_pad[li] = p.lane_pad.get(li, 0) + deficit


def _artifact_widen(p):
    """工件同泳道子欄標準(20260710.09):含工件夥伴的泳道(或無夥伴
    工件自身的泳道)lane_subs 無條件直上 ≥2,讓工件佔同泳道相鄰子欄、
    不跨泳道貼鄰;與選型加寬(chain/wide)疊加時取 max。"""
    lns = set()
    arts = [k for k, n in p.nodes.items() if n["t"] in NONGRID_TS]
    pmap = {}
    for aid, a, b, lab in p.assocs:
        if a in p.nodes and b in p.nodes:
            ta, tb = p.nodes[a]["t"], p.nodes[b]["t"]
            if ta in NONGRID_TS and tb not in NONGRID_TS:
                pmap.setdefault(a, b)
            elif tb in NONGRID_TS and ta not in NONGRID_TS:
                pmap.setdefault(b, a)
    for k in arts:
        pk = pmap.get(k)
        lns.add(p.nodes[pk]["lane"] if pk else p.nodes[k]["lane"])
    for li in lns:
        if 0 <= li < len(p.lane_subs):
            p.lane_subs[li] = max(p.lane_subs[li], 2)


def _place_artifacts(p, depth, sub):
    """工件後置放置(20260710.09 標準:同泳道子欄優先):
    以第一個關連夥伴為圓心,候選順序——①夥伴同泳道相鄰子欄(右優先)
    ②夥伴同泳道其他列 ③最後手段才鄰泳道(殘餘距離由「貼鄰」檢核回報)。
    泳道已由 _artifact_widen 無條件加寬 ≥2,同泳道必有子欄可用;
    不再跨泳道貼鄰,故原「左鄰 backLoop 走廊懲罰」邏輯已無效移除。
    使用者已明給 row 者尊重不動。"""
    occupied = {(p.nodes[k]["lane"], sub.get(k, p.nodes[k].get("sub", 0)),
                 depth.get(k, p.nodes[k]["row"]))
                for k in p.nodes if p.nodes[k]["t"] not in NONGRID_TS
                and not p.nodes[k].get("attach")}
    partner = {}
    for aid, a, b, lab in p.assocs:
        if a in p.nodes and b in p.nodes:
            ta, tb = p.nodes[a]["t"], p.nodes[b]["t"]
            if ta in NONGRID_TS and tb not in NONGRID_TS:
                partner.setdefault(a, b)
            elif tb in NONGRID_TS and ta not in NONGRID_TS:
                partner.setdefault(b, a)
    for k, n in p.nodes.items():
        if n["t"] not in NONGRID_TS:
            continue
        if n["row"] is not None and k not in depth:
            occupied.add((n["lane"], n.get("sub", 0), n["row"]))
            continue                              # 手動指定,尊重
        pk = partner.get(k)
        base = depth.get(pk, p.nodes[pk]["row"]) if pk else 0
        plane = p.nodes[pk]["lane"] if pk else n["lane"]
        psub = (sub.get(pk, p.nodes[pk].get("sub", 0)) or 0) if pk else 0
        # 候選排序 key =(泳道階級, 列距, 子欄偏好, 子欄距):
        #   泳道階級 0=夥伴同泳道、1=鄰泳道(最後手段);
        #   子欄偏好 0=夥伴右側、1=左側(右優先,遠離泳道左緣迴圈通道)。
        near = [lc for lc in (plane - 1, plane + 1)
                if 0 <= lc < len(p.lanes)]
        # 閘道列迴避(20260710.15):閘道所在列是分支側出走廊,工件落在
        # 該列會堵死「同源雙出邊分邊」(使用者標紅案:決標記錄表/廢標
        # 結果通知擋住達底價?的側出)——同泳道的閘道列降一級偏好
        gw_rows = {(p.nodes[g]["lane"], depth.get(g, p.nodes[g]["row"]))
                   for g in p.nodes if p.nodes[g]["t"] == "gateway"}
        cands = []
        for dr in range(-5, 6):
            r = base + dr
            if r < 0:
                continue
            for rank, lcs in ((0, [plane]), (1, near)):
                for lc in lcs:
                    ks = max(1, p.lane_subs[lc] if lc < len(p.lane_subs)
                             else 1)
                    gwpen = 1 if (lc, r) in gw_rows else 0
                    for sb in range(ks):
                        pref = 0 if (rank == 0 and sb > psub) else 1
                        cands.append((rank, gwpen, abs(dr), pref,
                                      abs(sb - psub), r, lc, sb))
        placed = False
        for rank, _gwp, adr, pref, asb, r, lc, sb in sorted(cands):
            if (lc, sb, r) not in occupied:
                depth[k] = r
                sub[k] = sb
                n["row"], n["sub"], n["lane"] = r, sb, lc
                occupied.add((lc, sb, r))
                placed = True
                break
        if not placed:                            # 泳道全滿:掛在最底下新列
            r = max(rr for _l, _s, rr in occupied) + 1
            depth[k] = r; sub[k] = 0
            n["row"], n["sub"] = r, 0
            occupied.add((n["lane"], 0, r))


def _ensure(x):
    """輸出前確保已分層/放置。接受 Proc 或 Collab。"""
    if isinstance(x, Collab):
        if not x.pools:
            raise ValueError("協作沒有任何 pool;請先用 add_pool() 加入。")
        ox = POOL_X
        for proc in x.pools:
            proc.ox = ox
            ox += proc.pool_width() + POOL_GAP
        x._bb_geo = []
        for bxid, bname in x.blackboxes:
            x._bb_geo.append((bxid, bname, ox, 200))
            ox += 200 + POOL_GAP
        need_auto = [p for p in x.pools
                     if any(n["row"] is None for n in p.nodes.values()
                            if n["t"] not in NONGRID_TS)]
        if not need_auto:
            for proc in x.pools:
                _ensure(proc)
            return
        # Collab 層級雙版面試算:單 pool 各自取優會看不到跨 pool 訊息流的
        # 重合/交叉,故全 pool 同模式各排一版,以整體 check_layout 評分取優
        # (同分取總列數少者,偏好緊湊)。
        best = None
        snaps = {p_: [tuple(f) for f in p_.flows] for p_ in x.pools}

        def _reflow_pools(mode):
            """泳道最小寬度(鐵則⑦)使 pool 寬度在佈局後才定案:重算各
            pool 原點 → 全量重放置 → 自動池重選路(wps_override 為絕對
            座標,平移後必須重產;手動池尊重使用者路線,僅重放置)。"""
            ox2 = POOL_X
            for proc in x.pools:
                proc.ox = ox2
                ox2 += proc.pool_width() + POOL_GAP
            x._bb_geo = []
            for bxid, bname in x.blackboxes:
                x._bb_geo.append((bxid, bname, ox2, 200))
                ox2 += 200 + POOL_GAP
            for proc in x.pools:
                for k in proc.nodes:
                    proc._place(k)
                for k in proc.nodes:
                    if proc.nodes[k].get("attach"):
                        proc._place(k)
                if proc in need_auto:
                    proc.flows = [tuple(f) for f in snaps[proc]]
                    if isinstance(mode, tuple):   # 加寬版忽略單欄提示(同 auto_layout)
                        proc.flows = [(fid, s_, t_, lab, "auto")
                                      for fid, s_, t_, lab, _rt in proc.flows]
                    _auto_routes(proc)
                _stash_bnd_tracks(proc)

        def _try_all(mode):
            for proc in x.pools:
                if proc in need_auto:
                    proc.flows = [tuple(f) for f in snaps[proc]]
                    for n in proc.nodes.values():
                        n["row"] = None
                        n["sub"] = 0
                    proc.lane_subs = [1] * len(proc.lanes)
                    auto_layout(proc, compact=mode)
                else:
                    _ensure(proc)
            _reflow_pools(mode)
            score, _d = layout_score(_check_placed(x))
            nrows = max((n["row"] for p_ in x.pools
                         for n in p_.nodes.values()), default=0) + 1
            penalized = score + max(0, nrows - ROW_CAP) * ROW_PENALTY
            key = (penalized, nrows, {True: 1, False: 2}.get(mode, 0))
            state = {p_: ({k: (n["row"], n["sub"]) for k, n in p_.nodes.items()},
                          [tuple(f) for f in p_.flows],
                          list(p_.lane_subs), dict(p_.lane_pad),
                          dict(getattr(p_, "wps_override", {})), p_.ox)
                     for p_ in x.pools}
            return key, state

        for mode in (True, False):
            cand = _try_all(mode)
            if best is None or cand[0] < best[0]:
                best = cand
        k2 = 2
        while best[0][1] > ROW_CAP and k2 <= MAX_SUBS:
            for kind in ("chain", "wide",    # 對齊單 Proc 加試(20260710.08;
                         "chainL", "wideL"):  # *L=迴圈親和分欄 20260710.13)
                cand = _try_all((kind, k2))
                if cand[0] < best[0]:
                    best = cand
            k2 += 1
        for proc, (rows, flows, lane_subs, lane_pad, wov, pox) in \
                best[1].items():
            proc.flows = flows
            proc.lane_subs = lane_subs
            proc.lane_pad = lane_pad
            proc.wps_override = wov
            proc._flow_port_cache = None
            proc.ox = pox
            for k, (r, sb) in rows.items():
                proc.nodes[k]["row"] = r
                proc.nodes[k]["sub"] = sb
            for k in proc.nodes:
                proc._place(k)
            for k in proc.nodes:
                if proc.nodes[k].get("attach"):
                    proc._place(k)
            _stash_bnd_tracks(proc)
        ox = max((pr.ox + pr.pool_width() + POOL_GAP for pr in x.pools),
                 default=POOL_X)
        x._bb_geo = []
        for bxid, bname in x.blackboxes:
            x._bb_geo.append((bxid, bname, ox, 200))
            ox += 200 + POOL_GAP
        return
    p = x
    if not p.nodes:
        raise ValueError("流程沒有任何節點;請先用 add() 加入節點再輸出。")
    if p.ox is None:
        p.ox = POOL_X
    if any(n["row"] is None for n in p.nodes.values()
           if n["t"] not in NONGRID_TS):
        auto_layout(p)                 # 流程節點缺 row → 整體自動佈局
    else:
        # 手動佈局:工件省略 row 不觸發整體自動(20260710.09),
        # 僅工件走自動放置(同泳道子欄標準,含泳道加寬);明給 row 者尊重。
        if any(n["row"] is None for n in p.nodes.values()):
            depth = {k: n["row"] for k, n in p.nodes.items()
                     if n["row"] is not None}
            sub = {k: n.get("sub", 0) or 0 for k, n in p.nodes.items()
                   if n["row"] is not None}
            _artifact_widen(p)
            _lane_min_width(p)               # 鐵則⑦:手動佈局亦適用
            _place_artifacts(p, depth, sub)
        else:
            _lane_min_width(p)
        for nid in p.nodes:
            p._place(nid)
        _stash_bnd_tracks(p)   # 手動佈局指定 sideLeft 亦需讓位軌佔用資訊
        _assign_backloop_tracks(p)   # 手動佈局的 backLoop 亦需軌位


# ---------------------------------------------------------------------------
# BPMN XML 輸出
# ---------------------------------------------------------------------------
def _fid(proc, fid):
    return f"{proc.xid}__{fid}"


def _process_xml(proc, pidx):
    inc = {nid: [] for nid in proc.nodes}
    outg = {nid: [] for nid in proc.nodes}
    for fid, s, tg, lab, rt in proc.flows:
        outg[s].append(_fid(proc, fid)); inc[tg].append(_fid(proc, fid))
    by_lane = {i: [] for i in range(len(proc.lanes))}
    for n in proc.nodes.values():
        if n["t"] in NONGRID_TS:
            continue               # 工件/註解非 FlowNode,不入泳道 flowNodeRef
        by_lane[n["lane"]].append(n["id"])
    laneset = []
    for i, lname in enumerate(proc.lanes):
        refs = "".join(f"\n        <bpmn:flowNodeRef>{x}</bpmn:flowNodeRef>"
                       for x in by_lane[i])
        laneset.append(
            f'      <bpmn:lane id="lane_{pidx}_{i}" name="{escape(lname)}">'
            f'{refs}\n      </bpmn:lane>')
    el = []
    TASK_TAG = {"user": "userTask", "system": "serviceTask",
                "subprocess": "subProcess", "generic": "task",
                "send": "sendTask", "receive": "receiveTask",
                "script": "scriptTask", "call": "callActivity"}
    for n in proc.nodes.values():
        nid, t, nm = n["id"], n["t"], escape(n["name"])
        io = "".join(f"\n      <bpmn:incoming>{f}</bpmn:incoming>" for f in inc[nid])
        io += "".join(f"\n      <bpmn:outgoing>{f}</bpmn:outgoing>" for f in outg[nid])
        evdef = ""
        if t == "gateway":
            tag = GW_TAG.get(n.get("kind", "exclusive"), "exclusiveGateway")
        elif t in ("input", "output"):
            el.append(f'    <bpmn:dataObject id="do_{nid}"/>')
            el.append(f'    <bpmn:dataObjectReference id="{nid}" name="{nm}" '
                      f'dataObjectRef="do_{nid}"/>')
            continue
        elif t == "database":
            el.append(f'    <bpmn:dataStoreReference id="{nid}" name="{nm}"/>')
            continue
        elif t == "terminate":
            tag = "endEvent"
            evdef = f'\n      <bpmn:terminateEventDefinition id="tdef_{nid}"/>'
        elif t == "note":
            el.append(f'    <bpmn:textAnnotation id="{nid}">\n'
                      f'      <bpmn:text>{nm}</bpmn:text>\n'
                      f'    </bpmn:textAnnotation>')
            continue
        elif t in EVDEF:
            evdef = f'\n      <bpmn:{EVDEF[t]} id="evd_{nid}"/>'
            if n.get("attach"):
                # 邊界事件:貼附宿主;interrupting=False → cancelActivity="false"
                cancel = "" if n.get("interrupting", True) \
                    else ' cancelActivity="false"'
                el.append(f'    <bpmn:boundaryEvent id="{nid}" name="{nm}" '
                          f'attachedToRef="{n["attach"]}"{cancel}>{io}{evdef}\n'
                          f'    </bpmn:boundaryEvent>')
                continue
            if not inc[nid]:
                tag = "startEvent"
            elif not outg[nid]:
                tag = "endEvent"
            elif n.get("kind") == "throw":
                tag = "intermediateThrowEvent"
            else:
                tag = "intermediateCatchEvent"
        elif t == "task":
            tag = TASK_TAG.get(n.get("kind") or "generic", "task")
            if n.get("loop"):
                evdef = f'\n      <bpmn:standardLoopCharacteristics id="loop_{nid}"/>'
        else:
            tag = {"start": "startEvent", "end": "endEvent"}.get(t, "task")
        el.append(f'    <bpmn:{tag} id="{nid}" name="{nm}">{io}{evdef}\n    </bpmn:{tag}>')
    fl = []
    for fid, s, tg, lab, rt in proc.flows:
        fl.append(f'    <bpmn:sequenceFlow id="{_fid(proc, fid)}"{_attr("name", lab)} '
                  f'sourceRef="{s}" targetRef="{tg}"/>')
    for aid, s, tg, lab in proc.assocs:
        fl.append(f'    <bpmn:association id="{_fid(proc, aid)}" '
                  f'associationDirection="None" sourceRef="{s}" targetRef="{tg}"/>')
    groups = "".join(
        f'    <bpmn:group id="grp_{pidx}_{k}" categoryValueRef="catval_{pidx}_{k}"/>\n'
        for k in range(len(proc.band_spans())))
    groups += "".join(
        f'    <bpmn:group id="cgrp_{cid}" categoryValueRef="ccat_{cid}"/>\n'
        for cid, _n, _m, _k in proc.containers)
    return (f'  <bpmn:process id="{proc.xid}" name="{escape(proc.name)}" isExecutable="false">\n'
            f'    <bpmn:laneSet id="laneset_{pidx}">\n'
            f'{chr(10).join(laneset)}\n'
            f'    </bpmn:laneSet>\n'
            f'{groups}'
            f'{chr(10).join(el)}\n'
            f'{chr(10).join(fl)}\n'
            f'  </bpmn:process>')


POOL_TITLE_BAND = 36               # bpmn.io 垂直 pool 的參與者名稱帶高度(僅 DI 用):
                                   # pool DI 上緣比泳道高出此值,名稱有自己的橫帶,
                                   # 不會壓到中間泳道的標頭文字


def _pool_di_xml(proc, pidx, pool_h):
    di = []
    di.append(
        f'      <bpmndi:BPMNShape id="di_pool_{pidx}" bpmnElement="part_{pidx}" isHorizontal="false">\n'
        f'        <dc:Bounds x="{proc.ox}" y="{POOL_Y - POOL_TITLE_BAND}" '
        f'width="{proc.pool_width()}" height="{pool_h + POOL_TITLE_BAND}"/>\n'
        f'      </bpmndi:BPMNShape>')
    for i in range(len(proc.lanes)):
        # bpmn.io 的參與者名稱在頂帶,SVG 的左側直條(POOL_HEADER_W)在此無用途,
        # 若照搬會在 pool 左緣留一條 30px 空縫;讓第一泳道向左延伸吃掉它。
        lx = proc._lane_x(i) - (POOL_HEADER_W if i == 0 else 0)
        lw = proc.lane_width(i) + (POOL_HEADER_W if i == 0 else 0)
        di.append(
            f'      <bpmndi:BPMNShape id="di_lane_{pidx}_{i}" bpmnElement="lane_{pidx}_{i}" isHorizontal="false">\n'
            f'        <dc:Bounds x="{lx}" y="{POOL_Y}" width="{lw}" height="{pool_h}"/>\n'
            f'      </bpmndi:BPMNShape>')
    for n in proc.nodes.values():
        # 事件/工件名稱一律置圖形下方(依組織繪製規範圖例);與 SVG 一致。
        elabel = ""
        if n["t"] in EVENT_TS + ARTIFACT_TS and n["name"]:
            lines = wrap(n["name"], 6)
            lw = max(len(ln) for ln in lines) * 14
            lh = len(lines) * 18
            elabel = (f'\n        <bpmndi:BPMNLabel>\n'
                      f'          <dc:Bounds x="{int(n["x"] + n["w"]/2 - lw/2)}" '
                      f'y="{int(n["y"] + n["h"] + 4)}" width="{lw}" height="{lh}"/>\n'
                      f'        </bpmndi:BPMNLabel>')
        expand = ' isExpanded="false"' \
            if n["t"] == "task" and n.get("kind") == "subprocess" else ""
        di.append(
            f'      <bpmndi:BPMNShape id="di_{n["id"]}" bpmnElement="{n["id"]}"{expand}>\n'
            f'        <dc:Bounds x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}"/>{elabel}\n'
            f'      </bpmndi:BPMNShape>')
    for fid, s, tg, lab, rt in proc.flows:
        wps = getattr(proc, "wps_override", {}).get(fid) \
            or waypoints(proc.nodes[s], proc.nodes[tg], rt)
        wp = "".join(f'\n        <di:waypoint x="{int(round(x))}" y="{int(round(y))}"/>'
                     for x, y in wps)
        label = ""
        if lab:
            lx, ly = label_pos(wps)
            label = (f'\n        <bpmndi:BPMNLabel>\n'
                     f'          <dc:Bounds x="{int(lx)-int(len(lab)*7)}" y="{int(ly)-8}" '
                     f'width="{len(lab)*14}" height="16"/>\n'
                     f'        </bpmndi:BPMNLabel>')
        di.append(
            f'      <bpmndi:BPMNEdge id="di_{_fid(proc, fid)}" bpmnElement="{_fid(proc, fid)}">{wp}{label}\n'
            f'      </bpmndi:BPMNEdge>')
    for aid, src, tg, lab in proc.assocs:
        if src not in proc.nodes or tg not in proc.nodes:
            continue
        wps = assoc_waypoints(proc, src, tg)
        wp = "".join(f'\n        <di:waypoint x="{int(round(px))}" y="{int(round(py))}"/>'
                     for px, py in wps)
        di.append(
            f'      <bpmndi:BPMNEdge id="di_{_fid(proc, aid)}" bpmnElement="{_fid(proc, aid)}">{wp}\n'
            f'      </bpmndi:BPMNEdge>')
    return "\n".join(di)


def _bb_nodes(x, pool_h):
    """黑箱 pool → pseudo node box(供訊息流 waypoints/端點)。"""
    out = {}
    for bxid, bname, box, bw in getattr(x, "_bb_geo", []):
        out[bxid] = dict(id=bxid, t="pool", name=bname, x=box, y=POOL_Y,
                         w=bw, h=pool_h, lane=-1, row=0, sub=0)
    return out


def _pool_height(pools):
    """pool 高度 = 泳道標頭 + (最大列索引+1) × 列高;三種輸出共用單一算法。"""
    _maxrow = max((n["row"] for p in pools for n in p.nodes.values()), default=0)
    return LANE_LABEL_H + (_maxrow + 1) * ROW_H


def _pools_bpmn(pools, mflows, defs_id, collab_id, collab_name="", bb=()):
    pool_h = _pool_height(pools)
    allnodes = {}
    for proc in pools:
        allnodes.update(proc.nodes)
    allnodes.update(_bb_nodes(type('B', (), {'_bb_geo': bb})(), pool_h))

    participants = "".join(
        f'\n    <bpmn:participant id="part_{i}" name="{escape(proc.name)}" '
        f'processRef="{proc.xid}"/>' for i, proc in enumerate(pools))
    participants += "".join(
        f'\n    <bpmn:participant id="{bxid}" name="{escape(bname)}"/>'
        for bxid, bname, _o, _w in bb)     # 黑箱 pool:無 processRef
    mf_xml = "".join(
        f'\n    <bpmn:messageFlow id="{mid}"{_attr("name", lab)} '
        f'sourceRef="{s}" targetRef="{tg}"/>' for mid, s, tg, lab in mflows)
    procs = "\n".join(_process_xml(proc, i) for i, proc in enumerate(pools))
    pool_di = "\n".join(_pool_di_xml(proc, i, pool_h) for i, proc in enumerate(pools))
    pool_di += "".join(
        f'\n      <bpmndi:BPMNShape id="di_bb_{bxid}" bpmnElement="{bxid}" '
        f'isHorizontal="false">\n'
        f'        <dc:Bounds x="{box}" y="{POOL_Y - POOL_TITLE_BAND}" '
        f'width="{bw}" height="{pool_h + POOL_TITLE_BAND}"/>\n'
        f'      </bpmndi:BPMNShape>'
        for bxid, _bn, box, bw in bb)
    mf_di = []
    for mid, s, tg, lab in mflows:
        if s in allnodes and tg in allnodes:
            wps = mf_waypoints(allnodes[s], allnodes[tg])
            wp = "".join(f'\n        <di:waypoint x="{int(round(x))}" y="{int(round(y))}"/>'
                         for x, y in wps)
            mf_di.append(
                f'      <bpmndi:BPMNEdge id="di_{mid}" bpmnElement="{mid}">{wp}\n'
                f'      </bpmndi:BPMNEdge>')
    mf_di = "\n".join(mf_di)

    # 橫向系統分區 → BPMN 2.0 標準 category + group + DI(bpmn.io 以虛線框呈現)
    cats, grp_di = "", []
    for i, proc in enumerate(pools):
        gx = proc.ox + POOL_HEADER_W
        gw = proc.pool_width() - POOL_HEADER_W
        for k, (name, y0, y1, _f, _s) in enumerate(proc.band_spans()):
            cats += (f'  <bpmn:category id="cat_{i}_{k}">\n'
                     f'    <bpmn:categoryValue id="catval_{i}_{k}" value="{escape(name)}"/>\n'
                     f'  </bpmn:category>\n')
            grp_di.append(
                f'      <bpmndi:BPMNShape id="di_grp_{i}_{k}" bpmnElement="grp_{i}_{k}">\n'
                f'        <dc:Bounds x="{gx}" y="{y0}" width="{gw}" height="{y1-y0}"/>\n'
                f'      </bpmndi:BPMNShape>')
        for cid, cname, _m, _kd in proc.containers:
            cats += (f'  <bpmn:category id="ccatg_{cid}">\n'
                     f'    <bpmn:categoryValue id="ccat_{cid}" value="{escape(cname)}"/>\n'
                     f'  </bpmn:category>\n')
        for cid, cname, cx0, cy0, cx1, cy1, _kd in proc.container_spans():
            grp_di.append(
                f'      <bpmndi:BPMNShape id="di_cgrp_{cid}" bpmnElement="cgrp_{cid}">\n'
                f'        <dc:Bounds x="{int(cx0)}" y="{int(cy0)}" '
                f'width="{int(cx1-cx0)}" height="{int(cy1-cy0)}"/>\n'
                f'      </bpmndi:BPMNShape>')
    grp_di = "\n".join(grp_di)

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="def_{defs_id}" targetNamespace="http://bpmn.flow/builder">
{cats}  <bpmn:collaboration id="{collab_id}"{_attr("name", collab_name)}>{participants}{mf_xml}
  </bpmn:collaboration>
{procs}
  <bpmndi:BPMNDiagram id="diagram_1">
    <bpmndi:BPMNPlane id="plane_1" bpmnElement="{collab_id}">
{pool_di}
{grp_di}
{mf_di}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
'''


def build_bpmn(x):
    _ensure(x)
    pools, mflows = _pools_mflows(x)
    cid = x.xid if isinstance(x, Collab) else "collab_" + x.xid
    defs_id = x.xid if isinstance(x, Collab) else x.xid
    return _pools_bpmn(pools, mflows, defs_id, cid, x.name,
                       bb=getattr(x, "_bb_geo", ()))


# ---------------------------------------------------------------------------
# draw.io 原生格式輸出(mxGraph XML)
# ---------------------------------------------------------------------------
# 背景:draw.io 不支援 BPMN 2.0 XML(其原生格式是 mxGraphModel),把 .bpmn 丟進
# draw.io 必然跑版。本函式直接把已計算好的座標與 waypoint 翻譯成 mxCell,
# 產出 draw.io 可原生開啟、可編輯、版面 100% 一致的 .drawio 檔。
# 形狀 style 取自 draw.io 官方形狀索引(mxgraph.bpmn 系列),非手寫猜測。
# 事件/工件名稱一律置圖形下方(組織規範圖例);顏色統一讀 STYLE
_DIO_EVENT = ("shape=mxgraph.bpmn.event;html=1;verticalLabelPosition=bottom;"
              "labelBackgroundColor=#ffffff;verticalAlign=top;align=center;"
              "fontSize=11;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;")
# symbol 依事件型別;outline 依位置動態決定(start-like=standard 單圈、
# 中間=throwing 雙圈、end-like=end 粗圈、邊界=boundInt/boundNonint 虛線)
_DIO_EVENT_SYM = {"start": "general", "end": "general",
                  "terminate": "general",   # 規範:黃圈無記號
                  "message": "message", "timer": "timer",
                  "error": "error", "escalation": "escalation",
                  "conditional": "conditional", "compensation": "compensation"}
_DIO_GW = ("shape=mxgraph.bpmn.gateway2;html=1;verticalLabelPosition=bottom;"
           "labelBackgroundColor=#ffffff;verticalAlign=top;align=center;"
           "perimeter=rhombusPerimeter;outlineConnect=0;")
_DIO_GW_KIND = {"exclusive": "outline=none;symbol=none;",          # 判斷分支:素菱形
                "event": "outline=throwing;symbol=multiple;",       # 事件型:雙圈五邊形
                "parallel": "outline=none;symbol=none;gwType=parallel;",
                "inclusive": "outline=end;symbol=general;"}
# 活動四型:官方 task2 形狀 + taskMarker;顏色讀 STYLE(container=0 維持平面模型)
_DIO_TASK2 = ("shape=mxgraph.bpmn.task2;whiteSpace=wrap;rectStyle=rounded;size=10;"
              "html=1;container=0;expand=0;collapsible=0;fontColor=#1f2d3d;")
_DIO_TASK_MARK = {"user": "taskMarker=user;", "system": "taskMarker=service;",
                  "subprocess": "taskMarker=abstract;isLoopSub=1;",
                  "send": "taskMarker=send;", "receive": "taskMarker=receive;",
                  "script": "taskMarker=script;",
                  "call": "taskMarker=abstract;",
                  "generic": "taskMarker=abstract;"}
# 工件:文件形(data2,input/output 箭頭)與資料庫圓柱;名稱置下方
_DIO_DATA = ("shape=mxgraph.bpmn.data2;html=1;labelPosition=center;"
             "verticalLabelPosition=bottom;align=center;verticalAlign=top;size=15;")
_DIO_DATASTORE = ("shape=datastore;whiteSpace=wrap;html=1;"
                  "verticalLabelPosition=bottom;verticalAlign=top;align=center;")
_DIO_ASSOC = ("edgeStyle=orthogonalEdgeStyle;html=1;dashed=1;dashPattern=1 4;"
              "endArrow=none;startArrow=none;strokeColor=#8a99a8;fontSize=11;"
              "jumpStyle=arc;jumpSize=10;"   # 鐵則⑤:交叉處原生跨線橋
              "labelBackgroundColor=#ffffff;")
_DIO_EDGE = ("edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;"
             "jettySize=auto;html=1;strokeColor=#3a4a59;"
             "endArrow=block;endFill=1;startArrow=none;"
             "jumpStyle=arc;jumpSize=10;"   # 鐵則⑤:交叉處原生跨線橋
             "labelBackgroundColor=#ffffff;fontSize=11;")
_DIO_MSG = ("edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;dashed=1;"
            "startArrow=oval;startFill=0;startSize=6;endArrow=open;endFill=0;"
            "strokeColor=#7a4a12;fontColor=#7a4a12;"
            "labelBackgroundColor=#ffffff;fontSize=11;")


def _attr_v(value):
    """draw.io 屬性值跳脫:引號 + 換行(&#xa; 才會在 draw.io 顯示為斷行)。"""
    return escape(str(value), {'"': "&quot;", "\n": "&#xa;"})


def _dio_pin(style, wp, box, end):
    """依 waypoint 端點位置在 style 加 exit/entry 針腳,固定連接點防止 draw.io 重排。"""
    x, y, w, h = box
    fx = round(min(max((wp[0] - x) / w, 0), 1), 3)
    fy = round(min(max((wp[1] - y) / h, 0), 1), 3)
    k = "exit" if end == "source" else "entry"
    return style + "%sX=%s;%sY=%s;%sDx=0;%sDy=0;" % (k, fx, k, fy, k, k)


def _drawio_page_xml(x, page_id):
    """單一 Proc / Collab → <diagram> 頁面 XML(供單頁/多頁組檔共用)。"""
    _ensure(x)
    pools, mflows = _pools_mflows(x)
    pool_h = _pool_height(pools)
    allnodes = {}
    for p in pools:
        allnodes.update(p.nodes)
    allnodes.update(_bb_nodes(x, pool_h))
    cells = []

    def cell(cid, value, style, gx, gy, gw, gh):
        cells.append(
            '        <mxCell id="%s" value="%s" style="%s" vertex="1" parent="1">\n'
            '          <mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/>\n'
            '        </mxCell>'
            % (escape(cid), _attr_v(value), escape(style),
               int(gx), int(gy), int(gw), int(gh)))

    # 底層 → 上層(XML 順序即 z-order):分區底色 → pool/lane 框與標題 → 連線 → 節點
    for i, proc in enumerate(pools):
        gx = proc.ox + POOL_HEADER_W
        gw = proc.pool_width() - POOL_HEADER_W
        for k, (bname, y0, y1, bfill, bstroke) in enumerate(proc.band_spans()):
            cell("dio_band_%d_%d" % (i, k), bname,
                 "rounded=0;whiteSpace=wrap;html=1;fillColor=%s;strokeColor=%s;"
                 "dashed=1;verticalAlign=top;align=right;fontStyle=2;"
                 "fontColor=%s;spacingRight=6;" % (bfill, bstroke, bstroke),
                 gx, y0, gw, y1 - y0)
    for proc in pools:
        for cid, cname, cx0, cy0, cx1, cy1, ckind in proc.container_spans():
            dsh = "dashed=1;" if ckind == "event" else ""
            cell("dio_ctn_%s" % cid, cname,
                 "rounded=1;arcSize=6;html=1;fillColor=none;"
                 "strokeColor=#5a6b7b;" + dsh +
                 "verticalAlign=top;align=left;spacingLeft=8;"
                 "fontStyle=2;fontSize=11;",
                 int(cx0), int(cy0), int(cx1 - cx0), int(cy1 - cy0))
    for bxid, bname, box, bw in getattr(x, "_bb_geo", []):
        cell(bxid, bname,
             "rounded=0;html=1;fillColor=none;strokeColor=#3a4a59;strokeWidth=2;"
             "verticalAlign=middle;align=center;fontStyle=1;fontSize=13;",
             box, POOL_Y, bw, pool_h)
    left0 = min(p_.ox for p_ in pools)
    cell("dio_title", "%s %s" % (x.name, x.version),
         "text;html=1;align=left;verticalAlign=middle;fontStyle=1;"
         "fontSize=19;fontColor=#1f2d3d;",
         left0, POOL_Y - 48, max(360, len(str(x.name)) * 20 + 90), 28)
    for i, proc in enumerate(pools):
        pw = proc.pool_width()
        cell("dio_pool_%d" % i, "",
             "rounded=0;html=1;fillColor=none;strokeColor=#3a4a59;strokeWidth=2;",
             proc.ox, POOL_Y, pw, pool_h)
        if not proc.bands:   # 有 bands 時左直條改作分區標頭,pool 名僅在圖頂(同 SVG)
            cell("dio_pooltitle_%d" % i, proc.name,
                 "text;html=1;horizontal=0;align=center;verticalAlign=middle;"
                 "fontStyle=1;fontSize=13;fontColor=#1f2d3d;",
                 proc.ox, POOL_Y, POOL_HEADER_W, pool_h)
        # 泳道頭底線:標頭列與內容區的分隔線
        cell("dio_hdrline_%d" % i, "",
             "rounded=0;html=1;fillColor=#8a99a8;strokeColor=none;",
             proc.ox + POOL_HEADER_W, POOL_Y + LANE_LABEL_H,
             pw - POOL_HEADER_W, 1)
        for li, lname in enumerate(proc.lanes):
            lx = proc._lane_x(li)
            cell("dio_lane_%d_%d" % (i, li), "",
                 "rounded=0;html=1;fillColor=none;strokeColor=#8a99a8;",
                 lx, POOL_Y, proc.lane_width(li), pool_h)
            cell("dio_lanehdr_%d_%d" % (i, li), lname,
                 "text;html=1;align=center;verticalAlign=middle;fontStyle=1;"
                 "fontSize=12;fontColor=#3a4a59;",
                 lx, POOL_Y, proc.lane_width(li), LANE_LABEL_H)

    def emit_edge(eid, s, tg, lab, wps, base_style):
        ns, nt = allnodes[s], allnodes[tg]
        style = _dio_pin(base_style, wps[0], (ns["x"], ns["y"], ns["w"], ns["h"]),
                         "source")
        style = _dio_pin(style, wps[-1], (nt["x"], nt["y"], nt["w"], nt["h"]),
                         "target")
        pts = "".join('<mxPoint x="%d" y="%d"/>' % (int(round(px)), int(round(py)))
                      for px, py in wps[1:-1])
        if pts:
            geom = ('<mxGeometry relative="1" as="geometry">'
                    '<Array as="points">%s</Array></mxGeometry>' % pts)
        else:
            geom = '<mxGeometry relative="1" as="geometry"/>'
        cells.append(
            '        <mxCell id="%s" value="%s" style="%s" edge="1" parent="1" '
            'source="%s" target="%s">\n          %s\n        </mxCell>'
            % (escape(eid), _attr_v(lab), escape(style),
               escape(s), escape(tg), geom))

    # 節點一律先於連線輸出:draw.io 解碼邊的 source/target 為前向參照時,
    # 部分版本會在惰性解碼路徑報「insertEdge is not a function」而無法開檔;
    # draw.io 自存檔也是節點在前、連線在後(連線畫在節點之上為其標準外觀)。
    indeg, outdeg = {}, {}
    for p in pools:
        for _f, a, b, _l, _r in p.flows:
            outdeg[a] = outdeg.get(a, 0) + 1
            indeg[b] = indeg.get(b, 0) + 1
    for proc in pools:
        for n in proc.nodes.values():
            t = n["t"]
            if t in EVENT_TS:
                st = STYLE[t]
                if n.get("attach"):
                    ol = "boundInt" if n.get("interrupting", True) \
                        else "boundNonint"
                elif t == "end":
                    ol = "end"
                elif t in ("start", "terminate"):
                    ol = "standard"
                elif not indeg.get(n["id"]):
                    ol = "standard"
                elif not outdeg.get(n["id"]):
                    ol = "end"
                else:
                    ol = "throwing"          # 流程中間事件:雙圈
                style = (_DIO_EVENT
                         + "outline=%s;symbol=%s;" % (ol, _DIO_EVENT_SYM[t])
                         + "fillColor=%s;strokeColor=%s;strokeWidth=%s;"
                         % (st["fill"], st["stroke"], st.get("sw", 1.8)))
            elif t == "gateway":
                gst = STYLE["gateway"]
                style = (_DIO_GW
                         + _DIO_GW_KIND.get(n.get("kind", "exclusive"),
                                            _DIO_GW_KIND["exclusive"])
                         + "fillColor=%s;strokeColor=%s;"
                         % (gst["fill"], gst["stroke"]))
            elif t in ("input", "output"):
                ast = STYLE["artifact"]
                style = (_DIO_DATA + "bpmnTransferType=%s;" % t
                         + "fillColor=%s;strokeColor=%s;"
                         % (ast["fill"], ast["stroke"]))
            elif t == "note":
                ast = STYLE["artifact"]
                # 標籤收在幾何框內(勿用 labelPosition=right:框外標籤會
                # 溢出泳道且逃過幾何檢核,20260716.02 使用者實案)
                style = ("shape=mxgraph.flowchart.annotation_2;html=1;align=left;"
                         "verticalAlign=middle;spacingLeft=16;spacingRight=4;"
                         "whiteSpace=wrap;fontSize=11;"
                         + "strokeColor=%s;fillColor=none;" % ast["stroke"])
            elif t == "database":
                ast = STYLE["artifact"]
                style = (_DIO_DATASTORE + "fillColor=%s;strokeColor=%s;"
                         % (ast["fill"], ast["stroke"]))
            else:
                kind = n.get("kind") or "generic"
                tst = STYLE.get("task_" + kind, STYLE["task_generic"])
                extra = ""
                if kind == "call":
                    extra += "bpmnShapeType=call;strokeWidth=2.5;"
                if n.get("loop"):
                    extra += "isLoopStandard=1;"
                style = (_DIO_TASK2 + _DIO_TASK_MARK.get(kind, "") + extra
                         + "fillColor=%s;strokeColor=%s;"
                         % (tst["fill"], tst["stroke"]))
            cell(n["id"], n["name"], style, n["x"], n["y"], n["w"], n["h"])

    for proc in pools:
        for fid, s, tg, lab, rt in proc.flows:
            emit_edge("dio_%s__%s" % (proc.xid, fid), s, tg, lab,
                      getattr(proc, "wps_override", {}).get(fid)
                      or waypoints(proc.nodes[s], proc.nodes[tg], rt),
                      _DIO_EDGE)
    for mid, s, tg, lab in mflows:
        if s in allnodes and tg in allnodes:
            emit_edge("dio_%s" % mid, s, tg, lab,
                      mf_waypoints(allnodes[s], allnodes[tg]), _DIO_MSG)
    for proc in pools:
        for aid, s, tg, lab in proc.assocs:
            if s in proc.nodes and tg in proc.nodes:
                emit_edge("dio_%s__%s" % (proc.xid, aid), s, tg, lab,
                          assoc_waypoints(proc, s, tg),
                          _DIO_ASSOC)

    return ('  <diagram id="%s" name="%s">\n'
            '    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" '
            'tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" '
            'math="0" shadow="0">\n      <root>\n'
            '        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n'
            '%s\n      </root>\n    </mxGraphModel>\n  </diagram>'
            % (page_id, _attr_v(x.name), "\n".join(cells)))


def build_drawio(x):
    """Proc / Collab → draw.io 原生 mxGraph XML(.drawio,單頁)。
    座標與 .bpmn/SVG 完全一致。"""
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<mxfile host="bpmn-flow-builder">\n'
            + _drawio_page_xml(x, "d1")
            + '\n</mxfile>\n')


def build_drawio_multi(diagrams):
    """多個 Proc / Collab → 單一多頁 .drawio(每張圖一個 <diagram> 頁籤)。
    draw.io 開啟後底部有頁籤可切換;各頁 id 依序 d1, d2, ...。"""
    if not diagrams:
        raise ValueError("沒有任何流程圖;請至少提供一個 Proc / Collab。")
    pages = [_drawio_page_xml(x, "d%d" % (i + 1))
             for i, x in enumerate(diagrams)]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<mxfile host="bpmn-flow-builder">\n'
            + "\n".join(pages)
            + '\n</mxfile>\n')


# ---------------------------------------------------------------------------
# SVG 輸出
# ---------------------------------------------------------------------------
def wrap(text, n):
    out, line = [], ""
    for ch in text:
        line += ch
        if len(line) >= n:
            out.append(line); line = ""
    if line:
        out.append(line)
    return out


def _svg_pool(proc, pool_h):
    s = []
    pw = proc.pool_width()
    spans = proc.band_spans()
    if spans:
        # 泳道區底色帶與虛線分隔(墊在泳道框線之下)
        lx0 = proc.ox + POOL_HEADER_W
        lw = pw - POOL_HEADER_W
        for name, y0, y1, fill, stroke in spans:
            s.append(f'<rect x="{lx0}" y="{y0}" width="{lw}" height="{y1-y0}" '
                     f'fill="{fill}" fill-opacity="0.55" stroke="none"/>')
            s.append(f'<line x1="{lx0}" y1="{y1}" x2="{lx0+lw}" y2="{y1}" '
                     f'stroke="{stroke}" stroke-width="1.2" stroke-dasharray="7 5"/>')
    s.append(f'<rect x="{proc.ox}" y="{POOL_Y}" width="{pw}" height="{pool_h}" '
             f'fill="none" stroke="#9aa7b4" stroke-width="1.5"/>')
    if spans:
        # 有分區帶時,左側直欄改為分區標頭欄;pool 名稱僅保留於圖頂標題,避免重複
        s.append(f'<rect x="{proc.ox}" y="{POOL_Y}" width="{POOL_HEADER_W}" '
                 f'height="{LANE_LABEL_H}" fill="#eef2f6" stroke="#cdd6df"/>')
        for name, y0, y1, fill, stroke in spans:
            s.append(f'<rect x="{proc.ox}" y="{y0}" width="{POOL_HEADER_W}" '
                     f'height="{y1-y0}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
            cy = (y0 + y1) / 2
            tx = proc.ox + POOL_HEADER_W / 2 + 4
            s.append(f'<text x="{tx}" y="{cy}" font-size="12.5" font-weight="bold" '
                     f'fill="{stroke}" text-anchor="middle" '
                     f'transform="rotate(-90 {tx} {cy})">{escape(name)}</text>')
    else:
        s.append(f'<rect x="{proc.ox}" y="{POOL_Y}" width="{POOL_HEADER_W}" height="{pool_h}" '
                 f'fill="#e7edf3" stroke="#9aa7b4"/>')
        pcy = POOL_Y + pool_h / 2
        s.append(f'<text x="{proc.ox+18}" y="{pcy}" font-size="13" font-weight="bold" '
                 f'fill="#3a4a59" text-anchor="middle" '
                 f'transform="rotate(-90 {proc.ox+18} {pcy})">{escape(proc.name)}</text>')
    for i, lname in enumerate(proc.lanes):
        lx = proc._lane_x(i)
        s.append(f'<rect x="{lx}" y="{POOL_Y}" width="{proc.lane_width(i)}" height="{pool_h}" '
                 f'fill="none" stroke="#cdd6df"/>')
        s.append(f'<rect x="{lx}" y="{POOL_Y}" width="{proc.lane_width(i)}" height="{LANE_LABEL_H}" '
                 f'fill="#eef2f6" stroke="#cdd6df"/>')
        s.append(f'<text x="{lx+proc.lane_width(i)/2}" y="{POOL_Y+23}" font-size="13.5" '
                 f'font-weight="bold" fill="#3a4a59" text-anchor="middle">{escape(lname)}</text>')
    return s


def _hops_path(wps, segs, r=5):
    """折線 → SVG path 字串,與 segs(先畫定案的正交線段)嚴格交叉處
    畫半圓跨線橋(鐵則⑤呈現:後畫者跳線,橋拱朝上/朝右,人眼可辨
    兩線互不相交)。貼近端點/折點 r+3px 內不畫橋(空間不足)。"""
    d = [f"M{int(round(wps[0][0]))},{int(round(wps[0][1]))}"]
    for i in range(len(wps) - 1):
        (x1, y1), (x2, y2) = wps[i], wps[i + 1]
        horiz = abs(y1 - y2) < 1e-6
        cross = []
        for b1, b2 in segs:
            if _seg_cross((x1, y1), (x2, y2), b1, b2):
                cross.append(b1[0] if horiz else b1[1])
        if horiz:
            sgn = 1 if x2 >= x1 else -1
            cross.sort(reverse=(sgn < 0))
            sweep = 1 if sgn > 0 else 0
            for c in cross:
                if abs(c - x1) < r + 3 or abs(c - x2) < r + 3:
                    continue
                d.append(f"L{int(round(c - sgn * r))},{int(round(y1))}")
                d.append(f"A{r},{r} 0 0 {sweep} "
                         f"{int(round(c + sgn * r))},{int(round(y1))}")
        else:
            sgn = 1 if y2 >= y1 else -1
            cross.sort(reverse=(sgn < 0))
            sweep = 1 if sgn > 0 else 0
            for c in cross:
                if abs(c - y1) < r + 3 or abs(c - y2) < r + 3:
                    continue
                d.append(f"L{int(round(x1))},{int(round(c - sgn * r))}")
                d.append(f"A{r},{r} 0 0 {sweep} "
                         f"{int(round(x1))},{int(round(c + sgn * r))}")
        d.append(f"L{int(round(x2))},{int(round(y2))}")
    return " ".join(d)


def _svg_seqflows(proc, segs=None):
    """segs:同 pool 已畫線段登錄(跨線橋用);呼叫者傳入共用 list,
    本函式邊畫邊登錄,後畫的線跳過先畫的線。"""
    s = []
    if segs is None:
        segs = []
    for fid, src, tg, lab, rt in proc.flows:
        wps = getattr(proc, "wps_override", {}).get(fid) \
            or waypoints(proc.nodes[src], proc.nodes[tg], rt)
        d = _hops_path(wps, segs)
        segs.extend((wps[i], wps[i + 1]) for i in range(len(wps) - 1))
        s.append(f'<path d="{d}" fill="none" stroke="#5a6b7b" '
                 f'stroke-width="1.6" marker-end="url(#arr)"/>')
        if lab:
            lx, ly = label_pos(wps)
            bw = 12 + len(lab) * 14
            s.append(f'<rect x="{lx-bw/2}" y="{ly-11}" width="{bw}" height="21" '
                     f'fill="#fff" stroke="#cdd6df" rx="3"/>')
            s.append(f'<text x="{lx}" y="{ly+4}" font-size="12.5" fill="#b0451f" '
                     f'text-anchor="middle" font-weight="bold">{escape(lab)}</text>')
    return s


def _svg_event_icon(t, cx, cy, throw=False):
    """事件圓內圖示:message/timer/error/escalation/conditional/compensation;
    throw=True 時圖示以實心呈現(擲出事件,BPMN 慣例)。"""
    st = STYLE[t]["stroke"]
    fill = st if throw else "none"
    if t == "message":
        body = [f'<rect x="{cx-9}" y="{cy-6}" width="18" height="12" fill="{fill}" '
                f'stroke="{st}" stroke-width="1.4"/>']
        flap_stroke = "#ffffff" if throw else st
        body.append(f'<path d="M{cx-9},{cy-6} L{cx},{cy+1} L{cx+9},{cy-6}" fill="none" '
                    f'stroke="{flap_stroke}" stroke-width="1.4"/>')
        return body
    if t == "timer":
        return [f'<circle cx="{cx}" cy="{cy}" r="10" fill="none" stroke="{st}" stroke-width="1.4"/>',
                f'<path d="M{cx},{cy} L{cx},{cy-7} M{cx},{cy} L{cx+5},{cy+2}" '
                f'stroke="{st}" stroke-width="1.4" fill="none"/>']
    if t == "error":
        return [f'<path d="M{cx-7},{cy+8} L{cx-2},{cy-6} L{cx+2},{cy+2} L{cx+7},{cy-8}" '
                f'fill="{fill}" stroke="{st}" stroke-width="1.6" '
                f'stroke-linejoin="round"/>']
    if t == "escalation":
        return [f'<path d="M{cx},{cy-8} L{cx+6},{cy+7} L{cx},{cy+2} L{cx-6},{cy+7} Z" '
                f'fill="{fill}" stroke="{st}" stroke-width="1.4"/>']
    if t == "conditional":
        return [f'<rect x="{cx-7}" y="{cy-8}" width="14" height="16" fill="none" '
                f'stroke="{st}" stroke-width="1.3"/>'] + \
               [f'<path d="M{cx-4},{cy-4+i*4} L{cx+4},{cy-4+i*4}" '
                f'stroke="{st}" stroke-width="1.2"/>' for i in range(3)]
    if t == "compensation":
        return [f'<path d="M{cx+1},{cy-6} L{cx-7},{cy} L{cx+1},{cy+6} Z '
                f'M{cx+8},{cy-6} L{cx},{cy} L{cx+8},{cy+6} Z" '
                f'fill="{fill}" stroke="{st}" stroke-width="1.3"/>']
    return []


def _svg_task_icon(kind, x, y, w, h, stroke):
    """活動圖示:user=人形(左上)、system=齒輪(左上)、subprocess=[+](底部中央)。"""
    if kind == "user":
        ix, iy = x + 12, y + 12
        return [f'<circle cx="{ix}" cy="{iy-2}" r="3.2" fill="none" stroke="{stroke}" stroke-width="1.3"/>',
                f'<path d="M{ix-5},{iy+7} Q{ix},{iy+1} {ix+5},{iy+7}" fill="none" '
                f'stroke="{stroke}" stroke-width="1.3"/>']
    if kind == "system":
        ix, iy = x + 12, y + 11
        spokes = "".join(
            f'M{ix},{iy} l{6.5*_c},{6.5*_s} '
            for _c, _s in ((1, 0), (-1, 0), (0, 1), (0, -1),
                           (.707, .707), (-.707, .707), (.707, -.707), (-.707, -.707)))
        return [f'<circle cx="{ix}" cy="{iy}" r="4" fill="none" stroke="{stroke}" stroke-width="1.3"/>',
                f'<path d="{spokes}" stroke="{stroke}" stroke-width="1.3" fill="none"/>']
    if kind == "subprocess":
        bx, by = x + w / 2 - 7, y + h - 16
        return [f'<rect x="{bx}" y="{by}" width="14" height="14" fill="none" '
                f'stroke="{stroke}" stroke-width="1.3"/>',
                f'<path d="M{bx+7},{by+3} L{bx+7},{by+11} M{bx+3},{by+7} L{bx+11},{by+7}" '
                f'stroke="{stroke}" stroke-width="1.3"/>']
    if kind in ("send", "receive"):
        ix, iy = x + 10, y + 8
        fill = stroke if kind == "send" else "none"
        flap = "#ffffff" if kind == "send" else stroke
        return [f'<rect x="{ix}" y="{iy}" width="16" height="11" fill="{fill}" '
                f'stroke="{stroke}" stroke-width="1.2"/>',
                f'<path d="M{ix},{iy} L{ix+8},{iy+6} L{ix+16},{iy}" fill="none" '
                f'stroke="{flap}" stroke-width="1.2"/>']
    if kind == "script":
        ix, iy = x + 10, y + 8
        return [f'<path d="M{ix+3},{iy} h10 q-5,3 0,6 q5,3 0,6 h-10 '
                f'q5,-3 0,-6 q-5,-3 0,-6 Z" fill="none" '
                f'stroke="{stroke}" stroke-width="1.2"/>']
    return []


def _svg_loop_icon(x, y, w, h, stroke):
    """迴圈記號 ↻:底部中央開口圓弧+箭頭。"""
    cx, cy, r = x + w / 2, y + h - 11, 6
    return [f'<path d="M{cx-r},{cy} A{r},{r} 0 1 1 {cx-1},{cy+r}" fill="none" '
            f'stroke="{stroke}" stroke-width="1.4"/>',
            f'<path d="M{cx-1},{cy+r} l-4,-3 M{cx-1},{cy+r} l-1,-5" '
            f'stroke="{stroke}" stroke-width="1.4" fill="none"/>']


def _svg_below_label(name, cx, top_y, size=11.5, color="#2a3a49"):
    """名稱置於圖形下方(依規範圖例),置中、每行 6 字。"""
    out = []
    for k, ln in enumerate(wrap(name, 6)):
        out.append(f'<text x="{cx}" y="{top_y + 12 + k*13}" font-size="{size}" '
                   f'fill="{color}" text-anchor="middle">{escape(ln)}</text>')
    return out


def _svg_nodes(proc):
    s = []
    indeg, outdeg = {}, {}
    for _f, a, b, _l, _r in proc.flows:
        outdeg[a] = outdeg.get(a, 0) + 1
        indeg[b] = indeg.get(b, 0) + 1
    for n in proc.nodes.values():
        x, y, w, h, t = n["x"], n["y"], n["w"], n["h"], n["t"]
        cx, cy = x + w / 2, y + h / 2
        if t in EVENT_TS:
            st = STYLE[t]
            dash = "" if n.get("interrupting", True) or not n.get("attach") \
                else ' stroke-dasharray="4,3"'
            s.append(f'<circle cx="{cx}" cy="{cy}" r="{w/2}" fill="{st["fill"]}" '
                     f'stroke="{st["stroke"]}" stroke-width="{st["sw"]}"{dash}/>')
            # 流程中間事件(有進有出)或邊界事件 → 雙圈(BPMN 慣例)
            if n.get("attach") or (t in EVDEF and indeg.get(n["id"])
                                   and outdeg.get(n["id"])):
                s.append(f'<circle cx="{cx}" cy="{cy}" r="{w/2-3.5}" fill="none" '
                         f'stroke="{st["stroke"]}" stroke-width="1.2"{dash}/>')
            s += _svg_event_icon(t, cx, cy, throw=(n.get("kind") == "throw"))
            if n["name"]:
                s += _svg_below_label(n["name"], cx, y + h)
        elif t == "gateway":
            gst = STYLE["gateway"]
            s.append(f'<polygon points="{cx},{y} {x+w},{cy} {cx},{y+h} {x},{cy}" '
                     f'fill="{gst["fill"]}" stroke="{gst["stroke"]}" stroke-width="1.6"/>')
            kind = n.get("kind", "exclusive")
            if kind == "event":
                gs = gst["stroke"]
                s.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="none" '
                         f'stroke="{gs}" stroke-width="1.3"/>')
                s.append(f'<circle cx="{cx}" cy="{cy}" r="9" fill="none" '
                         f'stroke="{gs}" stroke-width="1.3"/>')
                import math as _m
                pts = " ".join(f"{cx+6*_m.sin(2*_m.pi*i/5):.1f},"
                               f"{cy-6*_m.cos(2*_m.pi*i/5):.1f}" for i in range(5))
                s.append(f'<polygon points="{pts}" fill="none" '
                         f'stroke="{gs}" stroke-width="1.3"/>')
            elif kind == "parallel":
                s.append(f'<path d="M{cx},{cy-11} L{cx},{cy+11} M{cx-11},{cy} L{cx+11},{cy}" '
                         f'stroke="{gst["stroke"]}" stroke-width="2.6" fill="none"/>')
            elif kind == "inclusive":
                s.append(f'<circle cx="{cx}" cy="{cy}" r="10" fill="none" '
                         f'stroke="{gst["stroke"]}" stroke-width="2.6"/>')
            else:
                # 判斷分支(排他,規範預設):素菱形,名稱置菱形內
                # ≤3 字單行,4 字折兩行(2字/行),≥5 字由 check_layout 警告
                lines = wrap(n["name"], 2 if len(n["name"]) > 3 else 5)
                start = cy - (len(lines) - 1) * 6.5
                for k, ln in enumerate(lines):
                    s.append(f'<text x="{cx}" y="{start+k*13+4}" font-size="11" '
                             f'fill="#1f2d3d" text-anchor="middle">{escape(ln)}</text>')
            if kind in ("parallel", "inclusive", "event") and n["name"]:
                s += _svg_below_label(n["name"], cx, y + h)
        elif t in ("input", "output"):
            ast = STYLE["artifact"]
            fold = 10
            s.append(f'<path d="M{x},{y} L{x+w-fold},{y} L{x+w},{y+fold} L{x+w},{y+h} '
                     f'L{x},{y+h} Z" fill="{ast["fill"]}" stroke="{ast["stroke"]}" stroke-width="1.4"/>')
            s.append(f'<path d="M{x+w-fold},{y} L{x+w-fold},{y+fold} L{x+w},{y+fold}" '
                     f'fill="none" stroke="{ast["stroke"]}" stroke-width="1.4"/>')
            afill = ast["stroke"] if t == "output" else "none"
            s.append(f'<path d="M{x+7},{y+13} L{x+17},{y+13} L{x+17},{y+9} L{x+24},{y+15} '
                     f'L{x+17},{y+21} L{x+17},{y+17} L{x+7},{y+17} Z" fill="{afill}" '
                     f'stroke="{ast["stroke"]}" stroke-width="1.2"/>')
            if n["name"]:
                s += _svg_below_label(n["name"], cx, y + h)
        elif t == "note":
            ast = STYLE["artifact"]
            s.append(f'<path d="M{x+12},{y} L{x},{y} L{x},{y+h} L{x+12},{y+h}" '
                     f'fill="none" stroke="{ast["stroke"]}" stroke-width="1.4"/>')
            lines = wrap(n["name"], 11)
            start = cy - (len(lines) - 1) * 7
            for k, ln in enumerate(lines):
                s.append(f'<text x="{x+8}" y="{start+k*14+4}" font-size="11.5" '
                         f'fill="#3a4a59">{escape(ln)}</text>')
        elif t == "database":
            ast = STYLE["artifact"]
            ry = 7
            s.append(f'<path d="M{x},{y+ry} L{x},{y+h-ry} A{w/2},{ry} 0 0 0 {x+w},{y+h-ry} '
                     f'L{x+w},{y+ry}" fill="{ast["fill"]}" stroke="{ast["stroke"]}" stroke-width="1.4"/>')
            s.append(f'<ellipse cx="{cx}" cy="{y+ry}" rx="{w/2}" ry="{ry}" '
                     f'fill="{ast["fill"]}" stroke="{ast["stroke"]}" stroke-width="1.4"/>')
            if n["name"]:
                s += _svg_below_label(n["name"], cx, y + h)
        else:
            kind = n.get("kind") or "generic"
            tst = STYLE.get("task_" + kind, STYLE["task_generic"])
            sw = 3.0 if kind == "call" else 1.5      # 呼叫活動:粗框
            s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" '
                     f'fill="{tst["fill"]}" stroke="{tst["stroke"]}" stroke-width="{sw}"/>')
            s += _svg_task_icon(kind, x, y, w, h, tst["stroke"])
            if n.get("loop"):
                s += _svg_loop_icon(x, y, w, h, tst["stroke"])
            lines = wrap(n["name"], 11)
            start = cy - (len(lines) - 1) * 7.5
            for k, ln in enumerate(lines):
                s.append(f'<text x="{cx}" y="{start+k*15+4}" font-size="12.5" '
                         f'fill="#1f2d3d" text-anchor="middle">{escape(ln)}</text>')
    return s


def _svg_assocs(proc, segs=None):
    """關連:點線、無箭頭。segs 共用登錄:關連線跳過先畫的順序流。"""
    s = []
    if segs is None:
        segs = []
    for aid, src, tg, lab in proc.assocs:
        if src not in proc.nodes or tg not in proc.nodes:
            continue
        wps = assoc_waypoints(proc, src, tg)
        d = _hops_path(wps, segs)
        segs.extend((wps[i], wps[i + 1]) for i in range(len(wps) - 1))
        s.append(f'<path d="{d}" fill="none" stroke="#8a99a8" '
                 f'stroke-width="1.4" stroke-dasharray="2,4"/>')
        if lab:
            lx, ly = label_pos(wps)
            s.append(f'<text x="{lx}" y="{ly}" font-size="11" fill="#8a99a8" '
                     f'text-anchor="middle">{escape(lab)}</text>')
    return s


def build_svg(x, pad_aspect=True):
    """pad_aspect=True:正式交付 .svg,寬高比低於 MIN_ASPECT 時左右補白(預覽安全)。
    pad_aspect=False:未補白版,僅供 HTML 檢視器內嵌(檢視器自帶縮放,補白反而讓圖變小)。"""
    _ensure(x)
    pools, mflows = _pools_mflows(x)
    title = f"{x.name} {x.version}"
    pool_h = _pool_height(pools)
    allnodes = {}
    for proc in pools:
        allnodes.update(proc.nodes)

    # viewBox 內容自適應:依實際內容範圍四邊各留 PAD 小留白;
    # 寬高比不寫死,但低於 MIN_ASPECT(直式過長會被預覽器裁底)時左右對稱補白。
    PAD = 24
    left = min(proc.ox for proc in pools)
    right = max(proc.ox + proc.pool_width() for proc in pools)
    for _bx, _bn, box, bw in getattr(x, "_bb_geo", []):
        right = max(right, box + bw)
    title_top = (POOL_Y - 20) - 19             # 圖頂標題 baseline 與字級
    vx, vy = left - PAD, title_top - PAD
    vw = (right - left) + PAD * 2
    vh = (POOL_Y + pool_h - title_top) + PAD * 2
    pad_capped = False
    if pad_aspect and vw / vh < MIN_ASPECT:
        # 目標補到 MIN_ASPECT,但封頂於內容寬 × PAD_CAP:超長圖寧可維持
        # 比例偏窄(預覽可能需捲動/裁底,細看用檢視器),也不把主圖稀釋成細條。
        nw = min(math.ceil(vh * MIN_ASPECT), math.ceil(vw * PAD_CAP))
        pad_capped = nw < vh * MIN_ASPECT
        vx -= (nw - vw) // 2
        vw = nw

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" '
         f'viewBox="{vx} {vy} {vw} {vh}" '
         + ('data-pad="capped" ' if pad_capped else '')
         + f'font-family="Microsoft JhengHei, PingFang TC, Noto Sans CJK TC, sans-serif">']
    s.append(f'<rect x="{vx}" y="{vy}" width="{vw}" height="{vh}" fill="#ffffff"/>')
    s.append(f'<text x="{left}" y="{POOL_Y-20}" font-size="19" font-weight="bold" '
             f'fill="#1f2d3d">{escape(title)}</text>')
    s.append('<defs>'
             '<marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" '
             'orient="auto" markerUnits="strokeWidth">'
             '<path d="M0,0 L8,3 L0,6 Z" fill="#5a6b7b"/></marker>'
             '<marker id="mfarr" markerWidth="11" markerHeight="11" refX="8" refY="4" '
             'orient="auto" markerUnits="strokeWidth">'
             '<path d="M0,0 L8,4 L0,8" fill="none" stroke="#6b7b8b" stroke-width="1.3"/></marker>'
             '<marker id="mfdot" markerWidth="10" markerHeight="10" refX="5" refY="5" '
             'orient="auto" markerUnits="strokeWidth">'
             '<circle cx="5" cy="5" r="3.2" fill="#fff" stroke="#6b7b8b" stroke-width="1.3"/></marker>'
             '</defs>')
    for bxid, bname, box, bw in getattr(x, "_bb_geo", []):
        s.append(f'<rect x="{box}" y="{POOL_Y}" width="{bw}" height="{pool_h}" '
                 f'fill="none" stroke="#3a4a59" stroke-width="2"/>')
        s.append(f'<text x="{box+bw/2}" y="{POOL_Y+pool_h/2}" font-size="13" '
                 f'font-weight="bold" fill="#1f2d3d" text-anchor="middle">'
                 f'{escape(bname)}</text>')
    for proc in pools:
        s += _svg_pool(proc, pool_h)
    for proc in pools:
        for cid, cname, cx0, cy0, cx1, cy1, ckind in proc.container_spans():
            dash = ' stroke-dasharray="6,4"' if ckind == "event" else ""
            s.append(f'<rect x="{int(cx0)}" y="{int(cy0)}" width="{int(cx1-cx0)}" '
                     f'height="{int(cy1-cy0)}" rx="10" fill="none" '
                     f'stroke="#5a6b7b" stroke-width="1.6"{dash}/>')
            s.append(f'<text x="{int(cx0)+10}" y="{int(cy0)+16}" font-size="11.5" '
                     f'font-style="italic" fill="#5a6b7b">{escape(cname)}</text>')
    for proc in pools:
        segs = []                      # 同 pool 線段登錄:後畫者跨線橋
        s += _svg_seqflows(proc, segs)
        s += _svg_assocs(proc, segs)
    # message flows(虛線、起點空心圓、開口箭頭)
    for mid, src, tg, lab in mflows:
        if src not in allnodes or tg not in allnodes:
            continue
        wps = mf_waypoints(allnodes[src], allnodes[tg])
        pts = " ".join(f"{int(round(px))},{int(round(py))}" for px, py in wps)
        s.append(f'<polyline points="{pts}" fill="none" stroke="#6b7b8b" '
                 f'stroke-width="1.4" stroke-dasharray="6 4" '
                 f'marker-start="url(#mfdot)" marker-end="url(#mfarr)"/>')
        # 中點信封裝飾(訊息流慣例)
        ex, ey = label_pos(wps)
        if lab:
            ex -= 14 + len(lab) * 6.5        # 有標籤:信封讓位至標籤左側
        s.append(f'<rect x="{ex-8}" y="{ey-8}" width="16" height="11" '
                 f'fill="#ffffff" stroke="#6b7b8b" stroke-width="1.2"/>')
        s.append(f'<path d="M{ex-8},{ey-8} L{ex},{ey-2} L{ex+8},{ey-8}" '
                 f'fill="none" stroke="#6b7b8b" stroke-width="1.2"/>')
        if lab:
            lx, ly = label_pos(wps)
            bw = 12 + len(lab) * 13
            s.append(f'<rect x="{lx-bw/2}" y="{ly-10}" width="{bw}" height="19" '
                     f'fill="#fff" stroke="#d7dee6" rx="3"/>')
            s.append(f'<text x="{lx}" y="{ly+4}" font-size="11.5" fill="#52606d" '
                     f'text-anchor="middle">{escape(lab)}</text>')
    for proc in pools:
        s += _svg_nodes(proc)
    s.append('</svg>')
    return "\n".join(s)


# ---------------------------------------------------------------------------
# Markdown 輸出
# ---------------------------------------------------------------------------
TYPE_ZH = {"start": "起始事件", "end": "結束事件", "gateway": "決策閘道", "task": "任務"}
KIND_ZH = {"exclusive": "排他", "parallel": "平行", "inclusive": "包容"}


def _md_pool(proc, allnodes):
    outg = {nid: [] for nid in proc.nodes}
    for fid, s, tg, lab, rt in proc.flows:
        outg[s].append((tg, lab))
    nm = lambda nid: allnodes[nid]["name"] if nid in allnodes else nid
    L = []
    L.append("## 角色(泳道)\n")
    for i, lane in enumerate(proc.lanes, 1):
        L.append(f"{i}. {lane}")
    L.append("")
    L.append("## 流程步驟\n")
    ordered = sorted(proc.nodes.values(), key=lambda n: (n["row"], n["lane"]))
    for i, n in enumerate(ordered, 1):
        role = proc.lanes[n["lane"]]
        kind = ""
        if n["t"] == "gateway":
            kind = KIND_ZH.get(n.get("kind", "exclusive"), "") + "閘道"
        typ = kind or TYPE_ZH.get(n["t"], n["t"])
        L.append(f"{i}. **{n['name']}**({typ}|角色:{role})")
    L.append("")
    gws = [n for n in ordered if n["t"] == "gateway"]
    if gws:
        L.append("## 決策點\n")
        for n in gws:
            knd = KIND_ZH.get(n.get("kind", "exclusive"), "排他")
            L.append(f"- **{n['name']}**({knd})")
            for tg, lab in outg[n["id"]]:
                arrow = f"（{lab}）" if lab else ""
                L.append(f"  - {arrow} → {nm(tg)}")
        L.append("")
    L.append("## 流程連線\n")
    for fid, s, tg, lab, rt in proc.flows:
        arrow = f" —[{lab}]→ " if lab else " → "
        L.append(f"- {nm(s)}{arrow}{nm(tg)}")
    L.append("")
    if proc.bands:
        L.append("## 橫向系統分區\n")
        for name, ids in proc.bands:
            names = "、".join(proc.nodes[i]["name"] for i in ids if i in proc.nodes)
            L.append(f"- **{name}**:{names}")
        L.append("")
        L.append("> 註:系統分區以 BPMN 2.0 標準 Group 元素寫入 `.bpmn`"
                 "(bpmn.io 以虛線框呈現);屬視覺分組,不改變泳道與流程語意。")
        L.append("")
    return L


def build_md(x):
    _ensure(x)
    if isinstance(x, Collab):
        allnodes = {}
        for proc in x.pools:
            allnodes.update(proc.nodes)
        L = [f"# {x.name} {x.version}\n",
             "> 本文件由流程圖自動整理,對應同名的 `.bpmn`(可用 bpmn.io 開啟)與 `.svg`。\n"]
        for proc in x.pools:
            L.append(f"# Pool:{proc.name}\n")
            L += _md_pool(proc, allnodes)
        if x.mflows:
            L.append("## 跨 Pool 訊息流(message flow)\n")
            for mid, s, tg, lab in x.mflows:
                arrow = f" ⇢[{lab}]⇢ " if lab else " ⇢ "
                sn = allnodes.get(s, {}).get("name", s)
                tn = allnodes.get(tg, {}).get("name", tg)
                L.append(f"- {sn}{arrow}{tn}")
            L.append("")
        return "\n".join(L)
    L = [f"# {x.name} {x.version}\n",
         "> 本文件由流程圖自動整理,對應同名的 `.bpmn`(可用 bpmn.io 開啟)與 `.svg`。\n"]
    L += _md_pool(x, x.nodes)
    return "\n".join(L)


# ---------------------------------------------------------------------------
# HTML 檢視器(滾輪縮放/拖曳平移/雙擊重置)
# ---------------------------------------------------------------------------
_VIEWER_TMPL = """<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#f5f6f8;font-family:sans-serif}
#bar{position:fixed;top:10px;left:10px;z-index:9;background:#fffc;border:1px solid #ccc;
border-radius:8px;padding:6px 12px;font-size:13px;color:#333}
#stage{width:100%;height:100%;cursor:grab}
#stage:active{cursor:grabbing}
#inner{transform-origin:0 0}
#inner svg{display:block}
</style></head><body>
<div id="bar">滾輪縮放｜拖曳平移｜雙擊重置｜
<input id="q" type="search" placeholder="搜尋節點文字" style="font-size:12px;padding:2px 6px;border:1px solid #bbb;border-radius:6px">
<span id="hits" style="color:#889"></span></div>
<div id="stage"><div id="inner">__SVG__</div></div>
<script>
const stage=document.getElementById('stage'),inner=document.getElementById('inner');
const svg=inner.querySelector('svg'),vb=svg.viewBox.baseVal;
// 關鍵:先把 svg 元素尺寸釘在 viewBox 單位(1 CSS px = 1 viewBox 單位),
// 否則瀏覽器以容器寬渲染,fit() 的 scale 會疊加成二次縮小。
svg.setAttribute('width',vb.width); svg.setAttribute('height',vb.height);
let s=1,tx=0,ty=0,drag=false,sx=0,sy=0;
function apply(){inner.style.transform=`translate(${tx}px,${ty}px) scale(${s})`;}
function fit(){
 const w=stage.clientWidth,h=stage.clientHeight;
 s=Math.min(w/vb.width,h/vb.height)*0.95;
 tx=(w-vb.width*s)/2; ty=(h-vb.height*s)/2; apply();
}
// 節點文字搜尋:比對所有 <text>,高亮命中,Enter 循環並置中目前命中
const q=document.getElementById('q'),hitEl=document.getElementById('hits');
let hits=[],hi=-1;
function search(){
 hits.forEach(t=>{t.style.fill='';t.style.fontWeight='';});hits=[];hi=-1;
 const kw=q.value.trim();
 if(kw){
  hits=[...svg.querySelectorAll('text')].filter(t=>t.textContent.includes(kw));
  hits.forEach(t=>{t.style.fill='#d84315';t.style.fontWeight='bold';});
 }
 hitEl.textContent=kw?('命中 '+hits.length):'';
}
function centre(t){
 const r=stage.getBoundingClientRect(),b=t.getBoundingClientRect();
 tx+=r.left+r.width/2-(b.left+b.width/2);
 ty+=r.top+r.height/2-(b.top+b.height/2);apply();
}
q.addEventListener('input',search);
q.addEventListener('keydown',e=>{
 if(e.key==='Escape'){q.value='';search();q.blur();}
 if(e.key!=='Enter'||!hits.length)return;
 if(hi>=0)hits[hi].style.fill='#d84315';
 hi=(hi+1)%hits.length;hits[hi].style.fill='#c62828';centre(hits[hi]);});
stage.addEventListener('wheel',e=>{e.preventDefault();
 const k=e.deltaY<0?1.15:1/1.15,r=stage.getBoundingClientRect();
 const mx=e.clientX-r.left,my=e.clientY-r.top;
 tx=mx-(mx-tx)*k; ty=my-(my-ty)*k; s*=k; apply();},{passive:false});
stage.addEventListener('mousedown',e=>{drag=true;sx=e.clientX-tx;sy=e.clientY-ty;});
window.addEventListener('mousemove',e=>{if(drag){tx=e.clientX-sx;ty=e.clientY-sy;apply();}});
window.addEventListener('mouseup',()=>drag=false);
stage.addEventListener('dblclick',fit);
window.addEventListener('resize',fit);
fit();
</script></body></html>
"""


def build_viewer_html(x):
    """產生可縮放的 HTML 檢視器。內嵌「未補白」SVG(pad_aspect=False):
    檢視器自帶 fit 縮放,若吃補白會讓內容只佔畫布一小塊、fit 後更小。
    正式交付的 .svg 不受影響,仍走 pad_aspect=True 補白(預覽安全)。"""
    svg = build_svg(x, pad_aspect=False)
    title = f"{x.name} {x.version} 檢視器"
    return _VIEWER_TMPL.replace("__TITLE__", escape(title)).replace("__SVG__", svg)


def build_viewer_html_multi(diagrams, title, svgs=None):
    """多張圖 → 單一多頁檢視器(頂部頁籤切換,各頁獨立縮放/搜尋)。
    svgs:可傳入預先產好的無補白 SVG 清單(emit_multi 餵入用),省略則現產。"""
    if not diagrams:
        raise ValueError("沒有任何流程圖。")
    tabs, pages = [], []
    for i, x in enumerate(diagrams):
        svg = svgs[i] if svgs else build_svg(x, pad_aspect=False)
        # 多張 SVG 同頁內嵌:defs 內 id(arr/mfarr/mfdot 等)跨頁重複時,
        # url(#id) 一律解析到文件第一個定義;若該頁 display:none,
        # 引用它的箭頭不會繪製 → 每頁 id 加前綴隔離。
        import re as _re
        for _id in set(_re.findall(r'id="([A-Za-z][\w-]*)"', svg)):
            svg = svg.replace('id="%s"' % _id, 'id="p%d_%s"' % (i, _id)) \
                     .replace('url(#%s)' % _id, 'url(#p%d_%s)' % (i, _id)) \
                     .replace('href="#%s"' % _id, 'href="#p%d_%s"' % (i, _id))
        tabs.append('<button class="tab" data-p="%d">%s</button>'
                    % (i, escape(f"{x.name}")))
        pages.append('<div class="page" data-p="%d">%s</div>' % (i, svg))
    return _MULTI_VIEWER_TMPL \
        .replace("__TITLE__", escape(title)) \
        .replace("__TABS__", "".join(tabs)) \
        .replace("__PAGES__", "".join(pages))


_MULTI_VIEWER_TMPL = """<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font-family:"Microsoft JhengHei","PingFang TC",sans-serif}
#bar{position:fixed;top:0;left:0;right:0;z-index:9;background:#f5f6f8;border-bottom:1px solid #ddd;
     padding:6px 10px;font-size:12.5px;color:#556;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tab{font-size:12.5px;padding:3px 10px;border:1px solid #bbb;border-radius:14px;background:#fff;cursor:pointer}
.tab.on{background:#2a3a49;color:#fff;border-color:#2a3a49}
#stage{position:absolute;top:44px;bottom:0;left:0;right:0;overflow:hidden;background:#eef0f3;cursor:grab}
#stage.g{cursor:grabbing}
.page{position:absolute;transform-origin:0 0;display:none}
.page.on{display:block}
#q{font-size:12px;padding:2px 6px;border:1px solid #bbb;border-radius:6px;margin-left:auto}
</style></head><body>
<div id="bar">__TABS__<input id="q" type="search" placeholder="搜尋節點文字"><span id="hits" style="color:#889"></span>
<span style="color:#99a">滾輪縮放｜拖曳平移｜雙擊重置</span></div>
<div id="stage">__PAGES__</div>
<script>
const stage=document.getElementById('stage');
const pages=[...document.querySelectorAll('.page')],tabs=[...document.querySelectorAll('.tab')];
const st=pages.map(pg=>{const svg=pg.querySelector('svg'),vb=svg.viewBox.baseVal;
  svg.setAttribute('width',vb.width);svg.setAttribute('height',vb.height);
  return {pg,svg,vb,s:1,tx:0,ty:0};});
let cur=0,drag=false,sx=0,sy=0;
function apply(k){const a=st[k];a.pg.style.transform=`translate(${a.tx}px,${a.ty}px) scale(${a.s})`;}
function fit(k){const a=st[k],w=stage.clientWidth,h=stage.clientHeight;
  a.s=Math.min(w/a.vb.width,h/a.vb.height)*0.95;
  a.tx=(w-a.vb.width*a.s)/2;a.ty=(h-a.vb.height*a.s)/2;apply(k);}
function show(k){cur=k;pages.forEach((p,i)=>p.classList.toggle('on',i===k));
  tabs.forEach((t,i)=>t.classList.toggle('on',i===k));fit(k);search();}
tabs.forEach((t,i)=>t.onclick=()=>show(i));
stage.addEventListener('wheel',e=>{e.preventDefault();const a=st[cur];
  const f=e.deltaY<0?1.15:1/1.15;const r=stage.getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;
  a.tx=mx-(mx-a.tx)*f;a.ty=my-(my-a.ty)*f;a.s*=f;apply(cur);},{passive:false});
stage.addEventListener('mousedown',e=>{drag=true;sx=e.clientX;sy=e.clientY;stage.classList.add('g');});
window.addEventListener('mousemove',e=>{if(!drag)return;const a=st[cur];
  a.tx+=e.clientX-sx;a.ty+=e.clientY-sy;sx=e.clientX;sy=e.clientY;apply(cur);});
window.addEventListener('mouseup',()=>{drag=false;stage.classList.remove('g');});
stage.addEventListener('dblclick',()=>fit(cur));
window.addEventListener('resize',()=>fit(cur));
const q=document.getElementById('q'),hitEl=document.getElementById('hits');
let hits=[],hi=-1;
function search(){hits.forEach(t=>{t.style.fill='';t.style.fontWeight='';});hits=[];hi=-1;
  const kw=q.value.trim();
  if(kw){hits=[...st[cur].svg.querySelectorAll('text')].filter(t=>t.textContent.includes(kw));
    hits.forEach(t=>{t.style.fill='#d84315';t.style.fontWeight='bold';});}
  hitEl.textContent=kw?('命中 '+hits.length):'';}
q.addEventListener('input',search);
q.addEventListener('keydown',e=>{
  if(e.key==='Escape'){q.value='';search();q.blur();}
  if(e.key!=='Enter'||!hits.length)return;
  if(hi>=0)hits[hi].style.fill='#d84315';
  hi=(hi+1)%hits.length;const t=hits[hi];t.style.fill='#c62828';
  const a=st[cur],r=stage.getBoundingClientRect(),b=t.getBoundingClientRect();
  a.tx+=r.left+r.width/2-(b.left+b.width/2);
  a.ty+=r.top+r.height/2-(b.top+b.height/2);apply(cur);});
show(0);
</script></body></html>
"""


# ---------------------------------------------------------------------------
# 版號與版本記錄表
# ---------------------------------------------------------------------------
def bump_version(v, structural):
    """依變更類型進位版號:structural=True → 主版+1、次版歸 00;False → 次版+1。
    例:bump_version("V01.03", True) -> "V02.00";("V01.00", False) -> "V01.01"。"""
    try:
        major, minor = v.lstrip("Vv").split(".")
        major, minor = int(major), int(minor)
    except Exception:
        raise ValueError(f"版號格式錯誤:{v!r}(應為 V主版.次版,如 V01.00)")
    return f"V{major+1:02d}.00" if structural else f"V{major:02d}.{minor+1:02d}"


_LOG_HEADER = ("# {name}｜版本記錄\n\n"
               "| 版號 | 日期 | 變更類型 | 變更摘要 | 變更來源 |\n"
               "|------|------|----------|----------|----------|\n")


def _write_changelog(x, outdir, change, change_kind, change_source):
    """維護每張圖的獨立版本記錄表(檔名不帶版號,跨版累積)。"""
    stem = x.cid if isinstance(x, Collab) else x.pid   # 檔名用(可中文),非 XML xid
    return _write_changelog_row(stem, x.name, x.version, outdir,
                                change, change_kind, change_source)


def _write_changelog_row(stem, name, version, outdir,
                         change, change_kind, change_source):
    """版本記錄表核心(圖層級與專案層級共用)。同版號重複寫入時覆寫該列。"""
    import datetime
    path = os.path.join(outdir, stem + "_版本記錄.md")
    rows = []
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            if line.startswith("|") and not line.startswith("| 版號") \
               and not line.startswith("|--"):
                rows.append(line)
    first = not rows
    if change_kind is None:
        change_kind = "初版" if first else "文字"
    if first:
        change = change or "初版產出"
        change_source = change_source or "流程說明/會議記錄"
    else:
        if change is None:
            change = "(未填寫變更摘要)"
            print("⚠ 版本記錄:未填 change(變更摘要),請補填後重跑 emit 覆寫該列")
        if change_source is None:
            change_source = "(未填寫變更來源)"
            print("⚠ 版本記錄:未填 change_source(變更來源),請補填後重跑 emit 覆寫該列")
    today = datetime.date.today().isoformat()
    newrow = f"| {version} | {today} | {change_kind} | {change} | {change_source} |"
    rows = [r for r in rows if not r.startswith(f"| {version} ")]  # 同版覆寫
    rows.append(newrow)
    open(path, "w", encoding="utf-8").write(_LOG_HEADER.format(name=name) +
                                            "\n".join(rows) + "\n")
    return path


# 鐵則分類(20260710.12,使用者裁決):下列檢核項屬「鐵則」——交付仍
# 照常,但違規必須顯著標示(emit 輸出 + .md 鐵則檢核區)。「連線交叉」
# 不列鐵則:已以跨線橋呈現(鐵則⑤「應避免」),殘餘列提醒。
IRON_KEYS = ("節點重疊", "節點壓泳道線", "連線穿過節點", "連線重合",
             "端口重合", "間距不足", "容器標題", "標籤")
ENGINE_TIME_CAP = 300     # 每張圖引擎時間上限(秒);超過即警示(使用者裁決)


def _iron_report(problems):
    """把版面問題分類為 (鐵則違規, 交叉[已橋接], 其他提醒)。"""
    vio = [q for q in problems if any(k in q for k in IRON_KEYS)]
    cross = [q for q in problems if "連線交叉" in q]
    others = [q for q in problems if q not in vio and q not in cross]
    return vio, cross, others


def _iron_md_section(sem, problems):
    """.md 的「鐵則檢核」章節(固定附於流程說明之後)。"""
    vio, cross, others = _iron_report(problems)
    lines = ["", "## 鐵則檢核(引擎自動檢查)", ""]
    if not vio:
        lines.append("- **鐵則全數通過**(節點不重疊/不壓泳道線、連線不穿"
                     "節點與文字、無平行重疊、間距足夠、端口不重疊)")
    else:
        lines.append(f"- **✗ 鐵則違規 {len(vio)} 項**(引擎自動修正已達"
                     "此拓樸極限,建議於 draw.io 內手動微拉):")
        lines += [f"  - {q}" for q in vio]
    if cross:
        lines.append(f"- 連線交叉 {len(cross)} 處:**已以跨線橋(半圓弧)"
                     "呈現**,兩線視覺上互不相交")
    if others:
        lines.append(f"- 其他提醒 {len(others)} 項(非鐵則):")
        lines += [f"  - {q}" for q in others]
    if sem:
        lines.append(f"- 語意提醒 {len(sem)} 項:")
        lines += [f"  - {q}" for q in sem]
    return "\n".join(lines) + "\n"


def _print_page_report(tag, sem, problems, secs=None, hops=None):
    """emit / emit_multi 共用的終端回報:鐵則優先、交叉標明已橋接。
    hops:SVG 端實際畫出的跨線橋數(.drawio 端由 jumpStyle 全數原生呈現;
    SVG 端貼近折點 8px 內的交叉不畫橋,故兩者可能不同,如實回報)。"""
    vio, cross, others = _iron_report(problems)
    score, detail = layout_score(problems) if problems else (0, "")
    t = "" if secs is None else (
        f",引擎 {secs:.1f}s" + ("" if secs <= ENGINE_TIME_CAP
                                else f" ⚠超過 {ENGINE_TIME_CAP//60} 分鐘上限"))
    if vio:
        print(f"{tag}  ✗ 鐵則違規 {len(vio)} 項(評分 {score},{detail}{t}):")
        for q in vio:
            print("   ✗", q)
    elif problems or sem:
        print(f"{tag}  鐵則全數通過(評分 {score}"
              + (f",{detail}" if detail else "") + f"{t})")
    else:
        print(f"{tag}  鐵則全數通過、無任何缺陷(評分 0{t})")
    if cross:
        svgpart = "" if hops is None else f";SVG 端橋接 {hops} 處" + \
            ("" if hops >= len(cross) else "(貼近折點者不畫橋)")
        print(f"   - 連線交叉 {len(cross)} 處:draw.io 內以跨線橋呈現"
              f"(視覺不相交{svgpart})")
    for q in others:
        print("   -", q)
    for q in sem:
        print("   - [語意]", q)


def _emit_one_page(x, idx):
    """單張圖的整包產出:佈局(_ensure 於頁 XML 產生時觸發)、
    四種輸出與雙檢核,回傳純字串結果(含引擎耗時)。"""
    t0 = time.monotonic()
    page = _drawio_page_xml(x, "d%d" % (idx + 1))
    svg = build_svg(x)
    svg_np = build_svg(x, pad_aspect=False)
    sem = check_semantics(x)
    probs = check_layout(x)
    md = build_md(x) + _iron_md_section(sem, probs)
    stem = x.cid if isinstance(x, Collab) else x.pid
    return (idx, stem, x.name, page, svg, svg_np, md, sem, probs,
            time.monotonic() - t0)


def _render_pages(diagrams):
    """逐圖串行產出(20260710.08:移除按圖多進程並行——引擎端到端秒級,
    並行收益近零、徒增維護面;歷史背景見 CHANGELOG 20260709.05/20260710.08)。"""
    return [_emit_one_page(x, i) for i, x in enumerate(diagrams)]


def emit_multi(diagrams, project, outdir=".", version="V01.00", src=None,
               change=None, change_kind=None, change_source=None):
    """多張流程圖 → 專案級交付(單一多頁 .drawio):
      1) {project}_{version}.drawio      多頁,每張圖一個頁籤(draw.io 底部切換)
      2) 每張圖各自 {圖名}_{version}.svg 與 .md(對話預覽與說明仍逐圖)
      3) {project}_{version}_檢視器.html  多頁檢視器(頁籤切換、各頁縮放/搜尋)
      4) {project}_{version}_流程定義.py (src=__file__ 複製)
      5) {project}_版本記錄.md            專案層級,任一圖結構變動→主版進位
    版號以專案為準:所有圖與檔案共用同一 version。回傳各圖問題清單 dict。
    """
    if not diagrams:
        raise ValueError("沒有任何流程圖;請至少提供一個 Proc / Collab。")
    # 規則:多頁 .drawio 內節點 id 必須全檔唯一(跨頁重複會使 draw.io
    # 連線錯亂、箭頭消失)。撰寫定義時各圖 id 應加圖前綴(如 a1_/a2_)。
    seen_ids, dup = {}, []
    for x in diagrams:
        procs = x.pools if isinstance(x, Collab) else [x]
        stem = x.cid if isinstance(x, Collab) else x.pid
        for pr in procs:
            for nid in pr.nodes:
                if nid in seen_ids and seen_ids[nid] != stem:
                    dup.append(f"{nid}(於「{seen_ids[nid]}」與「{stem}」)")
                seen_ids.setdefault(nid, stem)
    if dup:
        raise ValueError("多頁 .drawio 節點 id 跨圖重複,請各圖 id 加圖前綴"
                         "(如 a1_/a2_)後重跑:" + "、".join(dup[:8]))
    # 版號子目錄(20260716.01):帶版號檔存 outdir/{version}/,
    # 專案版本記錄表留在 outdir 上層;outdir 已是該版號目錄時不重複巢套。
    verdir = outdir if os.path.basename(os.path.normpath(outdir)) == version \
        else os.path.join(outdir, version)
    os.makedirs(verdir, exist_ok=True)
    base = os.path.join(verdir, f"{project}_{version}")
    for x in diagrams:
        x.version = version
    rendered = _render_pages(diagrams)     # 逐圖串行產出
    open(base + ".drawio", "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<mxfile host="bpmn-flow-builder">\n'
        + "\n".join(r[3] for r in rendered)
        + '\n</mxfile>\n')
    open(base + "_檢視器.html", "w", encoding="utf-8").write(
        build_viewer_html_multi(diagrams, f"{project} {version} 檢視器",
                                svgs=[r[5] for r in rendered]))
    if src:
        import shutil
        dst = base + "_流程定義.py"
        if not os.path.exists(src):
            print(f"⚠ 找不到定義檔 src={src!r},略過複製 _流程定義.py(其餘交付物照常產出)")
        elif os.path.abspath(src) != os.path.abspath(dst):
            shutil.copyfile(src, dst)
    _write_changelog_row(project, project, version, outdir,
                         change, change_kind, change_source)
    results = {}
    for _i, stem, _name, _page, svg, _svg_np, md, sem, problems, secs \
            in rendered:
        dbase = os.path.join(verdir, f"{stem}_{version}")
        open(dbase + ".svg", "w", encoding="utf-8").write(svg)
        open(dbase + ".md", "w", encoding="utf-8").write(md)
        results[stem] = sem + problems
        _print_page_report(f"page: {stem}", sem, problems, secs,
                           hops=svg.count("A5,5 "))
    print("written:", f"{project}_{version}.drawio",
          f"(共 {len(diagrams)} 頁)+ 多頁檢視器 + 各圖 SVG/MD")
    return results


def emit(x, outdir=".", viewer=True, src=None, fmt="drawio",
         change=None, change_kind=None, change_source=None):
    """產出全部交付物(每張圖 6 檔):
      1) 圖檔 XML:預設 fmt="drawio" → .drawio(draw.io 用),**不需詢問使用者**;
         僅當使用者明講要用 bpmn.io 時改 fmt="bpmn" → .bpmn。
         兩工具格式不相容、不可互餵。
      2) .svg  3) .md 流程說明  4) _檢視器.html(viewer=True,預設固定產出)
      5) _流程定義.py(src=__file__ 時自動複製本次定義檔)
      6) _版本記錄.md(獨立累積,change=變更摘要、change_kind=初版/結構/文字、
         change_source=變更來源,如「使用者修改 .md」「使用者修改 .bpmn」「口頭指示」)
    """
    if fmt not in ("bpmn", "drawio"):
        raise ValueError(f"fmt 只能是 'bpmn' 或 'drawio',收到 {fmt!r}")
    t0 = time.monotonic()
    stem = x.cid if isinstance(x, Collab) else x.pid   # 檔名用(可中文),非 XML xid
    # 版號子目錄(20260716.01):5 個帶版號檔存 outdir/{version}/,
    # 版本記錄表(跨版累積)留在 outdir 上層;outdir 已是該版號目錄時不重複巢套。
    verdir = outdir if os.path.basename(os.path.normpath(outdir)) == x.version \
        else os.path.join(outdir, x.version)
    os.makedirs(verdir, exist_ok=True)
    base = os.path.join(verdir, stem + "_" + x.version)
    if fmt == "drawio":
        open(base + ".drawio", "w", encoding="utf-8").write(build_drawio(x))
    else:
        open(base + ".bpmn", "w", encoding="utf-8").write(build_bpmn(x))
    sem = check_semantics(x)
    problems = check_layout(x)
    svg_str = build_svg(x)
    open(base + ".svg", "w", encoding="utf-8").write(svg_str)
    open(base + ".md", "w", encoding="utf-8").write(
        build_md(x) + _iron_md_section(sem, problems))
    if viewer:
        open(base + "_檢視器.html", "w", encoding="utf-8").write(build_viewer_html(x))
    if src:
        import shutil
        dst = base + "_流程定義.py"
        if not os.path.exists(src):
            print(f"⚠ 找不到定義檔 src={src!r},略過複製 _流程定義.py(其餘交付物照常產出)")
        elif os.path.abspath(src) != os.path.abspath(dst):
            shutil.copyfile(src, dst)
    _write_changelog(x, outdir, change, change_kind, change_source)
    name = stem + "_" + x.version
    _print_page_report(f"written: {name}", sem, problems,
                       time.monotonic() - t0, hops=svg_str.count("A5,5 "))
    return sem + problems

