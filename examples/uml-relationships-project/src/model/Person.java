package model;

public abstract class Person implements Identifiable {
    private final String id;
    private String name;

    protected Person(String id, String name) {
        this.id = id;
        this.name = name;
    }

    @Override
    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void rename(String nextName) {
        if (nextName != null && !nextName.isBlank()) {
            this.name = nextName;
        }
    }

    public abstract String roleLabel();
}
