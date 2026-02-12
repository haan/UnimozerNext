public class HighlightMain {
    public static void main(String[] args) {
        HighlightCases cases = new HighlightCases();
        HighlightCommentPlayground comments = new HighlightCommentPlayground();

        int seq = cases.sequentialOnly(2, 4);
        boolean found = cases.binarySearch(new int[] { 1, 3, 5, 7, 9 }, 7);
        String day = cases.singleSwitch(3);
        int mixed = cases.mixedControl(6);
        int parsed = comments.parseAndCount("a1-b2-c3");

        System.out.println("sequentialOnly: " + seq);
        System.out.println("binarySearch: " + found);
        System.out.println("singleSwitch: " + day);
        System.out.println("mixedControl: " + mixed);
        System.out.println("parseAndCount: " + parsed);
        System.out.println("counter: " + cases.getCounter());
    }
}
