# UML Relationships Project

Use this project to validate UML parsing/layout, package grouping, inheritance, interfaces, and enum rendering.

## Files
- `src/model/Identifiable.java` (interface)
- `src/model/Person.java` (abstract base class)
- `src/model/Student.java`, `src/model/Teacher.java` (inheritance)
- `src/model/CourseLevel.java` (enum)
- `src/model/Course.java` (associations + collections)
- `src/model/School.java` (aggregation/composition style)
- `src/UmlRelationsMain.java` (simple main runner)

## Quick check
1. Open `examples/uml-relationships-project` as folder project.
2. Compile project.
3. Open UML view and confirm class/interface/enum relationships.
4. Run `UmlRelationsMain` and verify console output includes:
   - `School: Smoke Academy`
   - `Courses: 2`
   - `Students in CS101: 2`
