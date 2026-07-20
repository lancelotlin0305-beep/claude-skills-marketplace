# -*- coding: utf-8 -*-
"""bpmn_import:反向解析與差異比對(迭代同步用)。

使用者上傳「修改過的 .md 或 .bpmn」時,以本工具:
  1. 解析上傳檔 → 標準結構(canon)
  2. 與上一版(舊 .bpmn / 舊 .md / 現行 Proc・Collab 物件)比對 → 差異清單
  3. 依差異分類(結構/文字)建議下一版號
差異清單先交使用者確認,確認後才把變更套回 _流程定義.py 重產全部交付物。

CLI:
  python3 bpmn_import.py show <檔.bpmn|檔.md>          # 印出解析後結構
  python3 bpmn_import.py diff <舊檔> <新檔>            # 印差異清單+建議版號

標準結構(canon):
  {"name": 圖名, "version": "V01.00"或None,
   "pools": [ {"pid","name","lanes":[...],
               "nodes": {key: {"id"或None,"t","name","lane","kind"}},
               "flows": [(src_name, tgt_name, label)],
               "bands": [(band名, [節點name,...])]} ],
   "mflows": [(src_name, tgt_name, label)]}
節點 key:.bpmn 用節點 id;.md 無 id,用節點名稱。比對一律以「名稱」為鍵,
故同 pool 內節點名稱不可重複(builder 慣例本就如此)。
"""
import os, re, sys
import xml.etree.ElementTree as ET

NS = {"bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
      "bpmndi": "http://www.omg.org/spec/BPMN/20100524/DI",
      "dc": "http://www.omg.org/spec/DD/20100524/DC"}

_VER_RE = re.compile(r"(V\d{2}\.\d{2})")


def _ver_from(path_or_title):
    m = _VER_RE.search(path_or_title or "")
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# .bpmn → canon
# ---------------------------------------------------------------------------
def parse_bpmn(path):
    tree = ET.parse(path)
    root = tree.getroot()
    # 節點座標(DI):供 group(bands)成員還原
    shape_bounds = {}
    for sh in root.iter(f'{{{NS["bpmndi"]}}}BPMNShape'):
        b = sh.find(f'{{{NS["dc"]}}}Bounds')
        if b is not None:
            shape_bounds[sh.get("bpmnElement")] = (
                float(b.get("x")), float(b.get("y")),
                float(b.get("width")), float(b.get("height")))
    # category id → 分區名稱
    catval = {}
    for cat in root.findall(f'{{{NS["bpmn"]}}}category'):
        for cv in cat.findall(f'{{{NS["bpmn"]}}}categoryValue'):
            catval[cv.get("id")] = cv.get("value", "")
    # participant 名稱(pool 顯示名)
    part_name = {}
    for col in root.findall(f'{{{NS["bpmn"]}}}collaboration'):
        for p in col.findall(f'{{{NS["bpmn"]}}}participant'):
            part_name[p.get("processRef")] = p.get("name", "")
    pools = []
    node_pool = {}          # node name → pool 名(訊息流顯示用)
    id2name = {}
    for proc in root.findall(f'{{{NS["bpmn"]}}}process'):
        pid = proc.get("id")
        pname = part_name.get(pid, proc.get("name", pid))
        lanes, lane_of = [], {}
        for ls in proc.findall(f'{{{NS["bpmn"]}}}laneSet'):
            for ln in ls.findall(f'{{{NS["bpmn"]}}}lane'):
                idx = len(lanes)
                lanes.append(ln.get("name", ""))
                for ref in ln.findall(f'{{{NS["bpmn"]}}}flowNodeRef'):
                    lane_of[ref.text.strip()] = idx
        nodes, flows = {}, []
        for el in proc:
            tag = el.tag.split("}")[-1]
            if tag in ("laneSet", "group"):
                continue
            if tag == "sequenceFlow":
                flows.append((el.get("sourceRef"), el.get("targetRef"),
                              el.get("name", "") or ""))
                continue
            if tag.endswith("Gateway"):
                t, kind = "gateway", tag[:-len("Gateway")].lower()
            elif tag == "startEvent":
                t, kind = "start", ""
            elif tag == "endEvent":
                t, kind = "end", ""
            else:                      # task / userTask / serviceTask ... 一律視為 task
                t, kind = "task", ""
            nid, nm = el.get("id"), el.get("name", "") or ""
            nodes[nid] = dict(id=nid, t=t, name=nm,
                              lane=lane_of.get(nid), kind=kind)
            id2name[nid] = nm
            node_pool[nm] = pname
        # bands:group DI 的 y 範圍涵蓋哪些節點
        bands = []
        for grp in proc.findall(f'{{{NS["bpmn"]}}}group'):
            gname = catval.get(grp.get("categoryValueRef"), "")
            gb = shape_bounds.get(grp.get("id"))
            if not gb:
                continue
            gy0, gy1 = gb[1], gb[1] + gb[3]
            members = [n["name"] for n in nodes.values()
                       if n["id"] in shape_bounds
                       and gy0 - 1 <= shape_bounds[n["id"]][1] <= gy1 + 1]
            bands.append((gname, sorted(members)))
        pools.append(dict(
            pid=pid, name=pname, lanes=lanes,
            nodes={n["name"]: n for n in nodes.values()},
            flows=[(id2name.get(s, s), id2name.get(t, t), lab)
                   for s, t, lab in flows],
            bands=bands))
    mflows = []
    for col in root.findall(f'{{{NS["bpmn"]}}}collaboration'):
        for mf in col.findall(f'{{{NS["bpmn"]}}}messageFlow'):
            mflows.append((id2name.get(mf.get("sourceRef"), mf.get("sourceRef")),
                           id2name.get(mf.get("targetRef"), mf.get("targetRef")),
                           mf.get("name", "") or ""))
    col = root.find(f'{{{NS["bpmn"]}}}collaboration')
    name = (col is not None and col.get("name")) or \
        (pools[0]["name"] if len(pools) == 1 else "")
    return dict(name=name, version=_ver_from(os.path.basename(path)),
                pools=pools, mflows=mflows)


# ---------------------------------------------------------------------------
# 產出的 .md → canon(僅支援本 skill 產生的固定章節格式)
# ---------------------------------------------------------------------------
_STEP_RE = re.compile(r"^\d+\.\s+\*\*(.+?)\*\*(?:\((.+?)\))?\s*$")
_FLOW_RE = re.compile(r"^-\s+(.+?)\s+(?:—\[(.+?)\]→|→)\s+(.+)$")
_MF_RE = re.compile(r"^-\s+(.+?)\s+(?:⇢\[(.+?)\]⇢|⇢)\s+(.+)$")
_TYPE2T = {"起始事件": ("start", ""), "結束事件": ("end", ""), "任務": ("task", ""),
           "排他閘道": ("gateway", "exclusive"), "平行閘道": ("gateway", "parallel"),
           "包容閘道": ("gateway", "inclusive"), "決策閘道": ("gateway", "exclusive")}


def parse_md(path):
    lines = open(path, encoding="utf-8").read().splitlines()
    name, version = "", None
    pools, mflows = [], []
    cur, section = None, None

    def new_pool(pname):
        p = dict(pid=None, name=pname, lanes=[], nodes={}, flows=[], bands=[])
        pools.append(p)
        return p

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(">"):
            continue
        if line.startswith("# Pool:"):
            cur = new_pool(line[len("# Pool:"):].strip())
            section = None
            continue
        if line.startswith("# ") and not name:
            title = line[2:].strip()
            version = _ver_from(title)
            name = _VER_RE.sub("", title).strip()
            continue
        if line.startswith("## "):
            section = line[3:].strip()
            if section.startswith("角色") and cur is None:
                cur = new_pool(name)          # 單 pool:.md 沒有 Pool 標題
            continue
        if section is None or (cur is None and not section.startswith("跨 Pool")):
            continue
        if section.startswith("角色"):
            m = re.match(r"^\d+\.\s+(.*)$", line)
            if m:
                cur["lanes"].append(m.group(1).strip())
        elif section.startswith("流程步驟"):
            m = _STEP_RE.match(line)
            if m:
                nm, meta = m.group(1).strip(), m.group(2) or ""
                typ, role = "任務", None
                mm = re.match(r"^(.+?)\|角色:(.+)$", meta)
                if mm:
                    typ, role = mm.group(1).strip(), mm.group(2).strip()
                t, kind = _TYPE2T.get(typ, ("task", ""))
                lane = cur["lanes"].index(role) if role in cur["lanes"] else None
                cur["nodes"][nm] = dict(id=None, t=t, name=nm, lane=lane, kind=kind)
        elif section.startswith("流程連線"):
            m = _FLOW_RE.match(line)
            if m:
                cur["flows"].append((m.group(1).strip(), m.group(3).strip(),
                                     (m.group(2) or "").strip()))
        elif section.startswith("橫向系統分區"):
            m = re.match(r"^-\s+\*\*(.+?)\*\*[:：](.*)$", line)
            if m:
                cur["bands"].append((m.group(1).strip(),
                                     sorted(x.strip() for x in
                                            m.group(2).split("、") if x.strip())))
        elif section.startswith("跨 Pool"):
            m = _MF_RE.match(line)
            if m:
                mflows.append((m.group(1).strip(), m.group(3).strip(),
                               (m.group(2) or "").strip()))
        # 「決策點」章節為連線的摘要視圖,不重複解析
    return dict(name=name, version=version, pools=pools, mflows=mflows)


def parse(path):
    return parse_bpmn(path) if path.endswith(".bpmn") else parse_md(path)


def from_obj(x):
    """現行 Proc / Collab 物件 → canon(供「舊 .py 基準 vs 上傳檔」比對)。"""
    from bpmn_builder import Collab
    pools = x.pools if isinstance(x, Collab) else [x]
    mfl = x.mflows if isinstance(x, Collab) else []
    id2name = {n["id"]: n["name"] for p in pools for n in p.nodes.values()}
    cpools = []
    for p in pools:
        cpools.append(dict(
            pid=p.pid, name=p.name, lanes=list(p.lanes),
            nodes={n["name"]: dict(id=n["id"], t=n["t"], name=n["name"],
                                   lane=n["lane"], kind=n.get("kind", ""))
                   for n in p.nodes.values()},
            flows=[(id2name[s], id2name[t], lab) for _f, s, t, lab, _r in p.flows],
            bands=[(bn, sorted(id2name[i] for i in ids if i in id2name))
                   for bn, ids in p.bands]))
    return dict(name=x.name, version=x.version, pools=cpools,
                mflows=[(id2name.get(s, s), id2name.get(t, t), lab)
                        for _m, s, t, lab in mfl])


# ---------------------------------------------------------------------------
# 差異比對:回傳 (差異清單, 分類)  分類 ∈ {"none","text","structural"}
# ---------------------------------------------------------------------------
def _flow_set(flows):
    return {(s, t): lab for s, t, lab in flows}


def _diff_pool(old, new, out):
    tag = f"[{new['name']}] " if new.get("name") else ""
    structural = text = False
    if old["lanes"] != new["lanes"]:
        if sorted(old["lanes"]) == sorted(new["lanes"]):
            out.append(f"{tag}泳道順序調整:{old['lanes']} → {new['lanes']}")
        else:
            out.append(f"{tag}泳道變更:{old['lanes']} → {new['lanes']}")
        structural = True
    onames, nnames = set(old["nodes"]), set(new["nodes"])
    removed, added = onames - nnames, nnames - onames
    # 更名偵測:被移除與新增的節點若「型別相同且上下游鄰接一致」→ 視為更名(文字變更)
    o_adj = {}
    for s, t, _ in old["flows"]:
        o_adj.setdefault(s, set()).add(("out", t)); o_adj.setdefault(t, set()).add(("in", s))
    n_adj = {}
    for s, t, _ in new["flows"]:
        n_adj.setdefault(s, set()).add(("out", t)); n_adj.setdefault(t, set()).add(("in", s))
    renames = {}
    for r in sorted(removed):
        for a in sorted(added - set(renames.values())):
            if old["nodes"][r]["t"] != new["nodes"][a]["t"]:
                continue
            ra = {(d, x) for d, x in o_adj.get(r, set()) if x not in removed}
            aa = {(d, x) for d, x in n_adj.get(a, set()) if x not in added}
            if ra and ra == aa:
                renames[r] = a
                break
    for r, a in renames.items():
        out.append(f"{tag}節點更名:「{r}」→「{a}」")
        text = True
    removed -= set(renames)
    added -= set(renames.values())
    for r in sorted(removed):
        out.append(f"{tag}移除節點:「{r}」({old['nodes'][r]['t']})")
        structural = True
    for a in sorted(added):
        n = new["nodes"][a]
        lane = new["lanes"][n["lane"]] if n["lane"] is not None and \
            n["lane"] < len(new["lanes"]) else "?"
        out.append(f"{tag}新增節點:「{a}」({n['t']}|泳道:{lane})")
        structural = True
    ren = lambda nm: renames.get(nm, nm)
    for nm in sorted(onames & nnames):
        o, n = old["nodes"][nm], new["nodes"][nm]
        if o["t"] != n["t"] or (o["t"] == "gateway" and o["kind"] and
                                n["kind"] and o["kind"] != n["kind"]):
            out.append(f"{tag}節點「{nm}」型別/閘道種類變更:"
                       f"{o['t']}{o['kind'] and '('+o['kind']+')' or ''} → "
                       f"{n['t']}{n['kind'] and '('+n['kind']+')' or ''}")
            structural = True
        if o["lane"] is not None and n["lane"] is not None and o["lane"] != n["lane"]:
            ol = old["lanes"][o["lane"]] if o["lane"] < len(old["lanes"]) else "?"
            nl = new["lanes"][n["lane"]] if n["lane"] < len(new["lanes"]) else "?"
            if ol != nl:
                out.append(f"{tag}節點「{nm}」泳道異動:{ol} → {nl}")
                structural = True
    of = {(ren(s), ren(t)): lab for s, t, lab in old["flows"]}
    nf = _flow_set(new["flows"])
    for k in sorted(set(of) - set(nf)):
        out.append(f"{tag}移除連線:{k[0]} → {k[1]}")
        structural = True
    for k in sorted(set(nf) - set(of)):
        lab = f"(標籤「{nf[k]}」)" if nf[k] else ""
        out.append(f"{tag}新增連線:{k[0]} → {k[1]} {lab}".rstrip())
        structural = True
    for k in sorted(set(of) & set(nf)):
        if of[k] != nf[k]:
            out.append(f"{tag}連線標籤變更 {k[0]}→{k[1]}:"
                       f"「{of[k]}」→「{nf[k]}」")
            text = True
    ob = {bn: ids for bn, ids in old["bands"]}
    nb = {bn: [ren(i) for i in ids] for bn, ids in new["bands"]}
    ob = {bn: sorted(ren(i) for i in ids) for bn, ids in ob.items()}
    nb = {bn: sorted(ids) for bn, ids in nb.items()}
    if ob != nb:
        out.append(f"{tag}橫向系統分區變更:{ob} → {nb}")
        structural = True
    return structural, text


def diff(old, new):
    out, structural, text = [], False, False
    if old["name"] != new["name"] and old["name"] and new["name"]:
        out.append(f"圖名變更:「{old['name']}」→「{new['name']}」")
        text = True
    opools = {p["name"]: p for p in old["pools"]}
    npools = {p["name"]: p for p in new["pools"]}
    if len(old["pools"]) == len(new["pools"]) == 1:
        opools = {"_": old["pools"][0]}
        npools = {"_": new["pools"][0]}
    for pn in sorted(set(opools) - set(npools)):
        out.append(f"移除 Pool:「{pn}」")
        structural = True
    for pn in sorted(set(npools) - set(opools)):
        out.append(f"新增 Pool:「{pn}」")
        structural = True
    for pn in sorted(set(opools) & set(npools)):
        s, t = _diff_pool(opools[pn], npools[pn], out)
        structural |= s
        text |= t
    omf, nmf = _flow_set(old["mflows"]), _flow_set(new["mflows"])
    for k in sorted(set(omf) - set(nmf)):
        out.append(f"移除訊息流:{k[0]} ⇢ {k[1]}")
        structural = True
    for k in sorted(set(nmf) - set(omf)):
        out.append(f"新增訊息流:{k[0]} ⇢ {k[1]}")
        structural = True
    for k in sorted(set(omf) & set(nmf)):
        if omf[k] != nmf[k]:
            out.append(f"訊息流標籤變更 {k[0]}⇢{k[1]}:「{omf[k]}」→「{nmf[k]}」")
            text = True
    kind = "structural" if structural else ("text" if text else "none")
    return out, kind


def suggest_version(old_version, kind):
    from bpmn_builder import bump_version
    if not old_version:
        return "V01.00"
    if kind == "none":
        return old_version
    return bump_version(old_version, kind == "structural")


def _show(canon):
    print(f"圖名:{canon['name']}  版號:{canon['version'] or '(未知)'}")
    for p in canon["pools"]:
        print(f"Pool:{p['name']}  泳道:{p['lanes']}")
        for nm, n in p["nodes"].items():
            k = f"({n['kind']})" if n["kind"] else ""
            print(f"  - {n['t']}{k}「{nm}」 lane={n['lane']}")
        for s, t, lab in p["flows"]:
            print(f"  → {s} -[{lab}]-> {t}" if lab else f"  → {s} -> {t}")
        for bn, ids in p["bands"]:
            print(f"  band「{bn}」:{ids}")
    for s, t, lab in canon["mflows"]:
        print(f"  ⇢ {s} ⇢[{lab}]⇢ {t}" if lab else f"  ⇢ {s} ⇢ {t}")


def main(argv):
    if len(argv) >= 2 and argv[0] == "show":
        _show(parse(argv[1]))
        return 0
    if len(argv) >= 3 and argv[0] == "diff":
        old, new = parse(argv[1]), parse(argv[2])
        items, kind = diff(old, new)
        zh = {"none": "無差異", "text": "僅文字變更", "structural": "結構變更"}
        print(f"差異分類:{zh[kind]}")
        for it in items:
            print(" -", it)
        print("建議版號:", suggest_version(old["version"], kind),
              f"(上一版 {old['version'] or '未知'})")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
