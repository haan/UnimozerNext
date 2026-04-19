import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddClassDialog } from "../AddClassDialog";
import type { AddClassForm } from "../AddClassDialog";

function setup(overrides: Partial<Parameters<typeof AddClassDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <AddClassDialog
      open={true}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

describe("AddClassDialog", () => {
  it("renders name input and OK/Cancel buttons", () => {
    setup();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("OK button is disabled when name is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("OK button is disabled for an invalid Java identifier", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox"), "1InvalidName");
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("OK button becomes enabled when a valid name is entered", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox"), "MyClass");
    expect(screen.getByRole("button", { name: "OK" })).toBeEnabled();
  });

  it("calls onSubmit with the entered class name", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByRole("textbox"), "Animal");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const form: AddClassForm = onSubmit.mock.calls[0][0];
    expect(form.name).toBe("Animal");
    expect(form.isInterface).toBe(false);
    expect(form.includeMain).toBe(false);
  });

  it("includes main method when checkbox is checked", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByRole("textbox"), "Main");
    await userEvent.click(screen.getByRole("checkbox", { name: /Main Method/i }));
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].includeMain).toBe(true);
  });

  it("includes javadoc when checkbox is checked", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByRole("textbox"), "Doc");
    await userEvent.click(screen.getByRole("checkbox", { name: /JavaDoc/i }));
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].includeJavadoc).toBe(true);
  });

  it("shows advanced fields when Advanced is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Advanced/i }));
    expect(screen.getByRole("checkbox", { name: /interface/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /abstract/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /final/i })).toBeInTheDocument();
  });

  it("checking interface disables abstract and final checkboxes", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Advanced/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /interface/i }));
    expect(screen.getByRole("checkbox", { name: /abstract/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /final/i })).toBeDisabled();
  });

  it("Cancel button calls onOpenChange with false", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
