import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "../ui/menubar";

type AppMenuProps = {
  busy: boolean;
  hasUnsavedChanges: boolean;
  projectName: string;
  isMac: boolean;
  editDisabled: boolean;
  zoomDisabled: boolean;
  canAddClass: boolean;
  canAddConstructor: boolean;
  canAddField: boolean;
  canAddMethod: boolean;
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showDependencies: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
  wordWrap: boolean;
  onRequestNewProject: () => void;
  onRequestOpenProject: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleShowPrivate: (value: boolean) => void;
  onToggleShowInherited: (value: boolean) => void;
  onToggleShowStatic: (value: boolean) => void;
  onToggleShowDependencies: (value: boolean) => void;
  onToggleShowPackages: (value: boolean) => void;
  onToggleShowSwingAttributes: (value: boolean) => void;
  onToggleWordWrap: (value: boolean) => void;
  onAddClass: () => void;
  onAddConstructor: () => void;
  onAddField: () => void;
  onAddMethod: () => void;
};

export const AppMenu = ({
  busy,
  hasUnsavedChanges,
  projectName,
  isMac,
  editDisabled,
  zoomDisabled,
  canAddClass,
  canAddConstructor,
  canAddField,
  canAddMethod,
  showPrivateObjectFields,
  showInheritedObjectFields,
  showStaticObjectFields,
  showDependencies,
  showPackages,
  showSwingAttributes,
  wordWrap,
  onRequestNewProject,
  onRequestOpenProject,
  onSave,
  onSaveAs,
  onOpenSettings,
  onExit,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleShowPrivate,
  onToggleShowInherited,
  onToggleShowStatic,
  onToggleShowDependencies,
  onToggleShowPackages,
  onToggleShowSwingAttributes,
  onToggleWordWrap,
  onAddClass,
  onAddConstructor,
  onAddField,
  onAddMethod
}: AppMenuProps) => (
  <header className="relative flex items-center border-b border-border bg-card px-4 py-2">
    <div className="flex items-center gap-2">
      <img
        src="/icon/icon.png"
        alt="Unimozer Next icon"
        className="h-10 w-10"
        draggable={false}
      />
      <Menubar className="border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onRequestNewProject} disabled={busy}>
              New Project
              <MenubarShortcut>{isMac ? "⌘N" : "Ctrl+N"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onRequestOpenProject} disabled={busy}>
              Open
              <MenubarShortcut>{isMac ? "⌘O" : "Ctrl+O"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onSave} disabled={!hasUnsavedChanges || busy}>
              Save
              <MenubarShortcut>{isMac ? "⌘S" : "Ctrl+S"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onSaveAs} disabled={busy || !projectName}>
              Save As
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onOpenSettings} disabled={busy}>
              Settings
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onExit} disabled={busy}>
              Exit
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onUndo} disabled={editDisabled}>
              Undo
              <MenubarShortcut>{isMac ? "⌘Z" : "Ctrl+Z"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onRedo} disabled={editDisabled}>
              Redo
              <MenubarShortcut>{isMac ? "⇧⌘Z" : "Ctrl+Y"}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onCut} disabled={editDisabled}>
              Cut
              <MenubarShortcut>{isMac ? "⌘X" : "Ctrl+X"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onCopy} disabled={editDisabled}>
              Copy
              <MenubarShortcut>{isMac ? "⌘C" : "Ctrl+C"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onPaste} disabled={editDisabled}>
              Paste
              <MenubarShortcut>{isMac ? "⌘V" : "Ctrl+V"}</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onZoomIn} disabled={zoomDisabled}>
              Zoom In
              <MenubarShortcut>{isMac ? "⌘+" : "Ctrl++"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onZoomOut} disabled={zoomDisabled}>
              Zoom Out
              <MenubarShortcut>{isMac ? "⌘-" : "Ctrl+-"}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onZoomReset} disabled={zoomDisabled}>
              Reset Zoom
              <MenubarShortcut>{isMac ? "⌘0" : "Ctrl+0"}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>UML</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarCheckboxItem
                  checked={showDependencies}
                  onCheckedChange={(checked) =>
                    onToggleShowDependencies(Boolean(checked))
                  }
                >
                  Show dependencies
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={showPackages}
                  onCheckedChange={(checked) =>
                    onToggleShowPackages(Boolean(checked))
                  }
                >
                  Show packages
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={showSwingAttributes}
                  onCheckedChange={(checked) =>
                    onToggleShowSwingAttributes(Boolean(checked))
                  }
                >
                  Show javax.swing fields
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Object Bench</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarCheckboxItem
                  checked={showPrivateObjectFields}
                  onCheckedChange={(checked) => onToggleShowPrivate(Boolean(checked))}
                >
                  Show private fields
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={showInheritedObjectFields}
                  onCheckedChange={(checked) => onToggleShowInherited(Boolean(checked))}
                >
                  Show inherited fields
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={showStaticObjectFields}
                  onCheckedChange={(checked) => onToggleShowStatic(Boolean(checked))}
                >
                  Show static fields
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Editor</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarCheckboxItem
                  checked={wordWrap}
                  onCheckedChange={(checked) => onToggleWordWrap(Boolean(checked))}
                >
                  Word wrap
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Insert</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAddClass} disabled={!canAddClass}>
              Class
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onAddConstructor} disabled={!canAddConstructor}>
              Constructor
            </MenubarItem>
            <MenubarItem onClick={onAddField} disabled={!canAddField}>
              Field
            </MenubarItem>
            <MenubarItem onClick={onAddMethod} disabled={!canAddMethod}>
              Method
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>

    {projectName ? (
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-medium text-foreground">
        <span className="max-w-[60vw] truncate">{projectName}</span>
        {hasUnsavedChanges ? (
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        ) : null}
      </div>
    ) : null}
  </header>
);
