import { LLSDValue, LLSDType } from './llsd.js';
import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';
import { LLSDBinary } from './llbinary.js';

export class LLSDSerialize {
    public static readonly BINARY_HEADER = '<?llsd/binary?>';
    public static readonly NOTATION_HEADER = '<?llsd/notation?>';
    public static readonly XML_HEADER = '<?xml';

    public static readonly binaryHeader = '<? llsd/binary ?>\n';
    public static readonly notationHeader = '<? llsd/notation ?>\n';
    public static readonly xmlHeader = '<?xml version="1.0" ?>\n';

    public static parse(data: string | Uint8Array): LLSDValue {
        if (data instanceof Uint8Array) {
            const headerStr = new TextDecoder('ascii').decode(data.subarray(0, 16));
            if (headerStr.startsWith(LLSDSerialize.BINARY_HEADER) || headerStr.startsWith('<? llsd/binary')) {
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
        if (trimmed.startsWith(LLSDSerialize.BINARY_HEADER) || trimmed.startsWith('<? llsd/binary')) {
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
        if (obj === null || obj === undefined) return LLSDValue.undefined;
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
        return LLSDValue.undefined;
    }

    // --- NOTATION ---
    public static toNotation(val: LLSDValue): string {
        switch (val.type) {
            case LLSDType.UNDEFINED: return '!';
            case LLSDType.BOOLEAN: return val.asBoolean() ? '1' : '0';
            case LLSDType.INTEGER: return `i${val.asBigInt()}`;
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
        if (str.startsWith(LLSDSerialize.NOTATION_HEADER) || str.startsWith('<? llsd/notation')) {
            const newlineIdx = str.indexOf('\n');
            if (newlineIdx !== -1) {
                str = str.substring(newlineIdx + 1).trim();
            } else {
                str = str.replace(/<\?.*?\?>/, '').trim();
            }
        }
        if (!str) return LLSDValue.undefined;

        let index = 0;

        function skipWhitespace() {
            while (index < str.length && /\s/.test(str[index])) {
                index++;
            }
        }

        function parseNext(): LLSDValue {
            skipWhitespace();
            if (index >= str.length) return LLSDValue.undefined;

            const ch = str[index];
            if (ch === '!') {
                index++;
                return LLSDValue.undefined;
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
                try {
                    return LLSDValue.integer(BigInt(numStr));
                } catch {
                    return LLSDValue.integer(0);
                }
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
            return LLSDValue.undefined;
        }

        return parseNext();
    }

    // --- BINARY ---
    public static toBinary(val: LLSDValue): Uint8Array {
        const header = new TextEncoder().encode(LLSDSerialize.BINARY_HEADER + '\n');
        const body = LLSDSerialize.encodeBinaryValue(val);
        const result = new Uint8Array(header.length + body.length);
        result.set(header, 0);
        result.set(body, header.length);
        return result;
    }

    private static encodeBinaryValue(val: LLSDValue): Uint8Array {
        switch (val.type) {
            case LLSDType.UNDEFINED: return new Uint8Array([0x21]); // '!'
            case LLSDType.BOOLEAN: return new Uint8Array([val.asBoolean() ? 0x31 : 0x30]); // '1' / '0'
            case LLSDType.INTEGER: {
                const buf = new ArrayBuffer(5);
                const view = new DataView(buf);
                view.setUint8(0, 0x69); // 'i'
                view.setInt32(1, val.asInteger(), false); // Big endian
                return new Uint8Array(buf);
            }
            case LLSDType.REAL: {
                const buf = new ArrayBuffer(9);
                const view = new DataView(buf);
                view.setUint8(0, 0x72); // 'r'
                view.setFloat64(1, val.asReal(), false); // Big endian double
                return new Uint8Array(buf);
            }
            case LLSDType.UUID: {
                const buf = new Uint8Array(17);
                buf[0] = 0x75; // 'u'
                buf.set(val.asUUID().toBytes(), 1);
                return buf;
            }
            case LLSDType.STRING: {
                const strBytes = new TextEncoder().encode(val.asString());
                const buf = new Uint8Array(5 + strBytes.length);
                const view = new DataView(buf.buffer);
                view.setUint8(0, 0x73); // 's'
                view.setUint32(1, strBytes.length, false); // Length big endian
                buf.set(strBytes, 5);
                return buf;
            }
            case LLSDType.BINARY: {
                const bin = val.asBinary().bytes;
                const buf = new Uint8Array(5 + bin.length);
                const view = new DataView(buf.buffer);
                view.setUint8(0, 0x62); // 'b'
                view.setUint32(1, bin.length, false);
                buf.set(bin, 5);
                return buf;
            }
            case LLSDType.DATE: {
                const buf = new ArrayBuffer(9);
                const view = new DataView(buf);
                view.setUint8(0, 0x64); // 'd'
                view.setFloat64(1, val.asDate().secondsSinceEpoch, true); // LE double
                return new Uint8Array(buf);
            }
            case LLSDType.MAP: {
                const chunks: Uint8Array[] = [new Uint8Array([0x7B]), new Uint8Array(4)]; // '{' + count placeholder
                const mapObj = val.asMap;
                let totalLen = 5;
                let count = 0;

                mapObj.forEach((v, k) => {
                    const keyBytes = new TextEncoder().encode(k);
                    const keyBuf = new Uint8Array(5 + keyBytes.length);
                    const keyView = new DataView(keyBuf.buffer);
                    keyView.setUint8(0, 0x6B); // 'k'
                    keyView.setUint32(1, keyBytes.length, false);
                    keyBuf.set(keyBytes, 5);

                    const valBuf = LLSDSerialize.encodeBinaryValue(v);

                    chunks.push(keyBuf);
                    chunks.push(valBuf);
                    totalLen += keyBuf.length + valBuf.length;
                    count++;
                });

                chunks.push(new Uint8Array([0x7D])); // '}'
                totalLen += 1;

                const result = new Uint8Array(totalLen);
                let offset = 0;
                result[offset++] = 0x7B;

                const countView = new DataView(result.buffer, offset, 4);
                countView.setUint32(0, count, false);
                offset += 4;

                for (let i = 2; i < chunks.length; i++) {
                    result.set(chunks[i], offset);
                    offset += chunks[i].length;
                }
                return result;
            }
            case LLSDType.ARRAY: {
                const arr = val.asArray;
                const chunks: Uint8Array[] = [new Uint8Array([0x5B]), new Uint8Array(4)]; // '[' + count
                let totalLen = 5;

                arr.forEach(v => {
                    const itemBuf = LLSDSerialize.encodeBinaryValue(v);
                    chunks.push(itemBuf);
                    totalLen += itemBuf.length;
                });

                chunks.push(new Uint8Array([0x5D])); // ']'
                totalLen += 1;

                const result = new Uint8Array(totalLen);
                let offset = 0;
                result[offset++] = 0x5B;

                const countView = new DataView(result.buffer, offset, 4);
                countView.setUint32(0, arr.length, false);
                offset += 4;

                for (let i = 2; i < chunks.length; i++) {
                    result.set(chunks[i], offset);
                    offset += chunks[i].length;
                }
                return result;
            }
            default:
                return new Uint8Array([0x21]);
        }
    }

    public static fromBinary(data: Uint8Array): LLSDValue {
        let offset = 0;
        const headerStr = new TextDecoder('ascii').decode(data.subarray(0, 18));
        if (headerStr.startsWith(LLSDSerialize.BINARY_HEADER)) {
            offset = LLSDSerialize.BINARY_HEADER.length;
            if (data[offset] === 0x0A) offset++; // skip newline
        } else if (headerStr.startsWith('<? llsd/binary ?>')) {
            offset = '<? llsd/binary ?>'.length;
            if (data[offset] === 0x0A) offset++;
        }

        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        function readValue(): LLSDValue {
            if (offset >= data.length) return LLSDValue.undefined;
            const marker = data[offset++];

            switch (marker) {
                case 0x21: // '!'
                    return LLSDValue.undefined;
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
                    return LLSDValue.undefined;
            }
        }

        return readValue();
    }

    // --- XML ---
    public static toXML(val: LLSDValue, withDeclaration: boolean = false): string {
        const body = LLSDSerialize.encodeXMLValue(val, 2);
        if (withDeclaration) {
            return `<?xml version="1.0" encoding="UTF-8"?>\n<llsd>\n${body}\n</llsd>`;
        }
        return `<llsd>${body}</llsd>`;
    }

    private static xmlEscape(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private static encodeXMLValue(val: LLSDValue, indentLevel: number): string {
        const ind = ' '.repeat(indentLevel);
        switch (val.type) {
            case LLSDType.UNDEFINED: return `<undef/>`;
            case LLSDType.BOOLEAN: return `<boolean>${val.asBoolean() ? 'true' : 'false'}</boolean>`;
            case LLSDType.INTEGER: return `<integer>${val.asBigInt()}</integer>`;
            case LLSDType.REAL: {
                const r = val.asReal();
                if (isNaN(r)) return '<real>nan</real>';
                if (!isFinite(r)) return `<real>${r > 0 ? 'inf' : '-inf'}</real>`;
                return `<real>${r}</real>`;
            }
            case LLSDType.STRING: {
                const s = val.asString();
                return s ? `<string>${LLSDSerialize.xmlEscape(s)}</string>` : '<string/>';
            }
            case LLSDType.UUID: return val.asUUID().isNull() ? '<uuid/>' : `<uuid>${val.asUUID().toString()}</uuid>`;
            case LLSDType.DATE: return `<date>${val.asDate().toISOString()}</date>`;
            case LLSDType.URI: return `<uri>${LLSDSerialize.xmlEscape(val.asURI().toString())}</uri>`;
            case LLSDType.BINARY: return `<binary encoding="base64">${val.asBinary().toBase64()}</binary>`;
            case LLSDType.MAP: {
                const lines: string[] = ['<map>'];
                val.asMap.forEach((v, k) => {
                    lines.push(`<key>${LLSDSerialize.xmlEscape(k)}</key>`);
                    lines.push(LLSDSerialize.encodeXMLValue(v, indentLevel + 2));
                });
                lines.push('</map>');
                return lines.join('');
            }
            case LLSDType.ARRAY: {
                const lines: string[] = ['<array>'];
                val.asArray.forEach(v => {
                    lines.push(LLSDSerialize.encodeXMLValue(v, indentLevel + 2));
                });
                lines.push('</array>');
                return lines.join('');
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

                let value: LLSDValue = LLSDValue.undefined;
                switch (tagName) {
                    case 'undef': value = LLSDValue.undefined; break;
                    case 'boolean': value = LLSDValue.boolean(content === 'true' || content === '1'); break;
                    case 'integer': value = LLSDValue.integer(BigInt(content)); break;
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

        // Fallback simple regexes for primitive tags without outer <llsd> wrapper
        const intMatch = contentStr.match(/<integer>(-?\d+)<\/integer>/);
        if (intMatch) return LLSDValue.integer(BigInt(intMatch[1]));
        const strMatch = contentStr.match(/<string>(.*?)<\/string>/);
        if (strMatch) return LLSDValue.string(strMatch[1]);
        const boolMatch = contentStr.match(/<boolean>(.*?)<\/boolean>/);
        if (boolMatch) return LLSDValue.boolean(boolMatch[1] === 'true' || boolMatch[1] === '1');

        return LLSDValue.undefined;
    }
}
