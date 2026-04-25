const axios = require('axios');
const fs = require('fs');
const path = require('path');
const protoHandler = require('./protobuf.js');
const { AE, HEADERS, URLS, GARENA_CLIENT, DEFAULT_CREDENTIALS } = require('./constants.js');
const { processPlayerItems } = require('./utils.js');

class FreeFireAPI {
    constructor() {
        this.session = {
            token: null,
            serverUrl: null,
            openId: null,
            accountId: null
        };
    }

    _buildUnityGameHeaders(token) {
        return {
            'User-Agent': 'UnityPlayer/2022.3.47f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)',
            'Accept-Encoding': 'deflate, gzip',
            'Authorization': `Bearer ${token}`,
            'X-GA': 'v1 1',
            'ReleaseVersion': 'OB53',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Unity-Version': '2022.3.47f1'
        };
    }

    _decodeJwtPayload(token) {
        try {
            const parts = String(token || '').split('.');
            if (parts.length < 2) return {};
            const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
            return JSON.parse(payload);
        } catch (_) {
            return {};
        }
    }

    /**
     * Authenticate with Garena using UID and Password (Guest/Account)
     * @param {string} [uid] - (Optional) User ID
     * @param {string} [password] - (Optional) Password
     */
    async login(uid = null, password = null, options = {}) {
        if (uid && typeof uid === 'object') {
            options = uid;
            uid = options.uid ?? null;
            password = options.password ?? null;
        } else if (password && typeof password === 'object') {
            options = password;
            password = options.password ?? null;
        }

        const majorLoginPayloadPath = options?.majorLoginPayloadPath ? String(options.majorLoginPayloadPath) : '';
        const majorLoginBearerToken = options?.majorLoginBearerToken ? String(options.majorLoginBearerToken) : '';
        const skipGarenaAuth = Boolean(options?.skipGarenaAuth && majorLoginPayloadPath && majorLoginBearerToken);

        if (skipGarenaAuth) {
            const loginData = await this._majorLogin('', '', majorLoginBearerToken, majorLoginPayloadPath);
            if (!loginData || !loginData.token) {
                throw new Error('Major login failed: Empty token received');
            }
            this.session.token = loginData.token;
            this.session.serverUrl = loginData.serverUrl;
            this.session.accountId = loginData.accountId ?? loginData.accountid;
            return this.session;
        }

        // Use default credentials if not provided
        if (!uid || !password) {
            console.log("[i] No credentials provided, loading from config/credentials.yaml.");
            uid = DEFAULT_CREDENTIALS.UID;
            password = DEFAULT_CREDENTIALS.PASSWORD;
        }

        if (!uid || !password) {
            throw new Error("Missing credentials. Set UID and PASSWORD in config/credentials.yaml or pass them to login(uid, password).");
        }

        // Step 1: Get Garena Token
        const garenaData = await this._getGarenaToken(uid, password);
        if (!garenaData || !garenaData.access_token) {
            throw new Error("Garena authentication failed: Invalid credentials or response");
        }

        // Step 2: Major Login
        const loginData = await this._majorLogin(
            garenaData.access_token,
            garenaData.open_id,
            majorLoginBearerToken || garenaData.access_token,
            majorLoginPayloadPath
        );
        if (!loginData || !loginData.token) {
            throw new Error("Major login failed: Empty token received");
        }

        this.session.token = loginData.token;
        this.session.serverUrl = loginData.serverUrl;
        this.session.openId = garenaData.open_id;
        this.session.accountId = loginData.accountId ?? loginData.accountid;

        return this.session;
    }

    async _getGarenaToken(uid, password) {
        const uidNum = Number(uid);
        const jsonBody = {
            client_id: Number(GARENA_CLIENT.CLIENT_ID),
            client_secret: GARENA_CLIENT.CLIENT_SECRET,
            client_type: 2,
            password: String(password),
            response_type: 'token',
            uid: uidNum
        };
        const fallbackUrl = 'https://ffmconnect.live.gop.garenanow.com/oauth/guest/token/grant';

        try {
            const primary = await axios.post(URLS.GARENA_TOKEN, jsonBody, {
                headers: {
                    ...HEADERS.GARENA_AUTH,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
            return this._normalizeGarenaTokenResponse(primary.data);
        } catch (primaryError) {
            try {
                const params = new URLSearchParams();
                params.append('uid', String(uidNum));
                params.append('password', String(password));
                params.append('response_type', 'token');
                params.append('client_type', '2');
                params.append('client_secret', String(GARENA_CLIENT.CLIENT_SECRET));
                params.append('client_id', String(GARENA_CLIENT.CLIENT_ID));
                const fallback = await axios.post(fallbackUrl, params, {
                    headers: {
                        ...HEADERS.GARENA_AUTH,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                return this._normalizeGarenaTokenResponse(fallback.data);
            } catch (fallbackError) {
                const p = primaryError?.response?.data ? JSON.stringify(primaryError.response.data) : '';
                const f = fallbackError?.response?.data ? JSON.stringify(fallbackError.response.data) : '';
                throw new Error(`Garena Auth Request Failed: primary=${primaryError.message}${p ? `|${p}` : ''}; fallback=${fallbackError.message}${f ? `|${f}` : ''}`);
            }
        }
    }

    _normalizeGarenaTokenResponse(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const nested = source.data && typeof source.data === 'object' ? source.data : {};
        const accessToken = source.access_token || nested.access_token || null;
        const openId = source.open_id || nested.open_id || null;
        if (!accessToken || !openId) {
            return source;
        }
        return {
            ...source,
            access_token: accessToken,
            open_id: openId
        };
    }

    async _majorLogin(accessToken, openId, bearerToken = '', rawPayloadPath = '') {
        let requestBody;
        if (rawPayloadPath) {
            requestBody = fs.readFileSync(rawPayloadPath);
        } else {
            const payload = {
                openid: openId,
                logintoken: accessToken,
                platform: "4",
                clientversion: HEADERS.COMMON['ReleaseVersion'] || "OB53"
            };
            requestBody = await protoHandler.encode('MajorLogin.proto', 'MajorLogin.request', payload, true);
        }
        const loginUrls = [
            URLS.MAJOR_LOGIN,
            'https://loginbp.ggblueshark.com/MajorLogin'
        ];

        let lastError = null;
        for (const loginUrl of loginUrls) {
            try {
                const response = await axios.post(loginUrl, requestBody, {
                    headers: this._buildUnityGameHeaders(bearerToken || accessToken),
                    responseType: 'arraybuffer'
                });

                const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
                return await protoHandler.decode('MajorLogin.proto', 'MajorLogin.response', buf);
            } catch (error) {
                lastError = error;
                if (error?.response?.status !== 404) break;
            }
        }

        const responseBody = lastError?.response?.data
            ? (Buffer.isBuffer(lastError.response.data) ? lastError.response.data.toString('utf8') : JSON.stringify(lastError.response.data))
            : '';
        throw new Error(`Major Login Request Failed: ${lastError?.message || 'Unknown error'}${responseBody ? ` | response=${responseBody}` : ''}`);
    }

    /**
     * Search for accounts by name (fuzzy search)
     * @param {string} keyword 
     * @returns {Promise<Array>} List of matching accounts
     */
    async searchAccount(keyword) {
        await this._checkSession();

        if (keyword.length < 3) {
            throw new Error("Search keyword must be at least 3 characters long.");
        }

        const payload = { keyword: String(keyword) };
        const encryptedBody = await protoHandler.encode('SearchAccountByName.proto', 'SearchAccountByName.request', payload, true);

        const url = URLS.SEARCH(this.session.serverUrl);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            const data = await protoHandler.decode('SearchAccountByName.proto', 'SearchAccountByName.response', buf);
            return data.infos; // Field name is 'infos' in proto
        } catch (error) {
            throw new Error(`Search Failed: ${error.message}`);
        }
    }

    /**
     * Get detailed player profile (Personal Show)
     * @param {number|string} uid 
     * @returns {Promise<Object>} Player data including profile, guild, etc.
     */
    async getPlayerProfile(uid) {
        await this._checkSession();

        const payload = {
            accountId: Number(uid),
            callSignSrc: 7,
            needGalleryInfo: true
        };

        const encryptedBody = await protoHandler.encode('PlayerPersonalShow.proto', 'PlayerPersonalShow.request', payload, true);
        const url = URLS.PERSONAL_SHOW(this.session.serverUrl);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            const decoded = await protoHandler.decode('PlayerPersonalShow.proto', 'PlayerPersonalShow.response', buf);
            if (decoded && typeof decoded === 'object') {
                decoded._rawPacket = {
                    length: buf.length,
                    hex: buf.toString('hex'),
                    base64: buf.toString('base64')
                };
            }
            return decoded;
        } catch (error) {
            throw new Error(`Get Profile Failed: ${error.message}`);
        }
    }

    /**
     * Get player items (outfit, weapons, skills, pet)
     * @param {number|string} uid 
     */
    async getPlayerItems(uid) {
        const profile = await this.getPlayerProfile(uid);
        if (!profile) return null;
        return processPlayerItems(profile);
    }

    /**
     * Get Player Stats
     * @param {number|string} uid 
     * @param {'br'|'cs'} mode - Battle Royale or Clash Squad
     * @param {'career'|'ranked'|'normal'} matchType 
     */
    async getPlayerStats(uid, mode = 'br', matchType = 'career') {
        await this._checkSession();

        const modeLower = mode.toLowerCase();
        const typeUpper = matchType.toUpperCase();

        let matchMode = 0;
        let url = '';
        let protoFile = '';
        let payload = { accountid: Number(uid) };

        if (modeLower === 'br') {
            const types = { 'CAREER': 0, 'NORMAL': 1, 'RANKED': 2 };
            matchMode = types[typeUpper] !== undefined ? types[typeUpper] : 0;
            url = URLS.PLAYER_STATS(this.session.serverUrl);
            protoFile = 'PlayerStats.proto';
            payload.matchmode = matchMode;
        } else {
            const types = { 'CAREER': 0, 'NORMAL': 1, 'RANKED': 6 };
            matchMode = types[typeUpper] !== undefined ? types[typeUpper] : 0;
            url = URLS.PLAYER_CS_STATS(this.session.serverUrl);
            protoFile = 'PlayerCSStats.proto';
            payload.gamemode = 15; // CS default
            payload.matchmode = matchMode;
        }

        const pkg = protoFile.replace('.proto', '');
        const encryptedBody = await protoHandler.encode(protoFile, pkg + '.request', payload, true);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode(protoFile, pkg + '.response', buf);
        } catch (error) {
            throw new Error(`Get Stats Failed: ${error.message}`);
        }
    }
    /**
     * Get recommended friends for the authenticated account
     * @returns {Promise<Array>} List of recommended friend accounts
     */
    async getRecommendedFriend() {
        await this._checkSession();

        const payload = {};
        const encryptedBody = await protoHandler.encode('GetRecommendedFriend.proto', 'GetRecommendedFriend.request', payload, true);
        const url = URLS.RECOMMENDED_FRIEND(this.session.serverUrl);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            const data = await protoHandler.decode('GetRecommendedFriend.proto', 'GetRecommendedFriend.response', buf);
            return data.infos;
        } catch (error) {
            throw new Error(`Get Recommended Friend Failed: ${error.message}`);
        }
    }

    /**
     * Get account outfit info by account ID
     * @param {number|string} uid
     * @returns {Promise<Object>} Raw decoded outfit response
     */
    async getAccountOutfit(uid) {
        await this._checkSession();

        const payload = { accountId: Number(uid) };
        const encryptedBody = await protoHandler.encode('GetAccountOutfit.proto', 'GetAccountOutfit.request', payload, true);
        const url = URLS.ACCOUNT_OUTFIT(this.session.serverUrl);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode('GetAccountOutfit.proto', 'GetAccountOutfit.response', buf);
        } catch (error) {
            throw new Error(`Get Account Outfit Failed: ${error.message}`);
        }
    }

    /**
     * Get player gallery show info by account ID
     * @param {number|string} uid
     * @param {string} signatureMd5
     * @returns {Promise<Object>} Raw decoded gallery response
     */
    async getPlayerGalleryShowInfo(uid, signatureMd5 = '') {
        await this._checkSession();

        const effectiveSignature = String(signatureMd5 || this._extractSignatureMd5FromToken() || '');
        const payload = {
            accountId: Number(uid),
            signatureMd5: effectiveSignature
        };
        const encryptedBody = await protoHandler.encode('GetPlayerGalleryShowInfo.proto', 'GetPlayerGalleryShowInfo.request', payload, true);
        const url = URLS.PLAYER_GALLERY_SHOW_INFO(this.session.serverUrl);

        try {
            const response = await axios.post(url, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });

            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            const data = await protoHandler.decode('GetPlayerGalleryShowInfo.proto', 'GetPlayerGalleryShowInfo.response', buf);
            if (Array.isArray(data.infoItem) && !Array.isArray(data.info_item)) {
                data.info_item = data.infoItem;
            }
            return data;
        } catch (error) {
            throw new Error(`Get Player Gallery Show Info Failed: ${error.message}`);
        }
    }

    async _postEncryptedRaw(url, protoFile, messageName, payload) {
        const encryptedBody = await protoHandler.encode(protoFile, messageName, payload, true);
        const response = await axios.post(url, encryptedBody, {
            headers: {
                ...HEADERS.COMMON,
                'Authorization': `Bearer ${this.session.token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            responseType: 'arraybuffer'
        });
        return Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
    }

    _toRawPacket(buffer) {
        return {
            length: buffer.length,
            hex: buffer.toString('hex'),
            base64: buffer.toString('base64')
        };
    }

    async getVisitors() {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.VISITORS(this.session.serverUrl),
                'GetVisitors.proto',
                'GetVisitors.request',
                {}
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Visitors Failed: ${error.message}`);
        }
    }

    async getInteractionRecord() {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.INTERACTION_RECORD(this.session.serverUrl),
                'GetInteractionRecord.proto',
                'GetInteractionRecord.request',
                {}
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Interaction Record Failed: ${error.message}`);
        }
    }

    async getAccountAchievementInfo() {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.ACCOUNT_ACHIEVEMENT_INFO(this.session.serverUrl),
                'GetAccountAchievementInfo.proto',
                'GetAccountAchievementInfo.request',
                {}
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Account Achievement Info Failed: ${error.message}`);
        }
    }

    async getWorkshopAuthorInfo(uid, region = 'vn') {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.WORKSHOP_AUTHOR_INFO(this.session.serverUrl),
                'GetWorkshopAuthorInfo.proto',
                'GetWorkshopAuthorInfo.request',
                {
                    accountId: Number(uid),
                    region: String(region || 'vn').toLowerCase()
                }
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Workshop Author Info Failed: ${error.message}`);
        }
    }

    async getSpecialFriendList(uid) {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.SPECIAL_FRIEND_LIST(this.session.serverUrl),
                'GetSpecialFriendList.proto',
                'GetSpecialFriendList.request',
                { accountId: Number(uid) }
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Special Friend List Failed: ${error.message}`);
        }
    }

    async getPlayerCSRankingInfoByAccountID(uid) {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.PLAYER_CS_RANKING_INFO_BY_ACCOUNT_ID(this.session.serverUrl),
                'GetPlayerCSRankingInfoByAccountID.proto',
                'GetPlayerCSRankingInfoByAccountID.request',
                { accountId: Number(uid) }
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Player CS Ranking Info Failed: ${error.message}`);
        }
    }

    async getOccupationInfo() {
        await this._checkSession();
        try {
            const buf = await this._postEncryptedRaw(
                URLS.OCCUPATION_INFO(this.session.serverUrl),
                'GetOccupationInfo.proto',
                'GetOccupationInfo.request',
                {}
            );
            return this._toRawPacket(buf);
        } catch (error) {
            throw new Error(`Get Occupation Info Failed: ${error.message}`);
        }
    }

    /**
     * Full guest account creation flow:
     * 1. guest:register -> get uid + password
     * 2. guest/token:grant -> get access_token + open_id
     * 3. MajorLogin (initial)
     * 4. GenerateNickname
     * 5. MajorRegister
     * 6. ChooseNewbieChoice
     * 7. MajorLogin (final) -> session ready
     * @param {Object} [options]
     * @param {string} [options.region='vn']
     * @param {number} [options.regAvatar=102000007]
     * @param {number} [options.newbieChoice=3] - 1=NEWPLAYER, 2=FPSPLAYER, 3=VETERAN
     * @param {string|number} [options.guestUid] - Optional pre-created guest UID to bypass guest:register captcha
     * @param {string} [options.guestPassword] - Optional pre-created guest password to bypass guest:register captcha
     * @returns {Promise<Object>} { session, guestCredentials: { uid, password }, nickname }
     */
    async createGuestAccount(options = {}) {
        const region = String(options.region || 'vn').toLowerCase();
        const regAvatar = Number(options.regAvatar || 102000007);
        const newbieChoice = Number(options.newbieChoice || 3);
        const gopBearerToken = options.gopBearerToken ? String(options.gopBearerToken) : '';
        const guestRegisterSignature = options.guestRegisterSignature ? String(options.guestRegisterSignature) : '';
        let guestUid = options.guestUid ? String(options.guestUid) : '';
        let guestPassword = options.guestPassword ? String(options.guestPassword) : '';
        const jwtPayload = this._decodeJwtPayload(gopBearerToken);
        let directExternalId = options.externalId
            ? String(options.externalId)
            : (jwtPayload.external_id ? String(jwtPayload.external_id) : '');
        let directAccountId = options.accountId ? Number(options.accountId) : Number(jwtPayload.account_id || 0);
        let accessToken = '';
        let openId = '';
        let externalId = '';
        let useDirectGopFlow = false;

        if (!guestUid || !guestPassword) {
            const guestReg = await this._guestRegister({ guestRegisterSignature });
            guestUid = guestReg.uid;
            guestPassword = guestReg.password;
        }

        try {
            const garenaData = await this._guestTokenGrant(guestUid, guestPassword);
            accessToken =
                garenaData?.access_token ??
                garenaData?.token ??
                garenaData?.data?.access_token ??
                garenaData?.data?.token;
            openId =
                garenaData?.open_id ??
                garenaData?.uid ??
                garenaData?.data?.open_id ??
                garenaData?.data?.uid ??
                guestUid;
            externalId =
                garenaData?.external_id ??
                garenaData?.data?.external_id ??
                openId;
            if (!accessToken) {
                throw new Error(`Guest token grant failed: missing access token | response=${JSON.stringify(garenaData || {})}`);
            }
        } catch (grantError) {
            const msg = String(grantError?.message || '');
            if (!gopBearerToken || !msg.includes('captcha-delivery.com')) {
                throw grantError;
            }
            useDirectGopFlow = true;
            externalId = directExternalId;
            if (!externalId) {
                throw new Error('Guest token blocked by captcha and missing externalId for direct GOP flow.');
            }
        }

        if (!useDirectGopFlow) {
            let loginData = null;
            try {
                loginData = await this._majorLogin(accessToken, openId, gopBearerToken || accessToken);
                this.session.token = loginData.token;
                this.session.serverUrl = loginData.serverUrl;
                this.session.accountId = loginData.accountId ?? loginData.accountid;
            } catch (error) {
                const msg = String(error?.message || '');
                if (!msg.includes('account_not_found')) {
                    throw error;
                }
                // Fresh guest may not have a game account yet.
                // Do not use Garena token as GOP JWT; wait for register/login to issue valid JWT.
                this.session.token = null;
            }
            this.session.openId = openId;
        }

        if (gopBearerToken) {
            this.session.token = gopBearerToken;
        }

        // MajorRegister requires a valid GOP JWT in Authorization header.
        // If fresh guest flow does not yet have one, bootstrap from default account credentials.
        if (!this.session.token) {
            const bootstrapJwt = await this._bootstrapGopJwt();
            this.session.token = bootstrapJwt.token;
            this.session.serverUrl = bootstrapJwt.serverUrl || this.session.serverUrl;
        }

        const nicknameData = await this._generateNickname(region, externalId);
        const nickname = nicknameData.nickname || nicknameData.Nickname || 'Player';

        const regResult = await this._majorRegister({
            nickname,
            externalId,
            signatureHash: String(guestPassword).toLowerCase(),
            regAvatar,
            region,
            deviceFingerprintHex: '5551000605080f52005501055454575653025253520408555452540152090452'
        });

        if (regResult.token) this.session.token = regResult.token;
        if (regResult.serverUrl) this.session.serverUrl = regResult.serverUrl;
        if (regResult.accountId) this.session.accountId = regResult.accountId;

        if (!this.session.accountId && directAccountId > 0) {
            this.session.accountId = directAccountId;
        }
        if (!this.session.accountId) {
            throw new Error('Create account flow missing accountId after MajorRegister. Provide options.accountId when using direct GOP flow.');
        }

        await this._chooseNewbieChoice(this.session.accountId, newbieChoice);

        if (!useDirectGopFlow) {
            const finalLogin = await this._majorLogin(accessToken, openId, gopBearerToken || accessToken);
            this.session.token = finalLogin.token;
            this.session.serverUrl = finalLogin.serverUrl;
            this.session.accountId = finalLogin.accountId ?? finalLogin.accountid;
        }

        return {
            session: { ...this.session },
            guestCredentials: { uid: guestUid, password: guestPassword },
            nickname
        };
    }

    async _guestRegister(options = {}) {
        try {
            const crypto = require('crypto');
            const password = crypto.randomBytes(32).toString('hex').toUpperCase();
            const signature = options.guestRegisterSignature ? String(options.guestRegisterSignature) : '';
            const response = await axios.post(URLS.GARENA_GUEST_REGISTER, {
                app_id: Number(GARENA_CLIENT.CLIENT_ID),
                client_type: 2,
                password,
                source: 2
            }, {
                headers: {
                    ...HEADERS.GARENA_AUTH,
                    'User-Agent': 'GarenaMSDK/4.0.41(PGT-AN00 ;Android 9;vi;VN;app 2.123.1 2019117599;)',
                    'Accept': 'application/json',
                    ...(signature ? { 'Authorization': `Signature ${signature}` } : {}),
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
            const data = response.data || {};
            const uid =
                data.uid ??
                data.open_id ??
                data.user_id ??
                data?.data?.uid ??
                data?.data?.open_id ??
                data?.result?.uid;

            if (!uid || !/^\d+$/.test(String(uid))) {
                throw new Error(`Guest register returned invalid uid: ${JSON.stringify(data)}`);
            }

            return { uid: String(uid), password };
        } catch (error) {
            const responseBody = error?.response?.data ? JSON.stringify(error.response.data) : '';
            if (responseBody && responseBody.includes('captcha-delivery.com')) {
                throw new Error('Guest Register Failed: blocked by captcha challenge. Pass options.guestUid + options.guestPassword from a captured guest account to bypass this step.');
            }
            throw new Error(`Guest Register Failed: ${error.message}${responseBody ? ` | response=${responseBody}` : ''}`);
        }
    }

    async _guestTokenGrant(uid, password) {
        if (!uid || !/^\d+$/.test(String(uid))) {
            throw new Error(`Guest Token Grant Failed: invalid uid from register step (${uid})`);
        }
        try {
            const response = await axios.post(URLS.GARENA_TOKEN, {
                client_id: Number(GARENA_CLIENT.CLIENT_ID),
                client_secret: GARENA_CLIENT.CLIENT_SECRET,
                client_type: 2,
                password,
                response_type: 'token',
                uid: Number(uid)
            }, {
                headers: {
                    ...HEADERS.GARENA_AUTH,
                    'User-Agent': 'GarenaMSDK/4.0.41(PGT-AN00 ;Android 9;vi;VN;app 2.123.1 2019117599;)',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
            return response.data;
        } catch (error) {
            const responseBody = error?.response?.data ? JSON.stringify(error.response.data) : '';
            throw new Error(`Guest Token Grant Failed: ${error.message}${responseBody ? ` | response=${responseBody}` : ''}`);
        }
    }

    async _bootstrapGopJwt() {
        const credentialCandidates = [];

        if (DEFAULT_CREDENTIALS.UID && DEFAULT_CREDENTIALS.PASSWORD) {
            credentialCandidates.push({
                uid: DEFAULT_CREDENTIALS.UID,
                password: DEFAULT_CREDENTIALS.PASSWORD,
                source: 'credentials.yaml'
            });
        }

        try {
            const raw = fs.readFileSync(path.join(__dirname, '../config/accountConfiguration.json'), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                if (parsed.VN?.uid && parsed.VN?.password) {
                    credentialCandidates.push({ uid: parsed.VN.uid, password: parsed.VN.password, source: 'accountConfiguration.json:VN' });
                }
                for (const [region, cred] of Object.entries(parsed)) {
                    if (!cred?.uid || !cred?.password) continue;
                    if (String(region).toUpperCase() === 'VN') continue;
                    credentialCandidates.push({ uid: cred.uid, password: cred.password, source: `accountConfiguration.json:${region}` });
                }
            }
        } catch (_) {
            // ignore missing or invalid accountConfiguration.json
        }

        let lastError = null;
        for (const cred of credentialCandidates) {
            try {
                const garena = await this._getGarenaToken(cred.uid, cred.password);
                if (!garena?.access_token || !garena?.open_id) {
                    throw new Error(`missing access_token/open_id from ${cred.source}`);
                }
                const loginData = await this._majorLogin(garena.access_token, garena.open_id);
                if (!loginData?.token) {
                    throw new Error(`missing GOP token from ${cred.source}`);
                }
                return { token: loginData.token, serverUrl: loginData.serverUrl };
            } catch (err) {
                lastError = err;
            }
        }

        throw new Error(`Failed to bootstrap GOP JWT from local credentials: ${lastError?.message || 'no valid credential source'}`);
    }

    async _generateNickname(region, externalId) {
        const payload = {
            region: String(region),
            externalId: String(externalId)
        };
        const encryptedBody = await protoHandler.encode('GenerateNickname.proto', 'GenerateNickname.request', payload, true);

        try {
            const response = await axios.post(URLS.GENERATE_NICKNAME, encryptedBody, {
                headers: this._buildUnityGameHeaders(this.session.token),
                responseType: 'arraybuffer'
            });
            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode('GenerateNickname.proto', 'GenerateNickname.response', buf);
        } catch (error) {
            throw new Error(`Generate Nickname Failed: ${error.message}`);
        }
    }

    async _majorRegister({ nickname, externalId, signatureHash, regAvatar, region, deviceFingerprintHex }) {
        const payload = {
            nickname: Buffer.from(nickname, 'utf8'),
            signatureHash: String(signatureHash || ''),
            externalId: String(externalId),
            regAvatar: Number(regAvatar),
            externalType: 4,
            platId: 1,
            source: 1,
            deviceFingerprint: Buffer.from(
                deviceFingerprintHex || '5551000605080f52005501055454575653025253520408555452540152090452',
                'hex'
            ),
            region: String(region),
            clientType: 2
        };
        const encryptedBody = await protoHandler.encode('MajorRegister.proto', 'MajorRegister.request', payload, true);

        try {
            const response = await axios.post(URLS.MAJOR_REGISTER, encryptedBody, {
                headers: this._buildUnityGameHeaders(this.session.token),
                responseType: 'arraybuffer'
            });
            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode('MajorRegister.proto', 'MajorRegister.response', buf);
        } catch (error) {
            const responseBody = error?.response?.data
                ? (Buffer.isBuffer(error.response.data) ? error.response.data.toString('utf8') : JSON.stringify(error.response.data))
                : '';
            throw new Error(`Major Register Failed: ${error.message}${responseBody ? ` | response=${responseBody}` : ''}`);
        }
    }

    async _chooseNewbieChoice(accountId, choice = 3) {
        const payload = {
            accountId: Number(accountId),
            choice: 2,
            value: Number(choice)
        };
        const encryptedBody = await protoHandler.encode('ChooseNewbieChoice.proto', 'ChooseNewbieChoice.request', payload, true);

        try {
            const response = await axios.post(URLS.CHOOSE_NEWBIE_CHOICE, encryptedBody, {
                headers: this._buildUnityGameHeaders(this.session.token),
                responseType: 'arraybuffer'
            });
            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode('ChooseNewbieChoice.proto', 'ChooseNewbieChoice.response', buf);
        } catch (error) {
            throw new Error(`Choose Newbie Choice Failed: ${error.message}`);
        }
    }

    async ping() {
        await this._checkSession();
        const encryptedBody = await protoHandler.encode('Ping.proto', 'Ping.request', {}, true);
        try {
            const response = await axios.post(URLS.PING, encryptedBody, {
                headers: {
                    ...HEADERS.COMMON,
                    'Authorization': `Bearer ${this.session.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });
            const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            return await protoHandler.decode('Ping.proto', 'Ping.response', buf);
        } catch (error) {
            throw new Error(`Ping Failed: ${error.message}`);
        }
    }

    async getLoginData() {
        await this._checkSession();
        return this._toRawPacket(await this._postEncryptedRaw(
            URLS.GET_LOGIN_DATA(this.session.serverUrl),
            'GetLoginData.proto', 'GetLoginData.request', {}
        ));
    }

    async loginGetDesc(region = 'vn') {
        await this._checkSession();
        const payload = { region, platId: 1, countryCode: region.toUpperCase(), clientType: 2 };
        return this._toRawPacket(await this._postEncryptedRaw(
            URLS.LOGIN_GET_DESC(this.session.serverUrl),
            'LoginGetDesc.proto', 'LoginGetDesc.request', payload
        ));
    }

    async loginGetSplash(region = 'vn') {
        await this._checkSession();
        const payload = { region, clientType: 2, platId: 1 };
        return this._toRawPacket(await this._postEncryptedRaw(
            URLS.LOGIN_GET_SPLASH(this.session.serverUrl),
            'LoginGetSplash.proto', 'LoginGetSplash.request', payload
        ));
    }

    async loginGetProfile() {
        await this._checkSession();
        return this._toRawPacket(await this._postEncryptedRaw(
            URLS.LOGIN_GET_PROFILE(this.session.serverUrl),
            'LoginGetProfile.proto', 'LoginGetProfile.request', {}
        ));
    }

    _extractSignatureMd5FromToken() {
        try {
            const token = String(this.session?.token || '');
            const parts = token.split('.');
            if (parts.length < 2) return '';

            const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
            const decoded = Buffer.from(padded, 'base64').toString('utf8');
            const data = JSON.parse(decoded);
            return String(data.signature_md5 || '');
        } catch (_) {
            return '';
        }
    }

    // ----- Auto login if no session with Default Data.
    async _checkSession() {
        if (!this.session.token || !this.session.serverUrl) {
            await this.login();
        }
    }
}

module.exports = FreeFireAPI;
