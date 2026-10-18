import { useState, type ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AddClassDialog } from "../AddClassDialog";
import { AddFieldDialog } from "../AddFieldDialog";
import { AddConstructorDialog } from "../AddConstructorDialog";
import { AddMethodDialog } from "../AddMethodDialog";
import { RenameClassDialog } from "../RenameClassDialog";
import { CreateObjectDialog } from "../CreateObjectDialog";
import { CallMethodDialog } from "../CallMethodDialog";

type CommonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => Promise<void>;
  busy?: boolean;
};

const forms: { name: string; render: (props: CommonProps) => ReactElement }[] = [
  { name: "Add class", render: (props) => <AddClassDialog {...props} /> },
  { name: "Add field", render: (props) => <AddFieldDialog {...props} /> },
  { name: "Add constructor", render: (props) => <AddConstructorDialog {...props} /> },
  { name: "Add method", render: (props) => <AddMethodDialog {...props} /> },
  { name: "Rename class", render: (props) => <RenameClassDialog {...props} className="Animal" /> },
  {
    name: "Create object",
    render: (props) => <CreateObjectDialog {...props} className="Animal" constructorLabel="Animal()" params={[]} existingNames={[]} />
  },
  {
    name: "Call method",
    render: (props) => <CallMethodDialog {...props} objectName="animal0" methodLabel="eat(int amount)" params={[{ name: "amount", type: "int" }]} useObjectParameterDropdowns={false} availableObjects={[]} />
  }
];

function setup(form: typeof forms[number], options: { busy?: boolean; onSubmit?: () => Promise<void> } = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  function Harness() {
    const [open, setOpen] = useState(true);
    return form.render({
      open,
      busy: options.busy,
      onSubmit,
      onOpenChange: (next) => {
        onOpenChange(next);
        setOpen(next);
      }
    });
  }
  render(<Harness />);
  return { user: userEvent.setup(), onOpenChange, onSubmit };
}

async function editForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (name === "Add constructor") {
    const checkbox = screen.getByRole("checkbox", { name: "JavaDoc Comments" });
    await user.click(checkbox);
    return checkbox;
  }
  const input = screen.getAllByRole("textbox")[0];
  await user.clear(input);
  await user.type(input, name === "Call method" ? "42" : "Draft");
  return input;
}

describe.each(forms)("$name dismissal", (form) => {
  it("keeps entered work after outside clicks and lets the user cancel deliberately", async () => {
    const { user, onOpenChange } = setup(form);
    const input = await editForm(user, form.name);
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    fireEvent.click(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    if (form.name === "Add constructor") expect(input).toBeChecked();
    else expect(input).toHaveValue(form.name === "Call method" ? "42" : "Draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes an untouched form with Escape", async () => {
    const { user, onOpenChange } = setup(form);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("requires explicit discard after Escape and restores focus when keeping edits", async () => {
    const { user, onOpenChange } = setup(form);
    const input = await editForm(user, form.name);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard("{Escape}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks Escape and outside clicks while busy", async () => {
    const { user, onOpenChange } = setup(form, { busy: true });
    await user.keyboard("{Escape}");
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("blocks dismissal during submission and closes when submission succeeds", async () => {
    let resolveSubmission!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmission = resolve; }));
    const { user, onOpenChange } = setup(form, { onSubmit });
    await editForm(user, form.name);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => resolveSubmission());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

it("allows portaled dropdown selection and consumes Escape in the dropdown first", async () => {
  // jsdom does not implement the scrolling API used by Radix Select.
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  try {
    const { user, onOpenChange } = setup(forms[3]);
    await editForm(user, "Add method");
    const visibility = screen.getAllByRole("combobox")[1];
    visibility.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    visibility.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("option", { name: "private" }));
    expect(visibility).toHaveTextContent("private");
    expect(onOpenChange).not.toHaveBeenCalled();
  } finally {
    if (originalScroll) Element.prototype.scrollIntoView = originalScroll;
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});
