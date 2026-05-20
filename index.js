import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage
} from "@whiskeysockets/baileys"

import axios from "axios"
import fsExtra from "fs-extra"
import fs from "fs"
import pino from "pino"
import { Sticker, StickerTypes } from "wa-sticker-formatter"

const PHONE_NUMBER = "6283190378061"

// ===== GROUP SETTINGS =====
const GROUP_ID = "120363407357159636@g.us"

const ALLOWED_GROUPS = [
    "120363407357159636@g.us",
    "120363408661550505@g.us"
]

const CONTENT_API =
    "https://api.github.com/repos/EnzoLeo127/Scripts/contents"

const RAW_BASE =
    "https://raw.githubusercontent.com/EnzoLeo127/Scripts/main/"

const SAVE_FILE = "sent_files.json"
const CHECK_INTERVAL = 20000

const MENU_IMAGE =
    "https://i.ibb.co.com/KjJ3TCjf/IMG-20260107-WA0251.jpg"

// ===== AFK =====
const afkFile = "./afk.json"

let afk = {}
try {
    if (fs.existsSync(afkFile)) {
        afk = JSON.parse(fs.readFileSync(afkFile))
    }
} catch (e) {}

function saveAfk() {
    try {
        fs.writeFileSync(afkFile, JSON.stringify(afk, null, 2))
    } catch (e) {}
}

function clockString(ms) {
    let h = Math.floor(ms / 3600000)
    let m = Math.floor(ms / 60000) % 60
    let s = Math.floor(ms / 1000) % 60

    return [h, m, s]
        .map(v => v.toString().padStart(2, 0))
        .join(":")
}

// ===== GLOBAL =====
let sentFilesCache = []
let isChecking = false
let lastFileList = []
let sock
let intervalCheck = null

// ===== GET REPO FILES =====
async function getRepoFiles() {
    try {
        const res = await axios.get(CONTENT_API, {
            headers: { "User-Agent": "repo-checker" },
            timeout: 5000
        })
        return res.data
            .filter(f => f.type === "file")
            .map(f => f.name)
    } catch (e) {
        return []
    }
}

// ===== START BOT =====
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    })

    sock.ev.on("creds.update", saveCreds)

    // ===== SYNC FILE =====
    async function checkInitialFiles() {
        try {
            const files = await getRepoFiles()
            if (!fs.existsSync(SAVE_FILE)) {
                sentFilesCache = [...files]
                fsExtra.writeJsonSync(SAVE_FILE, sentFilesCache)
            } else {
                sentFilesCache = fsExtra.readJsonSync(SAVE_FILE)
            }
        } catch (e) {}
    }

    // ===== CONNECTION =====
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === "open") {
            console.log("✅ DYBOO HUB ONLINE")
            await checkInitialFiles()

            if (intervalCheck) clearInterval(intervalCheck)
            intervalCheck = setInterval(() => {
                checkNewFiles(sock)
            }, CHECK_INTERVAL)
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                startBot()
            }
        }
    })

    // ===== MESSAGE =====
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const jid = msg.key.remoteJid
        const sender = msg.key.participant || jid
        const isAllowedGroup = ALLOWED_GROUPS.includes(jid)
        const type = Object.keys(msg.message)[0]

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            ""

        const cmd = text.split(" ")[0].toLowerCase()
        const args = text.split(" ").slice(1)

        // ===== BACK AFK =====
        if (afk[sender] && !text.startsWith("-afk")) {
            let data = afk[sender]
            let durasi = clockString(Date.now() - data.time)
            delete afk[sender]
            saveAfk()

            await sock.sendMessage(jid, {
                text: `╭───〔 🌤️ WELCOME BACK 〕───⬣\n│\n│ 👤 User: @\${sender.split("@")[0]}\n│ 🕒 Durasi: \${durasi}\n│ 💬 Alasan: \${data.reason}\n│\n╰────────────⬣`,
                mentions: [sender]
            }, { quoted: msg }).catch(() => {})
        }

        // ===== COMMAND =====
        switch (cmd) {
            case "-menu":
                if (!isAllowedGroup) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const MENU = `╭───〔 DYBOO HUB 〕───⬣\n│\n│ -allscript\n│ -getscript <no>\n│ -item <id>\n│ -stiker\n│ -brat <text>\n│ -brathd <text>\n│ -bratvid <text>\n│ -iqc <text>\n│ -ai <text>\n│ -afk <reason>\n│ -tex2img <prompt>\n│ -getprofil @tag\n│\n╰────────────⬣`
                    await sock.sendMessage(jid, { image: { url: MENU_IMAGE }, caption: MENU }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-getprofil":
                if (!isAllowedGroup) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                let targetUser = null

                if (args[0]) {
                    let rawNumber = args[0].replace(/[^0-9]/g, '')
                    if (rawNumber.length > 5) {
                        targetUser = rawNumber + "@s.whatsapp.net"
                    }
                }
                if (!targetUser) {
                    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                        targetUser = msg.message.extendedTextMessage.contextInfo.mentionedJid[0]
                    } else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                        targetUser = msg.message.extendedTextMessage.contextInfo.participant
                    }
                }
                if (!targetUser) targetUser = sender

                try {
                    let ppUrl
                    try {
                        ppUrl = await sock.profilePictureUrl(targetUser, "image")
                    } catch (e) {
                        ppUrl = MENU_IMAGE
                    }
                    await sock.sendMessage(jid, {
                        image: { url: ppUrl },
                        caption: `╭───〔 👤 USER PROFILE 〕───⬣\n│\n│ 🤭 Profil berhasil diambil\n│\n╰────────────⬣`,
                        mentions: [targetUser]
                    }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    await sock.sendMessage(jid, { text: "❌ Gagal mengambil profil." }, { quoted: msg }).catch(() => {})
                }
            break

            case "-tex2img":
                if (!isAllowedGroup) return
                if (!args[0]) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    return await sock.sendMessage(jid, { text: "❌ Masukkan prompt!" }, { quoted: msg }).catch(() => {})
                }
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const prompt = args.join(" ")
                    const seed = Date.now().toString() + Math.floor(Math.random() * 1e6)
                    const urlImage = `https://image.pollinations.ai/prompt/\${encodeURIComponent(prompt)}?seed=\${seed}&enhance=true&nologo=true&model=flux`
                    await sock.sendMessage(jid, { image: { url: urlImage }, caption: `🖼️ Prompt: \${prompt}` }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    await sock.sendMessage(jid, { text: "❌ Gagal membuat gambar." }, { quoted: msg }).catch(() => {})
                }
            break

            case "-afk":
                if (!isAllowedGroup) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    let reason = args.join(" ") || "Tanpa Alasan"
                    afk[sender] = { reason, time: Date.now() }
                    saveAfk()
                    await sock.sendMessage(jid, {
                        text: `╭───〔 💤 AFK MODE 〕───⬣\n│\n│ 👤 User: @\${sender.split("@")[0]}\n│ 📝 Alasan: \${reason}\n│\n╰────────────⬣`,
                        mentions: [sender]
                    }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-allscript":
                if (!isAllowedGroup) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    lastFileList = await getRepoFiles()
                    if (lastFileList.length === 0) {
                        await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                        await sock.sendMessage(jid, { text: "❌ Gagal mengambil list script." }, { quoted: msg }).catch(() => {})
                    } else {
                        let teks = `╭───〔 LIST SCRIPT 〕───⬣\n│\n`
                        lastFileList.forEach((f, i) => { teks += `│ \${i + 1}. \${f}\n` })
                        teks += `│\n╰────────────⬣`
                        await sock.sendMessage(jid, { text: teks }, { quoted: msg })
                        await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                    }
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-getscript":
                if (!isAllowedGroup) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const no = parseInt(args[0])
                    if (lastFileList.length === 0) {
                        lastFileList = await getRepoFiles()
                    }
                    if (lastFileList[no - 1]) {
                        await sock.sendMessage(jid, { text: `loadstring(game:HttpGet("\${RAW_BASE + lastFileList[no - 1]}"))()` }, { quoted: msg })
                        await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                    } else {
                        await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                        await sock.sendMessage(jid, { text: "❌ Nomor tidak valid." }, { quoted: msg }).catch(() => {})
                    }
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-item":
                if (!isAllowedGroup) return
                const id = args[0]
                if (!id) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})

                try {
                    const [resDetails, resThumb] = await Promise.all([
                        axios.get(`https://economy.roblox.com/v2/assets/\${id}/details`, { timeout: 4000 }),
                        axios.get(`https://thumbnails.roblox.com/v1/assets?assetIds=\${id}&size=420x420&format=Png`, { timeout: 4000 })
                    ])

                    const d = resDetails.data
                    const t = resThumb.data

                    const status = d.IsForSale ? "🟢 ON SALE" : "🔴 OFF SALE"
                    let stockText = "ERROR CUY🗿"

                    if (d.Remaining !== undefined && d.Remaining !== null) {
                        stockText = parseInt(d.Remaining) === 0 ? "🔴 SOLD OUT" : d.Remaining.toString()
                    }

                    let hargaText = (d.PriceInRobux !== null && d.PriceInRobux !== undefined && d.PriceInRobux > 0) 
                        ? `\${d.PriceInRobux} Robux` 
                        : "Free"

                    const isLimited = (d.IsLimited || d.IsLimitedUnique) ? "😈 YES" : "❌ NO"

                    let gameSource = "Katalog / Game"
                    const desc = d.Description || ""
                    const match = desc.match(/roblox.com\/games\/(\d+)/)
                    if (match) {
                        gameSource = `https://www.roblox.com/games/\${match[1]}`
                    }

                    const caption = `╭───〔 🛍️ ITEM INFO 〕───⬣\n│\n│ 📌 Nama: \${d.Name}\n│ 👤 Creator: \${d.Creator?.Name}\n│ 🔗 Link: roblox.com/catalog/\${id}\n│ 📊 Status: \${status}\n│ 💰 Harga: \${hargaText}\n│ 📦 Stock: \${stockText}\n│ 💎 Limited: \${isLimited}\n│ 🎮 Game: \${gameSource}\n│\n╰────────────⬣`

                    await sock.sendMessage(jid, {
                        image: { url: t.data?.[0]?.imageUrl || MENU_IMAGE },
                        caption
                    }, { quoted: msg })
                    
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    await sock.sendMessage(jid, { text: "❌ ID tidak valid / private" }, { quoted: msg }).catch(() => {})
                }
            break

            case "-stiker":
            case "-s":
                if (!isAllowedGroup) return
                const isQuoted = type === "extendedTextMessage" && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
                const target = isQuoted ? msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage : msg.message.imageMessage
                if (!target) return

                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const stream = await downloadContentFromMessage(target, "image")
                    let buffer = Buffer.from([])
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk])
                    }
                    const s = new Sticker(buffer, {
                        pack: "Dyboo Hub",
                        author: "Team ZeroTrace",
                        type: StickerTypes.CROPPED,
                        quality: 100
                    })
                    await sock.sendMessage(jid, { sticker: await s.toBuffer() }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-ai":
                if (!isAllowedGroup) return
                if (!args[0]) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const res = await axios.get(`https://api.nexray.eu.cc/ai/turbochat?text=${encodeURIComponent(args.join(" "))}`, { timeout: 5000 })
                    await sock.sendMessage(jid, { text: res.data.result || res.data }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-brat":
                if (!isAllowedGroup) return
                if (!args[0]) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const resB = await axios.get(`https://api.nexray.eu.cc/maker/brat?text=${encodeURIComponent(args.join(" "))}`, { responseType: "arraybuffer", timeout: 6000 })
                    const stB = new Sticker(Buffer.from(resB.data), {
                        pack: "Dyboo Hub",
                        author: "Team ZeroTrace",
                        type: StickerTypes.FULL,
                        quality: 100
                    })
                    await sock.sendMessage(jid, { sticker: await stB.toBuffer() }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-brathd":
                if (!isAllowedGroup) return
                if (!args[0]) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const resHD = await axios.get(`https://api.nexray.eu.cc/maker/brathd?text=${encodeURIComponent(args.join(" "))}`, { responseType: "arraybuffer", timeout: 6000 })
                    const stHD = new Sticker(Buffer.from(resHD.data), {
                        pack: "Dyboo Hub",
                        author: "Team ZeroTrace",
                        type: StickerTypes.FULL,
                        quality: 100
                    })
                    await sock.sendMessage(jid, { sticker: await stHD.toBuffer() }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-bratvid":
                if (!isAllowedGroup) return
                if (!args[0]) return
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const resVid = await axios.get(`https://api.nexray.eu.cc/maker/bratvid?text=${encodeURIComponent(args.join(" "))}`, { responseType: "arraybuffer", timeout: 8000 })
                    const stVid = new Sticker(Buffer.from(resVid.data), {
                        pack: "Dyboo Hub",
                        author: "Team ZeroTrace",
                        type: StickerTypes.FULL,
                        quality: 100
                    })
                    await sock.sendMessage(jid, { sticker: await stVid.toBuffer() }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                }
            break

            case "-iqc":
                if (!isAllowedGroup) return
                if (!args[0]) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    return await sock.sendMessage(jid, { text: "❌ Masukkan teks!\nContoh: -iqc halo apa kabarrr" }, { quoted: msg }).catch(() => {})
                }
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } }).catch(() => {})
                try {
                    const iqcText = args.join(" ")
                    const resIqc = await axios.get(`https://api.nexray.eu.cc/maker/iqc?text=${encodeURIComponent(iqcText)}`, { responseType: "arraybuffer", timeout: 6000 })
                    await sock.sendMessage(jid, { image: Buffer.from(resIqc.data), caption: "✨ Hasil IQC Image" }, { quoted: msg })
                    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } }).catch(() => {})
                } catch (e) {
                    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } }).catch(() => {})
                    await sock.sendMessage(jid, { text: "❌ Terjadi kesalahan pada API IQC." }, { quoted: msg }).catch(() => {})
                }
            break
        }
    })

    // ===== AUTO POST =====
    async function checkNewFiles(socket) {
        if (isChecking) return
        isChecking = true

        try {
            if (!fs.existsSync(SAVE_FILE)) {
                fsExtra.writeJsonSync(SAVE_FILE, [])
            }

            const files = await getRepoFiles()
            const newFiles = files.filter(f => !sentFilesCache.includes(f))

            for (const file of newFiles) {
                sentFilesCache.push(file)
                fsExtra.writeJsonSync(SAVE_FILE, sentFilesCache)

                const meta = await socket.groupMetadata(GROUP_ID).catch(() => ({ participants: [] }))
                const members = meta.participants.map(p => p.id)

                const pesan = `╭───〔 🚨 NEW SCRIPT 〕───⬣\n│\n│ 📁 FILE: \${file}\n│ ⚡ STATUS: INSTANT RELEASE\n│ 🔥 TYPE: PRIVATE / UGC BUILD\n│ 💀 INFO: Script baru upload\n│\n╰────────────⬣`

                await socket.sendMessage(GROUP_ID, { text: pesan, mentions: members }).catch(() => {})
                await new Promise(r => setTimeout(r, 1500))
                await socket.sendMessage(GROUP_ID, { text: `loadstring(game:HttpGet("\${RAW_BASE + file}"))()` }).catch(() => {})
            }
        } catch (e) {
        } finally {
            isChecking = false
        }
    }

    // ===== PAIR CODE =====
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            let code = await sock.requestPairingCode(PHONE_NUMBER).catch(() => null)
            if (code) console.log("PAIRING CODE:", code)
        }, 3000)
    }
}

// ===== ANTI CRASH GLOBAL SYSTEM =====
process.on("uncaughtException", (e) => {})
process.on("unhandledRejection", (e) => {})

startBot()