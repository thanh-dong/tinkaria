import { python as pythonPreset, rust as rustPreset, css as cssPreset } from "sugar-high/presets"

type LanguageConfig = {
  keywords: Set<string>
  onCommentStart?(curr: string, next: string): 0 | 1 | 2
  onCommentEnd?(prev: string, curr: string): 0 | 1 | 2
  onQuote?(curr: string, i: number, code: string): number | null | undefined
}

// Shared comment handlers
function hashComment(curr: string): 0 | 1 {
  return curr === "#" ? 1 : 0
}

function dashDashComment(curr: string, next: string): 0 | 1 | 2 {
  if (curr === "-" && next === "-") return 1
  if (curr === "/" && next === "*") return 2
  return 0
}

function slashAndHashComment(curr: string, next: string): 0 | 1 | 2 {
  if (curr === "/" && next === "/") return 1
  if (curr === "/" && next === "*") return 2
  if (curr === "#") return 1
  return 0
}

function multilineEnd(prev: string, curr: string): 0 | 2 {
  return prev === "*" && curr === "/" ? 2 : 0
}

const goPreset: LanguageConfig = {
  keywords: new Set([
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
    "map", "package", "range", "return", "select", "struct", "switch", "type",
    "var", "nil", "true", "false", "iota", "append", "cap", "close", "copy",
    "delete", "len", "make", "new", "panic", "print", "println", "recover",
    "error", "string", "int", "int8", "int16", "int32", "int64", "uint",
    "uint8", "uint16", "uint32", "uint64", "float32", "float64", "bool",
    "byte", "rune", "complex64", "complex128", "any",
  ]),
}

const javaPreset: LanguageConfig = {
  keywords: new Set([
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "goto", "if", "implements",
    "import", "instanceof", "int", "interface", "long", "native", "new",
    "package", "private", "protected", "public", "return", "short", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "try", "void", "volatile", "while", "true", "false", "null",
    "var", "record", "sealed", "permits", "yield",
  ]),
}

const bashPreset: LanguageConfig = {
  keywords: new Set([
    "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
    "case", "esac", "in", "function", "return", "local", "declare", "export",
    "readonly", "unset", "shift", "break", "continue", "exit", "trap", "source",
    "eval", "exec", "set", "true", "false", "echo", "printf", "read", "test",
    "cd", "pwd", "mkdir", "rm", "cp", "mv", "ls", "cat", "grep", "sed", "awk",
    "find", "xargs", "sort", "uniq", "wc", "head", "tail", "cut", "tr",
    "chmod", "chown", "curl", "wget",
  ]),
  onCommentStart: hashComment,
}

const rubyPreset: LanguageConfig = {
  keywords: new Set([
    "alias", "and", "begin", "break", "case", "class", "def", "defined",
    "do", "else", "elsif", "end", "ensure", "false", "for", "if", "in",
    "module", "next", "nil", "not", "or", "redo", "rescue", "retry",
    "return", "self", "super", "then", "true", "undef", "unless", "until",
    "when", "while", "yield", "require", "include", "extend", "attr_reader",
    "attr_writer", "attr_accessor", "private", "protected", "public", "raise",
    "puts", "print", "lambda", "proc", "block_given",
  ]),
  onCommentStart: hashComment,
}

const sqlPreset: LanguageConfig = {
  keywords: new Set([
    "select", "from", "where", "and", "or", "not", "insert", "into", "values",
    "update", "set", "delete", "create", "table", "drop", "alter", "add",
    "column", "index", "view", "as", "join", "inner", "left", "right", "outer",
    "full", "on", "group", "by", "order", "asc", "desc", "having", "limit",
    "offset", "union", "all", "distinct", "between", "like", "in", "is",
    "null", "true", "false", "exists", "case", "when", "then", "else", "end",
    "cast", "primary", "key", "foreign", "references", "constraint", "unique",
    "default", "check", "grant", "revoke", "begin", "commit", "rollback",
    "transaction", "if", "declare", "cursor", "fetch", "open", "close",
    "integer", "varchar", "text", "boolean", "date", "timestamp", "float",
    "decimal", "serial", "bigint", "smallint", "char", "with", "recursive",
    "returning", "conflict", "do", "nothing", "coalesce", "count", "sum",
    "avg", "min", "max", "explain", "analyze", "using", "cascade",
    // case-insensitive: SQL keywords are typically uppercase but we match lowercase
    "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "INSERT", "INTO", "VALUES",
    "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "ADD",
    "COLUMN", "INDEX", "VIEW", "AS", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER",
    "FULL", "ON", "GROUP", "BY", "ORDER", "ASC", "DESC", "HAVING", "LIMIT",
    "OFFSET", "UNION", "ALL", "DISTINCT", "BETWEEN", "LIKE", "IN", "IS",
    "NULL", "TRUE", "FALSE", "EXISTS", "CASE", "WHEN", "THEN", "ELSE", "END",
    "CAST", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CONSTRAINT", "UNIQUE",
    "DEFAULT", "CHECK", "BEGIN", "COMMIT", "ROLLBACK", "RETURNING", "WITH",
    "INTEGER", "VARCHAR", "TEXT", "BOOLEAN", "DATE", "TIMESTAMP", "FLOAT",
    "DECIMAL", "SERIAL", "BIGINT", "SMALLINT", "CHAR", "COUNT", "SUM",
    "AVG", "MIN", "MAX", "EXPLAIN", "ANALYZE", "USING", "CASCADE",
  ]),
  onCommentStart: dashDashComment,
  onCommentEnd: multilineEnd,
}

const cPreset: LanguageConfig = {
  keywords: new Set([
    "auto", "break", "case", "char", "const", "continue", "default", "do",
    "double", "else", "enum", "extern", "float", "for", "goto", "if",
    "inline", "int", "long", "register", "restrict", "return", "short",
    "signed", "sizeof", "static", "struct", "switch", "typedef", "union",
    "unsigned", "void", "volatile", "while", "NULL", "true", "false",
    "bool", "size_t", "int8_t", "int16_t", "int32_t", "int64_t",
    "uint8_t", "uint16_t", "uint32_t", "uint64_t", "include", "define",
    "ifdef", "ifndef", "endif", "pragma", "elif",
  ]),
}

const cppPreset: LanguageConfig = {
  keywords: new Set([
    ...cPreset.keywords,
    "alignas", "alignof", "and_eq", "asm", "bitand", "bitor", "catch",
    "class", "co_await", "co_return", "co_yield", "compl", "concept",
    "consteval", "constexpr", "constinit", "decltype", "delete", "dynamic_cast",
    "explicit", "export", "final", "friend", "mutable", "namespace", "new",
    "noexcept", "not_eq", "nullptr", "operator", "or_eq", "override",
    "private", "protected", "public", "reinterpret_cast", "requires",
    "static_assert", "static_cast", "template", "this", "thread_local",
    "throw", "try", "typeid", "typename", "using", "virtual", "xor_eq",
    "string", "vector", "map", "set", "pair", "shared_ptr", "unique_ptr",
    "optional", "variant", "array", "cout", "cin", "endl", "std",
  ]),
}

const kotlinPreset: LanguageConfig = {
  keywords: new Set([
    "abstract", "actual", "annotation", "as", "break", "by", "catch", "class",
    "companion", "const", "constructor", "continue", "crossinline", "data",
    "do", "else", "enum", "expect", "external", "false", "final", "finally",
    "for", "fun", "get", "if", "import", "in", "infix", "init", "inline",
    "inner", "interface", "internal", "is", "lateinit", "noinline", "null",
    "object", "open", "operator", "out", "override", "package", "private",
    "protected", "public", "reified", "return", "sealed", "set", "super",
    "suspend", "this", "throw", "true", "try", "typealias", "val", "var",
    "vararg", "when", "where", "while",
  ]),
}

const swiftPreset: LanguageConfig = {
  keywords: new Set([
    "actor", "as", "associatedtype", "async", "await", "break", "case",
    "catch", "class", "continue", "default", "defer", "deinit", "do", "else",
    "enum", "extension", "fallthrough", "false", "fileprivate", "for", "func",
    "guard", "if", "import", "in", "init", "inout", "internal", "is", "lazy",
    "let", "nil", "open", "operator", "override", "private", "protocol",
    "public", "repeat", "required", "rethrows", "return", "self", "some",
    "static", "struct", "subscript", "super", "switch", "throw", "throws",
    "true", "try", "typealias", "var", "weak", "where", "while",
    "String", "Int", "Double", "Float", "Bool", "Array", "Dictionary",
    "Optional", "Set", "Any", "AnyObject", "Self", "Type",
  ]),
}

const phpPreset: LanguageConfig = {
  keywords: new Set([
    "abstract", "and", "array", "as", "break", "callable", "case", "catch",
    "class", "clone", "const", "continue", "declare", "default", "do", "echo",
    "else", "elseif", "empty", "enddeclare", "endfor", "endforeach", "endif",
    "endswitch", "endwhile", "enum", "extends", "false", "final", "finally",
    "fn", "for", "foreach", "function", "global", "goto", "if", "implements",
    "include", "instanceof", "interface", "isset", "list", "match", "namespace",
    "new", "null", "or", "print", "private", "protected", "public", "readonly",
    "require", "return", "static", "switch", "this", "throw", "trait", "true",
    "try", "unset", "use", "var", "while", "xor", "yield",
  ]),
  onCommentStart: slashAndHashComment,
  onCommentEnd: multilineEnd,
}

const luaPreset: LanguageConfig = {
  keywords: new Set([
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
    "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
    "then", "true", "until", "while", "require", "print", "pairs", "ipairs",
    "type", "tostring", "tonumber", "error", "pcall", "xpcall", "select",
    "next", "rawget", "rawset", "setmetatable", "getmetatable", "self",
    "table", "string", "math", "io", "os", "coroutine",
  ]),
  onCommentStart: dashDashComment,
}

const yamlPreset: LanguageConfig = {
  keywords: new Set([
    "true", "false", "null", "yes", "no", "on", "off",
    "True", "False", "Null", "Yes", "No", "On", "Off",
    "TRUE", "FALSE", "NULL", "YES", "NO", "ON", "OFF",
  ]),
  onCommentStart: hashComment,
}

const tomlPreset: LanguageConfig = {
  keywords: new Set(["true", "false"]),
  onCommentStart: hashComment,
}

const dockerfilePreset: LanguageConfig = {
  keywords: new Set([
    "FROM", "RUN", "CMD", "LABEL", "MAINTAINER", "EXPOSE", "ENV", "ADD",
    "COPY", "ENTRYPOINT", "VOLUME", "USER", "WORKDIR", "ARG", "ONBUILD",
    "STOPSIGNAL", "HEALTHCHECK", "SHELL", "AS",
    "from", "run", "cmd", "label", "expose", "env", "add", "copy",
    "entrypoint", "volume", "user", "workdir", "arg", "as",
  ]),
  onCommentStart: hashComment,
}

const csharpPreset: LanguageConfig = {
  keywords: new Set([
    "abstract", "as", "async", "await", "base", "bool", "break", "byte",
    "case", "catch", "char", "checked", "class", "const", "continue",
    "decimal", "default", "delegate", "do", "double", "else", "enum",
    "event", "explicit", "extern", "false", "finally", "fixed", "float",
    "for", "foreach", "goto", "if", "implicit", "in", "int", "interface",
    "internal", "is", "lock", "long", "namespace", "new", "null", "object",
    "operator", "out", "override", "params", "private", "protected", "public",
    "readonly", "record", "ref", "return", "sbyte", "sealed", "short",
    "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
    "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
    "ushort", "using", "var", "virtual", "void", "volatile", "where", "while",
    "yield", "get", "set", "init", "value", "required",
  ]),
}

const makefilePreset: LanguageConfig = {
  keywords: new Set([
    "ifeq", "ifneq", "ifdef", "ifndef", "else", "endif", "define", "endef",
    "include", "override", "export", "unexport", "vpath", "PHONY", "FORCE",
    "SUFFIXES", "DEFAULT", "PRECIOUS", "INTERMEDIATE", "SECONDARY",
    "IGNORE", "SILENT", "EXPORT_ALL_VARIABLES", "NOTPARALLEL", "ONESHELL",
    ".PHONY", ".FORCE", ".DEFAULT",
  ]),
  onCommentStart: hashComment,
}

// Language alias map
const presetMap: Record<string, LanguageConfig> = {
  python: pythonPreset,
  py: pythonPreset,
  rust: rustPreset,
  rs: rustPreset,
  css: cssPreset,
  scss: cssPreset,
  go: goPreset,
  golang: goPreset,
  java: javaPreset,
  bash: bashPreset,
  sh: bashPreset,
  shell: bashPreset,
  zsh: bashPreset,
  sql: sqlPreset,
  postgresql: sqlPreset,
  postgres: sqlPreset,
  mysql: sqlPreset,
  sqlite: sqlPreset,
  ruby: rubyPreset,
  rb: rubyPreset,
  c: cPreset,
  cpp: cppPreset,
  "c++": cppPreset,
  cxx: cppPreset,
  kotlin: kotlinPreset,
  kt: kotlinPreset,
  swift: swiftPreset,
  php: phpPreset,
  lua: luaPreset,
  yaml: yamlPreset,
  yml: yamlPreset,
  toml: tomlPreset,
  dockerfile: dockerfilePreset,
  docker: dockerfilePreset,
  csharp: csharpPreset,
  cs: csharpPreset,
  makefile: makefilePreset,
  make: makefilePreset,
}

export function getLanguagePreset(language: string): LanguageConfig | undefined {
  return presetMap[language.toLowerCase()]
}
