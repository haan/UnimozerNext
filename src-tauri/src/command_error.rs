use std::fmt::Display;

pub(crate) type CommandResult<T> = Result<T, String>;

pub(crate) fn to_command_error(error: impl Display) -> String {
    error.to_string()
}
