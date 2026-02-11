package model;

public class Teacher extends Person {
    private String subject;

    public Teacher(String id, String name, String subject) {
        super(id, name);
        this.subject = subject;
    }

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        if (subject != null && !subject.isBlank()) {
            this.subject = subject;
        }
    }

    @Override
    public String roleLabel() {
        return "Teacher";
    }
}
