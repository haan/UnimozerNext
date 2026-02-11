public class GeometryBox {
    private double width;
    private double height;
    private double depth;

    public GeometryBox() {
        this(1.0, 1.0, 1.0);
    }

    public GeometryBox(double width, double height, double depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;
    }

    public double volume() {
        return width * height * depth;
    }

    public double surfaceArea() {
        return 2 * (width * height + width * depth + height * depth);
    }

    public void scale(double factor) {
        width *= factor;
        height *= factor;
        depth *= factor;
    }

    public String dimensions() {
        return width + " x " + height + " x " + depth;
    }

    public static void main(String[] args) {
        GeometryBox b = new GeometryBox(2, 3, 4);
        System.out.println("Volume: " + b.volume());
        System.out.println("Area: " + b.surfaceArea());
    }
}
