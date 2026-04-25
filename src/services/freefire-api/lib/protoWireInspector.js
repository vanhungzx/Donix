const { decrypt } = require('./crypto.js');

function decodeVarint(buffer, start) {
    let value = 0n;
    let shift = 0n;
    let offset = start;

    while (offset < buffer.length) {
        const byte = BigInt(buffer[offset]);
        value |= (byte & 0x7fn) << shift;
        offset += 1;
        if ((byte & 0x80n) === 0n) {
            return { value, offset };
        }
        shift += 7n;
    }

    throw new Error('Malformed varint');
}

function toSafeNumber(bigintVal) {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    return bigintVal <= max ? Number(bigintVal) : bigintVal.toString();
}

function parseBuffer(buffer, depth, maxDepth) {
    const fields = [];
    let offset = 0;

    while (offset < buffer.length) {
        const tag = decodeVarint(buffer, offset);
        offset = tag.offset;

        const tagValue = Number(tag.value);
        const fieldNumber = tagValue >> 3;
        const wireType = tagValue & 0x7;

        if (wireType === 0) {
            const v = decodeVarint(buffer, offset);
            offset = v.offset;
            fields.push({
                field: fieldNumber,
                wireType,
                value: toSafeNumber(v.value)
            });
            continue;
        }

        if (wireType === 2) {
            const len = decodeVarint(buffer, offset);
            offset = len.offset;
            const length = Number(len.value);
            const end = offset + length;
            if (end > buffer.length) throw new Error('Length-delimited field exceeds buffer');

            const chunk = buffer.subarray(offset, end);
            offset = end;

            const utf8 = chunk.toString('utf8');
            const isPrintable = /^[\x20-\x7E]+$/.test(utf8);
            const fieldObj = {
                field: fieldNumber,
                wireType,
                length,
                base64: chunk.toString('base64'),
                hex: chunk.toString('hex')
            };

            if (isPrintable) {
                fieldObj.utf8 = utf8;
            }

            if (depth < maxDepth && chunk.length > 0) {
                try {
                    fieldObj.nested = parseBuffer(chunk, depth + 1, maxDepth);
                } catch (_) {
                    // Ignore nested parse errors; keep raw hex/base64.
                }
            }

            fields.push(fieldObj);
            continue;
        }

        if (wireType === 5) {
            if (offset + 4 > buffer.length) throw new Error('Fixed32 exceeds buffer');
            const val = buffer.readUInt32LE(offset);
            offset += 4;
            fields.push({
                field: fieldNumber,
                wireType,
                value: val
            });
            continue;
        }

        if (wireType === 1) {
            if (offset + 8 > buffer.length) throw new Error('Fixed64 exceeds buffer');
            const raw = buffer.subarray(offset, offset + 8);
            offset += 8;
            fields.push({
                field: fieldNumber,
                wireType,
                hex: raw.toString('hex')
            });
            continue;
        }

        throw new Error(`Unsupported wire type: ${wireType}`);
    }

    return fields;
}

function inferLabel(fieldEntry) {
    if (fieldEntry.wireType === 2 && typeof fieldEntry.utf8 === 'string') {
        const text = fieldEntry.utf8;
        if (/^[a-z]{2}$/i.test(text)) return 'region_or_lang';
        if (/^[a-f0-9]{32,64}$/i.test(text)) return 'hash_or_signature';
        if (/^https?:\/\//i.test(text)) return 'url';
        return 'string';
    }

    if (fieldEntry.wireType === 0) {
        const n = typeof fieldEntry.value === 'number' ? fieldEntry.value : NaN;
        if (Number.isFinite(n)) {
            if (n === 0 || n === 1) return 'bool_or_flag';
            if (n > 1000000000 && n < 9999999999999) return 'id_or_timestamp';
            if (n > 1000000) return 'id_or_counter';
        }
        return 'varint';
    }

    if (fieldEntry.wireType === 2 && Array.isArray(fieldEntry.nested)) {
        return 'nested_message';
    }

    if (fieldEntry.wireType === 5) return 'fixed32';
    if (fieldEntry.wireType === 1) return 'fixed64';
    return 'unknown';
}

function summarizeFields(fields) {
    const byField = {};
    for (const entry of fields) {
        const key = String(entry.field);
        if (!byField[key]) {
            byField[key] = {
                field: entry.field,
                occurrences: 0,
                wireTypes: [],
                labels: []
            };
        }
        const row = byField[key];
        row.occurrences += 1;
        if (!row.wireTypes.includes(entry.wireType)) row.wireTypes.push(entry.wireType);
        const label = inferLabel(entry);
        if (!row.labels.includes(label)) row.labels.push(label);
    }
    return Object.values(byField).sort((a, b) => a.field - b.field);
}

const ENDPOINT_REQUEST_FIELD_RULES = {
    GetPlayerStats: {
        1: 'accountId',
        2: 'matchmode'
    },
    GetWorkshopAuthorInfo: {
        1: 'accountId',
        2: 'region'
    },
    GetSpecialFriendList: {
        1: 'accountId'
    },
    GetPlayerCSRankingInfoByAccountID: {
        1: 'accountId'
    },
    GetPlayerPeriodicRankingInfoByAccountID: {
        2: 'accountId'
    },
    GetPlayerGalleryShowInfo: {
        1: 'accountId',
        3: 'signatureMd5'
    },
    GetAccountOutfit: {
        1: 'accountId'
    },
    QueryOccupationDetail: {
        1: 'accountId'
    },
    GetAccountWeaponPowerTitleRecord: {
        1: 'accountId'
    },
    GetPlayerTCStats: {
        1: 'accountId',
        3: 'gamemode',
        4: 'matchmode'
    },
    GetPlayerPersonalShow: {
        1: 'accountId',
        2: 'callSignSrc',
        4: 'needGalleryInfo',
        5: 'needTitle'
    }
};

const ENDPOINT_RESPONSE_FIELD_RULES = {
    GetRecommendedFriend: {
        1: 'infos'
    },
    GetAccountOutfit: {
        1: 'profile',
        2: 'outfit',
        5: 'details',
        6: 'status',
        8: 'flag'
    },
    GetPlayerGalleryShowInfo: {
        1: 'version',
        2: 'infoItem'
    },
    GetVisitors: {
        1: 'visitorsOrEntries',
        2: 'cursorOrMeta'
    },
    GetInteractionRecord: {
        1: 'records',
        2: 'cursorOrMeta'
    },
    GetAccountAchievementInfo: {
        1: 'achievementInfo',
        2: 'detailOrMeta'
    },
    GetWorkshopAuthorInfo: {
        1: 'authorInfo',
        2: 'works',
        3: 'summary'
    },
    GetSpecialFriendList: {
        1: 'friends',
        2: 'limitOrCursor',
        3: 'meta'
    },
    GetPlayerCSRankingInfoByAccountID: {
        1: 'rankingInfo',
        2: 'meta'
    },
    GetOccupationInfo: {
        1: 'occupationInfo',
        2: 'meta'
    },
    GetPlayerTCStats: {
        1: 'csstats'
    },
    GetPlayerPersonalShow: {
        1: 'basicinfo',
        2: 'profileinfo',
        3: 'rankingleaderboardpos',
        4: 'news',
        5: 'historyepinfo',
        6: 'clanbasicinfo',
        7: 'captainbasicinfo',
        8: 'petinfo',
        9: 'socialinfo',
        10: 'diamondcostres',
        11: 'creditscoreinfo',
        12: 'preveterantype',
        13: 'mmrlist',
        14: 'modestatssummaryinfo'
    }
};

function applyEndpointRules(summary, endpointName, messageType = 'response') {
    const name = String(endpointName || '');
    const type = String(messageType || 'response').toLowerCase();
    const sourceRules = type === 'request' ? ENDPOINT_REQUEST_FIELD_RULES : ENDPOINT_RESPONSE_FIELD_RULES;
    const rules = sourceRules[name];
    if (!rules) return summary;

    return summary.map((row) => {
        const semanticName = rules[row.field] || null;
        return semanticName ? { ...row, semanticName } : row;
    });
}

function buildSummaryBySemanticName(summary) {
    const out = {};
    for (const row of summary) {
        const key = row.semanticName || `field_${row.field}`;
        if (!out[key]) {
            out[key] = {
                fields: [],
                occurrences: 0,
                wireTypes: [],
                labels: []
            };
        }
        const item = out[key];
        item.occurrences += row.occurrences || 0;
        if (!item.fields.includes(row.field)) item.fields.push(row.field);
        for (const wt of row.wireTypes || []) {
            if (!item.wireTypes.includes(wt)) item.wireTypes.push(wt);
        }
        for (const label of row.labels || []) {
            if (!item.labels.includes(label)) item.labels.push(label);
        }
    }
    return out;
}

function packetToBuffer(packet) {
    const source = packet && typeof packet === 'object' ? packet : {};
    let buffer = null;
    if (typeof source.base64 === 'string' && source.base64.length > 0) {
        buffer = Buffer.from(source.base64, 'base64');
    } else if (typeof source.hex === 'string' && source.hex.length > 0) {
        buffer = Buffer.from(source.hex, 'hex');
    } else {
        throw new Error('Packet must include base64 or hex');
    }
    return buffer;
}

function inspectRawPacket(packet, options = {}) {
    const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 2;
    const endpointName = options.endpointName;
    const messageType = options.messageType || 'response';
    const buffer = packetToBuffer(packet);
    const fields = parseBuffer(buffer, 0, Math.max(0, maxDepth));

    const summary = applyEndpointRules(summarizeFields(fields), endpointName, messageType);

    return {
        length: buffer.length,
        fields,
        summary,
        summaryBySemanticName: buildSummaryBySemanticName(summary),
        endpoint: endpointName || null,
        messageType
    };
}

function inspectEncryptedPacket(packet, options = {}) {
    const encrypted = packetToBuffer(packet);
    const decrypted = decrypt(encrypted);
    const decryptedPacket = {
        length: decrypted.length,
        hex: decrypted.toString('hex'),
        base64: decrypted.toString('base64')
    };
    const inspected = inspectRawPacket(decryptedPacket, options);

    return {
        encryptedLength: encrypted.length,
        decryptedPacket,
        ...inspected
    };
}

module.exports = {
    inspectRawPacket,
    inspectEncryptedPacket,
    endpointRequestFieldRules: ENDPOINT_REQUEST_FIELD_RULES,
    endpointResponseFieldRules: ENDPOINT_RESPONSE_FIELD_RULES
};
