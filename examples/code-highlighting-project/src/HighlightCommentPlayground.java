/**
 * Comment stress sample for scope-highlighting behavior.
 */
public class HighlightCommentPlayground {

    /**
     * Javadoc should align with following block color.
     */
    public int parseAndCount(String input) {
        // inline comment on a white sequential line
        int count = 0;

        /*
         * Regular block comments should not affect brace depth.
         * They may appear between control structures.
         */
        if (input == null || input.isEmpty()) {
            return 0;
        }

        for (int i = 0; i < input.length(); i++) {
            char ch = input.charAt(i);
            if (Character.isLetter(ch)) {
                count++;
            } else if (Character.isDigit(ch)) {
                count += 2;
            } else {
                count += 0;
            }
        }
        return count;
    }
}
