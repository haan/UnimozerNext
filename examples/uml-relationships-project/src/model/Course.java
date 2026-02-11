package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Course {
    private final String code;
    private String title;
    private Teacher teacher;
    private CourseLevel level;
    private final List<Student> students = new ArrayList<>();

    public Course(String code, String title, Teacher teacher, CourseLevel level) {
        this.code = code;
        this.title = title;
        this.teacher = teacher;
        this.level = level;
    }

    public String getCode() {
        return code;
    }

    public String getTitle() {
        return title;
    }

    public Teacher getTeacher() {
        return teacher;
    }

    public CourseLevel getLevel() {
        return level;
    }

    public List<Student> getStudents() {
        return Collections.unmodifiableList(students);
    }

    public void assignTeacher(Teacher nextTeacher) {
        if (nextTeacher != null) {
            teacher = nextTeacher;
        }
    }

    public void setLevel(CourseLevel nextLevel) {
        if (nextLevel != null) {
            level = nextLevel;
        }
    }

    public void rename(String nextTitle) {
        if (nextTitle != null && !nextTitle.isBlank()) {
            title = nextTitle;
        }
    }

    public boolean enroll(Student student) {
        if (student == null || students.contains(student)) {
            return false;
        }
        students.add(student);
        return true;
    }
}
