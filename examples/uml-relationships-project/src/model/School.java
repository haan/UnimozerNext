package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class School {
    private final String name;
    private final List<Course> courses = new ArrayList<>();

    public School(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public List<Course> getCourses() {
        return Collections.unmodifiableList(courses);
    }

    public void addCourse(Course course) {
        if (course != null && !courses.contains(course)) {
            courses.add(course);
        }
    }
}
