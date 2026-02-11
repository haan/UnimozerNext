import model.Course;
import model.CourseLevel;
import model.School;
import model.Student;
import model.Teacher;

public class UmlRelationsMain {
    public static void main(String[] args) {
        Teacher teacherA = new Teacher("t-1", "Ms. Johnson", "Computer Science");
        Teacher teacherB = new Teacher("t-2", "Mr. Martin", "Mathematics");

        Student alice = new Student("s-1", "Alice", 11);
        Student bob = new Student("s-2", "Bob", 12);
        Student clara = new Student("s-3", "Clara", 10);

        Course cs101 = new Course("CS101", "Programming Basics", teacherA, CourseLevel.BASIC);
        cs101.enroll(alice);
        cs101.enroll(bob);

        Course math201 = new Course("M201", "Discrete Mathematics", teacherB, CourseLevel.INTERMEDIATE);
        math201.enroll(clara);

        School school = new School("Smoke Academy");
        school.addCourse(cs101);
        school.addCourse(math201);

        System.out.println("School: " + school.getName());
        System.out.println("Courses: " + school.getCourses().size());
        System.out.println("Students in CS101: " + cs101.getStudents().size());
    }
}
