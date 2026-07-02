#!/usr/bin/env python3
"""
Parse SQL DDL and generate one CSV file per CREATE TABLE with realistic mock data.

Uses pandas for tabular output and Faker for names, emails, dates, etc.
Foreign keys reference valid parent primary-key values generated in dependency order.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
from faker import Faker


CONSTRAINT_KEYWORD = re.compile(
    r"\s+(?:GENERATED|DEFAULT|NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT|REFERENCES|OPTIONS)\b",
    re.I,
)


@dataclass
class ForeignKey:
    column: str
    ref_table: str
    ref_column: str


@dataclass
class Column:
    name: str
    sql_type: str
    nullable: bool
    is_primary: bool
    enum_values: List[str] = field(default_factory=list)
    foreign_key: Optional[ForeignKey] = None


@dataclass
class Table:
    name: str
    columns: List[Column]
    primary_key: List[str]


def unquote(name: str) -> str:
    return name.strip().strip('"').strip("'").strip("`")


def parse_identifier_at(text: str, pos: int) -> Optional[Tuple[str, int]]:
    index = pos
    while index < len(text) and text[index].isspace():
        index += 1
    if index >= len(text):
        return None

    quote = text[index]
    if quote in ('"', "'", "`"):
        index += 1
        value = ""
        while index < len(text) and text[index] != quote:
            value += text[index]
            index += 1
        if index < len(text) and text[index] == quote:
            index += 1
        return value, index

    if re.match(r"[\w$#@]", quote):
        start = index
        while index < len(text) and re.match(r"[\w$#@]", text[index]):
            index += 1
        return text[start:index], index
    return None


def parse_qualified_name(text: str, pos: int) -> Optional[Tuple[str, int]]:
    first = parse_identifier_at(text, pos)
    if not first:
        return None
    name, index = first
    while index < len(text):
        while index < len(text) and text[index].isspace():
            index += 1
        if index >= len(text) or text[index] != ".":
            break
        index += 1
        nxt = parse_identifier_at(text, index)
        if not nxt:
            break
        name = f"{name}.{nxt[0]}"
        index = nxt[1]
    return name, index


def find_create_table_blocks(ddl: str) -> List[Tuple[str, str]]:
    blocks: List[Tuple[str, str]] = []
    head_re = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?", re.I)
    for head in head_re.finditer(ddl):
        table_ref = parse_qualified_name(ddl, head.end())
        if not table_ref:
            continue
        table_name, pos = table_ref
        while pos < len(ddl) and ddl[pos].isspace():
            pos += 1
        if pos >= len(ddl) or ddl[pos] != "(":
            continue
        pos += 1
        body_start = pos
        depth = 1
        while pos < len(ddl) and depth > 0:
            if ddl[pos] == "(":
                depth += 1
            elif ddl[pos] == ")":
                depth -= 1
            pos += 1
        body = ddl[body_start:pos - 1]
        short_name = table_name.split(".")[-1]
        blocks.append((short_name, body))
    return blocks


def strip_sql_line_comment(text: str) -> str:
    """Remove a trailing SQL line comment (--) outside quoted string literals."""
    in_single = False
    in_double = False
    index = 0
    while index < len(text):
        char = text[index]
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif (
            char == "-"
            and index + 1 < len(text)
            and text[index + 1] == "-"
            and not in_single
            and not in_double
        ):
            return text[:index].rstrip()
        index += 1
    return text


def is_valid_column_name(name: str) -> bool:
    """True when the token is a usable SQL identifier (matches hvyMETL ddlParser)."""
    if not name or name.startswith("--"):
        return False
    return bool(re.match(r"^[\w$#@]+$", name, re.ASCII))


def split_column_definitions(body: str) -> List[str]:
    parts: List[str] = []
    depth = 0
    current: List[str] = []
    for char in body:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if "".join(current).strip():
        parts.append("".join(current).strip())
    return parts


def parse_enum_values(sql_type: str) -> List[str]:
    match = re.search(r"enum\s*\((.*)\)", sql_type, re.I)
    if not match:
        return []
    inner = match.group(1)
    values: List[str] = []
    for quoted in re.finditer(r"'([^']*)'|\"([^\"]*)\"", inner):
        raw = quoted.group(1) if quoted.group(1) is not None else quoted.group(2)
        if raw is None:
            continue
        values.append(unquote(raw.strip()))
    return values


def parse_reference_target(ref_clause: str) -> Optional[Tuple[str, str]]:
    open_paren = ref_clause.rfind("(")
    if open_paren == -1:
        return None
    table_part = ref_clause[:open_paren].strip()
    close_paren = ref_clause.rfind(")")
    col_part = ref_clause[open_paren + 1:close_paren].strip() if close_paren > open_paren else ""
    table_segments = [unquote(s.strip()) for s in table_part.split(".")]
    table = table_segments[-1]
    column = unquote(col_part)
    if not table or not column:
        return None
    return table, column


def parse_foreign_key_line(line: str) -> Optional[ForeignKey]:
    trimmed = line.strip()
    fk_match = re.search(
        r"FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+(\S+)\s*\(\s*([^)]+)\s*\)",
        trimmed,
        re.I,
    )
    if fk_match:
        column = unquote(fk_match.group(1).split(",")[0].strip())
        ref_table = unquote(fk_match.group(2).split(".")[-1])
        ref_column = unquote(fk_match.group(3).strip())
        return ForeignKey(column=column, ref_table=ref_table, ref_column=ref_column)

    inline = re.search(r"REFERENCES\s+(.+)$", trimmed, re.I)
    if inline:
        col_match = re.match(r"^(\S+)\s+", trimmed, re.I)
        if not col_match:
            return None
        column = unquote(col_match.group(1))
        ref = parse_reference_target(inline.group(1).strip())
        if not ref:
            return None
        return ForeignKey(column=column, ref_table=ref[0], ref_column=ref[1])
    return None


def parse_column_line(line: str) -> Optional[Column]:
    trimmed = strip_sql_line_comment(line.strip())
    if not trimmed or trimmed.upper().startswith(("PRIMARY KEY", "UNIQUE", "CHECK", "CONSTRAINT", "FOREIGN KEY")):
        return None

    name_match = re.match(r'^["\']?([\w$#@]+)["\']?\s+(.+)$', trimmed, re.S)
    if not name_match:
        return None

    name = unquote(name_match.group(1))
    if not is_valid_column_name(name):
        return None
    rest = name_match.group(2).strip()
    type_end = CONSTRAINT_KEYWORD.search(rest)
    sql_type = rest[: type_end.start()].strip() if type_end else rest.split()[0]
    tail = rest[type_end.start():] if type_end else ""

    nullable = "NOT NULL" not in tail.upper() or "NULL" in tail.upper() and "NOT NULL" not in tail.upper()
    is_primary = bool(re.search(r"\bPRIMARY\s+KEY\b", tail, re.I))
    fk = parse_foreign_key_line(trimmed)
    enum_values = parse_enum_values(sql_type)

    return Column(
        name=name,
        sql_type=sql_type,
        nullable=nullable,
        is_primary=is_primary,
        enum_values=enum_values,
        foreign_key=fk,
    )


def preprocess_table_body(body: str) -> str:
    """Remove SQL line comments so comma splits do not treat '--' as column names."""
    cleaned_lines: List[str] = []
    for raw_line in body.splitlines():
        line = strip_sql_line_comment(raw_line.rstrip())
        if line:
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def parse_ddl(ddl: str) -> List[Table]:
    tables: List[Table] = []
    for table_name, body in find_create_table_blocks(ddl):
        columns: List[Column] = []
        foreign_keys: List[ForeignKey] = []
        primary_key: List[str] = []

        for line in split_column_definitions(preprocess_table_body(body)):
            trimmed = line.strip()
            upper = trimmed.upper()
            if upper.startswith("CONSTRAINT") or upper.startswith("FOREIGN KEY"):
                fk_line = parse_foreign_key_line(line)
                if fk_line:
                    foreign_keys.append(fk_line)
                continue

            pk_inline = re.search(r"PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)", line, re.I)
            if pk_inline and not columns:
                primary_key = [unquote(c.strip()) for c in pk_inline.group(1).split(",")]
                continue

            parsed = parse_column_line(line)
            if not parsed:
                if pk_inline:
                    primary_key = [unquote(c.strip()) for c in pk_inline.group(1).split(",")]
                continue
            columns.append(parsed)
            if parsed.is_primary and parsed.name not in primary_key:
                primary_key.append(parsed.name)
            if parsed.foreign_key:
                foreign_keys.append(parsed.foreign_key)

        for fk in foreign_keys:
            for col in columns:
                if col.name == fk.column:
                    col.foreign_key = fk

        if not primary_key and columns:
            primary_key = [columns[0].name]

        tables.append(Table(name=table_name, columns=columns, primary_key=primary_key))
    return ensure_referenced_tables(tables)


def ensure_referenced_tables(tables: List[Table]) -> List[Table]:
    """Add minimal parent CSV tables for FK targets referenced but not defined in the pasted DDL."""
    by_name = {table.name.lower(): table for table in tables}
    stubs: List[Table] = []

    for table in tables:
        for column in table.columns:
            fk = column.foreign_key
            if not fk:
                continue
            ref_key = fk.ref_table.lower()
            if ref_key in by_name:
                continue
            pk_column = Column(
                name=fk.ref_column,
                sql_type=column.sql_type,
                nullable=False,
                is_primary=True,
            )
            stub = Table(name=fk.ref_table, columns=[pk_column], primary_key=[fk.ref_column])
            by_name[ref_key] = stub
            stubs.append(stub)

    return [*tables, *stubs]


def topological_sort_tables(tables: List[Table]) -> List[Table]:
    by_name = {t.name: t for t in tables}
    deps: Dict[str, Set[str]] = {t.name: set() for t in tables}
    for table in tables:
        for col in table.columns:
            if col.foreign_key and col.foreign_key.ref_table in by_name:
                if col.foreign_key.ref_table != table.name:
                    deps[table.name].add(col.foreign_key.ref_table)

    ordered: List[Table] = []
    ready = [t.name for t in tables if not deps[t.name]]
    while ready:
        name = ready.pop(0)
        ordered.append(by_name[name])
        for child, parents in deps.items():
            if name in parents:
                parents.remove(name)
                if not parents and child not in [t.name for t in ordered]:
                    ready.append(child)

    for table in tables:
        if table not in ordered:
            ordered.append(table)
    return ordered


def sql_type_family(sql_type: str) -> str:
    upper = sql_type.upper()
    if "INT" in upper or upper.startswith("SERIAL") or upper.startswith("BIGSERIAL"):
        return "int"
    if any(token in upper for token in ("FLOAT", "DOUBLE", "REAL", "DECIMAL", "NUMERIC", "NUMBER")):
        return "float"
    if "BOOL" in upper:
        return "bool"
    if "DATE" in upper and "DATETIME" not in upper and "TIMESTAMP" not in upper:
        return "date"
    if "TIME" in upper or "TIMESTAMP" in upper or "DATETIME" in upper:
        return "datetime"
    if "ENUM" in upper:
        return "enum"
    if any(token in upper for token in ("TEXT", "CHAR", "CLOB", "STRING", "JSON", "BYTES")):
        return "string"
    return "string"


def column_value_hint(name: str) -> Optional[str]:
    lower = name.lower()
    hints = {
        "email": "email",
        "e_mail": "email",
        "phone": "phone",
        "mobile": "phone",
        "first_name": "first_name",
        "lastname": "last_name",
        "last_name": "last_name",
        "country": "country",
        "name": "name",
        "address": "address",
        "city": "city",
        "zip": "postcode",
        "postal": "postcode",
        "url": "url",
        "website": "url",
        "company": "company",
        "title": "job",
        "description": "text",
        "message": "text",
        "comment": "text",
        "changelog": "text",
        "uuid": "uuid",
    }
    for key, hint in hints.items():
        if key in lower:
            return hint
    if lower.endswith("_at") or lower.endswith("_time") or lower in ("time", "date", "term", "recorded_at", "raised_at"):
        return "datetime"
    if lower in ("amount", "balance", "rate", "price", "total", "limit", "current_val"):
        return "float"
    if lower in ("number", "serial_number", "account_number", "card_number"):
        return "number"
    if lower == "type" or lower.endswith("_type") or lower == "status":
        return "category"
    return None


def parse_string_max_length(sql_type: str) -> Optional[int]:
    """Return declared CHAR/VARCHAR length from types like VARCHAR(10) or CHAR(2)."""
    match = re.search(r"\((\d+)\)", sql_type)
    if not match:
        return None
    return int(match.group(1))


BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
LETTER_PREFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def encode_base62(value: int, min_width: int = 1) -> str:
    """Encode a non-negative integer into compact base62 for deterministic mock keys."""
    if value < 0:
        raise ValueError("Base62 encoding only supports non-negative integers.")
    if value == 0:
        encoded = BASE62_ALPHABET[0]
    else:
        chars: List[str] = []
        current = value
        while current > 0:
            current, remainder = divmod(current, len(BASE62_ALPHABET))
            chars.append(BASE62_ALPHABET[remainder])
        encoded = "".join(reversed(chars))
    return encoded.rjust(min_width, BASE62_ALPHABET[0])


def unique_string_primary_key(row_index: int, max_len: Optional[int]) -> str:
    """Return a stable unique string key that still fits short CHAR/VARCHAR columns when possible."""
    if max_len is None:
        return f"pk_{encode_base62(row_index, 8)}"

    width = max(1, max_len)
    if width == 1:
        if row_index < len(LETTER_PREFIX_ALPHABET):
            return LETTER_PREFIX_ALPHABET[row_index]
        return encode_base62(row_index)

    suffix_capacity = len(BASE62_ALPHABET) ** (width - 1)
    total_capacity = len(LETTER_PREFIX_ALPHABET) * suffix_capacity
    if row_index < total_capacity:
        prefix = LETTER_PREFIX_ALPHABET[row_index // suffix_capacity]
        suffix = encode_base62(row_index % suffix_capacity, width - 1)
        return f"{prefix}{suffix}"

    # A declared key width this small cannot represent the requested row count.
    # Prefer uniqueness over truncation so downstream MongoDB _id imports remain valid.
    return f"{LETTER_PREFIX_ALPHABET[-1]}{encode_base62(row_index)}"


class DataGenerator:
    def __init__(self, seed: int) -> None:
        self.fake = Faker()
        Faker.seed(seed)
        random_seed = seed
        import random

        random.seed(random_seed)
        self._random = random
        self.parent_ids: Dict[Tuple[str, str], List[Any]] = {}

    def _string_max_len(self, col: Column) -> Optional[int]:
        return parse_string_max_length(col.sql_type)

    def _fit_string(self, col: Column, value: str) -> str:
        max_len = self._string_max_len(col)
        if max_len is not None and len(value) > max_len:
            return value[:max_len]
        return value

    def _random_string(self, col: Column) -> str:
        max_len = self._string_max_len(col) or 32
        max_len = max(1, min(max_len, 255))
        min_chars = min(4, max_len)
        return self.fake.pystr(min_chars=min_chars, max_chars=max_len)

    def store_ids(self, table: str, column: str, values: List[Any]) -> None:
        self.parent_ids[(table, column)] = values

    def sample_fk(self, ref_table: str, ref_column: str, nullable: bool) -> Any:
        pool = self.parent_ids.get((ref_table, ref_column), [])
        if not pool:
            return None if nullable else 1
        if nullable and self._random.random() < 0.05:
            return None
        return self._random.choice(pool)

    def generate_value(self, col: Column, row_index: int, table: Table) -> Any:
        if col.is_primary or col.name in table.primary_key:
            family = sql_type_family(col.sql_type)
            if family == "int":
                return row_index + 1
            if family == "string":
                return unique_string_primary_key(row_index, self._string_max_len(col))
            return row_index + 1

        if col.foreign_key:
            return self.sample_fk(col.foreign_key.ref_table, col.foreign_key.ref_column, col.nullable)

        if col.nullable and self._random.random() < 0.08:
            return None

        family = sql_type_family(col.sql_type)
        hint = column_value_hint(col.name)

        if family == "enum" and col.enum_values:
            return self._random.choice(col.enum_values)

        if hint == "email":
            return self._fit_string(col, self.fake.email())
        if hint == "phone":
            return self._fit_string(col, self.fake.phone_number())
        if hint == "first_name":
            return self._fit_string(col, self.fake.first_name())
        if hint == "last_name":
            return self._fit_string(col, self.fake.last_name())
        if hint == "name":
            return self._fit_string(col, self.fake.name())
        if hint == "address":
            return self._fit_string(col, self.fake.address().replace("\n", ", "))
        if hint == "city":
            return self._fit_string(col, self.fake.city())
        if hint == "country":
            return self._fit_string(col, self.fake.country())
        if hint == "postcode":
            return self._fit_string(col, self.fake.postcode())
        if hint == "url":
            return self._fit_string(col, self.fake.url())
        if hint == "company":
            return self._fit_string(col, self.fake.company())
        if hint == "job":
            return self._fit_string(col, self.fake.job())
        if hint == "text":
            return self._fit_string(col, self.fake.sentence(nb_words=8))
        if hint == "uuid":
            return self._fit_string(col, str(self.fake.uuid4()))
        if hint == "datetime" or family == "datetime":
            return self.fake.date_time_between(start_date="-3y", end_date="now").strftime("%Y-%m-%d %H:%M:%S")
        if hint == "date" or family == "date":
            return self.fake.date_between(start_date="-3y", end_date="today").isoformat()
        if hint == "float" or family == "float":
            return round(self._random.uniform(1.0, 10000.0), 2)
        if hint == "number" or family == "int":
            return self._random.randint(1, 999999999)
        if family == "bool":
            return self._random.choice([0, 1])

        return self._random_string(col)


def row_count_for_table(table: Table, base_rows: int, child_multiplier: float, min_rows: int, max_rows: int) -> int:
    has_fk = any(col.foreign_key for col in table.columns)
    count = base_rows * (child_multiplier if has_fk else 1.0)
    count = int(max(min_rows, min(max_rows, round(count))))
    return count


def generate_table_csv(
    table: Table,
    generator: DataGenerator,
    base_rows: int,
    child_multiplier: float,
    min_rows: int,
    max_rows: int,
) -> pd.DataFrame:
    row_count = row_count_for_table(table, base_rows, child_multiplier, min_rows, max_rows)
    rows: List[Dict[str, Any]] = []
    for index in range(row_count):
        record: Dict[str, Any] = {}
        for col in table.columns:
            record[col.name] = generator.generate_value(col, index, table)
        rows.append(record)

    df = pd.DataFrame(rows, columns=[col.name for col in table.columns])

    for pk_col in table.primary_key:
        if pk_col in df.columns:
            generator.store_ids(table.name, pk_col, df[pk_col].tolist())

    for col in table.columns:
        if col.foreign_key:
            fk = col.foreign_key
            pool = generator.parent_ids.get((fk.ref_table, fk.ref_column), [])
            if pool:
                df[col.name] = [generator.sample_fk(fk.ref_table, fk.ref_column, col.nullable) for _ in range(len(df))]

    return df


def generate_csvs_from_ddl(
    ddl: str,
    output_dir: Path,
    base_rows: int = 500,
    child_multiplier: float = 3.0,
    min_rows: int = 50,
    max_rows: int = 10000,
    seed: int = 42,
) -> List[str]:
    tables = parse_ddl(ddl)
    if not tables:
        raise ValueError("No CREATE TABLE statements found in DDL.")

    output_dir.mkdir(parents=True, exist_ok=True)
    generator = DataGenerator(seed=seed)
    written: List[str] = []

    for table in topological_sort_tables(tables):
        df = generate_table_csv(table, generator, base_rows, child_multiplier, min_rows, max_rows)
        csv_path = output_dir / f"{table.name}.csv"
        df.to_csv(csv_path, index=False)
        written.append(table.name)

    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate mock CSV files from SQL DDL (one file per table).")
    parser.add_argument("--ddl", help="DDL string (or use --ddl-file)")
    parser.add_argument("--ddl-file", help="Path to .sql / .ddl file")
    parser.add_argument("--output", required=True, help="Output directory for CSV files")
    parser.add_argument("--base-rows", type=int, default=500, help="Default rows per root table (default: 500)")
    parser.add_argument(
        "--child-multiplier",
        type=float,
        default=3.0,
        help="Row multiplier for tables with foreign keys (default: 3.0)",
    )
    parser.add_argument("--min-rows", type=int, default=50, help="Minimum rows per table (default: 50)")
    parser.add_argument("--max-rows", type=int, default=10000, help="Maximum rows per table (default: 10000)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    args = parser.parse_args()

    ddl = args.ddl
    if args.ddl_file:
        ddl = Path(args.ddl_file).read_text(encoding="utf-8")
    if not ddl or not ddl.strip():
        print("Error: provide --ddl or --ddl-file", file=sys.stderr)
        return 1

    out = Path(args.output)
    tables = generate_csvs_from_ddl(
        ddl,
        out,
        base_rows=args.base_rows,
        child_multiplier=args.child_multiplier,
        min_rows=args.min_rows,
        max_rows=args.max_rows,
        seed=args.seed,
    )
    print(f"Generated {len(tables)} CSV file(s) in {out}")
    for name in tables:
        print(f"  - {name}.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
