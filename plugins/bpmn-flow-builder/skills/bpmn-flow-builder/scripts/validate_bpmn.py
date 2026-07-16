# -*- coding: utf-8 -*-
"""驗證圖檔 XML 是否符合結構、完整性與版面要求。
用法: python3 validate_bpmn.py <資料夾或檔案...> [--score]

.bpmn(BPMN 2.0,單/多 pool 皆可)檢查(✗ = 必修;• = 建議/提醒):
  結構  id 合法性(ASCII NCName,否則 bpmn.io 匯入報 illegal ID)、
        參照完整性、incoming/outgoing 一致與順序、泳道覆蓋、
        懸空(無下一關)、孤兒(無上一關)、空流程、起點/終點數量
  版面  節點框不重疊、連線不穿節點、連線兩兩交叉提醒
  連通  各 process 從起點可達、是否每個節點都能走到終點(僅順序流)
  閘道  diverging 須 ≥2 條 outgoing、排他分支建議命名;單進單出閘道提醒
  訊息  messageFlow 端點存在;建議跨 pool(同一 process 內提醒)
  DI    每個節點/連線都有 DI、waypoint ≥2、節點框不重疊、連線不穿過其他節點
.drawio(mxGraph)檢查:well-formed、必備根節點 0/1、id 唯一、
        id 非 JS 內建屬性名(fill/map/push 等,draw.io 開檔會失敗)、
        邊的 source/target 存在、頂點/邊皆有 mxGeometry(自閉合邊不會渲染)
交付  每張圖 6 檔齊備:圖檔 XML(.bpmn 或 .drawio 擇一)
      /.svg/.md/_檢視器.html/_流程定義.py/_版本記錄.md
--score 另列版面可讀性評分(越低越好,限同圖變體比較)
"""
import sys, glob, os, xml.etree.ElementTree as ET
M  = '{http://www.omg.org/spec/BPMN/20100524/MODEL}'
DI = '{http://www.omg.org/spec/BPMN/20100524/DI}'
DD = '{http://www.omg.org/spec/DD/20100524/DI}'
DC = '{http://www.omg.org/spec/DD/20100524/DC}'
GW_TAGS = ('exclusiveGateway', 'parallelGateway', 'inclusiveGateway',
           'eventBasedGateway', 'complexGateway')
NODE_TAGS = ('task', 'userTask', 'serviceTask', 'scriptTask', 'sendTask',
             'receiveTask', 'manualTask', 'subProcess', 'callActivity',
             'startEvent', 'endEvent', 'boundaryEvent',
             'intermediateCatchEvent', 'intermediateThrowEvent') + GW_TAGS
# 工件(非流程節點):要有 DI、不參與懸空/孤兒/連通/泳道覆蓋
ARTIFACT_TAGS = ('dataObjectReference', 'dataStoreReference',
                 'textAnnotation')
# JS 內建屬性名不可作 .drawio cell id:draw.io 以純 JS 物件/陣列作 id 查找表,
# 撞名時開檔報「x.setId is not a function」(20260710.10 實測;
# 清單與 bpmn_builder._JS_RESERVED 同步維護,builder 端已自動改名,
# 此為第二道防線,涵蓋使用者手改/外部產生的檔)
JS_RESERVED_IDS = frozenset((
    "constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
    "toLocaleString", "toString", "valueOf", "__proto__",
    "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
    "at", "concat", "copyWithin", "entries", "every", "fill", "filter",
    "find", "findIndex", "findLast", "findLastIndex", "flat", "flatMap",
    "forEach", "includes", "indexOf", "join", "keys", "lastIndexOf", "length",
    "map", "pop", "push", "reduce", "reduceRight", "reverse", "shift",
    "slice", "some", "sort", "splice", "unshift", "values", "with",
))


def files(args):
    out = []
    for a in (args or ['.']):
        if os.path.isdir(a):
            # 版號子目錄佈局(20260716.01):遞迴涵蓋 outdir/{版號}/ 下的圖檔
            out += sorted(glob.glob(os.path.join(a, '**', '*.bpmn'), recursive=True))
            out += sorted(glob.glob(os.path.join(a, '**', '*.drawio'), recursive=True))
        else:
            out.append(a)
    return out


def _boxes_overlap(a, b, pad=2):
    return not (a[0]+a[2]+pad <= b[0]-pad or b[0]+b[2]+pad <= a[0]-pad or
                a[1]+a[3]+pad <= b[1]-pad or b[1]+b[3]+pad <= a[1]-pad)


def _seg_hits_box(p1, p2, b, pad=6):
    (x1, y1), (x2, y2) = p1, p2
    bx1, by1, bx2, by2 = b[0]-pad, b[1]-pad, b[0]+b[2]+pad, b[1]+b[3]+pad
    if abs(x1-x2) < 1e-6:
        if bx1 <= x1 <= bx2:
            lo, hi = sorted((y1, y2)); return not (hi < by1 or lo > by2)
        return False
    if abs(y1-y2) < 1e-6:
        if by1 <= y1 <= by2:
            lo, hi = sorted((x1, x2)); return not (hi < bx1 or lo > bx2)
        return False
    for k in range(1, 24):
        t = k/24.0; x, y = x1+(x2-x1)*t, y1+(y2-y1)*t
        if bx1 <= x <= bx2 and by1 <= y <= by2:
            return True
    return False


def _seg_cross(a1, a2, b1, b2):
    """兩正交線段是否嚴格交叉(互相穿過內部;端點相觸不算)。"""
    ah, av = abs(a1[1]-a2[1]) < 1e-6, abs(a1[0]-a2[0]) < 1e-6
    bh, bv = abs(b1[1]-b2[1]) < 1e-6, abs(b1[0]-b2[0]) < 1e-6
    if ah and bv:
        h, v = (a1, a2), (b1, b2)
    elif av and bh:
        h, v = (b1, b2), (a1, a2)
    else:
        return False
    hy = h[0][1]; hlo, hhi = sorted((h[0][0], h[1][0]))
    vx = v[0][0]; vlo, vhi = sorted((v[0][1], v[1][1]))
    return hlo+0.5 < vx < hhi-0.5 and vlo+0.5 < hy < vhi-0.5


_NC_OK = __import__('re').compile(r'^[A-Za-z_][A-Za-z0-9_.\-]*$')


def check(f):
    iss, notes = [], []
    r = ET.parse(f).getroot()

    # id 合法性:bpmn.io 只接受 ASCII NCName,中文等字元會造成 illegal ID 無法匯入
    bad_ids = {e.get('id') for e in [r] + list(r.iter())
               if e.get('id') and not _NC_OK.match(e.get('id'))}
    for b in sorted(bad_ids):
        iss.append(f"id 含非法字元(bpmn.io 僅接受 ASCII NCName):{b}")

    procs = r.findall(M + 'process')
    if not procs:
        return ["找不到 bpmn:process"], []

    nodes = {}          # nid -> (tag, elem, proc_id)
    node_proc = {}
    seq = {}            # fid -> (s,t,name)
    for proc in procs:
        pid = proc.get('id')
        for tag in NODE_TAGS:
            for n in proc.iter(M + tag):
                nodes[n.get('id')] = (tag, n); node_proc[n.get('id')] = pid
        for fl in proc.findall(M + 'sequenceFlow'):
            seq[fl.get('id')] = (fl.get('sourceRef'), fl.get('targetRef'), fl.get('name'))

    artifacts = {}
    assocs = {}
    for proc in procs:
        for tag in ARTIFACT_TAGS:
            for a in proc.iter(M + tag):
                artifacts[a.get('id')] = tag
        for a in proc.iter(M + 'association'):
            assocs[a.get('id')] = (a.get('sourceRef'), a.get('targetRef'), None)

    if not nodes:
        return ["流程無任何節點(空流程)"], []

    ri = {k: [] for k in nodes}; ro = {k: [] for k in nodes}
    for fid, (s, t, lab) in seq.items():
        if s not in nodes: iss.append(f"sequenceFlow {fid} 來源不存在:{s}")
        if t not in nodes: iss.append(f"sequenceFlow {fid} 目標不存在:{t}")
        if s in nodes: ro[s].append(fid)
        if t in nodes: ri[t].append(fid)

    # incoming/outgoing 子元素一致與順序、起終點規則、懸空/孤兒
    for nid, (tag, n) in nodes.items():
        di = [e.text for e in n.findall(M + 'incoming')]
        do = [e.text for e in n.findall(M + 'outgoing')]
        if set(di) != set(ri[nid]): iss.append(f"{nid} incoming 與實際連線不符")
        if set(do) != set(ro[nid]): iss.append(f"{nid} outgoing 與實際連線不符")
        if tag == 'startEvent' and di: iss.append(f"{nid} 起始事件不應有 incoming")
        if tag == 'endEvent' and do: iss.append(f"{nid} 結束事件不應有 outgoing")
        if tag != 'endEvent' and not ro[nid]: iss.append(f"{nid} 無下一關(懸空)")
        if tag not in ('startEvent', 'boundaryEvent') and not ri[nid]:
            iss.append(f"{nid} 無上一關(孤兒)")
        kids = [c.tag for c in list(n) if c.tag in (M + 'incoming', M + 'outgoing')]
        if kids != sorted(kids, key=lambda x: 0 if x.endswith('incoming') else 1):
            iss.append(f"{nid} incoming/outgoing 順序錯誤(應 incoming 先)")

    # 每個 process 各自:起終點、泳道覆蓋、連通
    adj = {k: [] for k in nodes}; radj = {k: [] for k in nodes}
    for fid, (s, t, lab) in seq.items():
        if s in nodes and t in nodes:
            adj[s].append(t); radj[t].append(s)
    for proc in procs:
        pid = proc.get('id')
        pnodes = [nid for nid in nodes if node_proc[nid] == pid]
        starts = [k for k in pnodes if nodes[k][0] == 'startEvent']
        ends = [k for k in pnodes if nodes[k][0] == 'endEvent']
        if not starts: notes.append(f"process「{pid}」沒有 startEvent")
        if not ends:   notes.append(f"process「{pid}」沒有 endEvent")
        if proc.find(M + 'laneSet') is not None:
            lref = set(e.text for e in proc.iter(M + 'flowNodeRef'))
            for nid in pnodes:
                if nodes[nid][0] == 'boundaryEvent':
                    continue           # 邊界事件貼附宿主,不入泳道 flowNodeRef
                if nid not in lref: iss.append(f"{nid} 未配置於任何泳道")
        seeds = (starts or [k for k in pnodes if not ri[k]]) + \
            [k for k in pnodes if nodes[k][0] == 'boundaryEvent']
        reach = set(); st = list(seeds)
        while st:
            u = st.pop()
            if u in reach: continue
            reach.add(u); st += [v for v in adj[u] if node_proc.get(v) == pid]
        for nid in pnodes:
            if nid not in reach: iss.append(f"{nid} 從起點無法到達")
        if ends:
            ce = set(); st = list(ends)
            while st:
                u = st.pop()
                if u in ce: continue
                ce.add(u); st += [v for v in radj[u] if node_proc.get(v) == pid]
            for nid in pnodes:
                if nid not in ce: notes.append(f"{nid} 無法走到任何終點")

    # 閘道
    for nid, (tag, n) in nodes.items():
        if tag in GW_TAGS:
            nm = n.get('name') or nid
            no, ni = len(ro[nid]), len(ri[nid])
            if no <= 1 and ni <= 1:
                notes.append(f"閘道「{nm}」單進單出,通常多餘")
            if no > 1 and tag == 'exclusiveGateway':
                unlabeled = [fid for fid in ro[nid] if not seq[fid][2]]
                if unlabeled:
                    notes.append(f"排他閘道「{nm}」有 {len(unlabeled)} 條分支未命名(建議標條件)")

    # message flow
    mflows = {}
    collab = r.find(M + 'collaboration')
    parts = set()
    if collab is not None:
        parts = set(p.get('id') for p in collab.findall(M + 'participant'))
        for mf in collab.findall(M + 'messageFlow'):
            mflows[mf.get('id')] = (mf.get('sourceRef'), mf.get('targetRef'), mf.get('name'))
    for mid, (s, t, lab) in mflows.items():
        if s not in nodes and s not in parts: iss.append(f"messageFlow {mid} 來源不存在:{s}")
        if t not in nodes and t not in parts: iss.append(f"messageFlow {mid} 目標不存在:{t}")
        if s in nodes and t in nodes and node_proc[s] == node_proc[t]:
            notes.append(f"messageFlow {mid} 兩端在同一 pool(訊息流應跨 pool)")

    # DI 完整性 + 幾何
    shapes = {}
    for sh in r.iter(DI + 'BPMNShape'):
        b = sh.find(DC + 'Bounds')
        if b is not None:
            shapes[sh.get('bpmnElement')] = (float(b.get('x')), float(b.get('y')),
                                             float(b.get('width')), float(b.get('height')))
    for nid in list(nodes) + list(artifacts):
        if nid not in shapes: iss.append(f"{nid} 缺少 DI 形狀")
    ends_map = dict(seq); ends_map.update(mflows)     # edge id -> (s,t,name)
    ends_map.update(assocs)                           # 關連端點納入穿框排除
    edges = {}
    for e in r.iter(DI + 'BPMNEdge'):
        wps = [(float(w.get('x')), float(w.get('y'))) for w in e.findall(DD + 'waypoint')]
        edges[e.get('bpmnElement')] = wps
        if len(wps) < 2: iss.append(f"{e.get('bpmnElement')} waypoint 不足(<2)")
    for fid in list(seq) + list(mflows) + list(assocs):
        if fid not in edges: iss.append(f"{fid} 缺少 DI 連線")

    nodeboxes = {nid: shapes[nid] for nid in list(nodes) + list(artifacts)
                 if nid in shapes}
    battach = {nid: n.get('attachedToRef') for nid, (tag, n) in nodes.items()
               if tag == 'boundaryEvent'}
    keys = list(nodeboxes)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            if battach.get(a) == b or battach.get(b) == a:
                continue    # 邊界事件貼附宿主,重疊為 BPMN 慣例
            if _boxes_overlap(nodeboxes[a], nodeboxes[b]):
                iss.append(f"節點框重疊:{a} ↔ {b}")
    for eid, wps in edges.items():
        s, t = (ends_map.get(eid, (None, None, None))[0], ends_map.get(eid, (None, None, None))[1])
        for k in range(len(wps) - 1):
            (x1, y1), (x2, y2) = wps[k], wps[k + 1]
            if abs(x1 - x2) > 1 and abs(y1 - y2) > 1:
                iss.append(f"連線 {eid} 為斜線(應為水平/垂直正交折線)")
                break
        for nid, box in nodeboxes.items():
            if nid in (s, t): continue
            if battach.get(nid) in (s, t):
                continue    # 貼附於邊端點宿主的邊界事件,豁免
            if any(_seg_hits_box(wps[k], wps[k+1], box) for k in range(len(wps)-1)):
                if str(eid).startswith('mf_'):
                    notes.append(f"訊息流 {eid} 飛越節點 {nid}(跨 pool 慣例,提醒)")
                    continue
                iss.append(f"連線 {eid} 穿過節點 {nid}")
    eids = list(edges)
    for a in range(len(eids)):
        for b in range(a + 1, len(eids)):
            w1, w2 = edges[eids[a]], edges[eids[b]]
            if any(_seg_cross(w1[i], w1[i+1], w2[j], w2[j+1])
                   for i in range(len(w1)-1) for j in range(len(w2)-1)):
                notes.append(f"連線交叉:{eids[a]} × {eids[b]}(建議調整路線消除)")

    return iss, notes


MIN_ASPECT = 1.3


def check_svg_preview(f):
    """SVG 預覽安全檢查:①根元素不得寫死 width/height(僅 viewBox,否則預覽無法
    自適應);②寬高比 >= MIN_ASPECT(直式過長會在「以寬度撐滿」的預覽器被裁底且
    無法捲動)——但根元素帶 data-pad="capped"(builder 補白封頂標記:主圖至少佔
    畫布一半,寧可裁底不稀釋)時放行、改列提醒;③背景矩形完整覆蓋 viewBox。
    回傳 (errors, notes)。"""
    import re
    errs, notes = [], []
    s = open(f, encoding="utf-8").read()
    m = re.search(r'<svg\b[^>]*>', s)
    if not m:
        return ["找不到 <svg> 根元素"], []
    attrs = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(0)))
    for bad in ("width", "height"):
        if bad in attrs:
            errs.append(f'根元素寫死 {bad}="{attrs[bad]}" — 請移除,只保留 viewBox')
    if "viewBox" not in attrs:
        errs.append("根元素缺少 viewBox")
        return errs, notes
    vx, vy, vw, vh = (float(v) for v in attrs["viewBox"].split())
    if vw / vh < MIN_ASPECT - 1e-9:
        if attrs.get("data-pad") == "capped":
            notes.append(f"寬高比 {vw/vh:.2f} < {MIN_ASPECT}(補白已封頂:主圖佔畫布"
                         f"≥1/2)——對話內 SVG 預覽可能裁底,細看請用 _檢視器.html")
        else:
            errs.append(f"viewBox 寬高比 {vw/vh:.2f} < {MIN_ASPECT} — 直式過長預覽會裁底;"
                        f"請將畫布左右補白至寬度 >= {int(vh*MIN_ASPECT)+1}")
    bg = re.search(r'<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" '
                   r'height="([\d.]+)" fill="#(?:fff|ffffff)"/>', s)
    if not bg:
        errs.append("找不到覆蓋整個畫布的白色背景矩形")
    else:
        bx, by, bw, bh = (float(v) for v in bg.groups())
        if bx > vx or by > vy or bx + bw < vx + vw or by + bh < vy + vh:
            errs.append("背景矩形未完整覆蓋 viewBox")
    return errs, notes


def svg_files(args):
    out = []
    for a in args:
        if os.path.isdir(a):
            out += sorted(glob.glob(os.path.join(a, '**', '*.svg'), recursive=True))
        elif a.endswith('.svg'):
            out.append(a)
    return out


def check_deliverables(diagram_path):
    """交付完整性。單圖:圖檔 XML(.bpmn 或 .drawio 擇一)/.svg/.md/
    _檢視器.html/_流程定義.py + {圖名}_版本記錄.md(不帶版號,跨版累積)。
    多頁 .drawio(專案級,emit_multi 產出):改要求 _檢視器.html/_流程定義.py/
    版本記錄;各頁 SVG/MD 以各圖自己的檔名產出,不掛在專案 stem 下。"""
    iss = []
    base = os.path.splitext(diagram_path)[0]
    multi = False
    if diagram_path.endswith('.drawio'):
        try:
            multi = open(diagram_path, encoding='utf-8').read().count('<diagram') > 1
        except OSError:
            pass
    sufs = ('_檢視器.html', '_流程定義.py') if multi         else ('.svg', '.md', '_檢視器.html', '_流程定義.py')
    for suf in sufs:
        if not os.path.exists(base + suf):
            iss.append(f"缺交付物:{os.path.basename(base + suf)}")
    stem = os.path.basename(base)
    xid = stem.rsplit('_V', 1)[0] if '_V' in stem else stem
    d = os.path.dirname(diagram_path) or '.'
    # 版號子目錄佈局(20260716.01):版本記錄表在圖檔同層或上一層皆可
    logs = [os.path.join(d, xid + '_版本記錄.md'),
            os.path.join(os.path.dirname(os.path.abspath(d)), xid + '_版本記錄.md')]
    if not any(os.path.exists(l) for l in logs):
        iss.append(f"缺版本記錄表:{xid}_版本記錄.md")
    return iss


def check_drawio(f):
    """draw.io(mxGraph)檔基本結構檢查:well-formed、必備根節點 0/1、
    id 唯一、邊的 source/target 存在、頂點幾何存在。回傳 (errors, notes)。"""
    iss, notes = [], []
    try:
        r = ET.parse(f).getroot()
    except ET.ParseError as e:
        return [f"XML 解析失敗:{e}"], []
    diagrams = r.findall('diagram') or [r]
    if len(diagrams) > 1:
        notes.append(f"多頁檔:{len(diagrams)} 頁,逐頁檢查")
    for dgi, dg in enumerate(diagrams):
        tag = f"[頁{dgi+1}] " if len(diagrams) > 1 else ""
        page_iss = _check_drawio_page(dg, tag)
        iss.extend(page_iss)
    return iss, notes


def _check_drawio_page(dg, tag=""):
    """單一 <diagram> 頁的結構與幾何檢查(id 範疇以頁為界)。"""
    iss = []
    cells = list(dg.iter('mxCell'))
    if not cells:
        return [f"{tag}找不到任何 mxCell"]
    ids = {}
    for c in cells:
        cid = c.get('id')
        if cid in ids:
            iss.append(f"{tag}重複 id:{cid}")
        if cid in JS_RESERVED_IDS:
            iss.append(f"{tag}id「{cid}」為 JS 內建屬性名,draw.io 開檔會"
                       f"報 setId is not a function,須改名")
        ids[cid] = c
    if '0' not in ids or '1' not in ids:
        iss.append(f"{tag}缺少 draw.io 必備根節點 id=0 / id=1")
    for c in cells:
        cid = c.get('id')
        for end in ('source', 'target'):
            ref = c.get(end)
            if ref and ref not in ids:
                iss.append(f"{tag}連線 {cid} 的 {end} 不存在:{ref}")
        if c.get('vertex') == '1' and c.find('mxGeometry') is None:
            iss.append(f"{tag}頂點 {cid} 缺少 mxGeometry")
        if c.get('edge') == '1' and c.find('mxGeometry') is None:
            iss.append(f"{tag}連線 {cid} 缺少 mxGeometry(自閉合邊在 draw.io 不會渲染)")
        # 順序流方向性:實線流程邊(非 dashed 關連/訊息流)必須有可見箭頭。
        # draw.io 對帶自訂 edgeStyle 的邊,若 style 未顯式寫 endArrow 會渲染成
        # 無箭頭——順序流因此看不出方向(20260710.04 修)。
        if c.get('edge') == '1':
            stl = c.get('style', '')
            is_dashed = 'dashed=1' in stl
            if not is_dashed:
                import re as _re
                mt = _re.search(r'endArrow=([A-Za-z]+)', stl)
                if mt is None or mt.group(1) == 'none':
                    iss.append(f"{tag}順序流 {cid} 缺少箭頭方向(style 未指定 "
                               f"endArrow 或為 none;流程線必須顯示方向)")
    # 版面再驗(對齊 .bpmn 的 DI 再驗):框架 cell(dio_ 前綴的 pool/lane/band/
    # 標題/底線)依設計與內容重疊,排除;只驗流程節點。
    def _box(c):
        g = c.find('mxGeometry')
        try:
            return (float(g.get('x', '0')), float(g.get('y', '0')),
                    float(g.get('width', 'nan')), float(g.get('height', 'nan')))
        except (TypeError, ValueError):
            return None
    nodes2 = {c.get('id'): _box(c) for c in cells
              if c.get('vertex') == '1' and not c.get('id', '').startswith('dio_')
              and _box(c) and not any(v != v for v in _box(c))}
    bnd2 = {c.get('id') for c in cells
            if 'outline=boundInt' in c.get('style', '')
            or 'outline=boundNonint' in c.get('style', '')}
    keys2 = sorted(nodes2)
    for a in range(len(keys2)):
        for b in range(a + 1, len(keys2)):
            if keys2[a] in bnd2 or keys2[b] in bnd2:
                continue    # 邊界事件貼附宿主,重疊為 BPMN 慣例
            if _boxes_overlap(nodes2[keys2[a]], nodes2[keys2[b]]):
                iss.append(f"{tag}節點框重疊:{keys2[a]} ↔ {keys2[b]}")
    for c in cells:
        if c.get('edge') != '1':
            continue
        pts = [(float(p.get('x')), float(p.get('y')))
               for arr in c.findall('mxGeometry/Array')
               for p in arr.findall('mxPoint') if p.get('x') and p.get('y')]
        if len(pts) < 2:
            continue                      # 無中間 waypoint 的邊由 draw.io 自動繞線
        ends = {c.get('source'), c.get('target')}
        for nid, box in nodes2.items():
            if nid in ends:
                continue
            if any(_seg_hits_box(pts[k], pts[k + 1], box)
                   for k in range(len(pts) - 1)):
                eid2 = c.get('id') or ""
                if eid2.startswith('dio_mf_'):
                    continue    # 訊息流跨 pool 飛越屬慣例,不列穿框
                if nid in bnd2:
                    continue    # 邊界事件貼宿主豁免
                iss.append(f"{tag}連線 {eid2} 穿過節點 {nid}")
    return iss


def layout_score(iss, notes):
    """版面可讀性評分。權重表與 bpmn_builder.layout_score 共用
    (穿越 20、斜線 15、交叉 10、重疊 5);本工具只計入自身可偵測的類別
    (builder 端另有連線重合、標籤碰撞等專屬類別)。越低越好,0 = 無缺陷;
    僅適合比較同一張圖的不同版面變體。"""
    msgs = list(iss) + list(notes)
    through = sum(1 for m in msgs if "穿過節點" in m)
    cross = sum(1 for m in msgs if "連線交叉" in m)
    slant = sum(1 for m in msgs if "斜線" in m)
    olap = sum(1 for m in msgs if "節點框重疊" in m)
    return (20 * through + 10 * cross + 15 * slant + 5 * olap,
            f"穿越×{through}、交叉×{cross}、斜線×{slant}、重疊×{olap}")


def _check_one(f):
    """驗證並行 worker:單一檔案完整檢查,回傳輸出行與是否通過。"""
    lines = []
    if f.endswith('.svg'):
        iss, notes = check_svg_preview(f)
        lines.append(("OK   " if not iss else "FAIL ")
                     + os.path.basename(f) + "(SVG 預覽檢查)")
    else:
        if f.endswith('.drawio'):
            iss, notes = check_drawio(f)
        else:
            iss, notes = check(f)
        lines.append(("OK   " if not iss else "FAIL ") + os.path.basename(f))
    for i in iss:  lines.append("   ✗ " + str(i))
    for nt in notes: lines.append("   • " + str(nt))
    ok = not iss
    if not f.endswith('.svg'):
        miss = check_deliverables(f)
        if miss:
            lines.append("FAIL " + os.path.basename(f) + "(交付完整性)")
            for i in miss: lines.append("   ✗ " + str(i))
            ok = False
    return f, lines, ok, iss, notes


def main():
    show_score = "--score" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--score"]
    todo = [f for f in files(args) if not f.endswith('.svg')] + svg_files(args)
    # 逐檔串行(20260710.08:移除逐檔多進程並行,理由同 builder 端——
    # 實測 validate 秒級,並行收益近零)。
    results = [_check_one(f) for f in todo]
    ok = True
    for f, lines, fok, iss, notes in results:
        for ln in lines: print(ln)
        if show_score and not f.endswith('.svg'):
            sc, detail = layout_score(iss, notes)
            print(f"   評分 {sc}({detail};越低越好,限同圖變體比較)")
        ok = ok and fok
    print("\n=> 全數通過 BPMN 2.0 與 SVG 預覽檢查" if ok else "\n=> 發現問題,請修正")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
