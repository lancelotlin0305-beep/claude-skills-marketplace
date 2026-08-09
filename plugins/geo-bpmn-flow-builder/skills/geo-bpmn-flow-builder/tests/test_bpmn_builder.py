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
