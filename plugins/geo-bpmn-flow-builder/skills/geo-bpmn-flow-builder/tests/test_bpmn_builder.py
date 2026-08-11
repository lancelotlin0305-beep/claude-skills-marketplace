# -*- coding: utf-8 -*-
"""geo-bpmn-flow-builder 最小回歸測試套件。

把 CHANGELOG 長年的人工「回歸 5 範例、md5 一致」變成可重跑的自動化守護:
  - 單元:_ncname / bump_version / _clean / _safe_stem / 幾何 _boxes_overlap
  - 不變量(最高 CP):reference/example_process.py 五範例 emit 後鐵則硬傷 = 0
  - 良構:五範例 build_bpmn/build_drawio/build_svg 皆為合法 XML
  - 安全:惡意名稱(引號/控制字元/&/<)三輸出仍良構、控制字元被濾
  - 往返:emit→drawio_import/bpmn_import 解析,節點集合一致

執行(兩種皆可):
  python3 test_bpmn_builder.py       # 內建 runner,印通過/失敗統計
  pytest test_bpmn_builder.py        # 若有裝 pytest
"""
import os
import sys
import importlib.util
import xml.dom.minidom as minidom

_HERE = os.path.dirname(os.path.abspath(__file__))
_SKILL = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_SKILL, "scripts"))

import bpmn_builder as B  # noqa: E402


def _load_examples():
    path = os.path.join(_SKILL, "reference", "example_process.py")
    spec = importlib.util.spec_from_file_location("example_process", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_EX = _load_examples()
_BUILDS = sorted(n for n in dir(_EX) if n.startswith("build_"))


# ---------------------------------------------------------------------------
# 單元:純函式
# ---------------------------------------------------------------------------
def test_ncname_reserved_renamed():
    # JS 內建屬性名不可作 draw.io id,須被改成確定性安全名
    for bad in ("fill", "map", "push", "length", "constructor"):
        out = B._ncname(bad)
        assert out != bad, f"{bad!r} 應被改名(撞 JS 內建)"
        assert out == B._ncname(bad), "改名須為確定性"


def test_ncname_chinese_to_ascii():
    out = B._ncname("開始節點")
    assert out and (out[0].isalpha() or out[0] == "_"), "須為合法 NCName 起首"
    assert all(ord(c) < 128 for c in out), "須全 ASCII"


def test_ncname_valid_kept():
    assert B._ncname("a_1") == "a_1"


def test_bump_version():
    assert B.bump_version("V01.00", True) == "V02.00"    # 結構→主版進位、次版歸零
    assert B.bump_version("V01.00", False) == "V01.01"   # 文字→次版進位
    assert B.bump_version("V01.09", False) == "V01.10"   # 次版無位數上限
    assert B.bump_version("V02.03", True) == "V03.00"


def test_bump_version_invalid_raises():
    bad_raised = False
    try:
        B.bump_version("v1", True)
    except Exception:
        bad_raised = True
    assert bad_raised, "非法版號格式應 raise"


def test_clean_strips_control_keeps_newline():
    s = "正常\x01文字\x07\n第二行\t欄"
    out = B._clean(s)
    assert "\x01" not in out and "\x07" not in out, "非法控制字元須濾除"
    assert "\n" in out and "\t" in out, "換行/tab 須保留"
    assert B._clean(None) == ""


def test_safe_stem_blocks_traversal():
    assert "/" not in B._safe_stem("../../etc/passwd")
    assert "\\" not in B._safe_stem(r"..\..\win")
    assert B._safe_stem("C:\\evil") not in ("", "C:\\evil")
    assert B._safe_stem("正常檔名") == "正常檔名", "中文須保留"
    assert B._safe_stem("") == "diagram", "空值須有預設"


def test_boxes_overlap():
    a = dict(x=0, y=0, w=100, h=50)
    b = dict(x=50, y=20, w=100, h=50)
    c = dict(x=200, y=200, w=10, h=10)
    assert B._boxes_overlap(a, b) is True
    assert B._boxes_overlap(a, c) is False


# ---------------------------------------------------------------------------
# 不變量:五範例鐵則硬傷 = 0(最高 CP 的版面回歸守護)
# ---------------------------------------------------------------------------
def _iron_violations(x):
    return B._iron_report(B.check_layout(x))[0]


def test_examples_no_iron_violations():
    for name in _BUILDS:
        x = getattr(_EX, name)()
        vio = _iron_violations(x)
        assert not vio, f"{name} 出現鐵則違規:{vio}"


def test_examples_outputs_wellformed():
    for name in _BUILDS:
        x = getattr(_EX, name)()
        for fmt, fn in (("bpmn", B.build_bpmn), ("drawio", B.build_drawio),
                        ("svg", B.build_svg)):
            xml = fn(x)
            minidom.parseString(xml)   # 非良構會 raise


# ---------------------------------------------------------------------------
# 安全:惡意名稱不破壞良構、控制字元被濾
# ---------------------------------------------------------------------------
def test_malicious_names_stay_wellformed():
    p = B.Proc("t", '標題"含&<x>', ['泳道"A'])
    p.add("a", "start", "開始", 0)
    p.add("b", "task", '惡意"名" & <tag>\x01\x07控制', 0)
    p.flow("a", "b", '標籤"&<')
    for fn in (B.build_bpmn, B.build_drawio, B.build_svg):
        out = fn(p)
        minidom.parseString(out)
        assert "\x01" not in out and "\x07" not in out, "控制字元須被濾除"


# ---------------------------------------------------------------------------
# 往返:emit → import 解析,節點集合一致
# ---------------------------------------------------------------------------
def test_roundtrip_drawio(tmp_path=None):
    import tempfile
    import drawio_import
    x = _EX.build_auto()
    ids = set(x.nodes)
    d = tmp_path or tempfile.mkdtemp()
    fp = os.path.join(str(d), "rt.drawio")
    with open(fp, "w", encoding="utf-8") as f:
        f.write(B.build_drawio_multi([x]))
    pages = drawio_import.parse_file(fp)
    got = set(pages[0]["nodes"])
    # drawio_import 以 _ncname 後的 id 還原;流程節點應全數對得上
    missing = {i for i in ids if B._ncname(i) not in got}
    assert not missing, f"往返後遺失節點:{missing}"


def test_roundtrip_bpmn(tmp_path=None):
    import tempfile
    import bpmn_import
    x = _EX.build_bands()
    flow_ct = sum(1 for n in x.nodes.values()
                  if n["t"] not in ("input", "output", "note"))
    d = tmp_path or tempfile.mkdtemp()
    fp = os.path.join(str(d), "rt.bpmn")
    with open(fp, "w", encoding="utf-8") as f:
        f.write(B.build_bpmn(x))
    canon = bpmn_import.parse_bpmn(fp)
    got = sum(len(pool["nodes"]) for pool in canon["pools"])
    assert got >= flow_ct, f"往返節點數不足:{got} < {flow_ct}"


# ---------------------------------------------------------------------------
# 無障礙 / 行動裝置(檢視器與 SVG)
# ---------------------------------------------------------------------------
def test_svg_has_aria_and_title():
    svg = B.build_svg(_EX.build_auto())
    assert 'role="img"' in svg and "aria-label=" in svg, "SVG 根須有 role/aria-label"
    assert "<title>" in svg, "SVG 須含 <title> 供螢幕閱讀器"


def test_viewer_touch_keyboard_aria():
    for html in (B.build_viewer_html(_EX.build_auto()),
                 B.build_viewer_html_multi([_EX.build_auto(), _EX.build_bands()],
                                           "多頁")):
        assert "pointerdown" in html and "pointermove" in html, "須支援 Pointer/觸控"
        assert "Math.hypot" in html, "須有雙指 pinch 距離計算"
        assert 'role="application"' in html and "tabindex" in html, "stage 須可鍵盤聚焦"
        assert "ArrowLeft" in html and "keydown" in html, "須支援鍵盤平移/縮放"
        assert 'aria-live="polite"' in html, "命中數須 aria-live 播報"


# ---------------------------------------------------------------------------
# 簡易模式(無泳道/無框)
# ---------------------------------------------------------------------------
def _simple_proc():
    p = B.Proc("s_test", "簡易流程", simple=True)
    p.add("s", "start", "開始")           # lane 可省略
    p.add("a", "task", "步驟一")
    p.add("gw", "gateway", "判斷?")
    p.add("b", "task", "步驟二")
    p.add("e", "end", "完成")
    p.flow("s", "a"); p.flow("a", "gw")
    p.flow("gw", "b", "是"); p.flow("gw", "e", "否"); p.flow("b", "e")
    return p


def test_simple_requires_no_lanes():
    p = _simple_proc()
    assert p.simple and p.lanes == [""], "簡易模式用單一隱藏泳道"


def test_simple_no_swimlane_chrome():
    svg = B.build_svg(_simple_proc())
    assert 'stroke="#9aa7b4" stroke-width="1.5"' not in svg, "簡易不應有 pool 外框"
    assert "rotate(-90" not in svg, "簡易不應有泳道標頭"
    assert "<title>" in svg, "仍保留 SVG title(無障礙)"


def test_simple_outputs_wellformed_and_clean():
    p = _simple_proc()
    for fn in (B.build_svg, B.build_drawio, B.build_bpmn):
        minidom.parseString(fn(p))
    assert not _iron_violations(p), "簡易模式仍須鐵則硬傷=0"


def test_non_simple_requires_lanes():
    raised = False
    try:
        B.Proc("x", "無泳道會報錯")   # 非 simple 又沒給 lanes
    except Exception:
        raised = True
    assert raised, "非簡易模式未給 lanes 應 raise"


# ---------------------------------------------------------------------------
# 橫式版面
# ---------------------------------------------------------------------------
def test_horizontal_simple_flows_left_to_right():
    p = B.Proc("h", "橫式", simple=True, horizontal=True)
    for nid, t, nm in [("s", "start", "開始"), ("a", "task", "一"),
                       ("b", "task", "二"), ("e", "end", "完成")]:
        p.add(nid, t, nm)
    p.flow("s", "a"); p.flow("a", "b"); p.flow("b", "e")
    B.check_layout(p)   # 觸發 _ensure 放置
    xs = [p.nodes[k]["x"] for k in ("s", "a", "b", "e")]
    assert xs == sorted(xs) and xs[0] < xs[-1], "橫式應由左往右遞增 x"
    ys = [p.nodes[k]["y"] for k in ("s", "a", "b", "e")]
    assert max(ys) - min(ys) < 40, "線性鏈應大致同一 y 帶"
    assert not _iron_violations(p)


def test_horizontal_lanes_wellformed_and_clean():
    p = B.Proc("hl", "橫式泳道", ["甲", "乙"], horizontal=True)
    p.add("s", "start", "開始", 0); p.add("a", "task", "甲步驟", 0)
    p.add("b", "task", "乙步驟", 1); p.add("e", "end", "完成", 0)
    p.flow("s", "a"); p.flow("a", "b"); p.flow("b", "e")
    svg = B.build_svg(p)
    minidom.parseString(svg); minidom.parseString(B.build_drawio(p))
    minidom.parseString(B.build_bpmn(p))
    assert p.nodes["b"]["y"] > p.nodes["a"]["y"], "不同泳道應落在不同 y 橫帶"
    assert not _iron_violations(p)


# ---------------------------------------------------------------------------
# 事件類型擴充(signal/link/cancel/multiple/parallelMultiple)
# ---------------------------------------------------------------------------
def _events_proc():
    # 線性鏈涵蓋 signal/link/multiple/parallelMultiple 於
    # start / 中間 catch / throw 各位置(cancel 邊界另見 _cancel_proc)
    p = B.Proc("ev", "事件示範", ["角色"])
    p.add("s", "signal", "信號起始", 0)            # signal start(無 incoming)
    p.add("t1", "task", "處理", 0)
    p.add("lk", "link", "連接", 0)                 # link 中間 catch
    p.add("mul", "multiple", "多重", 0)            # multiple 中間 catch
    p.add("pm", "parallelMultiple", "平行多重", 0)  # parallelMultiple 中間 catch
    p.add("thr", "signal", "擲信號", 0, kind="throw")   # signal throw
    p.add("e", "end", "完成", 0)
    p.flow("s", "t1"); p.flow("t1", "lk"); p.flow("lk", "mul")
    p.flow("mul", "pm"); p.flow("pm", "thr"); p.flow("thr", "e")
    return p


def _cancel_proc():
    # cancel 作交易子流程的邊界事件(其主要用途),導向專屬終止
    p = B.Proc("cx", "取消示範", ["角色"])
    p.add("s", "start", "開始", 0)
    p.add("txn", "task", "交易處理", 0, kind="subprocess")
    p.add("e", "end", "完成", 0)
    p.add("bnd", "cancel", "取消", 0, attach="txn")
    p.add("ce", "terminate", "已取消", 0)
    p.flow("s", "txn"); p.flow("txn", "e"); p.flow("bnd", "ce")
    return p


def test_new_events_outputs_wellformed():
    p = _events_proc()
    for fn in (B.build_svg, B.build_drawio, B.build_bpmn):
        minidom.parseString(fn(p))       # 三輸出皆合法 XML
    assert not _iron_violations(p), "新事件類型不得產生鐵則硬傷"
    # cancel 邊界路徑也須輸出合法 XML(佈局不在此斷言)
    for fn in (B.build_svg, B.build_drawio, B.build_bpmn):
        minidom.parseString(fn(_cancel_proc()))


def test_new_events_bpmn_definitions():
    bpmn = B.build_bpmn(_events_proc()) + B.build_bpmn(_cancel_proc())
    for ed in ("signalEventDefinition", "linkEventDefinition",
               "cancelEventDefinition"):
        assert ed in bpmn, f".bpmn 應含 {ed}"
    assert 'parallelMultiple="true"' in bpmn, "parallelMultiple 須標屬性"
    assert "multipleEventDefinition" not in bpmn, \
        "multiple 不可偽造不存在的 eventDefinition"


def test_new_events_drawio_symbols():
    dio = B.build_drawio(_events_proc()) + B.build_drawio(_cancel_proc())
    for sym in ("symbol=signal", "symbol=link", "symbol=cancel",
                "symbol=multiple", "symbol=parallelMultiple"):
        assert sym in dio, f".drawio 應含 {sym}"


def test_signal_start_not_orphan():
    # signal 起始事件(無 incoming)不應被判為孤兒、且整體語意乾淨
    sem = B.check_semantics(_events_proc())
    assert not any("孤兒" in i for i in sem), f"signal 起始誤判孤兒:{sem}"


# ---------------------------------------------------------------------------
# 內建 runner(免 pytest)
# ---------------------------------------------------------------------------
def _run():
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    passed, failed = 0, []
    for t in tests:
        try:
            t()
            passed += 1
            print(f"  PASS  {t.__name__}")
        except Exception as e:
            failed.append((t.__name__, e))
            print(f"  FAIL  {t.__name__}: {e}")
    print(f"\n{passed}/{passed + len(failed)} 通過")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
