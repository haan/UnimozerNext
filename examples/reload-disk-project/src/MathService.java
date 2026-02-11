public class MathService {
    public int sum(int a, int b) {
        return a + b;
    }

    public int factorial(int n) {
        if (n < 2) {
            return 1;
        }
        int result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }
}
