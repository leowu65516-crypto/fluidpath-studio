import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createNode, NODE_DEFS, NodeSymbol, resolveSymbolProfile } from "../symbols";
import { parseDiagramJSON } from "../export";

function engineeringMarkup(type: typeof NODE_DEFS[number]["type"]) {
  return renderToStaticMarkup(<svg><NodeSymbol node={createNode(type, 0, 0)} profile="engineering" surface="preview" /></svg>);
}

describe("symbol profiles", () => {
  it("keeps a historical diagram on teaching symbols when the new field is absent", () => {
    const legacy = parseDiagramJSON(JSON.stringify({
      id: "legacy-symbol-profile",
      name: "Legacy",
      nodes: [createNode("pump", 0, 0, "Pump")],
      pipes: [],
      settings: { showGrid: true, background: "#ffffff", globalAnimationPlaying: false },
    }));

    expect(legacy.settings.symbolProfile).toBeUndefined();
    expect(resolveSymbolProfile(legacy.settings.symbolProfile)).toBe("teaching");
    const markup = renderToStaticMarkup(<svg><NodeSymbol node={legacy.nodes[0]} profile={legacy.settings.symbolProfile} /></svg>);
    expect(markup).not.toContain("data-symbol-feature=\"pump\"");
  });

  it("renders every registered component in the engineering profile", () => {
    for (const def of NODE_DEFS) {
      const markup = engineeringMarkup(def.type);
      expect(markup, `${def.type} should render`).toContain("<");
    }
  });

  it("uses structural markers for the priority confusion pairs", () => {
    expect(engineeringMarkup("safetyValve")).toContain("safety-spring");
    expect(engineeringMarkup("opv")).toContain("opv-relief");
    expect(engineeringMarkup("pressureGauge")).toContain(">PI<");
    expect(engineeringMarkup("pressureSwitch")).toContain(">PS<");
    expect(engineeringMarkup("hotWaterWand")).toContain("hot-water-wand");
    expect(engineeringMarkup("steamWand")).toContain("steam-wand");
    expect(engineeringMarkup("coffeeOutlet")).toContain("coffee-outlet");
    expect(engineeringMarkup("milkOutlet")).toContain("milk-outlet");
    expect(engineeringMarkup("hotWaterOutlet")).toContain("hotWater-outlet");
  });

  it("does not expose internal A/B selector slots as physical port labels", () => {
    const selector = createNode("diaphragmValve3", 0, 0);
    const markup = renderToStaticMarkup(<svg><NodeSymbol node={selector} profile="engineering" /></svg>);
    expect(markup).toContain(">P1<");
    expect(markup).toContain("active-selector-route");
    expect(markup).not.toContain(">A<");
    expect(markup).not.toContain(">B<");
  });

  it("round-trips an explicit engineering selection without changing diagram data", () => {
    const original = {
      id: "engineering-symbol-profile",
      name: "Engineering",
      nodes: [createNode("pressureRegulator", 0, 0)],
      pipes: [],
      settings: { showGrid: true, background: "#ffffff", globalAnimationPlaying: false, symbolProfile: "engineering" },
    };
    const loaded = parseDiagramJSON(JSON.stringify(original));
    expect(loaded.settings.symbolProfile).toBe("engineering");
    expect(loaded.nodes[0].ports).toEqual(original.nodes[0].ports);
    expect(loaded.nodes[0].valveState).toEqual(original.nodes[0].valveState);
  });
});

describe("engineering symbols v2：管路件与容器线条化", () => {
  const eng = (type: typeof NODE_DEFS[number]["type"], zoom = 1) =>
    renderToStaticMarkup(<svg><NodeSymbol node={createNode(type, 0, 0)} profile="engineering" surface="canvas" zoom={zoom} /></svg>);

  it("三通/四通/弯头用端口线条，不再出现 TE/CR 字母框", () => {
    for (const type of ["tee", "teeY", "teeF", "cross", "elbow"] as const) {
      const markup = eng(type);
      expect(markup, type).toContain("data-symbol-feature=\"junction-");
      expect(markup, type).not.toContain(">TE<");
      expect(markup, type).not.toContain(">CR<");
    }
  });

  it("接头与连接件有形状，connector 不再是空框", () => {
    expect(eng("coupling")).toContain("data-symbol-feature=\"coupling\"");
    expect(eng("metalCoupling")).toContain("coupling-metal");
    expect(eng("connector")).toContain("data-symbol-feature=\"connector\"");
    expect(eng("connector")).toContain("<circle");
  });

  it("容器族改用罐体 + 液位线，不再是 TA/SYR/BR 字母框", () => {
    expect(eng("tank")).toContain("vessel-tank");
    expect(eng("pressureTank")).toContain("vessel-pressureTank");
    expect(eng("syrupBottle")).toContain("vessel-syrupBottle");
    expect(eng("brewChamber")).toContain("vessel-brewChamber");
    for (const m of [eng("tank"), eng("syrupBottle")]) {
      expect(m).not.toMatch(/>TA</);
      expect(m).not.toMatch(/>SYR</);
    }
  });

  it("进出口用箭头表达，不再是 IN/OUT 字母框", () => {
    expect(eng("inlet")).toContain("port-in");
    expect(eng("outlet")).toContain("port-out");
    expect(eng("inlet")).not.toContain(">IN<");
    expect(eng("outlet")).not.toContain(">OUT<");
  });

  it("线宽随缩放补偿：27% 时描边明显加粗，100% 时保持原值", () => {
    const widthAt = (markup: string) => {
      const m = markup.match(/stroke-width="([0-9.]+)"/);
      return m ? Number(m[1]) : 0;
    };
    const base = widthAt(eng("tee", 1));
    const small = widthAt(eng("tee", 0.27));
    expect(base).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(base * 2.5);
    // 上限 3 倍，避免 100% 时线变得过粗
    expect(widthAt(eng("tee", 0.1))).toBeLessThanOrEqual(base * 3 + 0.001);
  });
});
