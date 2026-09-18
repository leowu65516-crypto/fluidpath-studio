import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FaultSignalInput } from "../components/FaultSignalInput";

afterEach(cleanup);
describe("complete diagnostic samples", () => {
  it("preserves decimal editing and samples only the completed value", () => {
    const commit = vi.fn();
    render(<FaultSignalInput label="Flow" value={10} onCommit={commit} />);
    const input = screen.getByRole("textbox", { name: "Flow" });
    input.focus();
    for (const value of ["", "0", "0.", "0.5"]) fireEvent.change(input, { target: { value } });
    expect(commit).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("0.5");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).toHaveBeenCalledExactlyOnceWith(0.5, "good");
  });
  it.each([["", "missing"], ["bad", "invalid"]] as const)("marks %s as %s instead of a healthy zero", (value, quality) => {
    const commit = vi.fn();
    render(<FaultSignalInput label="Flow" value={10} onCommit={commit} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
    expect(commit).toHaveBeenCalledExactlyOnceWith(0, quality);
  });
});
