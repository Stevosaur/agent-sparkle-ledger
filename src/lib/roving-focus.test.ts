import { describe, expect, it } from "vitest";
import { rovingTabStop, rovingTarget } from "./roving-focus";

const none = [false, false, false, false];

describe("rovingTarget", () => {
  it("moves right and left with wrap-around", () => {
    expect(rovingTarget("ArrowRight", 0, none)).toBe(1);
    expect(rovingTarget("ArrowRight", 3, none)).toBe(0);
    expect(rovingTarget("ArrowLeft", 0, none)).toBe(3);
    expect(rovingTarget("ArrowLeft", 2, none)).toBe(1);
  });

  it("jumps to the ends with Home and End", () => {
    expect(rovingTarget("Home", 2, none)).toBe(0);
    expect(rovingTarget("End", 1, none)).toBe(3);
  });

  it("skips disabled items, including at the ends", () => {
    const disabled = [true, false, true, false];
    expect(rovingTarget("ArrowRight", 1, disabled)).toBe(3);
    expect(rovingTarget("ArrowRight", 3, disabled)).toBe(1);
    expect(rovingTarget("ArrowLeft", 1, disabled)).toBe(3);
    expect(rovingTarget("Home", 3, disabled)).toBe(1);
    expect(rovingTarget("End", 1, [false, false, true])).toBe(1);
  });

  it("only handles Up / Down when vertical", () => {
    expect(rovingTarget("ArrowDown", 0, none)).toBeNull();
    expect(rovingTarget("ArrowUp", 0, none)).toBeNull();
    expect(rovingTarget("ArrowDown", 0, none, { vertical: true })).toBe(1);
    expect(rovingTarget("ArrowUp", 0, none, { vertical: true })).toBe(3);
  });

  it("starts from the ends when the current item is unknown", () => {
    expect(rovingTarget("ArrowRight", -1, none)).toBe(0);
    expect(rovingTarget("ArrowLeft", -1, none)).toBe(3);
  });

  it("ignores other keys, empty lists and all-disabled lists", () => {
    expect(rovingTarget("Enter", 0, none)).toBeNull();
    expect(rovingTarget("ArrowRight", 0, [])).toBeNull();
    expect(rovingTarget("ArrowRight", 0, [true, true])).toBeNull();
  });
});

describe("rovingTabStop", () => {
  it("is the selected item when it is enabled", () => {
    expect(rovingTabStop(2, none)).toBe(2);
  });

  it("falls back to the first enabled item", () => {
    expect(rovingTabStop(-1, none)).toBe(0);
    expect(rovingTabStop(0, [true, false, false])).toBe(1);
    expect(rovingTabStop(-1, [true, true])).toBe(-1);
  });
});
