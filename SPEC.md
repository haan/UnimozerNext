# Unimozer Next — SPEC.md

## 0. Overview

**Unimozer Next** is a modern rewrite of **Unimozer**, designed as a lightweight, student-friendly Java learning environment that integrates:

- UML class diagram ↔ Java code view
- Fast creation wizards (class/field/method/constructor)
- Live errors and feedback
- Project compilation + execution
- Visual learning tools (later: nested-block highlighting, NS diagrams)
- Interactive "Object Bench" (BlueJ-style) using JShell

The UI must remain **simple and classroom-friendly**, avoiding the complexity of full IDEs.

---

## 1. Motivation & Constraints

### 1.1 Motivation
Original Unimozer disadvantages to solve:
- Requires external **JRE/JDK** installation
- UI feels outdated
- Some features are unmaintained/broken
- Old parser tooling limited modern Java syntax (in the old setup)
- Needs a modern maintainable architecture

### 1.2 Key constraints
- Must work **offline**
- Must be **easy to install** on school PCs
- Must support **modern Java syntax**
- Must preserve Unimozer’s key workflow: **Open Project → diagram + code**
- Must keep diagram layout stable across refreshes (no jumping around)

---

## 2. Target Users & Key Workflows

### 2.1 Users
- Students learning OOP and algorithms in Java
- Teachers demonstrating class structure, relationships, and runtime behavior

### 2.2 Core workflows
1. **Open Project**
   - Browse folder list
   - Recognize Unimozer projects and NetBeans projects
   - Open as one project unit (not a raw folder view)

2. **Edit Code**
   - Monaco editor with tabs
   - Save, syntax highlighting
   - Live diagnostics + problem list (from JDT LS, later)

3. **View UML**
   - Auto-generated class diagram from source
   - Drag nodes, persist positions

4. **Generate structure**
   - Wizards: create class/field/method/constructor
   - Optional getter/setter generation

5. **Compile & Run**
   - Compile project
   - Run a selected `main()` method
   - Console output panel

6. **Object Bench (JShell)**
   - Create objects
   - Call methods
   - Evaluate expressions
   - Inspect variables
   - Reset session

---

## 3. Tech Stack

### 3.1 Desktop platform
- **Tauri** (Rust backend, desktop shell)

### 3.2 Frontend
- **React + Vite**
- Tailwind CSS (optional but recommended)
- State management: React state + small store (Zustand or similar if needed)

### 3.3 Code editor
- **Monaco Editor** (`@monaco-editor/react`)

### 3.4 Java tooling (long-term)
- **Eclipse JDT Language Server (JDT LS)** for:
  - live diagnostics
  - outline
  - navigation
  - code actions (optional)
- **JavaParser (modern version)** can be used for:
  - UML extraction (nodes + edges)
  - method AST for teaching views (NS diagrams)
  - stable and explicit structural extraction

Note: MVP may use a mocked graph / simple extraction, then expand.

### 3.5 Runtime execution
- **Bundled JDK** (recommended) including:
  - `javac`
  - `java`
  - `jshell`

### 3.6 Object Bench engine
- **JShell**
- Recommended approach: a **JSON-speaking JShell Bridge** (small Java helper process)

---

## 4. Project Types & Recognition

Unimozer Next must recognize and open projects like the original Unimozer:

### 4.1 Project Types

#### A) Legacy Unimozer Project
- Contains: `unimozer.pck`
- Has Java project structure: usually `src/`, `nbproject/`, `bin/`, `versions/`

#### B) NetBeans Project
- Contains: `nbproject/project.xml`

#### C) Plain Java Folder
- Fallback mode if it contains `.java` files under something like `src/` (optional in MVP)

### 4.2 Open Project UX
The Open Project UI should show a directory listing with icons:
- 🟩 Turtle icon: recognized legacy Unimozer project (`unimozer.pck`)
- 🟦 Cube icon: recognized NetBeans project (`nbproject/project.xml`)
- 📁 Folder icon: ordinary folder

Implementation:
- Either a custom in-app picker UI (preferred)
- Or use system folder picker + detection after selection (MVP)

---

## 5. Data & Persistence

### 5.1 Diagram layout persistence
Unimozer stored diagram layout in `unimozer.pck`.

#### Legacy `unimozer.pck` format (observed)
- 6 lines of booleans (UI toggles)
- Then N CSV-like lines: `"FQN","x","y"`

Example:
```
false
true
true
true
true
true
"lu.lgk.algorithms.BetterIntegerArrayList","10","10"
...
```

Unimozer Next should implement:
- Import support for legacy `unimozer.pck`
- Native persistence in JSON for extensibility

### 5.2 Unimozer Next diagram JSON format
For each project, store a file in the project root:

`diagram.json`

Schema:
```json
{
  "version": 1,
  "showFields": true,
  "showMethods": true,
  "showParams": true,
  "showTypes": true,
  "showVisibility": true,
  "showRelations": true,
  "nodes": {
    "lu.lgk.algorithms.MainClass": { "x": 373, "y": 192 }
  },
  "viewport": { "panX": 0, "panY": 0, "zoom": 1 }
}
```

Key points:
- Nodes keyed by **FQN** for stability
- Existing nodes must keep position across refresh
- New nodes get auto-placed deterministically

---

## 6. Internal TypeScript Models

### 6.1 UML Graph Model
This is the semantic model derived from Java source.

- Node id = **FQN**
- Nodes contain fields + methods (strings are fine initially)
- Edges include inheritance and associations

Recommended TS types:
- `UmlGraph`
- `UmlNode`
- `UmlEdge`
- Node kinds: class/interface/enum/record
- Edge kinds: extends/implements/association

### 6.2 Diagram State Model
This is the visual layout + toggles persisted to `diagram.json`.

### 6.3 Render Model
Merge semantic graph + layout to produce:
- nodes with x/y/width/height

---

## 7. UML Diagram Generation Rules

### 7.1 UML Nodes
Each Java top-level type becomes a UML class box:
- name
- optional sections for fields/methods (toggleable)

### 7.2 UML Edges

#### Inheritance
- `extends`: solid line + hollow triangle
- `implements`: dashed line + hollow triangle

#### Associations
For each field:
- Extract referenced type(s)
  - `Ball` -> Ball
  - `ArrayList<Ball>` -> Ball
  - `Ball[]` -> Ball
- If referenced type is another node in the graph: create association edge

Edge direction:
- from owning class -> referenced class

### 7.3 Incremental improvements (later)
- Composition diamonds, multiplicities, role names
- Better edge routing (orthogonal)
- Filtering and focus mode

---

## 8. UML Diagram Rendering Requirements (SVG)

Use **plain SVG** (not React Flow).

### 8.1 Rendering
- Each node is an SVG `<g>` group at `(x,y)`
- Rectangle box + text
- Edges drawn as:
  - simple bezier curves initially
  - arrow markers for edge types

### 8.2 Interaction
- Drag node by header area
- On drag end: persist to `diagram.json`
- Optional:
  - pan/zoom
  - selection highlight

### 8.3 Layout preservation rules
- Never move a node that already has coordinates saved
- Auto-place only new nodes

---

## 9. Editor Requirements (Monaco)

### 9.1 MVP editor features
- open multiple files (tabs)
- syntax highlighting (Java)
- save file

### 9.2 Later editor features
- diagnostics + errors panel (via JDT LS)
- outline
- go-to-definition
- rename refactor (optional)

---

## 10. Compilation & Execution

### 10.1 Compilation
- Use bundled `javac`
- Source roots:
  - for NetBeans projects: read `src.dir` from `nbproject/project.properties` if present, else default `src`
- Output directory:
  - recommended: `bin/` or `.unimozer-next/out/`
  - Keep deterministic

### 10.2 Run
- Detect main methods (simple scanning is ok in MVP)
- Run with bundled `java`:
  - `java -cp <out> <MainClassFQN>`
- Stream stdout/stderr to console panel

---

## 11. Object Bench (JShell)

### 11.1 Goals
Provide a BlueJ-like panel where the user can:
- create objects
- call methods
- evaluate expressions
- list variables
- reset session

### 11.2 Recommended architecture: JShell Bridge
Instead of parsing JShell CLI output, ship a small Java process:

- Starts `jdk.jshell.JShell`
- Executes snippets on request
- Returns structured JSON over stdin/stdout

Example request:
```json
{"cmd":"eval","code":"var a = new Foo();"}
```

Example response:
```json
{
  "ok": true,
  "stdout": "",
  "stderr": "",
  "vars": [{"name":"a","type":"Foo","value":"Foo@1234"}]
}
```

### 11.3 Bridge commands
Minimum:
- `eval`
- `vars`
- `reset`

Optional:
- `inspect` (reflection-based field inspection)

### 11.4 Integration with compile/run
JShell runs against the last successful compiled classpath.
After successful compile:
- restart JShell session (simplest)

---

## 12. Packaging & Distribution

### 12.1 Requirements
- No external Java install required
- Works offline
- Single installer or portable bundle

### 12.2 Bundled components
- JDK runtime (Temurin or similar)
- JDT LS distribution (later)
- JShell Bridge jar

---

## 13. Repository Structure

Suggested structure:

```
unimozer-next/
  SPEC.md
  src/
    components/
    models/
    services/
    pages/
  src-tauri/
    Cargo.toml
    src/
  resources/
    jdk/            (bundled later)
    jdtls/          (bundled later)
    jshell-bridge/  (jar later)
```

---

## 14. Milestones & Acceptance Criteria

### Milestone 1 — Project open + file tree + Monaco
**Deliverable**
- Open a folder project
- Show tree of source files
- Open `.java` file in Monaco
- Save file

**Acceptance**
- edit and save persists on disk

---

### Milestone 2 — UML SVG diagram + layout persistence
**Deliverable**
- Build `UmlGraph` (mock graph initially acceptable)
- Render UML class boxes in SVG
- Drag nodes
- Persist positions to `diagram.json`
- Reload preserves layout

**Acceptance**
- boxes don’t jump around after reload
- dragging persists

---

### Milestone 3 — UML generation from real Java sources
**Deliverable**
- Implement analyzer using JavaParser OR simple extraction
- Generate nodes + edges from project source code
- Merge with layout persistence

**Acceptance**
- classes appear from real project
- extends/implements edges visible
- field associations visible when types match other project classes

---

### Milestone 4 — Compile + Run + Console
**Deliverable**
- Compile with bundled JDK (dev machine JDK ok initially)
- Run main method
- Console panel shows stdout/stderr

**Acceptance**
- project compiles and runs from the app

---

### Milestone 5 — Wizards
**Deliverable**
- Add class wizard
- Add field wizard (+ getter/setter)
- Add method/constructor wizard
- Updates code + refresh UML

**Acceptance**
- wizard-generated code compiles
- UML updates immediately

---

### Milestone 6 — Object Bench (JShell)
**Deliverable**
- JShell Bridge process
- Object Bench UI:
  - variables list
  - eval input
  - reset
- Works with compiled project classes

**Acceptance**
- create object and call method works reliably

---

### Milestone 7 — JDT LS integration (IDE experience)
**Deliverable**
- diagnostics panel
- outline panel
- optional quick fixes

**Acceptance**
- syntax errors appear in real time like an IDE

---

### Milestone 8 — Teaching visualizations
**Deliverable**
- nested block highlighting
- NS diagrams view

---

## 15. Non-goals (explicitly out of scope for MVP)
- Full Maven/Gradle dependency management UI
- Debugger
- Git integration
- Complex UML features (sequence diagrams, etc.)

---

## 16. Definition of Done
A milestone is “done” when:
- Features meet acceptance criteria
- Works on Windows + Linux at minimum
- No frequent crashes; errors are surfaced clearly in UI
- Layout persistence stable and deterministic
