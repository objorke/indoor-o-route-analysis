import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NumericInput } from "./numeric-input";

afterEach(cleanup);

function setup(value = 5, props: Partial<React.ComponentProps<typeof NumericInput>> = {}) {
  const onCommit = vi.fn();
  const utils = render(<NumericInput aria-label="n" value={value} onCommit={onCommit} {...props} />);
  const input = utils.getByLabelText("n") as HTMLInputElement;
  return { ...utils, input, onCommit };
}

describe("NumericInput", () => {
  it("lets '-' be typed without committing, then commits on blur", () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-" } });
    expect(input.value).toBe("-");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "-12.5" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(-12.5);
  });

  it("commits on Enter", () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it("Enter followed by blur commits once", () => {
    const { input, onCommit } = setup(5);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("reverts invalid input on blur and marks it invalid", () => {
    const { input, onCommit } = setup(5);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("5");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("Esc reverts without committing", () => {
    const { input, onCommit } = setup(5);
    input.focus();
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("5");
  });

  it("does not commit an unchanged value and respects min", () => {
    const { input, onCommit } = setup(5, { min: 1 });
    fireEvent.focus(input);
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("follows external value changes while not focused", () => {
    const { input, rerender, onCommit } = setup(5);
    rerender(<NumericInput aria-label="n" value={8.25} onCommit={onCommit} />);
    expect(input.value).toBe("8.25");
  });
});
