import fs from "fs";

const textEffects = [
  {
    title: "Luxurious and creative sparkling colored crystal text effect",
    link: "https://textpro.me/luxurious-and-creative-sparkling-colored-crystal-text-effect-1190.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/07/28/luxurious-and-creative-sparkling-colored-crystal-text-effect-26ad8.jpg",
    altText: "Luxurious and creative sparkling colored crystal text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Stunning 3D hologram metallic text effect",
    link: "https://textpro.me/stunning-3d-hologram-metallic-text-effect-1189.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/07/10/stunning-3d-hologram-metallic-text-effect-67ba8.jpg",
    altText: "Stunning 3D hologram metallic text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Bright and Colorful 3D Summer Text Effect",
    link: "https://textpro.me/bright-and-colorful-3d-summer-text-effect-1188.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/06/24/bright-and-colorful-3d-summer-text-effect-3add8.jpg",
    altText: "Bright and Colorful 3D Summer Text Effect",
    page: 1,
    section: "All"
  },
  {
    title: "Energetic and adorable 3D summer text effect",
    link: "https://textpro.me/energetic-and-adorable-3d-summer-text-effect-1187.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/06/17/energetic-and-adorable-3d-summer-text-effect-b9a72.jpg",
    altText: "Energetic and adorable 3D summer text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Glossy metallic chrome 3D text effect",
    link: "https://textpro.me/glossy-metallic-chrome-3d-text-effect-1185.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/05/21/glossy-metallic-chrome-text-effect-d4888.jpg",
    altText: "Glossy metallic chrome 3D text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Awaken your inspiration with 3D hologram text effects",
    link: "https://textpro.me/awaken-your-inspiration-with-3d-hologram-text-effects-1184.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/04/25/awaken-your-inspiration-with-3d-hologram-text-effects-33d0d.jpg",
    altText: "Awaken your inspiration with 3D hologram text effects",
    page: 1,
    section: "All"
  },
  {
    title: "Create a mystical neon Blackpink logo text effect",
    link: "https://textpro.me/create-a-mystical-neon-blackpink-logo-text-effect-1180.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/04/01/create-a-mystical-neon-blackpink-logo-text-effect-dd6a8.jpg",
    altText: "Create a mystical neon Blackpink logo text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Create 3D cold blue metallic text effects online",
    link: "https://textpro.me/create-3d-cold-blue-metallic-text-effects-online-1179.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/03/31/create-3d-cold-blue-metallic-text-effects-online-6e3cb.jpg",
    altText: "Create 3D cold blue metallic text effects online",
    page: 1,
    section: "All"
  },
  {
    title: "Create artistic 3D text effects from corn kernels",
    link: "https://textpro.me/create-artistic-3d-text-effects-from-corn-kernels-1177.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/03/27/create-artistic-3d-text-effects-from-corn-kernels-740c7.jpg",
    altText: "Create artistic 3D text effects from corn kernels",
    page: 1,
    section: "All"
  },
  {
    title: "Create a luxurious blue marble text effect",
    link: "https://textpro.me/create-a-luxurious-blue-marble-text-effect-1176.html",
    imageUrl: "https://textpro.me/uploads/w450/2025/03/26/create-a-luxurious-blue-marble-text-effect-5d7ff.jpg",
    altText: "Create a luxurious blue marble text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Create elegant 3D pearl text effects online",
    link: "https://textpro.me/create-elegant-3d-pearl-text-effects-online-1168.html",
    imageUrl: "https://textpro.me/uploads/w450/2024/07/03/create-elegant-3d-pearl-text-effects-online-d72fc.jpg",
    altText: "Create elegant 3D pearl text effects online",
    page: 1,
    section: "All"
  },
  {
    title: "Create online 3D hologram glass text effect",
    link: "https://textpro.me/create-online-3d-hologram-glass-text-effect-1163.html",
    imageUrl: "https://textpro.me/uploads/w450/2024/06/11/create-online-3d-hologram-mirror-text-effect-71779.jpg",
    altText: "Create online 3D hologram glass text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Create Deadpool logo style text effect online",
    link: "https://textpro.me/create-deadpool-logo-style-text-effect-online-1159.html",
    imageUrl: "https://textpro.me/uploads/w450/2024/05/16/create-deadpool-logo-style-text-effect-online-1f239.jpg",
    altText: "Create Deadpool logo style text effect online",
    page: 1,
    section: "All"
  },
  {
    title: "Create online reflected neon text effect",
    link: "https://textpro.me/create-online-reflected-neon-text-effect-1157.html",
    imageUrl: "https://textpro.me/uploads/w450/2024/05/03/create-online-reflected-neon-text-effect-3e5fb.jpg",
    altText: "Create online reflected neon text effect",
    page: 1,
    section: "All"
  },
  {
    title: "Create 3D thunder text effects online",
    link: "https://textpro.me/create-3d-thunder-text-effects-online-1147.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/11/08/create-3d-thunder-text-effects-online-99cb4.jpg",
    altText: "Create 3D thunder text effects online",
    page: 1,
    section: "All"
  },
  {
    title: "Create a gradient text shadow effect online",
    link: "https://textpro.me/create-a-gradient-text-shadow-effect-online-1141.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/09/18/create-a-gradient-text-shadow-effect-online-dfc95.jpg",
    altText: "Create a gradient text shadow effect online",
    page: 1,
    section: "All"
  },
  {
    title: "Create Pokemon logo style text effect online",
    link: "https://textpro.me/create-pokemon-logo-style-text-effect-online-1134.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/08/07/create-pokemon-logo-style-text-effect-online-7c8a1.jpg",
    altText: "Create Pokemon logo style text effect online",
    page: 1,
    section: "All"
  },
  {
    title: "Generate Naruto Logo Style Text Effect Online",
    link: "https://textpro.me/generate-naruto-logo-style-text-effect-online-1125.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/06/02/create-naruto-logo-style-text-effect-online6479980945bcc_4fc224fda6db77a31c6c5474154bd1a2.jpg",
    altText: "Generate Naruto Logo Style Text Effect Online",
    page: 1,
    section: "All"
  },
  {
    title: "Create sunset light text effects online for free",
    link: "https://textpro.me/create-sunset-light-text-effects-online-for-free-1124.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/06/02/create-sunset-light-text_effects-online-for-free647998c858219_04906c06ce3361dad795fc00f7831a45.jpg",
    altText: "Create sunset light text effects online for free",
    page: 2,
    section: "All"
  },
  {
    title: "Create 3D liquid metal text effect",
    link: "https://textpro.me/create-3d-liquid-metal-text-effect-1112.html",
    imageUrl: "https://textpro.me/uploads/w450/2023/02/23/create-3d-liquid-metal-text-effect63f6cd566f66a_ce06d79c992672f276a0abe4b3ee33dd.jpg",
    altText: "Create 3D liquid metal text effect",
    page: 2,
    section: "All"
  },
  {
    title: "Create beautiful 3D snow text effect online",
    link: "https://textpro.me/create-beautiful-3d-snow-text-effect-online-1101.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/21/create-beautiful-3d-snow-text-effect-online637b50edb19fe_9e62b90154dee6e1a2b483222ccbedf0.jpg",
    altText: "Create beautiful 3D snow text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create winter cold snow text effect online",
    link: "https://textpro.me/create-winter-cold-snow-text-effect-online-1100.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-winter-cold-snow-text-effect-online637464c16334c_8b82b6d21e9f8a9617eb57f807e429fa.jpg",
    altText: "Create winter cold snow text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create realistic 3D text effect frozen winter",
    link: "https://textpro.me/create-realistic-3d-text-effect-frozen-winter-1099.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-realistic-3d-text-effect-frozen-winter637464e9d8e59_1603ce12b4f100d5f0b8ecc546c8135b.jpg",
    altText: "Create realistic 3D text effect frozen winter",
    page: 2,
    section: "All"
  },
  {
    title: "Create artistic typography online",
    link: "https://textpro.me/create-artistic-typography-online-1086.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-artistic-typography-online6374bb8b7509d_d9eb7bf354eb5f9942950030d52481f2.jpg",
    altText: "Create artistic typography online",
    page: 2,
    section: "All"
  },
  {
    title: "Create gradient neon light text effect online",
    link: "https://textpro.me/create-gradient-neon-light-text-effect-online-1085.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-gradient-neon-light-text-effect-online6374bb9d9fcac_a2afb930cb2ea39471d32f7f96bdcd78.jpg",
    altText: "Create gradient neon light text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create neon light Blackpink logo text effect online",
    link: "https://textpro.me/create-neon-light-blackpink-logo-text-effect-online-1081.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-neon-light-blackpink-logo-text-effect-online6374bbe371450_43f46f09a0ea9b9ba801308aa72bf7d7.jpg",
    altText: "Create neon light Blackpink logo text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create Blackpink style logo effects online",
    link: "https://textpro.me/create-blackpink-style-logo-effects-online-1079.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/11/16/create-blackpink-style-logo-effects-online6374bc0b04619_8d9a487e74350b832c94f1a6560fff8e.jpg",
    altText: "Create Blackpink style logo effects online",
    page: 2,
    section: "All"
  },
  {
    title: "Create light glow sliced text effect online",
    link: "https://textpro.me/create-light-glow-sliced-text-effect-online-1068.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/03/17/create-light-glow-sliced-text-effect-online6232ac3eb05a6_7550cce89fa53e792f78bcff10a7a6ec.jpg",
    altText: "Create light glow sliced text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Make a BATMAN logo online free",
    link: "https://textpro.me/make-a-batman-logo-online-free-1066.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/03/07/make-a-batman-logo-online-free6225cf2d2ca6e_088d2be2baa70fd34c11f647a8c46808.jpg",
    altText: "Make a BATMAN logo online free",
    page: 2,
    section: "All"
  },
  {
    title: "Create Thor logo style text effect online",
    link: "https://textpro.me/create-thor-logo-style-text-effect-online-1064.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/02/25/create-thor-logo-style-text-effect-online6218526c1249f_17b661540faac1b9cdab7ff41dd4dc18.jpg",
    altText: "Create Thor logo style text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create neon light on brick wall online",
    link: "https://textpro.me/create-neon-light-on-brick-wall-online-1062.html",
    imageUrl: "https://textpro.me/uploads/w450/2022/02/10/create-neon-light-on-brick-wall-online620486248d0a0_a534991c39b5b831c49e4b14079170b0.jpg",
    altText: "Create neon light on brick wall online",
    page: 2,
    section: "All"
  },
  {
    title: "Create a metallic text effect free online",
    link: "https://textpro.me/create-a-metallic-text-effect-free-online-1041.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/09/01/create-a-metallic-text-effect-free-online612eeb317cfe8_1f24695a06277853fb3348ad58a0516f.jpg",
    altText: "Create a metallic text effect free online",
    page: 2,
    section: "All"
  },
  {
    title: "Create green horror style text effect online",
    link: "https://textpro.me/create-green-horror-style-text-effect-online-1036.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/08/07/create-green-horror-style-text-effect-online610e35d91695c_b53059da5ed3c7576b4c60e0320d0cb5.jpg",
    altText: "Create green horror style text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create a magma hot text effect online",
    link: "https://textpro.me/create-a-magma-hot-text-effect-online-1030.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/07/12/create-a-magma-hot-text-effect-online60ec0f98d0a1c_c5397ea8d1ee8dd46b15abc1245f908f.jpg",
    altText: "Create a magma hot text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create 3D neon light text effect online",
    link: "https://textpro.me/create-3d-neon-light-text-effect-online-1028.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/07/07/create_3d_neon_light_text_effect_online60e52281d7295_9e5c8fe8ab483bc4a73bc12c99fd4a3f.jpg",
    altText: "Create 3D neon light text effect online",
    page: 2,
    section: "All"
  },
  {
    title: "Create impressive glitch text effects online",
    link: "https://textpro.me/create-impressive-glitch-text-effects-online-1027.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/07/01/glitch-text-effect-online60dd356464082_aad6bf1ca32855484ac170c2c8ab1328.jpg",
    altText: "Create impressive glitch text effects online",
    page: 2,
    section: "All"
  },
  {
    title: "Create Harry Potter text effect online",
    link: "https://textpro.me/create-harry-potter-text-effect-online-1025.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/06/23/create-harry-potter-text-effect-online60d2b92216bb4_7b9a046ee7f0c952891d5fffecedfb1e.jpg",
    altText: "Create Harry Potter text effect online",
    page: 3,
    section: "All"
  },
  {
    title: "Create neon devil wings text effect online free",
    link: "https://textpro.me/create-neon-devil-wings-text-effect-online-free-1014.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/05/07/create-neon-devil-wings-text-effect-online-free6094f14e88277_141a14b79b24b4e4a0576dec651453cc.jpg",
    altText: "Create neon devil wings text effect online free",
    page: 3,
    section: "All"
  },
  {
    title: "Online black and white bear mascot logo creation",
    link: "https://textpro.me/online-black-and-white-bear-mascot-logo-creation-1012.html",
    imageUrl: "https://textpro.me/uploads/w450/2021/04/17/Untitled-1-min607a54424ab82_24867a30d11e5dd4d4d67ce2a07015d3.jpg",
    altText: "Online black and white bear mascot logo creation",
    page: 3,
    section: "All"
  },
  {
    title: "Create Blackpink logo style online",
    link: "https://textpro.me/create-blackpink-logo-style-online-1001.html",
    imageUrl: "https://textpro.me/uploads/w450/2020/11/04/create-blackpink-logo-style-online5fa24cfe5483d_261905fce14ffe71e49a968c84079c12.jpg",
    altText: "Create Blackpink logo style online",
    page: 3,
    section: "All"
  },
  {
    title: "Create Glitch Text Effect Style Tik Tok",
    link: "https://textpro.me/create-glitch-text-effect-style-tik-tok-983.html",
    imageUrl: "https://textpro.me/uploads/w450/2020/04/15/create-text-glitch-effect-style-tik-tok5e96aa30534b2_523a0dd3712bd15fa8398f1a6f022fb6.jpg",
    altText: "Create Glitch Text Effect Style Tik Tok",
    page: 3,
    section: "All"
  },
  {
    title: "Neon Light Text Effect With Galaxy Style",
    link: "https://textpro.me/neon-light-text-effect-with-galaxy-style-981.html",
    imageUrl: "https://textpro.me/uploads/w450/2020/04/15/neon-light-text-effect-with-galaxy-style5e96a7aa6097b_3a34dc280e372f47bb69cb927f394831.jpg",
    altText: "Neon Light Text Effect With Galaxy Style",
    page: 3,
    section: "All"
  },
  {
    title: "Generate a Free Logo in Pornhub Style Online",
    link: "https://textpro.me/generate-a-free-logo-in-pornhub-style-online-977.html",
    imageUrl: "https://textpro.me/uploads/w450/2020/04/15/pornhub-style-logo-online-generator-free5e96853aed689_0ad82f11207801b5ba5a9d0995fb573f.jpg",
    altText: "Generate a Free Logo in Pornhub Style Online",
    page: 3,
    section: "All"
  },
  {
    title: "Create logo style Marvel studios online",
    link: "https://textpro.me/create-logo-style-marvel-studios-online-971.html",
    imageUrl: "https://textpro.me/uploads/w450/2019/05/18/Create_logo_style_Marvel_studios_online5cdf7217dcd92_c8dcc4e69fbb4c100df5ca5a14c6e690.jpg",
    altText: "Create logo style Marvel studios online",
    page: 3,
    section: "All"
  },
  {
    title: "Matrix Style Text Effect Online",
    link: "https://textpro.me/matrix-style-text-effect-online-884.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/11/demo25b1de6503dd24_f4bcac23e82a9596a78caf186b768180.jpg",
    altText: "Matrix Style Text Effect Online",
    page: 3,
    section: "All"
  },
  {
    title: "Create Thunder Text Effect Online",
    link: "https://textpro.me/create-thunder-text-effect-online-881.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/08/demo5b1a218b577eb_2e8b44f41e6613e17c4f4ac308d3ce68.jpg",
    altText: "Create Thunder Text Effect Online",
    page: 3,
    section: "All"
  },
  {
    title: "Neon Text Effect Online",
    link: "https://textpro.me/neon-text-effect-online-879.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/08/demo35b1a220986a58_e191296320ff69710a111cfdb931da1b.jpg",
    altText: "Neon Text Effect Online",
    page: 3,
    section: "All"
  },
  {
    title: "Road Warning Text Effect",
    link: "https://textpro.me/road-warning-text-effect-878.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/07/demo5b18b3437256d_80da294477cec0ead703ba8765b0f607.jpg",
    altText: "Road Warning Text Effect",
    page: 3,
    section: "All"
  },
  {
    title: "Bokeh Text effect",
    link: "https://textpro.me/bokeh-text-effect-876.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/07/demo5b18a1ff2961c_b1d287cf19d664480749e9fec6a0de34.jpg",
    altText: "Bokeh Text effect",
    page: 3,
    section: "All"
  },
  {
    title: "Free Advanced Glow Text Effect",
    link: "https://textpro.me/free-advanced-glow-text-effect-873.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/07/demo5b18950281ea8_c504b4d9603b3144cac2003ba07e73b6.jpg",
    altText: "Free Advanced Glow Text Effect",
    page: 3,
    section: "All"
  },
  {
    title: "Break Wall Text Effect",
    link: "https://textpro.me/break-wall-text-effect-871.html",
    imageUrl: "https://textpro.me/uploads/w450/2018/06/07/demo5b18909bdc166_4921dbce11e79c7a083be97e1ad86ee7.jpg",
    altText: "Break Wall Text Effect",
    page: 3,
    section: "All"
  }
];

const command = {
  name: "textpro",
  alias: ["tp"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo hiệu ứng chữ bằng TextPro.me",
  guide:
    "{pn} textpro <link> <text> → Tạo ảnh hiệu ứng chữ với link tùy chỉnh\n{pn} textpro <text> → Tạo ảnh hiệu ứng chữ với link mặc định\n{pn} textpro list → Xem danh sách hiệu ứng có sẵn\n   {pn} → Prefix lệnh bot",
  cd: 10,
  prefix: true,
  onCall: async ({ client, event, args, api, main, commandName, utils }: any) => {
    try {
      if (!args[0]) {
        return client.sendMessage("Vui lòng nhập nội dung để tạo hiệu ứng", event.threadID, event.messageID);
      }

      if (args[0].toLowerCase() === "list") {
        let msg = "📋 Danh sách hiệu ứng có sẵn:\n\n";
        let page = 1;
        const itemsPerPage = 10;

        const totalPages = Math.ceil(textEffects.length / itemsPerPage);
        const effects = textEffects.slice((page - 1) * itemsPerPage, page * itemsPerPage);

        effects.forEach((effect, index) => {
          msg += `${(page - 1) * itemsPerPage + index + 1}. ${effect.title}\n`;
        });

        msg += `\nTrang ${page}/${totalPages}`;
        msg += "\nReply số thứ tự để chọn hiệu ứng";

        return client.sendMessage(
          msg,
          event.threadID,
          (err: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              page,
              type: "list"
            });
          },
          event.messageID
        );
      }

      const startTime = Date.now();
      let text: string;
      let link: string;

      if (args[0].includes("textpro.me") && args[0].endsWith(".html")) {
        link = args[0];
        text = args.slice(1).join(" ");
        if (!text) {
          return client.sendMessage("Vui lòng nhập nội dung sau link", event.threadID, event.messageID);
        }
      } else {
        text = args.join(" ");
        const randomIndex = Math.floor(Math.random() * textEffects.length);
        const randomEffect = textEffects[randomIndex];
        if (!randomEffect) {
          return client.sendMessage("Không tìm thấy hiệu ứng ngẫu nhiên", event.threadID, event.messageID);
        }
        link = randomEffect.link;
      }

      const response = await api.textpro(link, text);
      if (response) {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const attachment = fs.createReadStream(response);
        await client.sendMessage(
          {
            body: `✨ Tạo ảnh thành công\n⏱️ Thời gian xử lý: ${processingTime}s`,
            attachment
          },
          event.threadID,
          event.messageID
        );
        fs.unlink(response, err => {
          if (err) console.error("Lỗi khi xóa tệp tạm:", err);
        });
        return;
      } else {
        throw new Error("Không thể tạo ảnh");
      }
    } catch (e) {
      console.error(e);
      return client.sendMessage("Đã xảy ra lỗi khi tạo ảnh", event.threadID, event.messageID);
    }
  },

  onReply: async ({ client, event, Reply, api, main }: any) => {
    const { author, commandName, type, page } = Reply;

    if (type !== "list" || event.senderID != author) return;

    const input = event.body;
    if (!input || isNaN(input)) return;

    const index = parseInt(input) - 1;
    const startIdx = (page - 1) * 10;
    const effect = textEffects[startIdx + index];

    if (!effect) {
      return client.sendMessage("Lựa chọn không hợp lệ", event.threadID, event.messageID);
    }

    try {
      const startTime = Date.now();
      client.sendMessage("Đang tạo ảnh, vui lòng đợi...", event.threadID, event.messageID);

      const response = await api.textpro(effect.link, "Preview");
      if (response) {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const attachment = fs.createReadStream(response);

        await client.sendMessage(
          {
            body: `🖼️ Preview hiệu ứng: ${effect.title}\n⏱️ Thời gian xử lý: ${processingTime}s\n\nReply tin nhắn này với nội dung để tạo ảnh`,
            attachment
          },
          event.threadID,
          (err: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              effectLink: effect.link,
              type: "create"
            });
          }
        );

        fs.unlink(response, err => {
          if (err) console.error("Lỗi khi xóa tệp tạm:", err);
        });
      }
    } catch (e) {
      console.error(e);
      return client.sendMessage("Đã xảy ra lỗi khi tạo ảnh preview", event.threadID, event.messageID);
    }
  }
};

export default command;
