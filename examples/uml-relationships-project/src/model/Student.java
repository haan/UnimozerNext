package model;

public class Student extends Person {
    private int gradeLevel;

    public Student(String id, String name, int gradeLevel) {
        super(id, name);
        this.gradeLevel = gradeLevel;
    }

    public int getGradeLevel() {
        return gradeLevel;
    }

    public void promote() {
        gradeLevel++;
    }

    @Override
    public String roleLabel() {
        return "Student";
    }
}
