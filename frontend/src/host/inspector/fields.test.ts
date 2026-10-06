import { describe, expect, it } from "vitest";
import type { LiveValues } from "../../protocol/messages";
import { formatLive, MIXED, mergeLive, NONE } from "./fields";

const base: LiveValues = {
  name: "button.primary",
  tag: "button",
  id: "",
  classes: ["primary"],
  key: "cta-primary",
  width: 120.4,
  height: 44,
  x: 48,
  y: 300,
  text: "Get started",
  color: "rgb(250, 247, 242)",
  background: "rgb(29, 29, 31)",
  fontFamily: "Georgia, serif",
  fontSize: "16px",
  fontWeight: "400",
};

describe("inspector fields", () => {
  it("formats one element", () => {
    const f = formatLive(base);
    expect(f.Size).toBe("120.4 × 44");
    expect(f.ID).toBe(NONE);
    expect(f.Classes).toBe("primary");
    expect(f.Position).toBe("48, 300");
  });

  it("shows shared values or Mixed", () => {
    const m = mergeLive([formatLive(base), formatLive({ ...base, name: "button.ghost", classes: ["ghost"], width: 120.4 })]);
    expect(m.Tag).toBe("button");
    expect(m.Size).toBe("120.4 × 44");
    expect(m.Name).toBe(MIXED);
    expect(m.Classes).toBe(MIXED);
  });
});
