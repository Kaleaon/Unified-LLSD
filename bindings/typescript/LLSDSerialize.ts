/**
 * Multi-format LLSD Serializer and Parser for Notation, Binary, XML, and JSON.
 */

import { LLSDValue, LLSDType, LLUUID, LLSDDate, LLSDURI, LLSDBinary } from './LLSD.js';

export class LLSDSerialize {
    public static readonly BINARY_HEADER = '<?llsd/binary?>';
    public static readonly NOTATION_HEADER = '<?llsd/notation?>';
    public static readonly XML_HEADER = '<?xml';

    public static parse(data: string | Uint8Array): LLSDValue {
        if (data instanceof Uint8Array) {
            const headerStr = new TextDecoder('ascii').decode(data.subarray(0, 15));
            if (headerStr.startsWith(LLSDSerialize.BINARY_HEADER)) {
                return LLSDSerialize.fromBinary(data);
            }
            const strData = new TextDecoder('utf-8').decode(data);
            return LLSDSerialize.parseString(strData);
        } else {
            return LLSDSerialize.parseString(data);
        }
    }

    private static parseString(str: string): LLSDValue {
        const trimmed = str.trim();
        if (trimmed.startsWith(LLSDSerialize.BINARY_HEADER)) {
            const encoder = new TextEncoder();
            return LLSDSerialize.fromBinary(encoder.encode(str));
        }
        if (trimmed.startsWith(LLSDSerialize.XML_HEADER) || trimmed.startsWith('<llsd>')) {
            return LLSDSerialize.fromXML(trimmed);
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return LLSDSerialize.fromJSON(trimmed);
            } catch {
                return LLSDSerialize.fromNotation(trimmed);
            }
        }
        return LLSDSerialize.fromNotation(trimmed);
    }

    // --- JSON ---
    public static toJSON(value: LLSDValue): string {
        return JSON.stringify(LLSDSerialize.toJSObject(value), null, 2);
    }

    public static fromJSON(jsonStr: string): LLSDValue {
        const obj = JSON.parse(jsonStr);
        return LLSDSerialize.fromJSObject(obj);
    }

    private static toJSObject(val: LLSDValue): any {
        switch (val.type) {
            case LLSDType.UNDEFINED: return null;
            case LLSDType.BOOLEAN: return val.asBoolean();
            case LLSDType.INTEGER: return val.asInteger();
            case LLSDType.REAL: return val.asReal();
            case LLSDType.STRING: return val.asString();
            case LLSDType.UUID: return val.asUUID().toString();
            case LLSDType.DATE: return val.asDate().toISOString();
            case LLSDType.URI: return val.asURI().toString();
            case LLSDType.BINARY: return val.asBinary().toBase64();
            case LLSDType.MAP: {
                const res: Record<string, any> = {};
                val.asMap.forEach((v, k) => {
                    res[k] = LLSDSerialize.toJSObject(v);
                });
                return res;
            }
            case LLSDType.ARRAY: {
                return val.asArray.map(item => LLSDSerialize.toJSObject(item));
            }
        }
    }

    private static fromJSObject(obj: any): LLSDValue {
        if (obj === null || obj === undefined) return LLSDValue.undefined();
        if (typeof obj === 'boolean') return LLSDValue.boolean(obj);
        if (typeof obj === 'number') {
            return Number.isInteger(obj) ? LLSDValue.integer(obj) : LLSDValue.real(obj);
        }
        if (typeof obj === 'string') {
            if (LLUUID.validate(obj)) return LLSDValue.uuid(obj);
            return LLSDValue.string(obj);
        }
        if (Array.isArray(obj)) {
            return LLSDValue.array(obj.map(item => LLSDSerialize.fromJSObject(item)));
        }
        if (typeof obj === 'object') {
            const mapObj: Record<string, LLSDValue> = {};
            for (const [k, v] of Object.entries(obj)) {
                mapObj[k] = LLSDSerialize.fromJSObject(v);
            }
            return LLSDValue.map(mapObj);
        }
        return LLSDValue.undefined();
    }

    // --- NOTATION ---
    public static toNotation(val: LLSDValue): string {
        switch (val.type) {
            case LLSDType.UNDEFINED: return '!';
            case LLSDType.BOOLEAN: return val.asBoolean() ? '1' : '0';
            case LLSDType.INTEGER: return `i${val.asInteger()}`;
            case LLSDType.REAL: return `r${val.asReal()}`;
            case LLSDType.STRING: return `'${val.asString().replace(/'/g, "\\'")}'`;
            case LLSDType.UUID: return `u${val.asUUID().toString()}`;
            case LLSDType.DATE: return `d"${val.asDate().toISOString()}"`;
            case LLSDType.URI: return `l"${val.asURI().toString()}"`;
            case LLSDType.BINARY: return `b64"${val.asBinary().toBase64()}"`;
            case LLSDType.MAP: {
                const parts: string[] = [];
                val.asMap.forEach((v, k) => {
                    parts.push(`'${k}':${LLSDSerialize.toNotation(v)}`);
                });
                return `{${parts.join(',')}}`;
            }
            case LLSDType.ARRAY: {
                const parts = val.asArray.map(v => LLSDSerialize.toNotation(v));
                return `[${parts.join(',')}]`;
            }
        }
    }

    public static fromNotation(notationStr: string): LLSDValue {
        let str = notationStr.trim();
        if (str.startsWith(LLSDSerialize.NOTATION_HEADER)) {
            str = str.substring(LLSDSerialize.NOTATION_HEADER.length).trim();
        }
        if (!str) return LLSDValue.undefined();

        let index = 0;

        function skipWhitespace() {
            while (index < str.length && /\s/.test(str[index])) {
                index++;
            }
        }

        function parseNext(): LLSDValue {
            skipWhitespace();
            if (index >= str.length) return LLSDValue.undefined();

            const ch = str[index];
            if (ch === '!') {
                index++;
                return LLSDValue.undefined();
            }
            if (ch === '1' || ch === 't') {
                if (str.startsWith('true', index)) index += 4;
                else index++;
                return LLSDValue.boolean(true);
            }
            if (ch === '0' || ch === 'f') {
                if (str.startsWith('false', index)) index += 5;
                else index++;
                return LLSDValue.boolean(false);
            }
            if (ch === 'i') {
                index++;
                let numStr = '';
                while (index < str.length && /[-0-9]/.test(str[index])) {
                    numStr += str[index++];
                }
                return LLSDValue.integer(parseInt(numStr, 10));
            }
            if (ch === 'r') {
                index++;
                let numStr = '';
                while (index < str.length && /[-0-9\.eE]/.test(str[index])) {
                    numStr += str[index++];
                }
                return LLSDValue.real(parseFloat(numStr));
            }
            if (ch === 'u') {
                index++;
                let uuidStr = str.substring(index, index + 36);
                if (uuidStr.startsWith('"') || uuidStr.startsWith("'")) {
                    const quote = uuidStr[0];
                    const end = str.indexOf(quote, index + 1);
                    uuidStr = str.substring(index + 1, end);
                    index = end + 1;
                } else {
                    index += 36;
                }
                return LLSDValue.uuid(uuidStr);
            }
            if (ch === 'd') {
                index++;
                skipWhitespace();
                if (str[index] === '"' || str[index] === "'") {
                    const quote = str[index++];
                    const end = str.indexOf(quote, index);
                    const dateStr = str.substring(index, end);
                    index = end + 1;
                    return LLSDValue.date(dateStr);
                }
            }
            if (ch === 'l') {
                index++;
                skipWhitespace();
                if (str[index] === '"' || str[index] === "'") {
                    const quote = str[index++];
                    const end = str.indexOf(quote, index);
                    const uriStr = str.substring(index, end);
                    index = end + 1;
                    return LLSDValue.uri(uriStr);
                }
            }
            if (ch === 'b') {
                if (str.startsWith('b64', index)) {
                    index += 3;
                    skipWhitespace();
                    if (str[index] === '"' || str[index] === "'") {
                        const quote = str[index++];
                        const end = str.indexOf(quote, index);
                        const b64Str = str.substring(index, end);
                        index = end + 1;
                        return LLSDValue.binary(LLSDBinary.fromBase64(b64Str));
                    }
                }
            }
            if (ch === '"' || ch === "'") {
                const quote = str[index++];
                let valStr = '';
                while (index < str.length && str[index] !== quote) {
                    if (str[index] === '\\' && index + 1 < str.length) {
                        index++;
                    }
                    valStr += str[index++];
                }
                if (index < str.length && str[index] === quote) index++;
                return LLSDValue.string(valStr);
            }
            if (ch === '{') {
                index++; // skip '{'
                const mapObj: Record<string, LLSDValue> = {};
                while (index < str.length) {
                    skipWhitespace();
                    if (str[index] === '}') {
                        index++;
                        break;
                    }
                    const keyVal = parseNext();
                    const key = keyVal.asString();
                    skipWhitespace();
                    if (str[index] === ':') index++; // skip ':'
                    skipWhitespace();
                    const val = parseNext();
                    mapObj[key] = val;
                    skipWhitespace();
                    if (str[index] === ',') index++;
                }
                return LLSDValue.map(mapObj);
            }
            if (ch === '[') {
                index++; // skip '['
                const arr: LLSDValue[] = [];
                while (index < str.length) {
                    skipWhitespace();
                    if (str[index] === ']') {
                        index++;
                        break;
                    }
                    const val = parseNext();
                    arr.push(val);
                    skipWhitespace();
                    if (str[index] === ',') index++;
                }
                return LLSDValue.array(arr);
            }

            index++;
            return LLSDValue.undefined();
        }

        return parseNext();
    }

    // --- BINARY ---
    private static readonly textEncoder = new TextEncoder();
    private static readonly BINARY_HEADER_BYTES = LLSDSerialize.textEncoder.encode(LLSDSerialize.BINARY_HEADER + '\n');

    private static getUtf8ByteLength(str: string): number {
        let len = 0;
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 0x80) {
                len += 1;
            } else if (code < 0x800) {
                len += 2;
            } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length && str.charCodeAt(i + 1) >= 0xDC00 && str.charCodeAt(i + 1) <= 0xDFFF) {
                len += 4;
                i++;
            } else {
                len += 3;
            }
        }
        return len;
    }

    public static calculateBinarySize(val: LLSDValue): number {
        switch (val.type) {
            case LLSDType.UNDEFINED:
            case LLSDType.BOOLEAN:
                return 1;
            case LLSDType.INTEGER:
                return 5;
            case LLSDType.REAL:
                return 9;
            case LLSDType.UUID:
                return 17;
            case LLSDType.STRING:
                return 5 + LLSDSerialize.getUtf8ByteLength(val.asString());
            case LLSDType.URI:
                return 5 + LLSDSerialize.getUtf8ByteLength(val.asURI().toString());
            case LLSDType.BINARY:
                return 5 + val.asBinary().bytes.length;
            case LLSDType.DATE:
                return 9;
            case LLSDType.MAP: {
                let size = 5; // '{' + uint32 count
                val.asMap.forEach((v, k) => {
                    size += 5 + LLSDSerialize.getUtf8ByteLength(k);
                    size += LLSDSerialize.calculateBinarySize(v);
                });
                size += 1; // '}'
                return size;
            }
            case LLSDType.ARRAY: {
                let size = 5; // '[' + uint32 count
                const arr = val.asArray;
                for (let i = 0; i < arr.length; i++) {
                    size += LLSDSerialize.calculateBinarySize(arr[i]);
                }
                size += 1; // ']'
                return size;
            }
            default:
                return 1;
        }
    }

    public static toBinary(val: LLSDValue): Uint8Array {
        const bodySize = LLSDSerialize.calculateBinarySize(val);
        const headerLen = LLSDSerialize.BINARY_HEADER_BYTES.length;
        const result = new Uint8Array(headerLen + bodySize);
        result.set(LLSDSerialize.BINARY_HEADER_BYTES, 0);
        const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
        LLSDSerialize.encodeBinaryValueDirect(val, result, view, headerLen);
        return result;
    }

    private static encodeBinaryValue(val: LLSDValue): Uint8Array {
        const bodySize = LLSDSerialize.calculateBinarySize(val);
        const result = new Uint8Array(bodySize);
        const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
        LLSDSerialize.encodeBinaryValueDirect(val, result, view, 0);
        return result;
    }

    private static encodeBinaryValueDirect(val: LLSDValue, buffer: Uint8Array, view: DataView, offset: number): number {
        switch (val.type) {
            case LLSDType.UNDEFINED:
                buffer[offset++] = 0x21; // '!'
                return offset;
            case LLSDType.BOOLEAN:
                buffer[offset++] = val.asBoolean() ? 0x31 : 0x30; // '1' / '0'
                return offset;
            case LLSDType.INTEGER:
                buffer[offset++] = 0x69; // 'i'
                view.setInt32(offset, val.asInteger(), false); // Big endian
                return offset + 4;
            case LLSDType.REAL:
                buffer[offset++] = 0x72; // 'r'
                view.setFloat64(offset, val.asReal(), false); // Big endian
                return offset + 8;
            case LLSDType.UUID:
                buffer[offset++] = 0x75; // 'u'
                buffer.set(val.asUUID().toBytes(), offset);
                return offset + 16;
            case LLSDType.STRING: {
                buffer[offset++] = 0x73; // 's'
                const str = val.asString();
                const strLen = LLSDSerialize.getUtf8ByteLength(str);
                view.setUint32(offset, strLen, false);
                offset += 4;
                if (strLen > 0) {
                    LLSDSerialize.textEncoder.encodeInto(str, buffer.subarray(offset, offset + strLen));
                    offset += strLen;
                }
                return offset;
            }
            case LLSDType.URI: {
                buffer[offset++] = 0x6C; // 'l'
                const uriStr = val.asURI().toString();
                const uriLen = LLSDSerialize.getUtf8ByteLength(uriStr);
                view.setUint32(offset, uriLen, false);
                offset += 4;
                if (uriLen > 0) {
                    LLSDSerialize.textEncoder.encodeInto(uriStr, buffer.subarray(offset, offset + uriLen));
                    offset += uriLen;
                }
                return offset;
            }
            case LLSDType.BINARY: {
                buffer[offset++] = 0x62; // 'b'
                const bin = val.asBinary().bytes;
                view.setUint32(offset, bin.length, false);
                offset += 4;
                if (bin.length > 0) {
                    buffer.set(bin, offset);
                    offset += bin.length;
                }
                return offset;
            }
            case LLSDType.DATE:
                buffer[offset++] = 0x64; // 'd'
                view.setFloat64(offset, val.asDate().getSecondsSinceEpoch(), true); // LE double
                return offset + 8;
            case LLSDType.MAP: {
                buffer[offset++] = 0x7B; // '{'
                const mapObj = val.asMap;
                view.setUint32(offset, mapObj.size, false);
                offset += 4;
                mapObj.forEach((v, k) => {
                    buffer[offset++] = 0x6B; // 'k'
                    const keyLen = LLSDSerialize.getUtf8ByteLength(k);
                    view.setUint32(offset, keyLen, false);
                    offset += 4;
                    if (keyLen > 0) {
                        LLSDSerialize.textEncoder.encodeInto(k, buffer.subarray(offset, offset + keyLen));
                        offset += keyLen;
                    }
                    offset = LLSDSerialize.encodeBinaryValueDirect(v, buffer, view, offset);
                });
                buffer[offset++] = 0x7D; // '}'
                return offset;
            }
            case LLSDType.ARRAY: {
                buffer[offset++] = 0x5B; // '['
                const arr = val.asArray;
                view.setUint32(offset, arr.length, false);
                offset += 4;
                for (let i = 0; i < arr.length; i++) {
                    offset = LLSDSerialize.encodeBinaryValueDirect(arr[i], buffer, view, offset);
                }
                buffer[offset++] = 0x5D; // ']'
                return offset;
            }
            default:
                buffer[offset++] = 0x21; // '!'
                return offset;
        }
    }

    public static fromBinary(data: Uint8Array): LLSDValue {
        let offset = 0;
        const headerStr = new TextDecoder('ascii').decode(data.subarray(0, 16));
        if (headerStr.startsWith(LLSDSerialize.BINARY_HEADER)) {
            offset = LLSDSerialize.BINARY_HEADER.length;
            if (data[offset] === 0x0A) offset++; // skip newline
        }

        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        function readValue(): LLSDValue {
            if (offset >= data.length) return LLSDValue.undefined();
            const marker = data[offset++];

            switch (marker) {
                case 0x21: // '!'
                    return LLSDValue.undefined();
                case 0x30: // '0'
                    return LLSDValue.boolean(false);
                case 0x31: // '1'
                    return LLSDValue.boolean(true);
                case 0x69: { // 'i'
                    const val = view.getInt32(offset, false);
                    offset += 4;
                    return LLSDValue.integer(val);
                }
                case 0x72: { // 'r'
                    const val = view.getFloat64(offset, false);
                    offset += 8;
                    return LLSDValue.real(val);
                }
                case 0x75: { // 'u'
                    const uuid = LLUUID.fromBytes(data, offset);
                    offset += 16;
                    return LLSDValue.uuid(uuid);
                }
                case 0x73: { // 's'
                    const len = view.getUint32(offset, false);
                    offset += 4;
                    const str = new TextDecoder('utf-8').decode(data.subarray(offset, offset + len));
                    offset += len;
                    return LLSDValue.string(str);
                }
                case 0x62: { // 'b'
                    const len = view.getUint32(offset, false);
                    offset += 4;
                    const bin = data.slice(offset, offset + len);
                    offset += len;
                    return LLSDValue.binary(bin);
                }
                case 0x64: { // 'd'
                    const sec = view.getFloat64(offset, true); // LE double
                    offset += 8;
                    return LLSDValue.date(sec);
                }
                case 0x6C: { // 'l'
                    const len = view.getUint32(offset, false);
                    offset += 4;
                    const uriStr = new TextDecoder('utf-8').decode(data.subarray(offset, offset + len));
                    offset += len;
                    return LLSDValue.uri(uriStr);
                }
                case 0x7B: { // '{'
                    const count = view.getUint32(offset, false);
                    offset += 4;
                    const mapObj: Record<string, LLSDValue> = {};
                    for (let i = 0; i < count; i++) {
                        if (data[offset] === 0x6B) { // 'k'
                            offset++;
                            const keyLen = view.getUint32(offset, false);
                            offset += 4;
                            const key = new TextDecoder('utf-8').decode(data.subarray(offset, offset + keyLen));
                            offset += keyLen;
                            mapObj[key] = readValue();
                        }
                    }
                    if (data[offset] === 0x7D) offset++; // '}'
                    return LLSDValue.map(mapObj);
                }
                case 0x5B: { // '['
                    const count = view.getUint32(offset, false);
                    offset += 4;
                    const arr: LLSDValue[] = [];
                    for (let i = 0; i < count; i++) {
                        arr.push(readValue());
                    }
                    if (data[offset] === 0x5D) offset++; // ']'
                    return LLSDValue.array(arr);
                }
                default:
                    return LLSDValue.undefined();
            }
        }

        return readValue();
    }

    // --- XML ---
    public static toXML(val: LLSDValue): string {
        return `<?xml version="1.0" encoding="UTF-8"?>\n<llsd>\n${LLSDSerialize.encodeXMLValue(val, 2)}\n</llsd>`;
    }

    private static encodeXMLValue(val: LLSDValue, indentLevel: number): string {
        const ind = ' '.repeat(indentLevel);
        switch (val.type) {
            case LLSDType.UNDEFINED: return `${ind}<undef/>`;
            case LLSDType.BOOLEAN: return `${ind}<boolean>${val.asBoolean()}</boolean>`;
            case LLSDType.INTEGER: return `${ind}<integer>${val.asInteger()}</integer>`;
            case LLSDType.REAL: return `${ind}<real>${val.asReal()}</real>`;
            case LLSDType.STRING: return `${ind}<string>${val.asString()}</string>`;
            case LLSDType.UUID: return `${ind}<uuid>${val.asUUID().toString()}</uuid>`;
            case LLSDType.DATE: return `${ind}<date>${val.asDate().toISOString()}</date>`;
            case LLSDType.URI: return `${ind}<uri>${val.asURI().toString()}</uri>`;
            case LLSDType.BINARY: return `${ind}<binary encoding="base64">${val.asBinary().toBase64()}</binary>`;
            case LLSDType.MAP: {
                const lines: string[] = [`${ind}<map>`];
                val.asMap.forEach((v, k) => {
                    lines.push(`${ind}  <key>${k}</key>`);
                    lines.push(LLSDSerialize.encodeXMLValue(v, indentLevel + 2));
                });
                lines.push(`${ind}</map>`);
                return lines.join('\n');
            }
            case LLSDType.ARRAY: {
                const lines: string[] = [`${ind}<array>`];
                val.asArray.forEach(v => {
                    lines.push(LLSDSerialize.encodeXMLValue(v, indentLevel + 2));
                });
                lines.push(`${ind}</array>`);
                return lines.join('\n');
            }
        }
    }

    public static fromXML(xmlStr: string): LLSDValue {
        let contentStr = xmlStr;
        const llsdMatch = /<llsd>([\s\S]*?)<\/llsd>/i.exec(xmlStr);
        if (llsdMatch) {
            contentStr = llsdMatch[1];
        }

        const tagRegex = /<([a-zA-Z0-9]+)(\s+encoding="([^"]+)")?>([\s\S]*?)<\/\1>|<(undef)\/>/gi;

        function parseXmlNodes(str: string): { mapEntries: Record<string, LLSDValue>; arrayItems: LLSDValue[] } {
            const mapEntries: Record<string, LLSDValue> = {};
            const arrayItems: LLSDValue[] = [];
            let currentKey: string | null = null;

            let match: RegExpExecArray | null;
            const subRegex = new RegExp(tagRegex.source, 'gi');

            while ((match = subRegex.exec(str)) !== null) {
                const tagName = (match[1] || match[5] || '').toLowerCase();
                const content = (match[4] || '').trim();

                if (tagName === 'key') {
                    currentKey = content;
                    continue;
                }

                let value: LLSDValue = LLSDValue.undefined();
                switch (tagName) {
                    case 'undef': value = LLSDValue.undefined(); break;
                    case 'boolean': value = LLSDValue.boolean(content === 'true' || content === '1'); break;
                    case 'integer': value = LLSDValue.integer(parseInt(content, 10)); break;
                    case 'real': value = LLSDValue.real(parseFloat(content)); break;
                    case 'string': value = LLSDValue.string(content); break;
                    case 'uuid': value = LLSDValue.uuid(content); break;
                    case 'date': value = LLSDValue.date(content); break;
                    case 'uri': value = LLSDValue.uri(content); break;
                    case 'binary': value = LLSDValue.binary(LLSDBinary.fromBase64(content)); break;
                    case 'map': {
                        const parsed = parseXmlNodes(content);
                        value = LLSDValue.map(parsed.mapEntries);
                        break;
                    }
                    case 'array': {
                        const parsed = parseXmlNodes(content);
                        value = LLSDValue.array(parsed.arrayItems);
                        break;
                    }
                }

                if (currentKey !== null) {
                    mapEntries[currentKey] = value;
                    currentKey = null;
                } else {
                    arrayItems.push(value);
                }
            }

            return { mapEntries, arrayItems };
        }

        const root = parseXmlNodes(contentStr);
        if (Object.keys(root.mapEntries).length > 0) return LLSDValue.map(root.mapEntries);
        if (root.arrayItems.length > 0) return root.arrayItems[0];
        return LLSDValue.undefined();
    }
}
