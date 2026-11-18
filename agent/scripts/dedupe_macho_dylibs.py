#!/usr/bin/env python3
"""Remove duplicate LC_LOAD_DYLIB entries from a zig-linked macOS agent.

Zig ld records CoreFoundation and SystemConfiguration twice. macOS 26 dyld
aborts on that. Bind ordinals are retargeted onto the first copy, and each
extra load command becomes an ignored command so the rest of the file stays put.
Re-sign afterwards: codesign -s - -f <binary>
"""

from __future__ import annotations

import struct
import sys

MH_MAGIC_64 = 0xFEEDFACF
LC_DYLD_INFO_ONLY = 0x80000022
LOAD_DYLIB_CMDS = {0xC, 0xD, 0x80000018, 0x1F}
# Unknown load command without LC_REQ_DYLD. dyld skips it.
IGNORED_CMD = 0x50


def uleb(buf: bytes | bytearray, index: int) -> tuple[int, int]:
    result = 0
    shift = 0
    start = index
    while True:
        byte = buf[index]
        index += 1
        result |= (byte & 0x7F) << shift
        if byte < 0x80:
            return result, index
        shift += 7
        if index - start > 10:
            raise ValueError(f"uleb too long at {start}")


def rewrite_binds(blob: bytearray, remap: dict[int, int]) -> int:
    index = 0
    changed = 0
    while index < len(blob):
        opcode = blob[index] & 0xF0
        immediate = blob[index] & 0x0F
        if opcode == 0x00 and immediate == 0:
            index += 1
            continue
        if opcode == 0x10:
            if immediate in remap and remap[immediate] != immediate:
                blob[index] = opcode | remap[immediate]
                changed += 1
            index += 1
        elif opcode == 0x20:
            value, end = uleb(blob, index + 1)
            new = remap.get(value, value)
            encoded = bytearray()
            rest = new
            while True:
                piece = rest & 0x7F
                rest >>= 7
                encoded.append(piece | 0x80 if rest else piece)
                if not rest:
                    break
            if len(encoded) != end - (index + 1):
                raise ValueError(f"dylib ordinal {value} does not fit in place")
            blob[index + 1 : end] = encoded
            if new != value:
                changed += 1
            index = end
        elif opcode == 0x40:
            index = blob.index(0, index + 1) + 1
        elif opcode == 0x60:
            index += 1
            while blob[index - 1] & 0x80:
                index += 1
        elif opcode in (0x70, 0x80, 0xA0):
            _, index = uleb(blob, index + 1)
        elif opcode == 0xC0:
            _, index = uleb(blob, index + 1)
            _, index = uleb(blob, index)
        elif opcode == 0xD0:
            _, index = uleb(blob, index + 1)
        else:
            index += 1
    return changed


def dedupe(path: str) -> None:
    data = bytearray(open(path, "rb").read())
    magic = struct.unpack_from("<I", data, 0)[0]
    if magic != MH_MAGIC_64:
        raise SystemExit(f"{path} is not a 64-bit Mach-O")
    ncmds = struct.unpack_from("<I", data, 16)[0]
    offset = 32
    ordinal = 0
    first_for_name: dict[bytes, int] = {}
    duplicate_offsets: list[int] = []
    old_to_kept: dict[int, int] = {}
    commands: list[tuple[int, int, int]] = []
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from("<II", data, offset)
        commands.append((offset, cmd, cmdsize))
        if cmd in LOAD_DYLIB_CMDS:
            ordinal += 1
            name_off = struct.unpack_from("<I", data, offset + 8)[0]
            end = data.index(0, offset + name_off)
            name = bytes(data[offset + name_off : end])
            if name in first_for_name:
                old_to_kept[ordinal] = first_for_name[name]
                duplicate_offsets.append(offset)
            else:
                first_for_name[name] = ordinal
                old_to_kept[ordinal] = ordinal
        offset += cmdsize
    if not duplicate_offsets:
        print(f"{path}: no duplicate dylibs")
        return

    kept_ordinals = [old for old, kept in old_to_kept.items() if old == kept]
    renumber = {old: new for new, old in enumerate(kept_ordinals, start=1)}
    remap = {old: renumber[old_to_kept[old]] for old in old_to_kept}

    info = None
    for cmd_off, cmd, _cmdsize in commands:
        if cmd == LC_DYLD_INFO_ONLY:
            info = struct.unpack_from("<IIIIIIIIII", data, cmd_off + 8)
            break
    if info is None:
        raise SystemExit(f"{path} has no LC_DYLD_INFO_ONLY")
    _rebase_off, _rebase_size, bind_off, bind_size, weak_off, weak_size, lazy_off, lazy_size, _export_off, _export_size = info
    changed = 0
    for start, size in ((bind_off, bind_size), (weak_off, weak_size), (lazy_off, lazy_size)):
        if size == 0:
            continue
        blob = data[start : start + size]
        changed += rewrite_binds(blob, remap)
        data[start : start + size] = blob
    for dup in duplicate_offsets:
        struct.pack_into("<I", data, dup, IGNORED_CMD)
    open(path, "wb").write(data)
    print(f"{path}: retargeted {changed} ordinals, removed {len(duplicate_offsets)} duplicate dylibs")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(f"usage: {sys.argv[0]} <mach-o>...")
    for path in sys.argv[1:]:
        dedupe(path)


if __name__ == "__main__":
    main()
