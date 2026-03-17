import { describe, expect, it } from "vitest";
import { parseFormula } from "@signalforge/dsl-core";
import { inferMethodologyTags } from "../summarize-tags.js";

function tags(input: string) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return inferMethodologyTags(ast);
}

describe("inferMethodologyTags", () => {
  describe("momentum", () => {
    it("tags ret_252d as momentum", () => {
      expect(tags("ret_252d")).toContain("momentum");
    });

    it("tags ret_126d as momentum", () => {
      expect(tags("ret_126d")).toContain("momentum");
    });

    it("tags mom_12m as momentum", () => {
      expect(tags("mom_12m")).toContain("momentum");
    });

    it("tags ret_63d as momentum", () => {
      expect(tags("ret_63d")).toContain("momentum");
    });
  });

  describe("mean-reversion", () => {
    it("tags ret_1d as mean-reversion", () => {
      expect(tags("ret_1d")).toContain("mean-reversion");
    });

    it("tags ret_5d as mean-reversion", () => {
      expect(tags("ret_5d")).toContain("mean-reversion");
    });

    it("tags ret_20d as mean-reversion", () => {
      expect(tags("ret_20d")).toContain("mean-reversion");
    });
  });

  describe("volatility", () => {
    it("tags vol_20d as volatility", () => {
      expect(tags("vol_20d")).toContain("volatility");
    });

    it("tags vol_60d as volatility", () => {
      expect(tags("vol_60d")).toContain("volatility");
    });

    it("tags vol_126d as volatility", () => {
      expect(tags("vol_126d")).toContain("volatility");
    });

    it("tags beta_60d as volatility", () => {
      expect(tags("beta_60d")).toContain("volatility");
    });
  });

  describe("liquidity", () => {
    it("tags dollar_volume_20d as liquidity", () => {
      expect(tags("dollar_volume_20d")).toContain("liquidity");
    });

    it("tags dollar_volume_60d as liquidity", () => {
      expect(tags("dollar_volume_60d")).toContain("liquidity");
    });
  });

  describe("multi-factor", () => {
    it("tags momentum + volatility as multi-factor", () => {
      const result = tags("ret_252d + vol_20d");
      expect(result).toContain("momentum");
      expect(result).toContain("volatility");
      expect(result).toContain("multi-factor");
    });

    it("tags mean-reversion + liquidity as multi-factor", () => {
      const result = tags("ret_1d / dollar_volume_20d");
      expect(result).toContain("mean-reversion");
      expect(result).toContain("liquidity");
      expect(result).toContain("multi-factor");
    });

    it("does NOT tag single-family as multi-factor", () => {
      const result = tags("ret_252d + mom_12m");
      expect(result).not.toContain("multi-factor");
    });
  });

  describe("ordering", () => {
    it("returns tags in canonical order", () => {
      const result = tags("ret_252d + vol_20d + dollar_volume_20d");
      const indices = result.map((t) => {
        const order = [
          "momentum",
          "value",
          "volatility",
          "quality",
          "liquidity",
          "size",
          "multi-factor",
          "mean-reversion",
          "trend",
        ];
        return order.indexOf(t);
      });
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
      }
    });
  });

  describe("pure arithmetic", () => {
    it("returns empty for pure numeric expressions", () => {
      const result = tags("42");
      expect(result).toHaveLength(0);
    });
  });
});
