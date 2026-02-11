public class TextService {
    public String normalizeName(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().replace("  ", " ");
    }

    public String titleCase(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String[] parts = value.toLowerCase().split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            out.append(Character.toUpperCase(part.charAt(0)))
                    .append(part.substring(1))
                    .append(' ');
        }
        return out.toString().trim();
    }
}
