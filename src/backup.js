import { normalizeData, LIMITS } from './model.js';
import { bytesToDataUrl } from './images.js';

let crcTable;

// ZIP CRC detects accidental corruption; it is not a signature or encryption.
export function crc32(bytes) {
    if (!crcTable) {
        crcTable = Array.from({ length: 256 }, (_, index) => {
            let value = index;
            for (let bit = 0; bit < 8; bit++) {
                value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
            }
            return value >>> 0;
        });
    }
    let value = 0xffffffff;
    for (const byte of bytes) {
        value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    }
    return (value ^ 0xffffffff) >>> 0;
}
function put16(bytes, offset, value) {
    new DataView(bytes.buffer).setUint16(offset, value, true);
}
function put32(bytes, offset, value) {
    new DataView(bytes.buffer).setUint32(offset, value, true);
}
function dataUrlBytes(dataUrl) {
    return Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
}
function imageExtension(dataUrl) {
    return dataUrl.match(/^data:image\/(png|jpeg|webp|gif)/i)?.[1].replace('jpeg', 'jpg') || 'png';
}
export function createZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach((file) => {
        const name = encoder.encode(file.name);
        const checksum = crc32(file.bytes);
        const header = new Uint8Array(30 + name.length);
        put32(header, 0, 0x04034b50);
        put16(header, 4, 20);
        put16(header, 6, 0x0800);
        put16(header, 8, 0);
        put32(header, 14, checksum);
        put32(header, 18, file.bytes.length);
        put32(header, 22, file.bytes.length);
        put16(header, 26, name.length);
        name.forEach((byte, index) => { header[30 + index] = byte; });
        chunks.push(header, file.bytes);
        const directory = new Uint8Array(46 + name.length);
        put32(directory, 0, 0x02014b50);
        put16(directory, 4, 20);
        put16(directory, 6, 20);
        put16(directory, 8, 0x0800);
        put16(directory, 10, 0);
        put32(directory, 16, checksum);
        put32(directory, 20, file.bytes.length);
        put32(directory, 24, file.bytes.length);
        put16(directory, 28, name.length);
        put32(directory, 42, offset);
        name.forEach((byte, index) => { directory[46 + index] = byte; });
        central.push(directory);
        offset += header.length + file.bytes.length;
    });
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    put32(end, 0, 0x06054b50);
    put16(end, 8, files.length);
    put16(end, 10, files.length);
    put32(end, 12, centralSize);
    put32(end, 16, offset);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
export function createBackupZip(data) {
    const copy = normalizeData(data);
    const files = [], images = new Map();
    function extract(value) {
        if (!value.startsWith("data:image/"))
            return value;
        if (images.has(value))
            return images.get(value);
        const mime = value.slice(5, value.indexOf(";"));
        const path = "images/thumbnail-" + (images.size + 1) + "." + imageExtension(value);
        files.push({ name: path, bytes: dataUrlBytes(value) });
        const reference = { zipImage: path, mime };
        images.set(value, reference);
        return reference;
    }
    for (const category of copy.categories)
        for (const access of category.accesses)
            access.thumbnail = extract(access.thumbnail);
    copy.settings.backgroundImageUrl = extract(copy.settings.backgroundImageUrl);
    files.unshift({ name: "nex-b-config.json", bytes: new TextEncoder().encode(JSON.stringify(copy, null, 2)) });
    const result = createZip(files);
    if (result.size > LIMITS.archive)
        throw new Error("El respaldo supera 64 MB. Reduce las imágenes antes de exportar.");
    return result;
}
export function readZipFiles(bytes) {
    const bad = () => { throw new Error("ZIP dañado o no compatible. Usa un respaldo ZIP generado por NEX.B (sin compresión)."); };
    if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > LIMITS.archive)
        bad();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = offset => view.getUint16(offset, true);
    const u32 = offset => view.getUint32(offset, true);
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50)
        end--;
    if (end < Math.max(0, bytes.length - 65557))
        bad();
    if (end + 22 + u16(end + 20) !== bytes.length || u16(end + 4) || u16(end + 6))
        bad();
    const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
    if (count !== u16(end + 8) || count < 1 || count > LIMITS.accesses + 2 || start + size !== end)
        bad();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const files = new Map();
    let offset = start, expectedLocalOffset = 0;
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || u32(offset) !== 0x02014b50)
            bad();
        const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16);
        const compressed = u32(offset + 20), expanded = u32(offset + 24);
        const n = u16(offset + 28), extra = u16(offset + 30), comment = u16(offset + 32);
        const local = u32(offset + 42);
        if ((flags & ~0x0800) || method !== 0 || compressed !== expanded || u16(offset + 34))
            bad();
        if (!n || offset + 46 + n + extra + comment > end || local !== expectedLocalOffset || local + 30 > start)
            bad();
        const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + n));
        if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith("/") || name.split("/").some(p => !p || p === ".." || p === ".") || files.has(name))
            bad();
        if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== expanded)
            bad();
        const localNameLength = u16(local + 26), localExtra = u16(local + 28);
        const dataStart = local + 30 + localNameLength + localExtra;
        if (dataStart + expanded > start || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name)
            bad();
        const file = bytes.subarray(dataStart, dataStart + expanded);
        if (crc32(file) !== crc)
            throw new Error("ZIP dañado: la comprobación CRC falló.");
        files.set(name, file);
        expectedLocalOffset = dataStart + expanded;
        offset += 46 + n + extra + comment;
    }
    if (offset !== end || expectedLocalOffset !== start)
        bad();
    return files;
}
export function readStoredZip(bytes) {
    const files = readZipFiles(bytes);
    const config = files.get("nex-b-config.json");
    if (!config)
        throw new Error("No se encontró nex-b-config.json.");
    const imported = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(config));
    const hydrated = new Map();
    let imageBudget = 0;
    function restore(value) {
        if (!value || typeof value !== "object")
            return value;
        if (typeof value.zipImage !== "string" || !/^images\/[\w-]+\.(png|jpg|jpeg|gif|webp)$/.test(value.zipImage) ||
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(value.mime))
            throw new Error("Referencia de imagen inválida.");
        const image = files.get(value.zipImage);
        if (!image || image.length > LIMITS.image)
            throw new Error("Falta una imagen o supera 8 MB: " + value.zipImage);
        imageBudget += Math.ceil(image.length * 4 / 3);
        if (imageBudget > LIMITS.data)
            throw new Error("Demasiadas imágenes al restaurar.");
        const key = value.zipImage + value.mime;
        if (!hydrated.has(key))
            hydrated.set(key, bytesToDataUrl(image, value.mime));
        return hydrated.get(key);
    }
    if (!Array.isArray(imported?.categories))
        throw new Error("Configuración inválida.");
    for (const category of imported.categories) {
        if (!Array.isArray(category?.accesses))
            throw new Error("Accesos inválidos.");
        for (const access of category.accesses) {
            if (!access || typeof access !== "object")
                throw new Error("Acceso inválido.");
            access.thumbnail = restore(access.thumbnail);
        }
    }
    if (imported.settings)
        imported.settings.backgroundImageUrl = restore(imported.settings.backgroundImageUrl);
    return normalizeData(imported);
}
