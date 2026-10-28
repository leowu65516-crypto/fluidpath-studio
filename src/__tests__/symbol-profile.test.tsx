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
