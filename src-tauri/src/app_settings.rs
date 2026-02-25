use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UmlSettings {
    show_dependencies: bool,
    #[serde(default = "default_true")]
    show_packages: bool,
    #[serde(default = "default_true")]
    show_swing_attributes: bool,
    #[serde(default = "default_true")]
    code_highlight: bool,
    #[serde(default = "default_true")]
    show_parameter_names: bool,
    #[serde(default = "default_edge_stroke_width")]
    edge_stroke_width: f32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneralSettings {
    #[serde(default = "default_font_size")]
    font_size: u32,
    #[serde(default = "default_false")]
    dark_mode: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
            dark_mode: default_false(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EditorSettings {
    #[serde(default = "default_editor_theme")]
    theme: String,
    #[serde(default = "default_tab_size")]
    tab_size: u32,
    #[serde(default = "default_insert_spaces")]
    insert_spaces: bool,
    #[serde(default = "default_true")]
    auto_close_brackets: bool,
    #[serde(default = "default_true")]
    auto_close_quotes: bool,
    #[serde(default = "default_true")]
    auto_close_comments: bool,
    #[serde(default = "default_true")]
    word_wrap: bool,
    #[serde(default = "default_false")]
    scope_highlighting: bool,
    #[serde(default = "default_true")]
    auto_format_on_save: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            theme: default_editor_theme(),
            tab_size: default_tab_size(),
            insert_spaces: default_insert_spaces(),
            auto_close_brackets: default_true(),
            auto_close_quotes: default_true(),
            auto_close_comments: default_true(),
            word_wrap: default_true(),
            scope_highlighting: default_false(),
            auto_format_on_save: default_true(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DebugLogCategories {
    #[serde(default = "default_true")]
    startup: bool,
    #[serde(default = "default_true")]
    launch: bool,
    #[serde(default = "default_true")]
    language_server: bool,
    #[serde(default = "default_true")]
    editor: bool,
    #[serde(default = "default_true")]
    uml: bool,
    #[serde(default = "default_true")]
    structogram: bool,
    #[serde(default = "default_true")]
    jshell: bool,
}

impl Default for DebugLogCategories {
    fn default() -> Self {
        Self {
            startup: default_true(),
            launch: default_true(),
            language_server: default_true(),
            editor: default_true(),
            uml: default_true(),
            structogram: default_true(),
            jshell: default_true(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AdvancedSettings {
    #[serde(default = "default_false")]
    debug_logging: bool,
    #[serde(default)]
    debug_log_categories: DebugLogCategories,
    #[serde(default = "default_true")]
    structogram_colors: bool,
    #[serde(default = "default_update_channel")]
    update_channel: UpdateChannel,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            debug_logging: default_false(),
            debug_log_categories: DebugLogCategories::default(),
            structogram_colors: default_true(),
            update_channel: default_update_channel(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StructogramSettings {
    #[serde(default = "default_structogram_loop_header_color")]
    loop_header_color: String,
    #[serde(default = "default_structogram_if_header_color")]
    if_header_color: String,
    #[serde(default = "default_structogram_switch_header_color")]
    switch_header_color: String,
    #[serde(default = "default_structogram_try_wrapper_color")]
    try_wrapper_color: String,
}

impl Default for StructogramSettings {
    fn default() -> Self {
        Self {
            loop_header_color: default_structogram_loop_header_color(),
            if_header_color: default_structogram_if_header_color(),
            switch_header_color: default_structogram_switch_header_color(),
            try_wrapper_color: default_structogram_try_wrapper_color(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ObjectBenchSettings {
    #[serde(default = "default_true")]
    show_private_object_fields: bool,
    #[serde(default = "default_true")]
    show_inherited_object_fields: bool,
    #[serde(default = "default_true")]
    show_static_object_fields: bool,
    #[serde(default = "default_true")]
    use_object_parameter_dropdowns: bool,
}

impl Default for ObjectBenchSettings {
    fn default() -> Self {
        Self {
            show_private_object_fields: default_true(),
            show_inherited_object_fields: default_true(),
            show_static_object_fields: default_true(),
            use_object_parameter_dropdowns: default_true(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LayoutSettings {
    #[serde(default = "default_split_ratio")]
    uml_split_ratio: f32,
    #[serde(default = "default_console_split_ratio")]
    console_split_ratio: f32,
    #[serde(default = "default_object_bench_split_ratio")]
    object_bench_split_ratio: f32,
}

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            uml_split_ratio: default_split_ratio(),
            console_split_ratio: default_console_split_ratio(),
            object_bench_split_ratio: default_object_bench_split_ratio(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum RecentProjectKind {
    Packed,
    Folder,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum UpdateChannel {
    Stable,
    Prerelease,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentProjectEntry {
    path: String,
    kind: RecentProjectKind,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettings {
    #[serde(default)]
    general: GeneralSettings,
    uml: UmlSettings,
    #[serde(default)]
    object_bench: ObjectBenchSettings,
    #[serde(default)]
    editor: EditorSettings,
    #[serde(default)]
    advanced: AdvancedSettings,
    #[serde(default)]
    structogram: StructogramSettings,
    #[serde(default)]
    recent_projects: Vec<RecentProjectEntry>,
    #[serde(default)]
    layout: LayoutSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings {
                font_size: default_font_size(),
                dark_mode: default_false(),
            },
            uml: UmlSettings {
                show_dependencies: true,
                show_packages: default_true(),
                show_swing_attributes: default_true(),
                code_highlight: default_true(),
                show_parameter_names: default_true(),
                edge_stroke_width: default_edge_stroke_width(),
            },
            object_bench: ObjectBenchSettings {
                show_private_object_fields: default_true(),
                show_inherited_object_fields: default_true(),
                show_static_object_fields: default_true(),
                use_object_parameter_dropdowns: default_true(),
            },
            editor: EditorSettings {
                theme: default_editor_theme(),
                tab_size: default_tab_size(),
                insert_spaces: default_insert_spaces(),
                auto_close_brackets: default_true(),
                auto_close_quotes: default_true(),
                auto_close_comments: default_true(),
                word_wrap: default_true(),
                scope_highlighting: default_false(),
                auto_format_on_save: default_true(),
            },
            advanced: AdvancedSettings {
                debug_logging: default_false(),
                debug_log_categories: DebugLogCategories::default(),
                structogram_colors: default_true(),
                update_channel: default_update_channel(),
            },
            structogram: StructogramSettings {
                loop_header_color: default_structogram_loop_header_color(),
                if_header_color: default_structogram_if_header_color(),
                switch_header_color: default_structogram_switch_header_color(),
                try_wrapper_color: default_structogram_try_wrapper_color(),
            },
            recent_projects: Vec::new(),
            layout: LayoutSettings {
                uml_split_ratio: default_split_ratio(),
                console_split_ratio: default_console_split_ratio(),
                object_bench_split_ratio: default_object_bench_split_ratio(),
            },
        }
    }
}

impl AppSettings {
    pub(crate) fn default_with_dark_mode(dark_mode: bool) -> Self {
        let mut settings = Self::default();
        settings.general.dark_mode = dark_mode;
        settings
    }

    pub(crate) fn debug_logging_enabled(&self) -> bool {
        self.advanced.debug_logging
    }

    pub(crate) fn debug_category_enabled(&self, category: DebugLogCategory) -> bool {
        if !self.debug_logging_enabled() {
            return false;
        }
        match category {
            DebugLogCategory::Startup => self.advanced.debug_log_categories.startup,
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum DebugLogCategory {
    Startup,
}

fn default_font_size() -> u32 {
    12
}

fn default_editor_theme() -> String {
    "default".to_string()
}

fn default_tab_size() -> u32 {
    4
}

fn default_insert_spaces() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_true() -> bool {
    true
}

fn default_edge_stroke_width() -> f32 {
    1.0
}

fn default_update_channel() -> UpdateChannel {
    UpdateChannel::Stable
}

fn default_split_ratio() -> f32 {
    0.5
}

fn default_console_split_ratio() -> f32 {
    0.75
}

fn default_object_bench_split_ratio() -> f32 {
    0.75
}

fn default_structogram_loop_header_color() -> String {
    "#d2ebd3".to_string()
}

fn default_structogram_if_header_color() -> String {
    "#cec1eb".to_string()
}

fn default_structogram_switch_header_color() -> String {
    "#d6e1ee".to_string()
}

fn default_structogram_try_wrapper_color() -> String {
    "#f3e2c2".to_string()
}
