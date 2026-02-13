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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { ExportStyle } from "../diagram/UmlDiagram";

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
  canCompileClass: boolean;
  canExportDiagram: boolean;
  canExportStructogram: boolean;
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showDependencies: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
  canUseStructogramMode: boolean;
  structogramMode: boolean;
  structogramColorsEnabled: boolean;
  wordWrap: boolean;
  scopeHighlighting: boolean;
  onRequestNewProject: () => void;
  onRequestOpenProject: () => void;
  onRequestOpenFolderProject: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
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
  onToggleStructogramMode: (value: boolean) => void;
  onToggleStructogramColors: (value: boolean) => void;
  onToggleWordWrap: (value: boolean) => void;
  onToggleScopeHighlighting: (value: boolean) => void;
  onAddClass: () => void;
  onAddConstructor: () => void;
  onAddField: () => void;
  onAddMethod: () => void;
  onCompileClass: () => void;
  onCopyDiagramPng: (style: ExportStyle) => void;
  onExportDiagramPng: (style: ExportStyle) => void;
  onCopyStructogramPng: () => void;
  onExportStructogramPng: () => void;
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
  canCompileClass,
  canExportDiagram,
  canExportStructogram,
  showPrivateObjectFields,
  showInheritedObjectFields,
  showStaticObjectFields,
  showDependencies,
  showPackages,
  showSwingAttributes,
  canUseStructogramMode,
  structogramMode,
  structogramColorsEnabled,
  wordWrap,
  scopeHighlighting,
  onRequestNewProject,
  onRequestOpenProject,
  onRequestOpenFolderProject,
  onSave,
  onSaveAs,
  onOpenSettings,
  onOpenAbout,
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
  onToggleStructogramMode,
  onToggleStructogramColors,
  onToggleWordWrap,
  onToggleScopeHighlighting,
  onAddClass,
  onAddConstructor,
  onAddField,
  onAddMethod,
  onCompileClass,
  onCopyDiagramPng,
  onExportDiagramPng,
  onCopyStructogramPng,
  onExportStructogramPng
}: AppMenuProps) => {
  const diagramViewActionsDisabled = structogramMode;
  const structogramActionsDisabled = !structogramMode;

  return (
    <header
      className="relative z-20 flex items-center border-b border-border bg-card px-4 py-2"
      style={{ boxShadow: "var(--menu-bar-shadow)" }}
    >
      <div className="flex items-center gap-2">
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
            <MenubarItem onClick={onRequestOpenFolderProject} disabled={busy}>
              Open Folder Project
            </MenubarItem>
            <MenubarItem onClick={onSave} disabled={busy || !projectName}>
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
                <MenubarCheckboxItem
                  checked={scopeHighlighting}
                  onCheckedChange={(checked) => onToggleScopeHighlighting(Boolean(checked))}
                >
                  Code highlighting
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Diagram</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              onClick={onCompileClass}
              disabled={diagramViewActionsDisabled || !canCompileClass}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2354 10.9867C2.02367 11.3225 2.07267 11.7602 2.35341 12.041L2.95951 12.6471C3.24025 12.9278 3.67795 12.9768 4.01382 12.7651L4.92506 12.1907C5.26384 12.377 5.62516 12.5278 6.0039 12.6379L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.99505 12.6383C9.37411 12.5282 9.73573 12.3773 10.0748 12.1909L10.986 12.7653C11.3218 12.977 11.7595 12.928 12.0403 12.6473L12.6464 12.0412C12.9271 11.7604 12.9761 11.3227 12.7644 10.9869L12.1902 10.076C12.3768 9.73688 12.5278 9.37515 12.638 8.99596L13.6879 8.75794C14.0751 8.67015 14.35 8.32601 14.35 7.92897V7.07183C14.35 6.6748 14.0751 6.33065 13.6879 6.24287L12.6381 6.00488C12.528 5.62578 12.3771 5.26414 12.1906 4.92507L12.7648 4.01407C12.9766 3.6782 12.9276 3.2405 12.6468 2.95975L12.0407 2.35366C11.76 2.07292 11.3223 2.02392 10.9864 2.23565L10.0755 2.80989C9.73622 2.62328 9.37437 2.47229 8.99505 2.36209L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM4.92053 3.81251C5.44724 3.44339 6.05665 3.18424 6.71543 3.06839L7.07095 1.50024H7.92809L8.28355 3.06816C8.94267 3.18387 9.5524 3.44302 10.0794 3.81224L11.4397 2.9547L12.0458 3.56079L11.1882 4.92117C11.5573 5.44798 11.8164 6.0575 11.9321 6.71638L13.5 7.07183V7.92897L11.932 8.28444C11.8162 8.94342 11.557 9.55301 11.1878 10.0798L12.0453 11.4402L11.4392 12.0462L10.0787 11.1886C9.55192 11.5576 8.94241 11.8166 8.28355 11.9323L7.92809 13.5002H7.07095L6.71543 11.932C6.0569 11.8162 5.44772 11.5572 4.92116 11.1883L3.56055 12.046L2.95445 11.4399L3.81213 10.0794C3.4431 9.55266 3.18403 8.94326 3.06825 8.2845L1.50002 7.92897V7.07183L3.06818 6.71632C3.18388 6.05765 3.44283 5.44833 3.81171 4.92165L2.95398 3.561L3.56008 2.95491L4.92053 3.81251ZM9.02496 7.50008C9.02496 8.34226 8.34223 9.02499 7.50005 9.02499C6.65786 9.02499 5.97513 8.34226 5.97513 7.50008C5.97513 6.65789 6.65786 5.97516 7.50005 5.97516C8.34223 5.97516 9.02496 6.65789 9.02496 7.50008ZM9.92496 7.50008C9.92496 8.83932 8.83929 9.92499 7.50005 9.92499C6.1608 9.92499 5.07513 8.83932 5.07513 7.50008C5.07513 6.16084 6.1608 5.07516 7.50005 5.07516C8.83929 5.07516 9.92496 6.16084 9.92496 7.50008Z"
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                  />
                </svg>
                Compile Project
              </span>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onAddClass} disabled={diagramViewActionsDisabled || !canAddClass}>
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Class
              </span>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={onAddConstructor}
              disabled={diagramViewActionsDisabled || !canAddConstructor}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Constructor
              </span>
            </MenubarItem>
            <MenubarItem onClick={onAddField} disabled={diagramViewActionsDisabled || !canAddField}>
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Field
              </span>
            </MenubarItem>
            <MenubarItem
              onClick={onAddMethod}
              disabled={diagramViewActionsDisabled || !canAddMethod}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Method
              </span>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled={diagramViewActionsDisabled || !canExportDiagram}>
                <span className="inline-flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z" />
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z" />
                  </svg>
                  Copy diagram as PNG
                </span>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  disabled={diagramViewActionsDisabled || !canExportDiagram}
                  onClick={() => onCopyDiagramPng("uncompiled")}
                >
                  Uncompiled
                </MenubarItem>
                <MenubarItem
                  disabled={diagramViewActionsDisabled || !canExportDiagram}
                  onClick={() => onCopyDiagramPng("compiled")}
                >
                  Compiled
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger disabled={diagramViewActionsDisabled || !canExportDiagram}>
                <span className="inline-flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5" />
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
                  </svg>
                  Export diagram as PNG
                </span>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  disabled={diagramViewActionsDisabled || !canExportDiagram}
                  onClick={() => onExportDiagramPng("uncompiled")}
                >
                  Uncompiled
                </MenubarItem>
                <MenubarItem
                  disabled={diagramViewActionsDisabled || !canExportDiagram}
                  onClick={() => onExportDiagramPng("compiled")}
                >
                  Compiled
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Structogram</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              onClick={() => onToggleStructogramMode(!structogramMode)}
              disabled={!canUseStructogramMode}
            >
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-xs">
                  {structogramMode ? "✓" : ""}
                </span>
                <span>Structogram mode</span>
              </span>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarCheckboxItem
              checked={structogramColorsEnabled}
              disabled={structogramActionsDisabled}
              onCheckedChange={(checked) => onToggleStructogramColors(Boolean(checked))}
            >
              Use colors
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={onCopyStructogramPng}
              disabled={structogramActionsDisabled || !canExportStructogram}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z" />
                  <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z" />
                </svg>
                Copy structogram as PNG
              </span>
            </MenubarItem>
            <MenubarItem
              onClick={onExportStructogramPng}
              disabled={structogramActionsDisabled || !canExportStructogram}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5" />
                  <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
                </svg>
                Export structogram as PNG
              </span>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onOpenAbout}>
              About
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        </Menubar>
      </div>

    {projectName ? (
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-medium text-foreground">
        <span className="max-w-[60vw] truncate">{projectName}</span>
        {hasUnsavedChanges ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Unsaved changes"
                  className="pointer-events-auto inline-block h-2 w-2 rounded-full bg-amber-500"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Shown when there are unsaved changes
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    ) : null}
    </header>
  );
};
