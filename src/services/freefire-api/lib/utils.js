const fs = require('fs');
const path = require('path');

let itemsDb = null;

function loadItems() {
    if (itemsDb) return itemsDb;
    try {
        const data = fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8');
        const itemsList = JSON.parse(data);
        itemsDb = {};
        itemsList.forEach(item => {
            const id = item.id || item.itemID;
            if (id) itemsDb[String(id)] = item;
        });
        console.log(`Loaded ${Object.keys(itemsDb).length} items into database.`);
    } catch (e) {
        console.error("Failed to load items database:", e);
        itemsDb = {};
    }
    return itemsDb;
}

// Initialize immediately
loadItems();

function getItemDetails(itemId) {
    const itemStrId = String(itemId);

    const currentItem = {
        id: itemId,
        name: "Unknown Item",
        type: "UNKNOWN",
        rarity: "NONE",
        description: "",
        is_unique: false,
        image: `https://raw.githubusercontent.com/ashqking/FF-Items/main/ICONS/${itemId}.png`,
        image_fallback: `https://raw.githubusercontent.com/I-SHOW-AKIRU200/AKIRU-ICONS/main/ICONS/${itemId}.png`
    };

    if (itemsDb && itemsDb[itemStrId]) {
        const itemData = itemsDb[itemStrId];
        currentItem.name = itemData.name || itemData.description || "Unknown Name";
        currentItem.type = itemData.type || "UNKNOWN";
        currentItem.collection_type = itemData.collection_type || "NONE";
        currentItem.rarity = itemData.rare || "NONE";
        currentItem.description = itemData.description || "";
        currentItem.is_unique = itemData.is_unique || false;
        currentItem.icon_code = itemData.icon || "";
    }

    return currentItem;
}

function processPlayerItems(playerData) {
    const profileInfo = playerData.profileinfo || {};
    const basicInfo = playerData.basicinfo || {};
    const petInfo = playerData.petinfo || {};

    // Clothes
    const outfitIds = profileInfo.clothes || [];
    const outfitDetails = outfitIds.map(getItemDetails);

    // Weapons (shown skins)
    const weaponIds = basicInfo.weaponskinshows || [];
    const weaponDetails = weaponIds.map(getItemDetails);

    // Skills
    const skillIds = profileInfo.equipedskills || [];
    const skillDetails = skillIds.map(getItemDetails);

    // Pet
    let petDetails = null;
    if (petInfo && (petInfo.id || petInfo.skinid)) {
        petDetails = {
            id: getItemDetails(petInfo.id),
            name: petInfo.name,
            level: petInfo.level,
            skin: getItemDetails(petInfo.skinid),
            selected_skill: getItemDetails(petInfo.selectedskillid)
        };
    }

    const normalizedBasicInfo = {
        accountid: basicInfo.accountid || "",
        nickname: basicInfo.nickname || "",
        level: basicInfo.level || 0,
        region: basicInfo.region || "",
        liked: basicInfo.liked || "",
        signature: basicInfo.signature || ""
    };

    return {
        basic_info: normalizedBasicInfo,
        items: {
            outfit: outfitDetails,
            skills: {
                equipped: skillDetails
            },
            weapons: {
                shown_skins: weaponDetails
            },
            pet: petDetails
        }
    };
}

module.exports = {
    loadItems,
    getItemDetails,
    processPlayerItems
};
