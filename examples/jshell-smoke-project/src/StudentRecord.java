import java.util.ArrayList;
import java.util.List;

public class StudentRecord {
    private final String name;
    private final List<Integer> grades = new ArrayList<>();
    private static String schoolName = "Unimozer High";

    public StudentRecord(String name) {
        this.name = name;
    }

    public StudentRecord(String name, int firstGrade) {
        this.name = name;
        this.grades.add(firstGrade);
    }

    public void addGrade(int grade) {
        grades.add(grade);
    }

    public double average() {
        if (grades.isEmpty()) return 0.0;
        int sum = 0;
        for (int g : grades) sum += g;
        return (double) sum / grades.size();
    }

    public String describe() {
        return name + " @ " + schoolName + " avg=" + average();
    }

    public static void setSchoolName(String school) {
        schoolName = school;
    }

    public static void main(String[] args) {
        StudentRecord s = new StudentRecord("Alice", 5);
        s.addGrade(4);
        s.addGrade(6);
        System.out.println(s.describe());
    }
}
