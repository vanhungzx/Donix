let math = require('./math.js');
var createCharacter = require("./createCharacter");
let pvp_rooms = {};
var get = require("./getData");
var set = require("./setData");
var axios = require("axios");

async function createCharecter({ userData, api, event }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = createCharacter({
        data: {
            id: senderID,
            name: (await userData.get(senderID)).name
        }
    });
    if (dataUser == 403) return api.sendMessage("❎ Bạn đã có nhân vật rồi", threadID, messageID);
    var stream = (await axios.get(global.configMonster.create, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: "✅ Tạo nhân vật thành công\n\n✏️ Sử dụng lệnh /monster info để xem thông tin nhân vật\n✏️ Sử dụng lệnh /monster help để xem cách chơi", attachment: stream }, threadID, messageID);
}

async function getCharacter({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    var statusBag = "";
    if (dataUser.monster.length >= 1) statusBag = "🟢";
    if (dataUser.monster.length >= 10) statusBag = "🟡";
    if (dataUser.monster.length >= 20) statusBag = "🟠";
    if (dataUser.monster.length >= 30) statusBag = "🔴";
    var statusKarma = "";
    if (dataUser.karma >= 10) statusKarma = "Những Linh hồn đang than khóc, level quái +10";
    if (dataUser.karma >= 20) statusKarma = "Những vong hồn vất vưởng, level quái +20";
    if (dataUser.karma >= 30) statusKarma = "Những oan hồn đang gào rú, level quái +30";
    if (dataUser.karma >= 40) statusKarma = "Mày còn không bú ngay một chai nước thánh là mày ăn cứt nhé em, level quái +40";
    if (dataUser.karma >= 50) statusKarma = "Á đù nguyên một quân đoàn ác quỷ sau lưng, level quái +50";
    if (dataUser.karma >= 60) statusKarma = "Mày có chắc là không bú nước thánh không đấy, level quái +60";
    if (dataUser.karma >= 70) statusKarma = "Vẫn đang giết thêm quái đấy à, level quái +70";
    if (dataUser.karma >= 80) statusKarma = "Hết cứu, level quái +80";
    if (dataUser.karma >= 90) statusKarma = "Nghe lời tao, bú nhanh một chai nước thánh đi, level quái +90";
    if (dataUser.karma >= 100) statusKarma = "Vãi lồn, game chưa đủ khó à, level quái +100";
    var stream = (await axios.get(global.configMonster.info, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `[ ------ STATUS ------ ]\n────────────────\n👤 Tên nhân vật: ${dataUser.name}\n📝 Uid: ${dataUser.id}\n✏️ Level: ${dataUser.level}\n✨ EXP: ${Math.round(dataUser.exp)} / ${500 * Math.round(Math.pow(1.2, dataUser.level - 1))}\n🦾 Chỉ số:\n❤️ Máu: ${dataUser.hp} (+${dataUser.weapon != null ? dataUser.weapon.HP : "0"})\n⚔️ Dmg: ${dataUser.atk} (+${dataUser.weapon != null ? dataUser.weapon.ATK : "0"})\n🛡 Giáp: ${dataUser.def} (+${dataUser.weapon != null ? dataUser.weapon.DEF : "0"})\n⚡ Tốc độ: ${dataUser.spd} (+${dataUser.weapon != null ? dataUser.weapon.SPD : "0"})\n🗡️ Skill point: ${dataUser.points}\n💪🏻 Lực Chiến cơ bản: ${dataUser.hp + 4 * dataUser.atk + 3 * dataUser.def + 5 * dataUser.spd}\n🛡️ Trang bị cộng thêm: ${dataUser.weapon != null ? dataUser.weapon.HP + 4 * dataUser.weapon.ATK + 3 * dataUser.weapon.DEF + 5 * dataUser.weapon.SPD : 0}\n🦾 Thể lực: ${dataUser.the_luc}\n💀 Karma: ${dataUser.karma}\n${statusKarma}\n────────────────\n⚔️ Vũ khí: ${dataUser.weapon ? dataUser.weapon.name + " (Độ bền: " + dataUser.weapon.durability + ")" : "Không có"}\n🧺 Số vật phẩm trong túi đồ: ${dataUser.bag.length}\n💰 Số quái trong túi: ${dataUser.monster.length}/30 (` + statusBag + `)\n🏚️ Khu vực: ${dataUser.locationID ? dataUser.locationID : "Home"}\n\n`, attachment: stream }, threadID, messageID);
}

async function getRank({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    var data = get.getDataUser(senderID).history;
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    if (data.length == 0) return api.sendMessage("⚠️ Cần hạ ít nhất 1 quái để mở tính năng", threadID, messageID);
    var Small = data.filter(i => i.category == 'Small monster');
    var Medium = data.filter(i => i.category == 'Medium monster');
    var Big = data.filter(i => i.category == 'Big monster');
    var Giant = data.filter(i => i.category == 'Giant monster');
    var Elder = data.filter(i => i.category == 'Elder Dragon');
    var Dragon = data.filter(i => i.category == 'Dragon');
    var TrueDragon = data.filter(i => i.category == 'True Dragon');
    var DragonLord = data.filter(i => i.category == 'Dragon Lord');
    var TrueDragonLord = data.filter(i => i.category == 'True Dragon Lord');
    var Exotic = data.filter(i => i.category == 'Exotic');
    var stream = (await axios.get(global.configMonster.info, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `[ ------ Ranking ------ ]\n────────────────\n👤 Tên nhân vật: ${dataUser.name}\n📝 Uid: ${dataUser.id}\n✏️ Level: ${dataUser.level}\n💀 Total Kills: ${dataUser.history.length}\n🧟 Small: ${Small.length}\n🧟‍♀️ Medium: ${Medium.length}\n🧟‍♂️ Big: ${Big.length}\n🧌 Giant: ${Giant.length}\n🐉 Elder Dragon: ${Elder.length}\n🐲 Dragon: ${Dragon.length}\n🐉 True Dragon: ${TrueDragon.length}\n🐲 Dragon Lord: ${DragonLord.length}\n🐉 True Dragon Lord: ${TrueDragonLord.length}\n👾 Exotic: ${Exotic.length}\n\n`, attachment: stream }, threadID, messageID);
}

async function getWeapon({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (dataUser.weapon == null) return api.sendMessage("❎ Bạn chưa trang bị vũ khí", threadID, messageID);
    var stream = (await axios.get(dataUser.weapon.image, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `[ TRANG BỊ HIỆN TẠI ]\n────────────────\n🗡️ Vũ khí: ${dataUser.weapon ? dataUser.weapon.name : "Không có"}\n⭐ Level: ${dataUser.weapon.usage}\n❤️ HP: ${dataUser.weapon.HP}\n⚔️ ATK: ${dataUser.weapon.ATK}\n🛡️ DEF: ${dataUser.weapon.DEF}\n⚡ SPD: ${dataUser.weapon.SPD}\n📝 Thuộc Tính Đặc Thù Vũ Khí:\n+ Sát Thương tạo thành: ${dataUser.weapon.dmgBonus * 100}%\n+ Khả Năng phòng thủ: ${dataUser.weapon.defBonus * 100}%\n+ Tốc Độ tung đòn: ${dataUser.weapon.spdBonus * 100}%\n+ Xuyên Giáp: ${Math.round((1 - dataUser.weapon.ArmorPiercing) * 100)}%\n🦾 Lực chiến: ${dataUser.weapon != null ? dataUser.weapon.HP + 4 * dataUser.weapon.ATK + 3 * dataUser.weapon.DEF + 5 * dataUser.weapon.SPD : 0}\n────────────────\n${dataUser.weapon.description}`, attachment: stream }, threadID, messageID);
}

async function getStats({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    var stream = (await axios.get(global.configMonster.info, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `[ CHỈ SỐ HIỆN TẠI ]\n────────────────\n‣ Chỉ số:\n❤️ HP: ${dataUser.hp}\n⚔️ ATK: ${dataUser.atk}\n🛡️ DEF: ${dataUser.def} \n⚡ SPD: ${dataUser.spd}\n🦾 Skill point: ${dataUser.points}\n────────────────\nSkill point được sử dụng để nâng chỉ số HP, ATK, DEF, SPD\n📌 Nhập /monster + stt dưới đây\n+ up-HP: tăng chỉ số HP với 1pts = 5HP\n+ up-ATK: tăng chỉ số ATK với 1pts = 4ATK\n+ up-DEF: tăng chỉ số phòng thủ với 1pts = 4DEF\n+ up-SPD: tăng chỉ số SPD với 1pts = 2SPD`, attachment: stream }, threadID, messageID);
}

async function getServer({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const datauser = require("./data/datauser.json");
    const dataitem = require("./data/item.json");
    const datamonster = require("./data/monster.json");
    const data = require("./data/data.json");
    var stream = (await axios.get(global.configMonster.info, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `[ MONSTER STATUS ]\n────────────────\n👤 Tổng số người chơi: ${datauser.length}\n🏚️ Tổng khu vực: ${datamonster.length}\n🧌 Tổng: ${data.length} quái\n🗡️ Tổng số vũ khí: ${dataitem.length}\n⭐ Các tier (độ hiếm): I, II, III, IV, V, X, XX\n⚠️ Các mức độ nguy hiểm: 1 ~ 16`, attachment: stream }, threadID, messageID);
}

async function getItems({ api, event, type, main }) {
    const { senderID, threadID, messageID } = event;
    if (!type) return api.sendMessage("❎ Không hợp lệ", threadID, messageID);
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    const item = get.getItems();
    var greatSword = item.filter(i => i.category == 'Great Sword');
    var lance = item.filter(i => i.category == 'Lance');
    var swords = item.filter(i => i.category == 'Sword');
    var blades = item.filter(i => i.category == 'Dual Blades');
    var HBGs = item.filter(i => i.category == 'Heavy Bowgun');
    var LBGs = item.filter(i => i.category == 'Light Bowgun');
    switch (type) {
        case "1":
            var msg = "Vũ khí loại Great Sword với lượng sát thương khủng bố 200% nhưng tốc độ giảm 50%:\n\n";
            num = 0;
            greatSword.forEach(greatSword => {
                num++;
                msg += `${num}. ${greatSword.name}\n✏️ Độ bền: ${greatSword.durability}\n📝 Chỉ số:\n⚔️ ATK: ${greatSword.ATK}\n🛡️ DEF: ${greatSword.DEF}\n⚡ SPEED: ${greatSword.SPD}\n💵 Giá: ${greatSword.price}$\n\n`;
            });
            var stream = (await axios.get(global.configMonster.GreatSword, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: greatSword
                });
            }, messageID);
        case "2":
            var msg = "Các vũ khí thuộc loại Lance nổi bật với lượng DEF khủng bố, HP cao và nội tại tăng 200% DEF cho người trang bị nhưng sẽ giảm 50% tốc độ:\n\n";
            num = 0;
            lance.forEach(lance => {
                num++;
                msg += `${num}. ${lance.name}\n✏️ Độ bền: ${lance.durability}\n📝 Chỉ số:\n⚔️ ATK: ${lance.ATK}\n🛡️ DEF: ${lance.DEF}\n⚡ SPEED: ${lance.SPD}\n💵 Giá: ${lance.price}$\n────────────────\n`;
            });
            msg += "Reply (phản hồi) theo stt để mua vũ khí";
            var stream = (await axios.get(global.configMonster.Lance, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: lance
                });
            }, messageID);
        case "3":
            var msg = "Các vũ khí thuộc loại Sword'n Shield  nổi bật với sự cân bằng công thủ tốc toàn diện:\n\n";
            num = 0;
            swords.forEach(swords => {
                num++;
                msg += `${num}. ${swords.name}\n✏️ Độ bền: ${swords.durability}\n📝 Chỉ số:\n⚔️ ATK: ${swords.ATK}\n🛡️ DEF: ${lance.DEF}\n⚡ SPEED: ${swords.SPD}\n💵 Giá: ${swords.price}$\n────────────────\n`;
            });
            msg += "Reply (phản hồi) theo stt để mua vũ khí";
            var stream = (await axios.get(global.configMonster.Sword, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: swords
                });
            }, messageID);
        case "4":
            var msg = "Các vũ khí thuộc loại Dual Blades vói tốc độ khủng bố, nội tại tăng 250% tốc độ nhưng giảm thủ xuống 50%:\n\n";
            num = 0;
            blades.forEach(blades => {
                num++;
                msg += `${num}. ${blades.name}\n✏️ Độ bền: ${blades.durability}\n📝 Chỉ số:\n⚔️ ATK: ${blades.ATK}\n🛡️ DEF: ${blades.DEF}\n⚡ SPEED: ${blades.SPD}\n💵 Giá: ${blades.price}$\n────────────────\n`;
            });
            msg += "Reply (phản hồi) theo stt để mua vũ khí";
            var stream = (await axios.get(global.configMonster.Blades, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: blades
                });
            }, messageID);
        case "5":
            var msg = "Các vũ khí thuộc loại HBG tức Heavy Bowgun vói lượng sát thương khủng cùng khả năng xuyên giáp cao, nội tại tăng 350% sát thương cùng với đó từ 30-60% xuyên giáp tuỳ cấp vũ khí nhưng giảm thủ và speed xuống 50%:\n\n";
            num = 0;
            HBGs.forEach(HBGs => {
                num++;
                msg += `${num}. ${HBGs.name}\n✏️ Độ bền: ${HBGs.durability}\n📝 Chỉ số:\n⚔️ ATK: ${HBGs.ATK}\n🛡️ DEF: ${HBGs.DEF}\n⚡ SPEED: ${HBGs.SPD}\n💵 Giá: ${HBGs.price}$\n────────────────\n`;
            });
            msg += "Reply (phản hồi) theo stt để mua vũ khí";
            var stream = (await axios.get(global.configMonster.HBG, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: HBGs
                });

            }, messageID);
        case "6":
            var msg = "Các vũ khí thuộc loại LBG tức Light Bowgun có tốc độ cao và sát thương ổn định, đòn đánh có xuyên giáp 15% nhưng giáp bị giảm 40%:\n\n";
            num = 0;
            LBGs.forEach(LBGs => {
                num++;
                msg += `${num}. ${LBGs.name}\n✏️ Độ bền: ${LBGs.durability}\n📝 Chỉ số:\n⚔️ ATK: ${LBGs.ATK}\n🛡️ DEF: ${LBGs.DEF}\n⚡ SPEED: ${LBGs.SPD}\n💵 Giá: ${LBGs.price}$\n────────────────\n`;
            });
            msg += "Reply (phản hồi) theo stt để mua vũ khí";
            var stream = (await axios.get(global.configMonster.LBG, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "1",
                    data: LBGs
                });

            }, messageID);
        case "7":
            var foods = [
                {
                    type: "food",
                    name: "A Platter Mini (+5 mọi chỉ số)",
                    price: 5000,
                    heal: 100,
                    boostHP: 5,
                    boostATK: 5,
                    boostDEF: 5,
                    boostSPD: 5,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    image: "https://i.imgur.com/a4sWP0L.png"
                },
                {
                    type: "food",
                    name: "B Platter Medium (+10 mọi chỉ số)",
                    price: 12500,
                    boostHP: 10,
                    boostATK: 10,
                    boostDEF: 10,
                    boostSPD: 10,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    heal: 250,
                    image: "https://i.imgur.com/Zzjdj65.png"
                },
                {
                    type: "food",
                    name: "C Platter XL (+15 mọi chỉ số)",
                    price: 25000,
                    boostHP: 15,
                    boostATK: 15,
                    boostDEF: 15,
                    boostSPD: 15,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    heal: 500,
                    image: "https://i.imgur.com/6LTkApY.png"
                },
                {
                    type: "food",
                    name: "Trà Sữa TocoToco Full Topping (+20 mọi chỉ số)",
                    price: 50000,
                    boostHP: 20,
                    boostATK: 20,
                    boostDEF: 20,
                    boostSPD: 20,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    heal: 1000,
                    image: "https://i.imgur.com/JoyQr1y.png"
                },
                {
                    type: "food",
                    name: "Upgrade Pill+ (đột phá mọi chỉ số)",
                    price: 2000000,
                    boostHP: 2000,
                    boostATK: 1000,
                    boostDEF: 1000,
                    boostSPD: 100,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    heal: 0,
                    image: "https://i.imgur.com/C8cunxL.png"
                },
                {
                    type: "food",
                    name: "10x Upgrade Pill+ (đột phá mọi chỉ số)",
                    price: 20000000,
                    boostHP: 20000,
                    boostATK: 10000,
                    boostDEF: 10000,
                    boostSPD: 1000,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 0,
                    heal: 0,
                    image: "https://i.imgur.com/Lbe9fdO.png"
                },
                {
                    type: "food",
                    name: "Nước Thánh (-10 Karma)",
                    price: 5000,
                    boostHP: 0,
                    boostATK: 0,
                    boostDEF: 0,
                    boostSPD: 0,
                    boostEXP: 0,
                    boostKarma: -10,
                    boostPoints: 0,
                    heal: 0,
                    image: "https://i.imgur.com/xhLi9dU.png"
                },
                {
                    type: "food",
                    name: "Nước Thánh Tối Thượng (-100 Karma)",
                    price: 500000,
                    boostHP: 0,
                    boostATK: 0,
                    boostDEF: 0,
                    boostSPD: 0,
                    boostEXP: 0,
                    boostKarma: -100,
                    boostPoints: 0,
                    heal: 0,
                    image: "https://i.imgur.com/ASlZumx.png"
                },
                {
                    type: "food",
                    name: "Sức Mạnh Tri Thức (Tăng SP)",
                    price: 50000000,
                    boostHP: 0,
                    boostATK: 0,
                    boostDEF: 0,
                    boostSPD: 0,
                    boostEXP: 0,
                    boostKarma: 0,
                    boostPoints: 50000,
                    heal: 0,
                    image: "https://i.imgur.com/eTSNtJF.png"
                },
                {
                    type: "food",
                    name: "Cách để tăng độ khó cho game",
                    price: 100000,
                    boostHP: 0,
                    boostATK: 0,
                    boostDEF: 0,
                    boostSPD: 0,
                    boostEXP: 0,
                    boostKarma: 100,
                    boostPoints: 0,
                    heal: 0,
                    image: "https://i.imgur.com/jws0SLF.png"
                }
            ]
            var msg = "Thức ăn hồi thể lực và thuốc:\n";
            num = 0;
            foods.forEach(item => {
                num++;
                msg += `${num}. ${item.name}\n🦾 Hồi thể lực: ${item.heal} - ${item.price}$\n`;
            });
            msg += "⭐ Bạn có thể mua thức ăn bằng cách nhập số thứ tự thức ăn (có thể nhập nhiều số cách nhau bởi dấu phẩy hoặc tất cả -all)";
            var stream = (await axios.get(global.configMonster.food, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "7",
                    data: foods
                });
            }, messageID);
        case "8":
            if (!dataUser.monster || dataUser.monster.length == 0) return api.sendMessage("❎ Túi của bạn không có gì", threadID, messageID);
            var msg = "🦾 Chiến lợi phẩm của bạn:\n";
            var num = 0;
            dataUser.monster.forEach(monster => {
                num++;
                msg += `${num}. ${monster.Name} - ${monster.price}$\n`;
            });
            msg += "⭐ Bạn có thể bán quái vật của mình bằng cách nhập số thứ tự quái vật (có thể nhập nhiều số cách nhau bởi dấu phẩy hoặc tất cả -all)";
            var stream = (await axios.get(global.configMonster.sell, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "8",
                    data: dataUser.monster
                });
            }, messageID);
        case "9":
            var upgrades = [
                {
                    type: "upgrade",
                    name: "Mithril",
                    usage: 1,
                    price: 20000,
                    boostHPweapon: 2000,
                    boostATKweapon: 200,
                    boostDEFweapon: 200,
                    boostSPDweapon: 10,
                    image: "https://i.imgur.com/Cvg8eHC.png"
                },
                {
                    type: "upgrade",
                    name: "Orichalcum",
                    usage: 2,
                    price: 50000,
                    boostHPweapon: 4000,
                    boostATKweapon: 400,
                    boostDEFweapon: 400,
                    boostSPDweapon: 20,
                    image: "https://i.imgur.com/Sz0A2hp.png"
                },
                {
                    type: "upgrade",
                    name: "Adamantium",
                    usage: 4,
                    price: 120000,
                    boostHPweapon: 8000,
                    boostATKweapon: 800,
                    boostDEFweapon: 800,
                    boostSPDweapon: 40,
                    image: "https://i.imgur.com/SnObhnz.png"
                },
                {
                    type: "upgrade",
                    name: "Scarite",
                    usage: 8,
                    price: 260000,
                    boostHPweapon: 16000,
                    boostATKweapon: 1600,
                    boostDEFweapon: 1600,
                    boostSPDweapon: 80,
                    image: "https://i.imgur.com/iIMwZEy.jpg"
                },
                {
                    type: "upgrade",
                    name: "Dragonite",
                    usage: 16,
                    price: 420000,
                    boostHPweapon: 32000,
                    boostATKweapon: 3200,
                    boostDEFweapon: 3200,
                    boostSPDweapon: 160,
                    image: "https://i.imgur.com/mKzBHAK.jpg"
                },
                {
                    type: "upgrade",
                    name: "Lunarite",
                    usage: 32,
                    price: 840000,
                    boostHPweapon: 64000,
                    boostATKweapon: 6400,
                    boostDEFweapon: 6400,
                    boostSPDweapon: 320,
                    image: "https://i.imgur.com/40qcjeG.jpg",
                },
                {
                    type: "upgrade",
                    name: "Kriztonite",
                    usage: 64,
                    price: 1580000,
                    boostHPweapon: 128000,
                    boostATKweapon: 12800,
                    boostDEFweapon: 12800,
                    boostSPDweapon: 640,
                    image: "https://i.imgur.com/awGbMAP.jpg"
                },
                {
                    type: "upgrade",
                    name: "Damascusium Crytalite",
                    usage: 128,
                    price: 4560000,
                    boostHPweapon: 256000,
                    boostATKweapon: 25600,
                    boostDEFweapon: 25600,
                    boostSPDweapon: 1280,
                    image: "https://i.imgur.com/a0T8AZf.jpg"
                }
            ]
            var msg = "Upgrade Materials:\n";
            num = 0;
            upgrades.forEach(item => {
                num++;
                msg += `${num}. ${item.name}\n⬆️ Cộng chỉ số vũ khí: +${item.usage} - ${item.price}$\n`;
            });
            msg += "⭐ Bạn có thể mua bằng cách nhập số thứ tự vật phẩm nâng cấp, vô bag để sử dụng nâng cấp vũ khí đang trang bị";
            var stream = (await axios.get(global.configMonster.weapon, {
                responseType: 'stream', headers: {
                    'authority': 'i.imgur.com',
                    'method': 'GET',
                    'scheme': 'https',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                    'cache-control': 'max-age=0',
                    'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                    'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                    'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                    'priority': 'u=0, i',
                    'referer': 'https://imgur.com/',
                    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                }
            })).data;
            return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
                main.onReply.set(info.messageID, {
                    commandName: 'monster',
                    messageID: info.messageID,
                    author: senderID,
                    type: "buyItem",
                    id: "9",
                    data: upgrades
                });
            }, messageID);
        default:
            return api.sendMessage("⚠️ Không hợp lệ", threadID, messageID);

    }
}

async function buyItem({ api, event, idItem, userData, Reply }) {
    var { senderID, threadID, messageID } = event;
    var dataGlobal = require("./data/datauser.json");
    var dataUser = dataGlobal.find(item => item.id == senderID);
    var fs = require("fs-extra");
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    if (!idItem) return api.sendMessage("❎ Bạn chưa nhập ID vật phẩm", threadID, messageID);
    var money = (await userData.get(senderID)).money;
    try {
        switch (Reply.id) {
            case "1":
                if (money < Reply.data[idItem - 1].price) return api.sendMessage("❎ Bạn không đủ tiền, hãy chăm chỉ làm việc nhé", threadID, messageID);
                await userData.delMoney(event.senderID, BigInt(parseInt(Reply.data[idItem - 1].price)));
                const item = set.buyItem(senderID, Reply.data[idItem - 1]);
                if (item == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
                if (item == 403) return api.sendMessage("❎ Bạn đã sở hữu vật phẩm này từ trước", threadID, messageID);
                api.unsendMessage(Reply.messageID);
                var stream = (await axios.get(Reply.data[idItem - 1].image, {
                    responseType: 'stream', headers: {
                        'authority': 'i.imgur.com',
                        'method': 'GET',
                        'scheme': 'https',
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-encoding': 'gzip, deflate, br, zstd',
                        'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                        'cache-control': 'max-age=0',
                        'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                        'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                        'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                        'priority': 'u=0, i',
                        'referer': 'https://imgur.com/',
                        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'document',
                        'sec-fetch-mode': 'navigate',
                        'sec-fetch-site': 'same-site',
                        'sec-fetch-user': '?1',
                        'upgrade-insecure-requests': '1',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                    }
                })).data;
                return api.sendMessage({ body: `✅ Bạn đã mua thành công ${Reply.data[idItem - 1].name}\n - Thuộc Tính:\n⚔️ ATK Bonus: x${Reply.data[idItem - 1].dmgBonus}\n🛡️ DEF Bonus: x${Reply.data[idItem - 1].defBonus}\n⚡ SPD Bonus: x${Reply.data[idItem - 1].spdBonus}\n• Giá ${Reply.data[idItem - 1].price}$`, attachment: stream }, threadID, messageID);
            case "7":
                if (Reply.data[idItem - 1] == undefined) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
                if (money < Reply.data[idItem - 1].price) return api.sendMessage("❎ Bạn không đủ tiền, hãy làm việc chăm chỉ nhé", threadID, messageID);
                await userData.delMoney(event.senderID, BigInt(parseInt(Reply.data[idItem - 1].price)));
                const food = set.buyItem(senderID, Reply.data[idItem - 1]);
                if (food == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
                api.unsendMessage(Reply.messageID);
                var stream = (await axios.get(Reply.data[idItem - 1].image, {
                    responseType: 'stream', headers: {
                        'authority': 'i.imgur.com',
                        'method': 'GET',
                        'scheme': 'https',
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-encoding': 'gzip, deflate, br, zstd',
                        'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                        'cache-control': 'max-age=0',
                        'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                        'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                        'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                        'priority': 'u=0, i',
                        'referer': 'https://imgur.com/',
                        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'document',
                        'sec-fetch-mode': 'navigate',
                        'sec-fetch-site': 'same-site',
                        'sec-fetch-user': '?1',
                        'upgrade-insecure-requests': '1',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                    }
                })).data;
                return api.sendMessage({ body: `✅ Bạn đã mua thành công ${Reply.data[idItem - 1].name} với giá ${Reply.data[idItem - 1].price}$`, attachment: stream }, threadID, messageID);
            case "9":
                if (Reply.data[idItem - 1] == undefined) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
                if (dataUser.weapon.usage >= 256) return api.sendMessage("❎ Vũ Khí đã đạt cấp tối đa", threadID, messageID);
                if (money < Reply.data[idItem - 1].price) return api.sendMessage("❎ Bạn không đủ tiền, hãy làm việc chăm chỉ nhé", threadID, messageID);
                await userData.delMoney(event.senderID, BigInt(parseInt(Reply.data[idItem - 1].price)));
                const upgrade = set.buyItem(senderID, Reply.data[idItem - 1]);
                if (upgrade == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
                api.unsendMessage(Reply.messageID);
                var stream = (await axios.get(Reply.data[idItem - 1].image, {
                    responseType: 'stream', headers: {
                        'authority': 'i.imgur.com',
                        'method': 'GET',
                        'scheme': 'https',
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-encoding': 'gzip, deflate, br, zstd',
                        'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                        'cache-control': 'max-age=0',
                        'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
                        'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
                        'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
                        'priority': 'u=0, i',
                        'referer': 'https://imgur.com/',
                        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'document',
                        'sec-fetch-mode': 'navigate',
                        'sec-fetch-site': 'same-site',
                        'sec-fetch-user': '?1',
                        'upgrade-insecure-requests': '1',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
                    }
                })).data;
                return api.sendMessage({ body: `✅ Bạn đã mua thành công ${Reply.data[idItem - 1].name} với giá ${Reply.data[idItem - 1].price}$`, attachment: stream }, threadID, messageID);
            case "8":
                var list = event.body.split(" ");
                var num = 0;
                var moneySell = 0;
                if (list[0] == "-all") {
                    dataUser.monster.forEach(monster => {
                        num++;
                        moneySell += monster.price;
                    });
                    dataUser.monster = [];
                    fs.writeFileSync(__dirname + "/data/datauser.json", JSON.stringify(dataGlobal, null, 4));
                }
                else {
                    list.forEach(id => {
                        if (dataUser.monster[id - 1] == undefined) {
                            api.sendMessage("⚠️ Không tìm thấy quái tại số " + id, threadID, messageID);
                        }
                        else {
                            num++;
                            moneySell += dataUser.monster[id - 1].price;
                            dataUser.monster.splice(id - 1, 1);
                        }
                    });
                    fs.writeFileSync(__dirname + "/data/datauser.json", JSON.stringify(dataGlobal, null, 4));
                }
                api.unsendMessage(Reply.messageID);
                userData.addMoney(event.senderID, BigInt(parseInt(moneySell)));
                return api.sendMessage(`✅ Bạn đã bán thành công ${num} quái vật và nhận được ${moneySell} đô`, threadID, messageID);
            default:
                return api.sendMessage("⚠️ Không hợp lệ", threadID, messageID);
        }
    }
    catch (e) {
        return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
    }
}

async function setItem({ api, event, Reply }) {
    var weapon = Reply.data[event.body - 1];
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!weapon) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", threadID, messageID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    if (!event.body) return api.sendMessage("❎ Bạn chưa nhập ID vật phẩm", threadID, messageID);
    set.setItem(senderID, weapon);
    api.unsendMessage(Reply.messageID);
    var stream = (await axios.get(weapon.type == "weapon" ? global.configMonster.setWeapon : global.configMonster.eatGif, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: `✅ Đã ${weapon.type == "weapon" ? "đặt" : "sử dụng"} vật phẩm`, attachment: stream }, threadID, messageID);
}

async function myItem({ api, event, main }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    var msg = "📌 Các vật phẩm của bạn:\n";
    var num = 0;
    var weapon = dataUser.bag.filter(item => item.type == "weapon");
    var food = dataUser.bag.filter(item => item.type == "food");
    var upgrade = dataUser.bag.filter(item => item.type == "upgrade");
    var user = get.getDataUser(senderID);
    msg += "🗡️ Vũ khí:\n";
    if (weapon.length == 0) msg += "❎ Không có vũ khí\n\n";
    else {
        weapon.forEach(item => {
            num++;
            msg += `${num}. Tên: ${item.name} (Giá: ${item.price})\n\n`;
        });
    }
    msg += "🍗 Thực phẩm:\n";
    if (food.length == 0) msg += "❎ Không có thức ăn\n\n";
    else {
        food.forEach(item => {
            num++;
            msg += `${num}. Tên: ${item.name} - ${item.price}$\n`;
        });
    }
    msg += "⬆️ Nâng Cấp:\n";
    if (upgrade.length == 0) msg += "❎ Không có nâng cấp\n\n";
    if (user.weapon == null) msg += "⚠️ Trang bị vũ khí để sử dụng\n\n";
    else {
        upgrade.forEach(item => {
            num++;
            msg += `${num}. Tên: ${item.name} - ${item.price}$\n`;
        });
    }
    msg += "⭐ Bạn có thể trang bị vũ khí hoặc dùng thức ăn bằng cách nhập số thứ tự của vật phẩm\n────────────────\n📌 Vũ khí mới sẽ thay thế vũ khí cũ và vũ khí cũ sẽ bị mất";
    var stream = (await axios.get(global.configMonster.bag, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    })).data;
    return api.sendMessage({ body: msg, attachment: stream }, threadID, (err, info) => {
        main.onReply.set(info.messageID, {
            commandName: 'monster',
            messageID: info.messageID,
            author: senderID,
            type: "setItem",
            data: weapon.concat(food, upgrade)
        });
    }, messageID);
}


async function increaseDurability({ api, event, userData, Reply }) {
    try {
        if (event.body == NaN) return api.sendMessage("❎ Vui lòng nhập một chữ số", event.threadID, event.messageID);
        if (isNaN(event.body)) return api.sendMessage("❎ Vui lòng nhập 1 con số", event.threadID, event.messageID);
        const money = (await Currencies.getData(event.senderID)).money;
        if (money < event.body) return api.sendMessage("❎ Bạn không đủ tiền, hãy làm việc chăm chỉ nhé", threadID, messageID);
        const item = set.increaseDurability(event.senderID, event.body);
        await userData.delMoney(event.senderID, BigInt(parseInt(event.body)));
        if (item == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", event.threadID, event.messageID);
        api.unsendMessage(Reply.messageID);
        return api.sendMessage(`✅ Đã gia tăng độ bền thành công, độ bền hiện tại của vật phẩm là ${item}`, event.threadID, event.messageID);
    }
    catch (e) {
        console.log(e);
    }
}

async function increaseHp({ api, event, Reply }) {
    try {
        const dataUser = get.getDataUser(event.senderID);
        if (event.body == NaN) return api.sendMessage("❎ Vui lòng nhập một chữ số", event.threadID, event.messageID);
        if (isNaN(event.body)) return api.sendMessage("❎ Vui lòng nhập 1 con số", event.threadID, event.messageID);
        if (dataUser.points < event.body) return api.sendMessage("❎ Bạn không đủ điểm, hãy chăm chỉ cày cuốc nhé", threadID, messageID);
        const item = set.increaseHP(event.senderID, event.body * 5);
        set.decreasePoints(event.senderID, event.body);
        if (item == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", event.threadID, event.messageID);
        api.unsendMessage(Reply.messageID);
        return api.sendMessage(`✅ Đã gia tăng ${event.body * 5} điểm vào HP, tổng HP là ${item}`, event.threadID, event.messageID);
    }
    catch (e) {
        console.log(e);
    }
}

async function increaseDef({ api, event, Reply }) {
    try {
        const dataUser = get.getDataUser(event.senderID);
        if (event.body == NaN) return api.sendMessage("❎ Vui lòng nhập một chữ số", event.threadID, event.messageID);
        if (isNaN(event.body)) return api.sendMessage("❎ Vui lòng nhập 1 con số", event.threadID, event.messageID);
        if (dataUser.points < event.body) return api.sendMessage("❎ Bạn không đủ điểm, hãy chăm chỉ cày cuốc nhé", threadID, messageID);
        const item = set.increaseDEF(event.senderID, event.body * 2);
        set.decreasePoints(event.senderID, event.body);
        if (item == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", event.threadID, event.messageID);
        api.unsendMessage(Reply.messageID);
        return api.sendMessage(`✅ Đã gia tăng ${event.body * 2} điểm vào DEF, tổng DEF là ${item}`, event.threadID, event.messageID);
    }
    catch (e) {
        console.log(e);
    }
}

async function increaseAtk({ api, event, Reply }) {
    try {
        const dataUser = get.getDataUser(event.senderID);
        if (event.body == NaN) return api.sendMessage("❎ Vui lòng nhập một chữ số", event.threadID, event.messageID);
        if (isNaN(event.body)) return api.sendMessage("❎ Vui lòng nhập 1 con số", event.threadID, event.messageID);
        if (dataUser.points < event.body) return api.sendMessage("❎ Bạn không đủ điểm, hãy chăm chỉ cày cuốc nhé", threadID, messageID);
        const item = set.increaseATK(event.senderID, event.body * 2);
        set.decreasePoints(event.senderID, event.body);
        if (item == 404) return api.sendMessage("❎ Không tìm thấy vật phẩm", event.threadID, event.messageID);
        api.unsendMessage(Reply.messageID);
        return api.sendMessage(`✅ Đã gia tăng ${event.body * 2} điểm vào ATK, tổng ATK là ${item}`, event.threadID, event.messageID);
    }
    catch (e) {
        console.log(e);
    }
}

async function increaseSpd({ api, event, Reply }) {
    try {
        const dataUser = get.getDataUser(event.senderID);
        if (event.body == NaN) return api.sendMessage("❎ Vui lòng nhập một chữ số", event.threadID, event.messageID);
        if (isNaN(event.body)) return api.sendMessage("❎ Vui lòng nhập 1 con số", event.threadID, event.messageID);
        if (dataUser.points < event.body) return api.sendMessage("❎ Bạn không đủ điểm, hãy chăm chỉ cày cuốc nhé", threadID, messageID);
        const item = set.increaseSPD(event.senderID, event.body);
        set.decreasePoints(event.senderID, event.body);
        if (item == 404) return api.sendMessage("⚠️ Không tìm thấy vật phẩm", event.threadID, event.messageID);
        api.unsendMessage(Reply.messageID);
        return api.sendMessage(`✅ Đã gia tăng ${event.body} điểm vào SPD, tổng SPD là ${item}`, event.threadID, event.messageID);
    }
    catch (e) {
        console.log(e);
    }
}

async function match({ api, event }) {
    const { senderID, threadID, messageID } = event;
    const locate = require("./data/monster.json");
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    if (dataUser.locationID == null) return api.sendMessage("❎ Bạn chưa đến khu vực nào", threadID, messageID);
    const monster = get.getMonster(dataUser.locationID);
    const minLevel = get.getMinLevel(dataUser.locationID);
    const maxLevel = get.getMaxLevel(dataUser.locationID);
    const locationLevel = get.getLocationLevel(dataUser.locationID);
    if (!monster || monster.length == 0) return api.sendMessage("❎ Không tìm thấy khu vực này hoặc không có quái vật nào ở khu vực này", threadID, messageID);
    if (dataUser.weapon == null) return api.sendMessage("❎ Bạn chưa lên đồ, bộ bạn định đánh bằng tay không à?", threadID, messageID);
    if (dataUser.weapon.durability <= 0) return api.sendMessage("⚠️ Vũ khí của bạn đã bị hỏng, sửa đi rồi phang nhau tiếp nhé", threadID, messageID);
    if (dataUser.level < locationLevel) return api.sendMessage('❎ Bạn chưa đạt đủ level, hãy cày thêm\nLevel khu vực: ' + locationLevel, threadID, messageID);
    if (dataUser.the_luc < 50) return api.sendMessage("⚠️ Thể lực của bạn không đủ để đánh quái vật, vui lòng ghé cửa hàng để mua thức ăn!", threadID, messageID);
    if (dataUser.monster.length > 30) return api.sendMessage("⚠️ Bạn đã đầy túi, hãy bán bớt đồ trong túi", threadID, messageID);
    const random = Math.floor(Math.random() * 1000);
    var tier = 0;
    if (random < 340) tier = "I";
    else if (random < 540) tier = "II";
    else if (random < 690) tier = "III";
    else if (random < 790) tier = "IV";
    else if (random < 840) tier = "V";
    else if (random < 860) tier = "X";
    else if (random < 861) tier = "XX";
    else return api.sendMessage("Bạn không gặp quái vật", threadID, messageID);
    const monsterTier = monster.filter((item) => item.Tier == tier);
    if (monsterTier.length == 0) return api.sendMessage('Bạn không gặp quái vật', threadID, messageID);
    const monsterRandom = monsterTier[Math.floor(Math.random() * monsterTier.length)];
    var karma = 0
    if (dataUser.karma >= 10) karma = 10;
    if (dataUser.karma >= 20) karma = 20;
    if (dataUser.karma >= 30) karma = 30;
    if (dataUser.karma >= 40) karma = 40;
    if (dataUser.karma >= 50) karma = 50;
    if (dataUser.karma >= 60) karma = 60;
    if (dataUser.karma >= 70) karma = 70;
    if (dataUser.karma >= 80) karma = 80;
    if (dataUser.karma >= 90) karma = 90;
    if (dataUser.karma >= 100) karma = 100;
    var level = Math.floor(Math.random() * maxLevel + minLevel) + karma;
    var threat = "";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 1) threat = "1💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 4400) threat = "2💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 8300) threat = "3💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 28800) threat = "4💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 80000) threat = "5💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 140000) threat = "6💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 275000) threat = "7💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 400000) threat = "8💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 590000) threat = "9💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 800000) threat = "10💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 1000000) threat = "11💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 1200000) threat = "12💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 1500000) threat = "13💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 2000000) threat = "14💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 2600000) threat = "15💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 3920000) threat = "16💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 4300000) threat = "17💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 4900000) threat = "18💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 5600000) threat = "19💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 6000000) threat = "20💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 7000000) threat = "21💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 9000000) threat = "23💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 11000000) threat = "24💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 12500000) threat = "25💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 25000000) threat = "26💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 50000000) threat = "27💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 60000000) threat = "28💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 70000000) threat = "29💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 85000000) threat = "30💀";
    if (monsterRandom.HP + 4 * monsterRandom.ATK + 3 * monsterRandom.DEF + 5 * monsterRandom.SPD > 90000000) threat = "30+💀";

    const exp = Math.round(monsterRandom.exp + (monsterRandom.exp * 0.15) * (level - 1))
    var monsterHp = monsterRandom.HP + (monsterRandom.HP * 0.2) * (level - 1)
    const monsterHP = Math.round(monsterHp)
    var monsterAtk = monsterRandom.ATK + (monsterRandom.ATK * 0.2) * (level - 1)
    const monsterATK = Math.round(monsterAtk)
    var monsterDef = monsterRandom.DEF + (monsterRandom.DEF * 0.2) * (level - 1)
    const monsterDEF = Math.round(monsterDef)
    var monsterSpd = monsterRandom.SPD + (monsterRandom.SPD * 0.2) * (level - 1)
    const monsterSPD = Math.round(monsterSpd)
    var path = __dirname + "/" + senderID + ".png";
    var image = await get.getImgMonster(monsterRandom, path);
    var fs = require('fs-extra');
    var msgStatus = `[ ENEMY SPOTTED ]\n────────────────\nBạn đã gặp quái vật ${monsterRandom.Name} có chỉ số:\n✏️ Level: ${level}\n❤️ HP: ${monsterHP}\n⚔️ ATK: ${monsterATK}\n🛡️ DEF: ${monsterDEF}\n⚡ SPEED: ${monsterSPD}\n🧟 Chủng: ${monsterRandom.category}\n⚠️ Độ nguy hiểm: ` + threat + `\n👊 Lực Chiến: ${monsterHP + 4 * monsterATK + 3 * monsterDEF + 5 * monsterSPD}\n────────────────\n⭐ Nội tại:\n⚔️ Tăng ATK: ${monsterRandom.ATKbonus * 100}%\n🛡️ Tăng DEF: ${monsterRandom.DEFbonus * 100}%\n⚡ Tăng SPD: ${monsterRandom.SPDbonus * 100}%\n🏹 Xuyên Giáp: ${(1 - monsterRandom.ArmorPiercing) * 100}%`
    var msg = {
        body: msgStatus,
        attachment: image
    }
    await api.sendMessage(msg, threadID);
    fs.unlinkSync(path);
    await new Promise(resolve => setTimeout(resolve, 3000));
    await api.sendMessage("🔄 Đang đấm nhau...", threadID);
    try {
        var fight = require('./fight.js');
        var result = fight.fight({
            HP: ((dataUser.hp + dataUser.weapon.HP) * dataUser.weapon.hpBonus),
            ATK: ((dataUser.atk + dataUser.weapon.ATK) * dataUser.weapon.dmgBonus),
            DEF: ((dataUser.def + dataUser.weapon.DEF) * dataUser.weapon.defBonus),
            SPD: ((dataUser.spd + dataUser.weapon.SPD) * dataUser.weapon.spdBonus),
            AP: Math.round(dataUser.weapon.ArmorPiercing),
            Mana: 1
        }, {
            HP: (monsterHP),
            ATK: (monsterATK * monsterRandom.ATKbonus),
            DEF: (monsterDEF * monsterRandom.DEFbonus),
            SPD: (monsterSPD * monsterRandom.SPDbonus),
            AP: Math.round(monsterRandom.ArmorPiercing),
            Mana: 1
        });
        var dur = set.decreaseDurability(senderID);
        set.karmaUp(senderID);
        var powPlayer = result.playerPow;
        set.decreaseHealthWeapon(senderID, powPlayer.HP);
        var dame = 0,
            def = 0,
            dameMonster = 0,
            defMonster = 0,
            countTurn = result.log.length
        result.log.map(i => {
            if (i.attacker == "player") {
                dame += i.damage;
                defMonster += i.defenderDef;
            }
            else {
                dameMonster += i.damage;
                def += i.defenderDef;
            }
        })
        var msg = `⭐ Bạn và nó đấm nhau trong ${countTurn} hiệp\n👤 Bạn:\n⚔️ Tổng sát thương: ${dame}\n🛡️ Chống chịu: ${def}\n🧌 Quái vật:\n⚔️ Tổng sát thương: ${dameMonster}\n🛡️ Chống chịu: ${defMonster}`;
        if (dur == 0) await api.sendMessage("⚠️ Vũ khí của bạn đã bị hỏng, sửa đi để còn phang nhau...", threadID);
        if (dataUser.weapon == null) await api.sendMessage("⚠️ Vũ khí của bạn đã bị hỏng nặng, chúng tôi hết cứu", threadID);
        if (dataUser.the_luc < 150) await api.sendMessage("⚠️ Thể lực gần cạn, chú ý bổ sung thể lực", threadID);
        var status = "";
        if (result.log.length == 1) status = "NHỜN! một vụt là oẳng\n\n";
        if (result.log.length >= 2) status = "Quá EZ!!!\n\n";
        if (result.log.length > 10) status = "Quá ghê gớm, bạn và con quái giao cấu mãnh liệt\n\n";
        if (result.log.length > 20) status = "Bạn và con quái giao cấu tanh bành cả một khu!!!\n\n";
        if (result.log.length > 30) status = "Dã man tàn bạo vô nhân đạo, bạn và quái giao cấu banh cả map!!!\n\n";
        if (result.winner == true) {
            var sendMsg = status + `⭐ Bạn đã hạ được ${monsterRandom.Name} (Tier: ${tier})\nBạn nhận được ${exp}EXP`;
            set.addMonster(senderID, monsterRandom);
            set.addHistory(senderID, monsterRandom);
            await api.sendMessage(sendMsg, threadID);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await api.sendMessage("📝 Thống kê trận đấu\n────────────────\n" + msg, threadID);
            set.setExp(senderID, exp, api, threadID);
        }
        else {
            await api.sendMessage(status + "💔 Bạn đã thua trận đấu", threadID);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await api.sendMessage("📝 Thống kê trận đấu★\n\n" + msg, threadID);
            return;
        }
    }
    catch (e) {
        return api.sendMessage("⚠️ Đã có lỗi xảy ra liên hệ Admin để fix", threadID, messageID);
    }

}

async function listLocation({ api, event, main }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    var listLocation = require("./data/monster.json")
    var msg = "[ MONSTER MAP ]\n────────────────\n🏚️ Các khu vực:\n";
    listLocation.forEach(location => {
        msg += `${location.ID + 1}. ${location.location} - Level: ${location.level}\n────────────────\n `;
    });
    var stream = await axios.get(global.configMonster.location, {
        responseType: 'stream', headers: {
            'authority': 'i.imgur.com',
            'method': 'GET',
            'scheme': 'https',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1',
            'if-modified-since': 'Tue, 19 Apr 2022 15:39:42 GMT',
            'if-none-match': '"55ecbc13e75e5768cdb74c907882baee"',
            'priority': 'u=0, i',
            'referer': 'https://imgur.com/',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-site',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
    });
    return api.sendMessage({ body: msg, attachment: stream.data }, threadID, (err, info) => {
        main.onReply.set(info.messageID, {
            commandName: 'monster',
            messageID: info.messageID,
            author: senderID,
            type: "setLocationID"
        });
    }, messageID);
}

function setLocationID({ api, event, Reply }) {
    const { senderID, threadID, messageID } = event;
    const dataUser = get.getDataUser(senderID);
    if (!dataUser) return api.sendMessage("❎ Bạn chưa có nhân vật", threadID, messageID);
    const locationID = Number(event.body) - 1;
    const location = require("./data/monster.json")[locationID];
    if (!location) return api.sendMessage("⚠️ Không tìm thấy khu vực", threadID, messageID);
    set.setLocation(senderID, String(locationID));
    api.unsendMessage(Reply.messageID);
    return api.sendMessage(`✅ Đã đến khu vực ${location.location}`, threadID, messageID);
}

function pvp(o, id, expressio, main) {
    let tid = o.event.threadID;
    let send = (msg, cb) => o.api.sendMessage(msg, tid, cb, o.event.messageID);
    let data_user = get.getDataUser(id);
    let pvp_room = pvp_rooms[tid];

    if (!pvp_room) pvp_room = pvp_rooms[tid] = [];
    if (!data_user) return send(("❎ Bạn chưa có nhân vật"));
    if (!data_user.weapon) return send("❎ Bạn chưa lên đồ, bộ bạn định đánh bằng tay không à?");

    let room = pvp_room.find($ => $.players.includes(id));

    switch (expression) {
        case 'list rooms':
            send(`${pvp_room.length == 0 ? '⚠️ không có phòng do chưa có người chơi nào tạo' : pvp_room.map(function ($, i, o, [p_1, p_2] = $.players.map($ => get.getDataUser($))) { return `${i + 1}. ${$.title}\n👤 Player 1: ${p_1.name} (${math.power.sum(p_1)} LC)\n👤 Player 2: ${!p_2 ? 'null' : `${p_2.name} (${math.power.sum(p_2)} LC)`}\n📝 Status: ${global.configMonster.status_room[$.status]}\n────────────────` }).join('\n')}\n\nReply (phản hồi) join + stt để vào phòng pvp`, (err, res) => (res.name = 'monster', res.type = 'pvp.rooms', main.onReply.set(res.messageID, res)));
            break;
        case 'info room': {
            if (!room) return send('❎ Bạn chưa tạo or tham gia phòng pvp nào cả');

            let [p_1, p_2] = room.players.map($ => get.getDataUser($));

            send(`[ Phòng PVP Số ${room.stt} - ${room.title}]\n────────────────\n👤 Player 1: ${p_1.name}\n⚔️ Chiến lực: ${math.power.sum(p_1)}\n👤 Player 2: ${!p_2 ? 'null' : `${p_2.name}\n⚔️ Chiến lực:${math.power.sum(p_2)}`}\n📝 Status: ${global.configMonster.status_room[room.status]}\n\nThả cảm xúc '👍' để ${id == p_1.id ? 'bắt đầu' : 'sẵn sàng'} hoặc '👎' để rời phòng\nReply (phản hồi) 'start' để bắt đầu, 'ready' để sẵn sàng, 'leave' để rời phòng, 'join' để vào phòng`, (err, res) => (res.name = 'monster', res.type = 'pvp.room.info', res.stt = room.stt, main.oneReaction.set(res.messageID, res), main.onReply.set(res.messageID, res)));
        } break;
        case 'create room': {
            if (!!room) return send('❎ Bạn đã tạo or tham gia phòng pvp rồi');

            pvp_room.push({
                stt: pvp_room.length + 1,
                title: o.event.args.slice(1).join(' '),
                players: [id],
                status: 1,
            });
            send(`✅ Đã tạo phòng pvp, phòng của bạn là số ${pvp_room.length}`, () => pvp(o, id, 'info room'));
        } break;
        default:
            break;
    }
}

pvp.room = async (o, id = o.event.senderID, expression = (o.event.args || [])[0], stt = (o.event.args || [])[1]) => {
    let tid = o.event.threadID;
    let send = (msg, cb) => new Promise(r => o.api.sendMessage(msg, tid, cb || r, o.event.messageID));
    let data_user = get.getDataUser(id);
    let pvp_room = pvp_rooms[tid];

    if (id == o.api.getCurrentUserID()) return;
    if (!data_user) return send(("❎ Bạn chưa có nhân vật"));
    if (!data_user.weapon) return send("❎ Bạn chưa lên đồ, bộ bạn định đánh bằng tay không à?");

    switch (expression) {
        case 'join': {
            let room = pvp_room[stt - 1] || pvp_room[o.Reply.stt - 1];

            if (!room) return send('⚠️ Phòng không tồn tại');
            if (room.players.includes(id)) return send('❎ Bạn đã trong phòng pvp rồi');
            if (/^(2|3)$/.test(room.status)) return send(global.configMonster.status_room[room.status]);

            room.players.push(id),
                room.status = 2,
                room.ready = false,
                pvp(o, id, 'info room');
        } break;
        case 'start':
        case 'ready':
        case 'leave': {
            let room = pvp_room.find($ => $.players.includes(id));

            if (!room) return send('❎ Bạn chưa tạo or tham gia phòng pvp nào cả');
            if (room.status == 3) return send('⚠️ Trận pvp đang diễn ra không thể thực hiện các thao tác này!')
            if (expression == 'start' && id != room.players[0]) return send('❎ Bạn không phải chủ phòng để có thể bắt đầu trận pvp');
            
            if (expression == 'leave') return (id == room.players[0] ? (pvp_room.splice(room.stt - 1, 1), send('✅ Đã rời phòng pvp, vì bạn là chủ phòng nên phòng sẽ bị huỷ')) : (room.ready = false, room.status == 1, room.players.length == 1 ? pvp_room.splice(room.stt - 1, 1) : room.players.splice(room.players.findIndex($ => $ == id), 1), send('✅ Đã rời phòng pvp')));
            if (id == room.players[1]) {
                room.ready = !room.ready ? true : false;
                send(`đã ${room.ready ? '' : 'huỷ'} sẵn sàng`);
            } else if (id == room.players[0]) {
                if (room.status == 1) return send(global.configMonster.status_room[room.status]);
                if (!room.ready) return send('⚠️ Đối thủ chưa sẵn sàng');

                room.status = 3,
                    await send('🔄 PVP đang diễn ra...');

                let players = room.players.map($ => get.getDataUser($));
                let result = require('./pvp.js')(players);
                let dmg = {
                    player1: 0,
                    player2: 0,
                };
                let def = {
                    player1: 0,
                    player2: 0,
                };

                result.log.map($ => (dmg[$.attacker] += $.damage, def[$.attacker] += $.defenderDef));
                send(`[ Kết Quả Trận PVP - ${players[0].name} VS ${players[1].name} ]\n\n⭐ Winner: ${result.winner == 'player1' ? players[0].name : players[1].name}\n📝 Số Hiệp: ${result.log.length}\n👤 Player 1 - ${players[0].name}:\n⚔️ Tổng Sát Thương Gây Ra: ${dmg.player1}\n🛡️ Chống Chịu: ${def.player2}\n\n👤 Player 2 - ${players[1].name}:\n⚔️ Tổng Sát Thương Gây Ra: ${dmg.player2}\n🛡️ Chống Chịu: ${def.player1}`, (err, res) => (room.status = 2, room.ready = false));
            };
        } break;
        default:
            break;
    }
}

module.exports = {
    createCharecter,
    getCharacter,
    getItems,
    getServer,
    buyItem,
    setItem,
    myItem,
    increaseDurability,
    match,
    listLocation,
    setLocationID,
    getWeapon,
    increaseHp,
    increaseDef,
    increaseAtk,
    increaseSpd,
    getStats,
    getRank,
    pvp,
    pvp_rooms

}